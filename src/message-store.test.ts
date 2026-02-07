import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { StoredMessage } from "./types.js";
import {
  readHistory,
  appendMessage,
  nextMessageId,
  listSessions,
  deleteSession,
} from "./message-store.js";

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

    it("mediaUrl이 있는 메시지는 mediaUrl 필드 포함하여 저장", () => {
      const msg: StoredMessage = {
        id: "msg-with-media",
        text: "이미지가 포함된 메시지",
        timestamp: Date.now(),
        role: "assistant",
        mediaUrl: "http://localhost:19999/api/media?path=/tmp/test.png",
      };

      appendMessage(testUserId, msg);

      const history = readHistory(testUserId);
      expect(history).toHaveLength(1);
      expect(history[0].mediaUrl).toBe("http://localhost:19999/api/media?path=/tmp/test.png");
    });

    it("mediaUrl이 없는 메시지는 mediaUrl 필드 없음", () => {
      const msg: StoredMessage = {
        id: "msg-no-media",
        text: "텍스트만 있는 메시지",
        timestamp: Date.now(),
        role: "user",
      };

      appendMessage(testUserId, msg);

      const history = readHistory(testUserId);
      expect(history).toHaveLength(1);
      expect(history[0].mediaUrl).toBeUndefined();
    });

    it("같은 세션에 mediaUrl 있는/없는 메시지 혼합 저장", () => {
      const msg1: StoredMessage = {
        id: "msg-1",
        text: "텍스트만",
        timestamp: Date.now(),
        role: "user",
      };
      const msg2: StoredMessage = {
        id: "msg-2",
        text: "이미지 포함",
        timestamp: Date.now() + 1,
        role: "assistant",
        mediaUrl: "http://localhost:19999/api/media?path=/tmp/image.jpg",
      };
      const msg3: StoredMessage = {
        id: "msg-3",
        text: "다시 텍스트만",
        timestamp: Date.now() + 2,
        role: "user",
      };

      appendMessage(testUserId, msg1);
      appendMessage(testUserId, msg2);
      appendMessage(testUserId, msg3);

      const history = readHistory(testUserId);
      expect(history).toHaveLength(3);
      expect(history[0].mediaUrl).toBeUndefined();
      expect(history[1].mediaUrl).toBe("http://localhost:19999/api/media?path=/tmp/image.jpg");
      expect(history[2].mediaUrl).toBeUndefined();
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

  describe("listSessions", () => {
    const testUsers = ["list-user-1", "list-user-2", "list-user-3"];
    const testPaths = testUsers.map((u) => path.join(STORE_DIR, `${u}.json`));

    beforeEach(() => {
      testPaths.forEach((p) => {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      });
    });

    afterEach(() => {
      testPaths.forEach((p) => {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      });
    });

    it("세션이 없으면 빈 배열 반환", () => {
      const sessions = listSessions();
      expect(Array.isArray(sessions)).toBe(true);
    });

    it("저장된 세션 목록을 반환", () => {
      const msg1: StoredMessage = {
        id: "msg-1",
        text: "첫 메시지",
        timestamp: 1000,
        role: "user",
      };
      const msg2: StoredMessage = {
        id: "msg-2",
        text: "두 번째 메시지",
        timestamp: 2000,
        role: "assistant",
      };

      appendMessage(testUsers[0], msg1);
      appendMessage(testUsers[1], msg2);

      const sessions = listSessions();
      const testSessions = sessions.filter((s) => testUsers.includes(s.sessionId));

      expect(testSessions.length).toBeGreaterThanOrEqual(2);

      const session1 = testSessions.find((s) => s.sessionId === testUsers[0]);
      const session2 = testSessions.find((s) => s.sessionId === testUsers[1]);

      expect(session1).toBeDefined();
      expect(session1?.messageCount).toBe(1);
      expect(session1?.lastTimestamp).toBe(1000);

      expect(session2).toBeDefined();
      expect(session2?.messageCount).toBe(1);
      expect(session2?.lastTimestamp).toBe(2000);
    });

    it("세션은 lastTimestamp 내림차순 정렬", () => {
      const oldMsg: StoredMessage = {
        id: "old",
        text: "오래된 메시지",
        timestamp: 1000,
        role: "user",
      };
      const newMsg: StoredMessage = {
        id: "new",
        text: "최근 메시지",
        timestamp: 3000,
        role: "user",
      };

      appendMessage(testUsers[0], oldMsg);
      appendMessage(testUsers[1], newMsg);

      const sessions = listSessions();
      const testSessions = sessions.filter((s) => testUsers.includes(s.sessionId));

      expect(testSessions[0].lastTimestamp).toBeGreaterThanOrEqual(testSessions[1].lastTimestamp);
    });

    it("여러 메시지가 있는 세션의 messageCount 정확히 계산", () => {
      for (let i = 0; i < 5; i++) {
        appendMessage(testUsers[0], {
          id: `msg-${i}`,
          text: `메시지 ${i}`,
          timestamp: Date.now() + i,
          role: i % 2 === 0 ? "user" : "assistant",
        });
      }

      const sessions = listSessions();
      const session = sessions.find((s) => s.sessionId === testUsers[0]);

      expect(session?.messageCount).toBe(5);
    });

    it("잘못된 JSON 파일이 있어도 에러 없이 처리", () => {
      fs.mkdirSync(STORE_DIR, { recursive: true });
      const corruptPath = path.join(STORE_DIR, "corrupt-session.json");
      fs.writeFileSync(corruptPath, "invalid json{");

      try {
        const sessions = listSessions();
        const corrupt = sessions.find((s) => s.sessionId === "corrupt-session");
        expect(corrupt?.messageCount).toBe(0);
        expect(corrupt?.lastTimestamp).toBe(0);
      } finally {
        if (fs.existsSync(corruptPath)) fs.unlinkSync(corruptPath);
      }
    });

    it("빈 메시지 배열을 가진 세션도 정상 처리", () => {
      fs.mkdirSync(STORE_DIR, { recursive: true });
      const emptyPath = path.join(STORE_DIR, `${testUsers[0]}.json`);
      fs.writeFileSync(emptyPath, "[]");

      const sessions = listSessions();
      const empty = sessions.find((s) => s.sessionId === testUsers[0]);

      expect(empty?.messageCount).toBe(0);
      expect(empty?.lastTimestamp).toBe(0);
    });
  });

  describe("deleteSession", () => {
    const testUserId = "delete-user-" + Date.now();
    const testPath = path.join(STORE_DIR, `${testUserId}.json`);

    beforeEach(() => {
      if (fs.existsSync(testPath)) fs.unlinkSync(testPath);
    });

    afterEach(() => {
      if (fs.existsSync(testPath)) fs.unlinkSync(testPath);
    });

    it("존재하는 세션을 삭제하고 true 반환", () => {
      const msg: StoredMessage = {
        id: "msg-1",
        text: "삭제될 메시지",
        timestamp: Date.now(),
        role: "user",
      };

      appendMessage(testUserId, msg);
      expect(fs.existsSync(testPath)).toBe(true);

      const result = deleteSession(testUserId);

      expect(result).toBe(true);
      expect(fs.existsSync(testPath)).toBe(false);
    });

    it("존재하지 않는 세션 삭제 시도는 false 반환", () => {
      const result = deleteSession("non-existent-session-" + Date.now());
      expect(result).toBe(false);
    });

    it("삭제 후 해당 세션의 히스토리는 빈 배열", () => {
      const msg: StoredMessage = {
        id: "msg-1",
        text: "테스트",
        timestamp: Date.now(),
        role: "user",
      };

      appendMessage(testUserId, msg);
      deleteSession(testUserId);

      const history = readHistory(testUserId);
      expect(history).toEqual([]);
    });

    it("삭제 후 listSessions에서 제외됨", () => {
      const msg: StoredMessage = {
        id: "msg-1",
        text: "테스트",
        timestamp: Date.now(),
        role: "user",
      };

      appendMessage(testUserId, msg);

      let sessions = listSessions();
      expect(sessions.some((s) => s.sessionId === testUserId)).toBe(true);

      deleteSession(testUserId);

      sessions = listSessions();
      expect(sessions.some((s) => s.sessionId === testUserId)).toBe(false);
    });

    it("특수문자가 포함된 sessionId도 삭제 가능", () => {
      const specialId = "user@example.com/device#1";
      const msg: StoredMessage = {
        id: "msg-1",
        text: "특수문자 테스트",
        timestamp: Date.now(),
        role: "user",
      };

      appendMessage(specialId, msg);
      const result = deleteSession(specialId);

      expect(result).toBe(true);

      const history = readHistory(specialId);
      expect(history).toEqual([]);
    });
  });
});
