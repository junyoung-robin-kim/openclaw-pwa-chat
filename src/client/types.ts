export type StoredMessage = {
  id: string;
  text: string;
  timestamp: number;
  role: "user" | "assistant";
  images?: string[]; // data URLs for display
  mediaUrl?: string; // server media URL (local file or HTTP URL)
};

export type WsClientMessage = {
  type: "message";
  text: string;
};

export type WsServerMessage =
  | { type: "history"; messages: StoredMessage[] }
  | { type: "message"; msg: StoredMessage }
  | { type: "streaming"; text: string }
  | { type: "streaming_end" };

export type ConnectionState = "connecting" | "connected" | "disconnected";
