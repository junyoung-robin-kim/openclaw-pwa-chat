export type StoredMessage = {
  id: string;
  text: string;
  timestamp: number;
  role: "user" | "assistant";
  images?: string[]; // data URLs for display
  mediaUrl?: string; // server media URL (local file or HTTP URL)
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

export type ConnectionState = "connecting" | "connected" | "disconnected";
