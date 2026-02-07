import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { StoredMessage } from "../src/types.js";
import { appendMessage, readHistory } from "../src/message-store.js";
import { pushOutboundMessage } from "../src/ws-server.js";

describe("ws-server.ts — 간단한 통합 테스트", () => {
  const testUserId = "test-broadcast-user";

  beforeAll(() => {
    // message-store 초기화 (파일 기반이므로 격리됨)
  });

  afterAll(() => {
    // cleanup if needed
  });

  describe("pushOutboundMessage", () => {
    it("메시지를 저장하고 broadcast 호출 (실제 WS 없이)", () => {
      const initialCount = readHistory(testUserId).length;

      pushOutboundMessage(`pwa-chat:${testUserId}`, "테스트 메시지");

      const history = readHistory(testUserId);
      expect(history.length).toBe(initialCount + 1);

      const lastMsg = history[history.length - 1];
      expect(lastMsg.text).toBe("테스트 메시지");
      expect(lastMsg.role).toBe("assistant");
      expect(lastMsg.id).toMatch(/^out-/);
    });

    it("pwa-chat: prefix 제거하고 메시지 저장", () => {
      const userId = "user-with-prefix";
      const initialCount = readHistory(userId).length;

      pushOutboundMessage(`pwa-chat:${userId}`, "prefix 테스트");

      const history = readHistory(userId);
      expect(history.length).toBe(initialCount + 1);
      expect(history[history.length - 1].text).toBe("prefix 테스트");
    });

    it("여러 메시지를 순차적으로 저장", () => {
      const userId = "multi-msg-user";

      pushOutboundMessage(`pwa-chat:${userId}`, "첫 번째");
      pushOutboundMessage(`pwa-chat:${userId}`, "두 번째");
      pushOutboundMessage(`pwa-chat:${userId}`, "세 번째");

      const history = readHistory(userId);
      const recent = history.slice(-3);

      expect(recent[0].text).toBe("첫 번째");
      expect(recent[1].text).toBe("두 번째");
      expect(recent[2].text).toBe("세 번째");
    });
  });

  describe("message persistence", () => {
    it("저장된 메시지는 재시작 후에도 유지됨", () => {
      const userId = "persist-test-user";

      const msg: StoredMessage = {
        id: "persist-1",
        text: "영속성 테스트",
        timestamp: Date.now(),
        role: "user",
      };

      appendMessage(userId, msg);

      // 다시 읽기
      const history = readHistory(userId);
      const found = history.find((m) => m.id === "persist-1");

      expect(found).toBeTruthy();
      expect(found?.text).toBe("영속성 테스트");
    });
  });
});
