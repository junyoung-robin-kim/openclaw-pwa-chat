// Lv.0 — Primitives

export type StoredMessage = {
  id: string;
  text: string;
  timestamp: number;
  role: "user" | "assistant";
};

export type WsClientMessage =
  | { type: "message"; text: string }
  | { type: "ping" }
  | { type: "resync" };

export type WsServerMessage =
  | { type: "hello"; connectionId: string; seq: number }
  | { type: "pong"; seq?: number }
  | { type: "history"; messages: StoredMessage[]; seq: number }
  | { type: "message"; msg: StoredMessage; seq: number }
  | { type: "streaming"; text: string; seq: number }
  | { type: "streaming_end"; seq: number };

export type ResolvedPwaChatAccount = {
  accountId: string;
  enabled: boolean;
  port: number;
  host: string;
};

export const CHANNEL_ID = "pwa-chat" as const;
export const MAX_HISTORY = 500;
export const STREAMING_TIMEOUT_MS = 30_000;
