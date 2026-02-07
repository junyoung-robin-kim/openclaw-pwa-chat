import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { StoredMessage } from "./types.js";
import { readHistory, appendMessage, nextMessageId } from "./message-store.js";

const STORE_DIR = path.join(process.env.HOME || "/tmp", ".openclaw", "pwa-chat-history");

describe("message-store.ts — 메시지 영속성", () => {
  const testUserId = "test-user-" + Date.now();
  const testPath = path.join(STORE_DIR, `${testUserId}.json`);

  beforeEach(() => {
    // 테스트 파일 정리
    if (fs.existsSync(testPath)) {
      fs.unlinkSync(testPath);
    }
  });

  afterEach(() => {
    // 테스트 파일 정리
    if (fs.existsSync(testPath)) {
      fs.unlinkSync(testPath);
    }
  });

  describe("readHistory", () => {
    it("파일이 없으면 빈 배열 반환", () => {
      const history = readHistory(testUserId);
      expect(history).toEqual([]);
    });

    it("저장된 메시지를 읽어옴", () => {
      const msg: StoredMessage = {
        id: "msg-1",
        text: "테스트 메시지",
        timestamp: Date.now(),
        role: "user",
      };

      appendMessage(testUserId, msg);
      const history = readHistory(testUserId);

      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(msg);
    });

    it("잘못된 JSON 파일이면 빈 배열 반환", () => {
      fs.mkdirSync(STORE_DIR, { recursive: true });
      fs.writeFileSync(testPath, "invalid json{");

      const history = readHistory(testUserId);
      expect(history).toEqual([]);
    });
  });

  describe("appendMessage", () => {
    it("새 메시지를 추가하고 파일에 저장", () => {
      const msg: StoredMessage = {
        id: "msg-1",
        text: "첫 메시지",
        timestamp: Date.now(),
        role: "user",
      };

      appendMessage(testUserId, msg);

      expect(fs.existsSync(testPath)).toBe(true);
      const history = readHistory(testUserId);
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(msg);
    });

    it("여러 메시지를 순서대로 추가", () => {
      const msg1: StoredMessage = {
        id: "msg-1",
        text: "첫 번째",
        timestamp: Date.now(),
        role: "user",
      };
      const msg2: StoredMessage = {
        id: "msg-2",
        text: "두 번째",
        timestamp: Date.now(),
        role: "assistant",
      };

      appendMessage(testUserId, msg1);
      appendMessage(testUserId, msg2);

      const history = readHistory(testUserId);
      expect(history).toHaveLength(2);
      expect(history[0]).toEqual(msg1);
      expect(history[1]).toEqual(msg2);
    });

    it("MAX_HISTORY(500)를 초과하면 오래된 메시지 제거", () => {
      // 501개의 메시지 추가
      for (let i = 0; i < 501; i++) {
        const msg: StoredMessage = {
          id: `msg-${i}`,
          text: `메시지 ${i}`,
          timestamp: Date.now() + i,
          role: i % 2 === 0 ? "user" : "assistant",
        };
        appendMessage(testUserId, msg);
      }

      const history = readHistory(testUserId);
      expect(history).toHaveLength(500);
      // 첫 번째 메시지(msg-0)는 제거되고 msg-1부터 시작
      expect(history[0].id).toBe("msg-1");
      expect(history[499].id).toBe("msg-500");
    });

    it("디렉토리가 없으면 자동 생성", () => {
      const newUserId = "new-user-" + Date.now();
      const newPath = path.join(STORE_DIR, `${newUserId}.json`);

      try {
        const msg: StoredMessage = {
          id: "msg-1",
          text: "테스트",
          timestamp: Date.now(),
          role: "user",
        };

        appendMessage(newUserId, msg);
        expect(fs.existsSync(newPath)).toBe(true);
      } finally {
        if (fs.existsSync(newPath)) {
          fs.unlinkSync(newPath);
        }
      }
    });

    it("특수문자가 포함된 userId 처리", () => {
      const specialUserId = "user@example.com/device#1";
      const safeName = specialUserId.replace(/[^a-zA-Z0-9_-]/g, "_");
      const specialPath = path.join(STORE_DIR, `${safeName}.json`);

      try {
        const msg: StoredMessage = {
          id: "msg-1",
          text: "특수문자 테스트",
          timestamp: Date.now(),
          role: "user",
        };

        appendMessage(specialUserId, msg);
        expect(fs.existsSync(specialPath)).toBe(true);

        const history = readHistory(specialUserId);
        expect(history).toHaveLength(1);
      } finally {
        if (fs.existsSync(specialPath)) {
          fs.unlinkSync(specialPath);
        }
      }
    });
  });

  describe("nextMessageId", () => {
    it("prefix + timestamp + random 형식의 고유 ID 생성", () => {
      const id1 = nextMessageId("test");
      const id2 = nextMessageId("test");
      const id3 = nextMessageId("other");

      expect(id1).toMatch(/^test-[a-z0-9]+-[a-z0-9]+$/);
      expect(id2).toMatch(/^test-[a-z0-9]+-[a-z0-9]+$/);
      expect(id3).toMatch(/^other-[a-z0-9]+-[a-z0-9]+$/);

      // ID는 고유해야 함
      expect(id1).not.toBe(id2);
    });

    it("서로 다른 prefix로 ID 생성", () => {
      const inId = nextMessageId("in");
      const outId = nextMessageId("out");

      expect(inId).toMatch(/^in-/);
      expect(outId).toMatch(/^out-/);
    });
  });
});
