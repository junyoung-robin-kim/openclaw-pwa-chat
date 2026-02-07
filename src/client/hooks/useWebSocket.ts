import { useCallback, useEffect, useRef, useState } from "react";
import type { StoredMessage, WsServerMessage, ConnectionState } from "../types";

const MIN_RECONNECT_DELAY = 3000;
const MAX_RECONNECT_DELAY = 300_000;
const RECONNECT_JITTER = 2000;
const PING_INTERVAL = 30_000; // send ping every 30s
const PONG_TIMEOUT = 10_000; // wait 10s for pong before giving up

declare global {
  interface Window {
    __PWA_AUTH_TOKEN__?: string;
  }
}

export function useWebSocket(sessionId: string = "default") {
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [waitingForReply, setWaitingForReply] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pongTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connectionIdRef = useRef<string>("");
  const serverSequenceRef = useRef<number>(0);
  const connectFailCountRef = useRef(0);

  const clearTimers = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (pongTimeoutRef.current) {
      clearTimeout(pongTimeoutRef.current);
      pongTimeoutRef.current = null;
    }
  }, []);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    clearReconnectTimeout();

    let delay = MIN_RECONNECT_DELAY;
    const fails = connectFailCountRef.current;
    if (fails > 1) {
      delay = Math.min(delay * fails * fails, MAX_RECONNECT_DELAY);
    }
    delay += Math.random() * RECONNECT_JITTER;

    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      doConnect();
    }, delay);
  }, [clearReconnectTimeout]); // doConnect captured via ref below

  // Use a ref to break the circular dependency between connect and scheduleReconnect
  const doConnectRef = useRef<() => void>(() => {});

  const doConnect = useCallback(() => {
    doConnectRef.current();
  }, []);

  // The actual connect implementation
  useEffect(() => {
    doConnectRef.current = () => {
      // Guard: already connected or reconnect pending
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
      if (reconnectTimeoutRef.current) return;

      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const token = window.__PWA_AUTH_TOKEN__ ?? "";
      const params = new URLSearchParams({ userId: "default", sessionId });
      if (token) params.set("token", token);
      if (connectionIdRef.current) {
        params.set("connection_id", connectionIdRef.current);
        params.set("sequence_number", String(serverSequenceRef.current));
      }

      const url = `${proto}//${location.host}/ws?${params}`;
      setConnectionState("connecting");

      const ws = new WebSocket(url);
      wsRef.current = ws;

      // Stale-connection guard: every handler checks if ws is still current
      const isStale = () => wsRef.current !== ws;

      ws.onopen = () => {
        if (isStale()) {
          addDebug("stale onopen");
          return;
        }
        addDebug("WS connected");
        setConnectionState("connected");
        connectFailCountRef.current = 0;
        clearTimers();
        startPing(ws);
      };

      ws.onmessage = (ev) => {
        if (isStale()) {
          console.warn("[pwa-chat] stale ws, ignoring message");
          return;
        }

        const msg = JSON.parse(ev.data) as WsServerMessage;
        const logMsg = `recv ${msg.type} seq=${"seq" in msg ? msg.seq : "-"}`;
        console.log(`[pwa-chat] ${logMsg}`);
        addDebug(logMsg);

        // Seq validation (skip hello & pong)
        if (msg.type !== "hello" && msg.type !== "pong") {
          if (msg.seq !== serverSequenceRef.current) {
            addDebug(`SEQ MISMATCH exp=${serverSequenceRef.current} got=${msg.seq}`);
            console.warn(
              `[pwa-chat] seq mismatch: expected=${serverSequenceRef.current}, got=${msg.seq}`,
            );
            ws.close(); // Reconnect will resync via connection_id + sequence_number
            return;
          }
          serverSequenceRef.current = msg.seq + 1;
        }

        switch (msg.type) {
          case "hello":
            if (connectionIdRef.current && connectionIdRef.current !== msg.connectionId) {
              console.log("[pwa-chat] new connectionId, full resync");
            }
            connectionIdRef.current = msg.connectionId;
            serverSequenceRef.current = msg.seq + 1;
            break;

          case "pong":
            // Clear pong timeout — connection is alive
            if (pongTimeoutRef.current) {
              clearTimeout(pongTimeoutRef.current);
              pongTimeoutRef.current = null;
            }
            break;

          case "history":
            setMessages(msg.messages);
            break;

          case "message": {
            setStreamingText(null);
            if (msg.msg.role === "assistant") setWaitingForReply(false);
            const msgText = msg.msg.text?.slice(0, 30) ?? "";
            addDebug(`MSG ${msg.msg.role} id=${msg.msg.id} "${msgText}"`);
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.msg.id)) {
                addDebug(`DEDUP skip id=${msg.msg.id}`);
                return prev;
              }
              if (msg.msg.role === "user") {
                const recent = prev.find(
                  (m) =>
                    m.id.startsWith("local-") &&
                    m.text === msg.msg.text &&
                    Math.abs(m.timestamp - msg.msg.timestamp) < 5000,
                );
                if (recent) {
                  addDebug(`DEDUP local-match id=${msg.msg.id}`);
                  return prev;
                }
              }
              addDebug(`ADDED id=${msg.msg.id} total=${prev.length + 1}`);
              return [...prev, msg.msg];
            });
            break;
          }

          case "streaming":
            setWaitingForReply(false);
            setStreamingText(msg.text);
            break;

          case "streaming_end":
            setStreamingText(null);
            break;
        }
      };

      ws.onclose = (ev) => {
        addDebug(`WS closed code=${ev.code} stale=${isStale()}`);
        if (isStale()) return;
        wsRef.current = null;
        setConnectionState("disconnected");
        clearTimers();
        connectFailCountRef.current++;
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose will fire after onerror
      };
    };
  }, [sessionId, clearTimers, scheduleReconnect]);

  // Ping helper
  function startPing(ws: WebSocket) {
    pingIntervalRef.current = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        clearTimers();
        return;
      }

      // Send application-level ping
      ws.send(JSON.stringify({ type: "ping" }));

      // Set a pong timeout (shorter than interval)
      if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current);
      pongTimeoutRef.current = setTimeout(() => {
        console.warn("[pwa-chat] pong timeout, closing connection");
        pongTimeoutRef.current = null;
        ws.close();
      }, PONG_TIMEOUT);
    }, PING_INTERVAL);
  }

  // Network & visibility events
  useEffect(() => {
    const handleOnline = () => {
      console.log("[pwa-chat] online");
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        scheduleReconnect();
      }
    };

    const handleOffline = () => {
      console.log("[pwa-chat] offline");
      // Don't aggressively close; let pong timeout handle it
    };

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      console.log("[pwa-chat] tab visible");
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        scheduleReconnect();
      } else {
        // Send a ping to verify connection is still alive
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [scheduleReconnect]);

  // Initial connect
  useEffect(() => {
    // Close existing connection & reset state on session change
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    clearReconnectTimeout();
    clearTimers();
    setMessages([]);
    setStreamingText(null);
    setWaitingForReply(false);
    connectionIdRef.current = "";
    serverSequenceRef.current = 0;
    connectFailCountRef.current = 0;

    // Small delay to ensure doConnectRef is updated with new sessionId
    const t = setTimeout(() => doConnect(), 50);
    return () => {
      clearTimeout(t);
      clearReconnectTimeout();
      clearTimers();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [sessionId, doConnect, clearReconnectTimeout, clearTimers]);

  const sendMessage = useCallback((text: string, images?: { data: string; mimeType: string }[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const localMsg: StoredMessage = {
        id: `local-${Date.now()}`,
        text,
        timestamp: Date.now(),
        role: "user",
        ...(images && images.length > 0
          ? { images: images.map((img) => `data:${img.mimeType};base64,${img.data}`) }
          : {}),
      };
      setMessages((prev) => [...prev, localMsg]);
      setWaitingForReply(true);
      const payload: any = { type: "message", text };
      if (images && images.length > 0) {
        payload.images = images.map((img) => ({
          type: "image" as const,
          data: img.data,
          mimeType: img.mimeType,
        }));
      }
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  // Debug state visible on screen
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const addDebug = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setDebugLog((prev) => [...prev.slice(-15), `${ts} ${msg}`]);
  }, []);

  return {
    messages,
    streamingText,
    connectionState,
    waitingForReply,
    sendMessage,
    debugLog,
    addDebug,
  };
}
