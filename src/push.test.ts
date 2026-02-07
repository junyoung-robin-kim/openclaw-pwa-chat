// @ts-ignore — no type declarations for web-push
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getVapidPublicKey,
  addSubscription,
  removeSubscription,
  sendPushNotification,
  type PushSubscription,
} from "./push.js";

// Mock web-push module
vi.mock("web-push", () => ({
  default: {
    generateVAPIDKeys: vi.fn(() => ({
      publicKey: "test-public-key-" + Math.random(),
      privateKey: "test-private-key-" + Math.random(),
    })),
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(() => Promise.resolve()),
  },
}));

const STORE_DIR = path.join(process.env.HOME || "/tmp", ".openclaw", "pwa-chat-push");
const VAPID_PATH = path.join(STORE_DIR, "vapid.json");
const SUBS_PATH = path.join(STORE_DIR, "subscriptions.json");

describe("push.ts — Web Push 알림", () => {
  beforeEach(() => {
    // 구독 파일만 정리 (VAPID 파일은 유지)
    if (fs.existsSync(SUBS_PATH)) fs.unlinkSync(SUBS_PATH);
    vi.clearAllMocks();
  });

  afterEach(() => {
    // 구독 파일만 정리
    if (fs.existsSync(SUBS_PATH)) fs.unlinkSync(SUBS_PATH);
    vi.clearAllMocks();
  });

  describe("getVapidPublicKey", () => {
    it("VAPID 공개키를 반환", () => {
      const key = getVapidPublicKey();
      expect(key).toBeTruthy();
      expect(typeof key).toBe("string");
    });

    it("VAPID 키가 자동 생성되고 파일에 저장됨", () => {
      // 첫 호출로 키 생성
      const key = getVapidPublicKey();
      expect(key).toBeTruthy();

      // 파일이 생성되었는지 확인 (첫 호출 또는 이전 테스트에서 생성됨)
      expect(fs.existsSync(VAPID_PATH)).toBe(true);

      // 파일 내용 확인
      const stored = JSON.parse(fs.readFileSync(VAPID_PATH, "utf8"));
      expect(stored.publicKey).toBeTruthy();
      expect(stored.privateKey).toBeTruthy();
    });

    it("기존 VAPID 키가 있으면 재사용", () => {
      const key1 = getVapidPublicKey();
      const key2 = getVapidPublicKey();
      expect(key1).toBe(key2);
    });

    it("파일에서 VAPID 키 구조 검증", () => {
      getVapidPublicKey(); // 키 생성 확인

      expect(fs.existsSync(VAPID_PATH)).toBe(true);
      const vapid = JSON.parse(fs.readFileSync(VAPID_PATH, "utf8"));

      expect(vapid).toHaveProperty("publicKey");
      expect(vapid).toHaveProperty("privateKey");
      expect(typeof vapid.publicKey).toBe("string");
      expect(typeof vapid.privateKey).toBe("string");
    });
  });

  describe("addSubscription", () => {
    const testSub: PushSubscription = {
      endpoint: "https://push.example.com/test-endpoint",
      keys: {
        p256dh: "test-p256dh-key",
        auth: "test-auth-key",
      },
    };

    it("새 구독을 추가", () => {
      addSubscription("user1", testSub);

      expect(fs.existsSync(SUBS_PATH)).toBe(true);
      const store = JSON.parse(fs.readFileSync(SUBS_PATH, "utf8"));
      expect(store.user1).toHaveLength(1);
      expect(store.user1[0]).toEqual(testSub);
    });

    it("잘못된 JSON 파일이 있어도 새 구독 추가 가능", () => {
      // 잘못된 JSON 파일 생성
      fs.mkdirSync(STORE_DIR, { recursive: true });
      fs.writeFileSync(SUBS_PATH, "invalid json{");

      // 새 구독 추가 - 파일을 덮어씀
      addSubscription("user1", testSub);

      const store = JSON.parse(fs.readFileSync(SUBS_PATH, "utf8"));
      expect(store.user1).toHaveLength(1);
    });

    it("동일한 사용자에게 여러 구독 추가", () => {
      const sub1: PushSubscription = {
        endpoint: "https://push.example.com/endpoint1",
        keys: { p256dh: "key1", auth: "auth1" },
      };
      const sub2: PushSubscription = {
        endpoint: "https://push.example.com/endpoint2",
        keys: { p256dh: "key2", auth: "auth2" },
      };

      addSubscription("user1", sub1);
      addSubscription("user1", sub2);

      const store = JSON.parse(fs.readFileSync(SUBS_PATH, "utf8"));
      expect(store.user1).toHaveLength(2);
    });

    it("중복 endpoint는 업데이트", () => {
      const sub1: PushSubscription = {
        endpoint: "https://push.example.com/same",
        keys: { p256dh: "old-key", auth: "old-auth" },
      };
      const sub2: PushSubscription = {
        endpoint: "https://push.example.com/same",
        keys: { p256dh: "new-key", auth: "new-auth" },
      };

      addSubscription("user1", sub1);
      addSubscription("user1", sub2);

      const store = JSON.parse(fs.readFileSync(SUBS_PATH, "utf8"));
      expect(store.user1).toHaveLength(1);
      expect(store.user1[0].keys.p256dh).toBe("new-key");
    });

    it("여러 사용자의 구독 관리", () => {
      const sub1: PushSubscription = {
        endpoint: "https://push.example.com/user1",
        keys: { p256dh: "key1", auth: "auth1" },
      };
      const sub2: PushSubscription = {
        endpoint: "https://push.example.com/user2",
        keys: { p256dh: "key2", auth: "auth2" },
      };

      addSubscription("user1", sub1);
      addSubscription("user2", sub2);

      const store = JSON.parse(fs.readFileSync(SUBS_PATH, "utf8"));
      expect(store.user1).toHaveLength(1);
      expect(store.user2).toHaveLength(1);
    });

    it("구독 파일이 없으면 자동 생성", () => {
      expect(fs.existsSync(SUBS_PATH)).toBe(false);
      addSubscription("user1", testSub);
      expect(fs.existsSync(SUBS_PATH)).toBe(true);
    });
  });

  describe("removeSubscription", () => {
    const sub1: PushSubscription = {
      endpoint: "https://push.example.com/endpoint1",
      keys: { p256dh: "key1", auth: "auth1" },
    };
    const sub2: PushSubscription = {
      endpoint: "https://push.example.com/endpoint2",
      keys: { p256dh: "key2", auth: "auth2" },
    };

    it("특정 구독을 제거", () => {
      addSubscription("user1", sub1);
      addSubscription("user1", sub2);

      removeSubscription("user1", sub1.endpoint);

      const store = JSON.parse(fs.readFileSync(SUBS_PATH, "utf8"));
      expect(store.user1).toHaveLength(1);
      expect(store.user1[0].endpoint).toBe(sub2.endpoint);
    });

    it("모든 구독을 제거하면 사용자 엔트리 삭제", () => {
      addSubscription("user1", sub1);
      removeSubscription("user1", sub1.endpoint);

      const store = JSON.parse(fs.readFileSync(SUBS_PATH, "utf8"));
      expect(store.user1).toBeUndefined();
    });

    it("존재하지 않는 사용자 제거 시도는 무시", () => {
      addSubscription("user1", sub1);
      removeSubscription("user2", sub1.endpoint);

      const store = JSON.parse(fs.readFileSync(SUBS_PATH, "utf8"));
      expect(store.user1).toHaveLength(1);
    });

    it("존재하지 않는 endpoint 제거 시도는 무시", () => {
      addSubscription("user1", sub1);
      removeSubscription("user1", "https://not-exist.com");

      const store = JSON.parse(fs.readFileSync(SUBS_PATH, "utf8"));
      expect(store.user1).toHaveLength(1);
    });

    it("구독 파일이 없어도 에러 없이 처리", () => {
      expect(fs.existsSync(SUBS_PATH)).toBe(false);
      expect(() => removeSubscription("user1", sub1.endpoint)).not.toThrow();
    });
  });

  describe("sendPushNotification", () => {
    const mockLog = {
      info: vi.fn(),
      error: vi.fn(),
    };

    const testSub: PushSubscription = {
      endpoint: "https://push.example.com/test",
      keys: { p256dh: "key1", auth: "auth1" },
    };

    beforeEach(() => {
      mockLog.info.mockClear();
      mockLog.error.mockClear();
    });

    it("구독이 있는 사용자에게 푸시 전송", async () => {
      addSubscription("user1", testSub);

      const payload = {
        title: "테스트 알림",
        body: "테스트 메시지",
      };

      await sendPushNotification("user1", payload, mockLog);

      const webpush = await import("web-push");
      expect(webpush.default.sendNotification).toHaveBeenCalledWith(
        testSub,
        JSON.stringify(payload),
      );
      expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining("push sent to user1"));
    });

    it("구독이 없는 사용자는 푸시 전송 스킵", async () => {
      await sendPushNotification("no-user", { title: "Test", body: "Test" }, mockLog);

      const webpush = await import("web-push");
      expect(webpush.default.sendNotification).not.toHaveBeenCalled();
    });

    it("여러 구독에 동시에 푸시 전송", async () => {
      const sub1: PushSubscription = {
        endpoint: "https://push.example.com/device1",
        keys: { p256dh: "key1", auth: "auth1" },
      };
      const sub2: PushSubscription = {
        endpoint: "https://push.example.com/device2",
        keys: { p256dh: "key2", auth: "auth2" },
      };

      addSubscription("user1", sub1);
      addSubscription("user1", sub2);

      await sendPushNotification("user1", { title: "Test", body: "Test" }, mockLog);

      const webpush = await import("web-push");
      expect(webpush.default.sendNotification).toHaveBeenCalledTimes(2);
    });

    it("만료된 구독(410)은 자동 제거", async () => {
      const webpush = await import("web-push");
      webpush.default.sendNotification.mockRejectedValueOnce({ statusCode: 410 });

      addSubscription("user1", testSub);

      await sendPushNotification("user1", { title: "Test", body: "Test" }, mockLog);

      // 구독이 제거되었는지 확인
      const store = JSON.parse(fs.readFileSync(SUBS_PATH, "utf8"));
      expect(store.user1).toBeUndefined();
    });

    it("Not Found(404) 구독은 자동 제거", async () => {
      const webpush = await import("web-push");
      webpush.default.sendNotification.mockRejectedValueOnce({ statusCode: 404 });

      addSubscription("user1", testSub);

      await sendPushNotification("user1", { title: "Test", body: "Test" }, mockLog);

      const store = JSON.parse(fs.readFileSync(SUBS_PATH, "utf8"));
      expect(store.user1).toBeUndefined();
    });

    it("다른 에러는 로그만 기록하고 구독 유지", async () => {
      const webpush = await import("web-push");
      webpush.default.sendNotification.mockRejectedValueOnce({
        statusCode: 500,
        message: "Server error",
      });

      addSubscription("user1", testSub);

      await sendPushNotification("user1", { title: "Test", body: "Test" }, mockLog);

      expect(mockLog.error).toHaveBeenCalled();
      const store = JSON.parse(fs.readFileSync(SUBS_PATH, "utf8"));
      expect(store.user1).toHaveLength(1);
    });

    it("tag 옵션을 포함한 payload 전송", async () => {
      addSubscription("user1", testSub);

      const payload = {
        title: "그룹 알림",
        body: "새 메시지",
        tag: "chat-room-123",
      };

      await sendPushNotification("user1", payload, mockLog);

      const webpush = await import("web-push");
      expect(webpush.default.sendNotification).toHaveBeenCalledWith(
        testSub,
        JSON.stringify(payload),
      );
    });

    it("log 없이도 정상 동작", async () => {
      addSubscription("user1", testSub);

      await expect(
        sendPushNotification("user1", { title: "Test", body: "Test" }),
      ).resolves.not.toThrow();
    });
  });
});
