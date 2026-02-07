import { useState, useCallback, useEffect } from "react";

export type SessionInfo = {
  sessionId: string;
  messageCount: number;
  lastTimestamp: number;
};

function getAuthToken(): string {
  return (window as any).__PWA_AUTH_TOKEN__ || "";
}

export function useSessions() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    return localStorage.getItem("pwa-chat-session") || "default";
  });

  const fetchSessions = useCallback(async () => {
    try {
      const token = getAuthToken();
      const res = await fetch("/api/sessions", {
        headers: token ? { "X-Auth-Token": token } : {},
      });
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const switchSession = useCallback((sessionId: string) => {
    localStorage.setItem("pwa-chat-session", sessionId);
    setCurrentSessionId(sessionId);
  }, []);

  const createSession = useCallback(() => {
    const id = `default:${Date.now().toString(36)}`;
    switchSession(id);
    fetchSessions();
    return id;
  }, [switchSession, fetchSessions]);

  const deleteSession = useCallback(
    async (sessionId: string) => {
      const token = getAuthToken();
      await fetch("/api/sessions", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "X-Auth-Token": token } : {}),
        },
        body: JSON.stringify({ sessionId }),
      });
      if (currentSessionId === sessionId) {
        switchSession("default");
      }
      fetchSessions();
    },
    [currentSessionId, switchSession, fetchSessions],
  );

  return { sessions, currentSessionId, switchSession, createSession, deleteSession, fetchSessions };
}
