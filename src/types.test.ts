import { describe, it, expect } from "vitest";
import type {
  StoredMessage,
  WsClientMessage,
  WsServerMessage,
  ResolvedPwaChatAccount,
} from "./types.js";
import { CHANNEL_ID, MAX_HISTORY, STREAMING_TIMEOUT_MS } from "./types.js";

describe("types.ts — 상수 및 타입 정의", () => {
  describe("상수 검증", () => {
    it("CHANNEL_ID는 'pwa-chat'이어야 함", () => {
      expect(CHANNEL_ID).toBe("pwa-chat");
    });

    it("MAX_HISTORY는 500이어야 함", () => {
      expect(MAX_HISTORY).toBe(500);
    });

    it("STREAMING_TIMEOUT_MS는 30000이어야 함", () => {
      expect(STREAMING_TIMEOUT_MS).toBe(30_000);
    });
  });

  describe("StoredMessage 타입", () => {
    it("유효한 user 메시지 구조", () => {
      const msg: StoredMessage = {
        id: "test-1",
        text: "안녕하세요",
        timestamp: Date.now(),
        role: "user",
      };
      expect(msg.role).toBe("user");
      expect(msg.text).toBe("안녕하세요");
    });

    it("유효한 assistant 메시지 구조", () => {
      const msg: StoredMessage = {
        id: "test-2",
        text: "네, 무엇을 도와드릴까요?",
        timestamp: Date.now(),
        role: "assistant",
      };
      expect(msg.role).toBe("assistant");
    });
  });

  describe("WsClientMessage 타입", () => {
    it("message 타입 메시지", () => {
      const msg: WsClientMessage = {
        type: "message",
        text: "테스트",
      };
      expect(msg.type).toBe("message");
      if (msg.type === "message") {
        expect(msg.text).toBe("테스트");
      }
    });

    it("ping 타입 메시지", () => {
      const msg: WsClientMessage = { type: "ping" };
      expect(msg.type).toBe("ping");
    });
  });

  describe("WsServerMessage 타입", () => {
    it("hello 메시지", () => {
      const msg: WsServerMessage = {
        type: "hello",
        connectionId: "conn-123",
        seq: 0,
      };
      expect(msg.type).toBe("hello");
      expect(msg.seq).toBe(0);
    });

    it("history 메시지", () => {
      const msg: WsServerMessage = {
        type: "history",
        messages: [],
        seq: 1,
      };
      expect(msg.type).toBe("history");
      expect(msg.messages).toEqual([]);
    });

    it("streaming 메시지", () => {
      const msg: WsServerMessage = {
        type: "streaming",
        text: "진행 중...",
        seq: 2,
      };
      expect(msg.type).toBe("streaming");
      if (msg.type === "streaming") {
        expect(msg.text).toBe("진행 중...");
      }
    });
  });

  describe("ResolvedPwaChatAccount 타입", () => {
    it("유효한 계정 구조", () => {
      const account: ResolvedPwaChatAccount = {
        accountId: "default",
        enabled: true,
        port: 19999,
        host: "127.0.0.1",
      };
      expect(account.enabled).toBe(true);
      expect(account.port).toBe(19999);
    });
  });
});
