// WebSocket server: manages client connections, broadcasts messages/streaming

import type { Server as HttpServer, IncomingMessage } from "node:http";
import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { randomUUID } from "node:crypto";
import { createReplyPrefixOptions } from "openclaw/plugin-sdk";
import { WebSocketServer, WebSocket } from "ws";
import { checkAuth } from "./auth.js";
import { readHistory, appendMessage, nextMessageId } from "./message-store.js";
import { sendPushNotification } from "./push.js";
import { getRuntime } from "./runtime.js";
import {
  type StoredMessage,
  type WsClientMessage,
  type WsServerMessage,
  CHANNEL_ID,
  STREAMING_TIMEOUT_MS,
} from "./types.js";

// ===== Per-user sequence counter & event buffer =====
const EVENT_BUFFER_SIZE = 500;

interface UserState {
  sequence: number;
  eventBuffer: Array<{ seq: number; msg: WsServerMessage }>;
  clients: Set<ClientInfo>;
}

function getUserState(userId: string): UserState {
  let state = userStates.get(userId);
  if (!state) {
    state = { sequence: 0, eventBuffer: [], clients: new Set() };
    userStates.set(userId, state);
  }
  return state;
}

const userStates = new Map<string, UserState>();

function getNextSeq(userId: string): number {
  const state = getUserState(userId);
  return state.sequence++;
}

function addToBuffer(userId: string, msg: WsServerMessage, seq: number): void {
  const state = getUserState(userId);
  state.eventBuffer.push({ seq, msg });
  if (state.eventBuffer.length > EVENT_BUFFER_SIZE) {
    state.eventBuffer.shift();
  }
}

// ===== Client tracking =====
interface ClientInfo {
  ws: WebSocket;
  connectionId: string;
}

function addClient(userId: string, info: ClientInfo): void {
  getUserState(userId).clients.add(info);
}

function removeClient(userId: string, info: ClientInfo): void {
  const state = userStates.get(userId);
  if (!state) return;
  state.clients.delete(info);
}

function broadcast(
  userId: string,
  msgWithoutSeq: Omit<WsServerMessage, "seq">,
  log?: { info: (msg: string) => void },
): void {
  const state = getUserState(userId);

  const seq = getNextSeq(userId);
  const msg = { ...msgWithoutSeq, seq } as WsServerMessage;
  addToBuffer(userId, msg, seq);

  const data = JSON.stringify(msg);
  let sent = 0;
  for (const info of state.clients) {
    if (info.ws.readyState === WebSocket.OPEN) {
      info.ws.send(data);
      sent++;
    }
  }
  console.log(
    `[pwa-chat] broadcast type=${(msg as any).type} seq=${seq} to=${sent}/${state.clients.size} clients`,
  );
}

// ===== Streaming state =====
const streamingState = new Map<string, { text: string; timer: ReturnType<typeof setTimeout> }>();

function clearStreamingTimeout(userId: string): void {
  const state = streamingState.get(userId);
  if (state) clearTimeout(state.timer);
}

function setStreamingText(userId: string, text: string): void {
  clearStreamingTimeout(userId);
  const timer = setTimeout(() => {
    streamingState.delete(userId);
    broadcast(userId, { type: "streaming_end" } as any);
  }, STREAMING_TIMEOUT_MS);
  streamingState.set(userId, { text, timer });
  broadcast(userId, { type: "streaming", text } as any);
}

function endStreaming(userId: string): void {
  clearStreamingTimeout(userId);
  streamingState.delete(userId);
  broadcast(userId, { type: "streaming_end" } as any);
}

// ===== Public: push messages =====
export function pushOutboundMessage(to: string, text: string, mediaUrl?: string): void {
  const userId = normalizeTarget(to);
  const msg: StoredMessage = {
    id: nextMessageId("out"),
    text,
    timestamp: Date.now(),
    role: "assistant",
    ...(mediaUrl && { mediaUrl }),
  };
  appendMessage(userId, msg);
  broadcast(userId, { type: "message", msg } as any);

  // Send push only when no active WS connections (user not looking at the app)
  const activeClients = getUserState(userId).clients.size;
  if (activeClients === 0) {
    const preview = text.length > 100 ? text.slice(0, 100) + "…" : text;
    void sendPushNotification(userId, {
      title: "🦞 JKLobster",
      body: preview,
      tag: "pwa-chat-reply",
    }).catch(() => {});
  }
}

function normalizeTarget(target: string): string {
  return target.replace(/^pwa-chat:/, "");
}

// ===== Inbound dispatch =====
export type ImageContent = { type: "image"; data: string; mimeType: string };

async function dispatchInbound(params: {
  text: string;
  userId: string;
  cfg: OpenClawConfig;
  accountId: string;
  images?: ImageContent[];
  log?: { info: (msg: string) => void; error: (msg: string) => void };
}): Promise<void> {
  const { text, userId, cfg, accountId, images, log } = params;
  const core = getRuntime();

  const fromAddress = `pwa-chat:${userId}`;
  const toAddress = fromAddress;

  const storePath = core.channel.session.resolveStorePath((cfg as any).session?.store);
  const route = core.channel.routing.resolveAgentRoute({
    cfg,
    channel: CHANNEL_ID,
    accountId,
    peer: { kind: "dm", id: fromAddress },
  });

  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(cfg);
  const previousTimestamp = await core.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });

  const body = core.channel.reply.formatInboundEnvelope({
    channel: "PWA Chat",
    from: userId,
    timestamp: Date.now(),
    body: text,
    chatType: "direct",
    sender: { id: userId },
    previousTimestamp,
    envelope: envelopeOptions,
  });

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: text,
    CommandBody: text,
    From: fromAddress,
    To: toAddress,
    SessionKey: route.sessionKey,
    AccountId: accountId,
    ChatType: "direct" as const,
    ConversationLabel: `PWA Chat (${userId})`,
    SenderId: userId,
    Provider: CHANNEL_ID,
    Surface: CHANNEL_ID,
    MessageSid: `pwa-${Date.now()}`,
    Timestamp: Date.now(),
    OriginatingChannel: CHANNEL_ID as string,
    OriginatingTo: toAddress,
    CommandAuthorized: true,
  });

  void core.channel.session
    .recordSessionMetaFromInbound({
      storePath,
      sessionKey: route.sessionKey,
      ctx: ctxPayload,
    })
    .catch(() => {});

  const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
    cfg,
    agentId: route.agentId,
    channel: CHANNEL_ID,
    accountId,
  });

  let accumulatedText = "";
  let finalDelivered = false;

  await (core.channel.reply.dispatchReplyWithBufferedBlockDispatcher as any)({
    ctx: ctxPayload,
    cfg,
    dispatcherOptions: {
      ...prefixOptions,
      deliver: async (payload: any, info: any) => {
        const chunk = typeof payload.text === "string" ? payload.text : "";
        log?.info(`pwa-chat: deliver kind=${info.kind} chunk=${chunk.length}chars`);

        if (info.kind === "final") {
          // Final delivery — push as outbound message
          finalDelivered = true;
          if (chunk) accumulatedText += chunk;
          if (accumulatedText) {
            pushOutboundMessage(fromAddress, accumulatedText);
          }
          endStreaming(userId);
        } else if (info.kind === "block" && chunk) {
          // Block = streaming chunk
          accumulatedText += chunk;
          setStreamingText(userId, accumulatedText);
        }
      },
      onError: (err: any, info: any) => {
        log?.error(`pwa-chat: ${info.kind} reply failed: ${String(err)}`);
      },
    },
    replyOptions: {
      onModelSelected,
      images,
    },
  });

  // Safety: if deliver(final) was never called, push what we have
  if (!finalDelivered && accumulatedText) {
    pushOutboundMessage(fromAddress, accumulatedText);
    endStreaming(userId);
  }
}

// ===== WebSocket server setup =====
let wss: WebSocketServer | null = null;

export function setupWebSocketServer(
  server: HttpServer,
  cfg: OpenClawConfig,
  accountId: string,
  log?: { info: (msg: string) => void; error: (msg: string) => void },
): void {
  wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket, head) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    if (!checkAuth(req, cfg)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss!.handleUpgrade(req, socket, head, (ws) => {
      const baseUserId = url.searchParams.get("userId") ?? "default";
      const sessionId = url.searchParams.get("sessionId") ?? "default";
      const userId = sessionId === "default" ? baseUserId : `${baseUserId}:${sessionId}`;
      handleConnection(ws, userId, cfg, accountId, log, url.searchParams);
    });
  });

  // Ping every 30s
  const pingInterval = setInterval(() => {
    if (!wss) {
      clearInterval(pingInterval);
      return;
    }
    for (const ws of wss.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }
  }, 30_000);

  wss.on("close", () => clearInterval(pingInterval));
}

function handleConnection(
  ws: WebSocket,
  userId: string,
  cfg: OpenClawConfig,
  accountId: string,
  log?: { info: (msg: string) => void; error: (msg: string) => void },
  urlParams?: URLSearchParams,
): void {
  const incomingConnectionId = urlParams?.get("connection_id") ?? "";
  const incomingSeq = parseInt(urlParams?.get("sequence_number") ?? "0", 10);

  const state = getUserState(userId);
  let connectionId: string = randomUUID();
  let shouldResync = true;

  // Check if reconnect
  if (incomingConnectionId) {
    const buf = state.eventBuffer;
    const minBufferedSeq = buf.length > 0 ? buf[0].seq : state.sequence;
    const maxBufferedSeq = buf.length > 0 ? buf[buf.length - 1].seq : state.sequence;

    if (incomingSeq >= minBufferedSeq && incomingSeq <= maxBufferedSeq) {
      connectionId = incomingConnectionId;
      shouldResync = false;
      log?.info(`pwa-chat: reconnect (connectionId=${connectionId}, seq=${incomingSeq})`);
    } else {
      log?.info(`pwa-chat: seq out of range, full resync (connectionId=${connectionId})`);
    }
  }

  const clientInfo: ClientInfo = { ws, connectionId };
  addClient(userId, clientInfo);
  log?.info(`pwa-chat: WS connected (userId=${userId}, connectionId=${connectionId})`);

  // Send hello
  const helloSeq = getNextSeq(userId);
  const helloMsg: WsServerMessage = { type: "hello", connectionId, seq: helloSeq };
  ws.send(JSON.stringify(helloMsg));

  if (shouldResync) {
    // Send full history
    const history = readHistory(userId);
    const historySeq = getNextSeq(userId);
    const historyMsg: WsServerMessage = { type: "history", messages: history, seq: historySeq };
    ws.send(JSON.stringify(historyMsg));
    addToBuffer(userId, historyMsg, historySeq);

    // Send current streaming state if any
    const current = streamingState.get(userId);
    if (current) {
      const streamSeq = getNextSeq(userId);
      const streamMsg: WsServerMessage = { type: "streaming", text: current.text, seq: streamSeq };
      ws.send(JSON.stringify(streamMsg));
      addToBuffer(userId, streamMsg, streamSeq);
    }
  } else {
    // Send only missed events from this user's buffer
    const missedEvents = state.eventBuffer.filter((e) => e.seq >= incomingSeq);
    for (const { msg } of missedEvents) {
      ws.send(JSON.stringify(msg));
    }
    log?.info(`pwa-chat: sent ${missedEvents.length} missed events`);
  }

  ws.on("message", (raw) => {
    let parsed: WsClientMessage;
    try {
      parsed = JSON.parse(raw.toString()) as WsClientMessage;
    } catch {
      return;
    }

    if (parsed.type === "ping") {
      // pong doesn't consume a seq number (not a data event)
      log?.info("pwa-chat: received ping, sending pong");
      ws.send(JSON.stringify({ type: "pong" }));
      return;
    }

    if (parsed.type === "resync") {
      log?.info(`pwa-chat: resync requested (userId=${userId}, connectionId=${connectionId})`);

      // Send full history
      const history = readHistory(userId);
      const historySeq = getNextSeq(userId);
      const historyMsg: WsServerMessage = { type: "history", messages: history, seq: historySeq };
      ws.send(JSON.stringify(historyMsg));
      addToBuffer(userId, historyMsg, historySeq);

      // Send current streaming state if any
      const current = streamingState.get(userId);
      if (current) {
        const streamSeq = getNextSeq(userId);
        const streamMsg: WsServerMessage = {
          type: "streaming",
          text: current.text,
          seq: streamSeq,
        };
        ws.send(JSON.stringify(streamMsg));
        addToBuffer(userId, streamMsg, streamSeq);
      }

      return;
    }

    if (parsed.type === "message" && typeof parsed.text === "string") {
      const text = parsed.text.trim();
      if (!text) return;

      // Parse images if present
      const images: ImageContent[] | undefined = (parsed as any).images;

      // Store user message
      const msg: StoredMessage = {
        id: nextMessageId("in"),
        text,
        timestamp: Date.now(),
        role: "user",
        ...(images && images.length > 0 ? { hasImages: true, imageCount: images.length } : {}),
      };
      appendMessage(userId, msg);

      // Broadcast to all tabs
      broadcast(userId, { type: "message", msg } as any);

      // Dispatch to agent
      log?.info(
        `pwa-chat: dispatching message from ${userId}: "${text.slice(0, 50)}"${images ? ` (+${images.length} images)` : ""}`,
      );
      dispatchInbound({ text, userId, cfg, accountId, images, log })
        .then(() => {
          log?.info(`pwa-chat: dispatch completed for ${userId}`);
        })
        .catch((err) => {
          log?.error(`pwa-chat: dispatch error: ${String(err)}`);
        });
    }
  });

  ws.on("close", () => {
    removeClient(userId, clientInfo);
    log?.info(`pwa-chat: WS disconnected (userId=${userId}, connectionId=${connectionId})`);
  });

  ws.on("error", (err) => {
    log?.error(`pwa-chat: WS error: ${String(err)}`);
    removeClient(userId, clientInfo);
  });
}

export function closeWebSocketServer(): void {
  if (wss) {
    wss.close();
    wss = null;
  }
}
