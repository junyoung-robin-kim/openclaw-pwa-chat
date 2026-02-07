import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { StoredMessage } from "./types.js";
import { readHistory, deleteSession } from "./message-store.js";
import { pushOutboundMessage } from "./ws-server.js";

const STORE_DIR = path.join(process.env.HOME || "/tmp", ".openclaw", "pwa-chat-history");

describe("ws-server.ts — pushOutboundMessage", () => {
  const testUserId = "ws-test-user-" + Date.now();
  const testPath = path.join(STORE_DIR, `${testUserId}.json`);

  beforeEach(() => {
    // 테스트 파일 정리
    if (fs.existsSync(testPath)) {
      fs.unlinkSync(testPath);
    }
  });

  afterEach(() => {
    // 테스트 파일 정리
    deleteSession(testUserId);
  });

  describe("mediaUrl 파라미터", () => {
    it("mediaUrl이 제공되면 StoredMessage에 포함됨", () => {
      const testMediaUrl = "http://localhost:19999/api/media?path=/tmp/test.png";

      pushOutboundMessage(testUserId, "이미지를 보내드립니다", testMediaUrl);

      const history = readHistory(testUserId);
      expect(history).toHaveLength(1);

      const msg = history[0];
      expect(msg.text).toBe("이미지를 보내드립니다");
      expect(msg.role).toBe("assistant");
      expect(msg.mediaUrl).toBe(testMediaUrl);
      expect(msg.id).toMatch(/^out-/);
      expect(msg.timestamp).toBeGreaterThan(0);
    });

    it("mediaUrl이 없으면 StoredMessage에 mediaUrl 필드 없음", () => {
      pushOutboundMessage(testUserId, "텍스트만 보냅니다");

      const history = readHistory(testUserId);
      expect(history).toHaveLength(1);

      const msg = history[0];
      expect(msg.text).toBe("텍스트만 보냅니다");
      expect(msg.role).toBe("assistant");
      expect(msg.mediaUrl).toBeUndefined();
      expect(msg.id).toMatch(/^out-/);
    });

    it("mediaUrl을 명시적으로 undefined로 전달하면 필드 없음", () => {
      pushOutboundMessage(testUserId, "명시적 undefined", undefined);

      const history = readHistory(testUserId);
      expect(history).toHaveLength(1);

      const msg = history[0];
      expect(msg.mediaUrl).toBeUndefined();
    });

    it("빈 문자열 mediaUrl은 필드 없음 (falsy 처리)", () => {
      pushOutboundMessage(testUserId, "빈 문자열 테스트", "");

      const history = readHistory(testUserId);
      expect(history).toHaveLength(1);

      const msg = history[0];
      // 빈 문자열은 falsy이므로 mediaUrl 필드가 생성되지 않음
      expect(msg.mediaUrl).toBeUndefined();
    });

    it("여러 메시지를 순차적으로 보내면 각각 올바르게 저장", () => {
      pushOutboundMessage(testUserId, "첫 번째 메시지");
      pushOutboundMessage(
        testUserId,
        "두 번째 메시지 (이미지)",
        "http://localhost:19999/api/media?path=/tmp/image1.jpg",
      );
      pushOutboundMessage(testUserId, "세 번째 메시지");
      pushOutboundMessage(
        testUserId,
        "네 번째 메시지 (이미지)",
        "http://localhost:19999/api/media?path=/tmp/image2.png",
      );

      const history = readHistory(testUserId);
      expect(history).toHaveLength(4);

      expect(history[0].text).toBe("첫 번째 메시지");
      expect(history[0].mediaUrl).toBeUndefined();

      expect(history[1].text).toBe("두 번째 메시지 (이미지)");
      expect(history[1].mediaUrl).toBe("http://localhost:19999/api/media?path=/tmp/image1.jpg");

      expect(history[2].text).toBe("세 번째 메시지");
      expect(history[2].mediaUrl).toBeUndefined();

      expect(history[3].text).toBe("네 번째 메시지 (이미지)");
      expect(history[3].mediaUrl).toBe("http://localhost:19999/api/media?path=/tmp/image2.png");
    });

    it("pwa-chat: 프리픽스가 있는 userId는 정규화됨", () => {
      const prefixedUserId = `pwa-chat:${testUserId}`;

      pushOutboundMessage(prefixedUserId, "프리픽스 테스트", "http://example.com/media.jpg");

      // 내부적으로 pwa-chat: 프리픽스가 제거되어 저장됨
      const history = readHistory(testUserId);
      expect(history).toHaveLength(1);
      expect(history[0].text).toBe("프리픽스 테스트");
      expect(history[0].mediaUrl).toBe("http://example.com/media.jpg");
    });
  });

  describe("메시지 ID 생성", () => {
    it("모든 outbound 메시지는 'out-' 프리픽스로 시작", () => {
      pushOutboundMessage(testUserId, "테스트 1");
      pushOutboundMessage(testUserId, "테스트 2", "http://example.com/img.png");

      const history = readHistory(testUserId);
      expect(history[0].id).toMatch(/^out-/);
      expect(history[1].id).toMatch(/^out-/);
    });

    it("각 메시지는 고유한 ID를 가짐", () => {
      pushOutboundMessage(testUserId, "메시지 1");
      pushOutboundMessage(testUserId, "메시지 2");
      pushOutboundMessage(testUserId, "메시지 3");

      const history = readHistory(testUserId);
      const ids = history.map((m) => m.id);

      // Set으로 변환했을 때 길이가 같으면 모두 고유
      expect(new Set(ids).size).toBe(3);
    });
  });

  describe("timestamp", () => {
    it("각 메시지는 현재 시간의 timestamp를 가짐", () => {
      const before = Date.now();
      pushOutboundMessage(testUserId, "타임스탬프 테스트");
      const after = Date.now();

      const history = readHistory(testUserId);
      expect(history[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(history[0].timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe("role", () => {
    it("pushOutboundMessage로 생성된 메시지는 항상 role=assistant", () => {
      pushOutboundMessage(testUserId, "어시스턴트 메시지");
      pushOutboundMessage(testUserId, "이미지 포함", "http://example.com/img.jpg");

      const history = readHistory(testUserId);
      expect(history[0].role).toBe("assistant");
      expect(history[1].role).toBe("assistant");
    });
  });
});
