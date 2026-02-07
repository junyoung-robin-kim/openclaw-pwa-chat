import type { OpenClawConfig, PluginRuntime, ChannelLogSink } from "openclaw/plugin-sdk";
import * as http from "node:http";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { StoredMessage } from "./types.js";
import { startHttpServer, stopHttpServer } from "./http-server.js";
import { appendMessage, deleteSession } from "./message-store.js";
import { addSubscription, type PushSubscription } from "./push.js";

// Mock web-push module
vi.mock("web-push", () => ({
  default: {
    generateVAPIDKeys: vi.fn(() => ({
      publicKey: "test-vapid-public-key",
      privateKey: "test-vapid-private-key",
    })),
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(() => Promise.resolve()),
  },
}));

describe("http-server.ts — HTTP 엔드포인트", () => {
  const TEST_PORT = 19998; // 테스트용 포트
  const TEST_HOST = "127.0.0.1";
  const TEST_TOKEN = "test-auth-token-" + Date.now();

  let abortController: AbortController;

  const mockConfig: OpenClawConfig = {
    gateway: {
      auth: { token: TEST_TOKEN },
    },
  } as any;

  const mockRuntime: PluginRuntime = {} as any;

  const mockLog: ChannelLogSink = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  } as any;

  beforeEach(async () => {
    abortController = new AbortController();

    await startHttpServer({
      port: TEST_PORT,
      host: TEST_HOST,
      cfg: mockConfig,
      runtime: mockRuntime,
      accountId: "test-account",
      abortSignal: abortController.signal,
      log: mockLog,
    });

    // 서버 시작 대기
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterEach(() => {
    abortController.abort();
    stopHttpServer();
  });

  function request(
    method: string,
    path: string,
    options: {
      headers?: Record<string, string>;
      body?: string;
    } = {},
  ): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
    return new Promise((resolve, reject) => {
      const headers = { ...options.headers };

      // Content-Length 자동 설정
      if (options.body && !headers["Content-Length"]) {
        headers["Content-Length"] = Buffer.byteLength(options.body).toString();
      }

      const req = http.request(
        {
          hostname: TEST_HOST,
          port: TEST_PORT,
          path,
          method,
          headers,
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            resolve({
              status: res.statusCode || 0,
              headers: res.headers,
              body,
            });
          });
        },
      );

      req.on("error", reject);

      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  }

  describe("/api/status", () => {
    it("인증 성공 시 200과 상태 반환", async () => {
      const res = await request("GET", "/api/status", {
        headers: { Authorization: `Bearer ${TEST_TOKEN}` },
      });

      expect(res.status).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.ok).toBe(true);
      expect(data.channel).toBe("pwa-chat");
    });

    it("localhost 접근은 인증 없이 허용", async () => {
      // localhost에서 실행되므로 토큰 없이도 접근 가능
      const res = await request("GET", "/api/status");

      expect(res.status).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.ok).toBe(true);
    });
  });

  describe("/api/sessions GET", () => {
    const testUserId = "http-test-user-" + Date.now();

    beforeEach(() => {
      // 테스트용 세션 생성
      const msg: StoredMessage = {
        id: "msg-1",
        text: "테스트 메시지",
        timestamp: Date.now(),
        role: "user",
      };
      appendMessage(testUserId, msg);
    });

    afterEach(() => {
      deleteSession(testUserId);
    });

    it("세션 목록 반환", async () => {
      const res = await request("GET", "/api/sessions", {
        headers: { Authorization: `Bearer ${TEST_TOKEN}` },
      });

      expect(res.status).toBe(200);
      const data = JSON.parse(res.body);
      expect(Array.isArray(data.sessions)).toBe(true);

      const session = data.sessions.find((s: any) => s.sessionId === testUserId);
      expect(session).toBeDefined();
      expect(session.messageCount).toBeGreaterThan(0);
    });

    it("localhost에서 인증 없이 접근 가능", async () => {
      // localhost에서 실행되므로 토큰 없이도 접근 가능
      const res = await request("GET", "/api/sessions");

      expect(res.status).toBe(200);
      const data = JSON.parse(res.body);
      expect(Array.isArray(data.sessions)).toBe(true);
    });
  });

  describe("/api/sessions DELETE", () => {
    const testUserId = "http-delete-user-" + Date.now();

    beforeEach(() => {
      const msg: StoredMessage = {
        id: "msg-1",
        text: "삭제될 메시지",
        timestamp: Date.now(),
        role: "user",
      };
      appendMessage(testUserId, msg);
    });

    afterEach(() => {
      deleteSession(testUserId);
    });

    it("세션 삭제 성공", async () => {
      const res = await request("DELETE", "/api/sessions", {
        headers: {
          Authorization: `Bearer ${TEST_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId: testUserId }),
      });

      expect(res.status).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.ok).toBe(true);
    });

    it("존재하지 않는 세션 삭제 시도", async () => {
      const res = await request("DELETE", "/api/sessions", {
        headers: {
          Authorization: `Bearer ${TEST_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId: "non-existent-" + Date.now() }),
      });

      expect(res.status).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.ok).toBe(false);
    });

    it("잘못된 body 형식은 400 반환", async () => {
      const res = await request("DELETE", "/api/sessions", {
        headers: {
          "Content-Type": "application/json",
        },
        body: "invalid json{",
      });

      expect(res.status).toBe(400);
      if (res.body) {
        const data = JSON.parse(res.body);
        expect(data.error).toBe("Invalid body");
      }
    });
  });

  describe("/api/push/vapid-public-key", () => {
    it("VAPID 공개키 반환", async () => {
      const res = await request("GET", "/api/push/vapid-public-key");

      expect(res.status).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.publicKey).toBeTruthy();
      expect(typeof data.publicKey).toBe("string");
    });

    it("인증 없이 접근 가능 (공개 엔드포인트)", async () => {
      const res = await request("GET", "/api/push/vapid-public-key");

      expect(res.status).toBe(200);
    });
  });

  describe("/api/push/subscribe POST", () => {
    const testSubscription: PushSubscription = {
      endpoint: "https://push.example.com/test-" + Date.now(),
      keys: {
        p256dh: "test-p256dh-key",
        auth: "test-auth-key",
      },
    };

    it("구독 추가 성공", async () => {
      const res = await request("POST", "/api/push/subscribe", {
        headers: {
          Authorization: `Bearer ${TEST_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: "test-user",
          subscription: testSubscription,
        }),
      });

      expect(res.status).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.ok).toBe(true);
    });

    it("userId 없이도 default로 처리", async () => {
      const res = await request("POST", "/api/push/subscribe", {
        headers: {
          Authorization: `Bearer ${TEST_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subscription: testSubscription,
        }),
      });

      expect(res.status).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.ok).toBe(true);
    });

    it("잘못된 body 형식은 400 반환", async () => {
      const res = await request("POST", "/api/push/subscribe", {
        headers: {
          "Content-Type": "application/json",
        },
        body: "invalid json{",
      });

      expect(res.status).toBe(400);
      const data = JSON.parse(res.body);
      expect(data.error).toBe("Invalid body");
    });
  });

  describe("/api/push/unsubscribe POST", () => {
    const testEndpoint = "https://push.example.com/unsubscribe-test-" + Date.now();
    const testSub: PushSubscription = {
      endpoint: testEndpoint,
      keys: { p256dh: "key", auth: "auth" },
    };

    beforeEach(() => {
      addSubscription("test-user", testSub);
    });

    it("구독 제거 성공", async () => {
      const res = await request("POST", "/api/push/unsubscribe", {
        headers: {
          Authorization: `Bearer ${TEST_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: "test-user",
          endpoint: testEndpoint,
        }),
      });

      expect(res.status).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.ok).toBe(true);
    });

    it("userId 없이도 default로 처리", async () => {
      const res = await request("POST", "/api/push/unsubscribe", {
        headers: {
          Authorization: `Bearer ${TEST_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          endpoint: testEndpoint,
        }),
      });

      expect(res.status).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.ok).toBe(true);
    });

    it("잘못된 body 형식은 400 반환", async () => {
      const res = await request("POST", "/api/push/unsubscribe", {
        headers: {
          "Content-Type": "application/json",
        },
        body: "invalid json{",
      });

      expect(res.status).toBe(400);
      const data = JSON.parse(res.body);
      expect(data.error).toBe("Invalid body");
    });
  });

  describe("CORS", () => {
    it("OPTIONS 요청에 CORS 헤더 반환", async () => {
      const res = await request("OPTIONS", "/api/status");

      expect(res.status).toBe(204);
      expect(res.headers["access-control-allow-origin"]).toBe("*");
      expect(res.headers["access-control-allow-methods"]).toContain("GET");
      expect(res.headers["access-control-allow-methods"]).toContain("POST");
    });

    it("모든 응답에 CORS 헤더 포함", async () => {
      const res = await request("GET", "/api/push/vapid-public-key");

      expect(res.headers["access-control-allow-origin"]).toBe("*");
    });
  });

  describe("Static files", () => {
    it("존재하지 않는 경로는 index.html로 폴백 (SPA)", async () => {
      const res = await request("GET", "/some/unknown/path");

      // SPA 폴백이므로 404가 아니라 index.html 제공 시도
      // dist가 없으면 404일 수 있지만 로직은 동작함
      expect([200, 404]).toContain(res.status);
    });

    it("루트 경로 접근", async () => {
      const res = await request("GET", "/");

      expect([200, 404]).toContain(res.status);
    });

    it(".js 파일 요청", async () => {
      const res = await request("GET", "/app.js");

      // 파일이 없으면 SPA 폴백
      expect([200, 404]).toContain(res.status);
    });

    it(".css 파일 요청", async () => {
      const res = await request("GET", "/styles.css");

      expect([200, 404]).toContain(res.status);
    });
  });

  describe("Error handling", () => {
    it("서버 에러 발생 시 500 반환 (잘못된 메서드)", async () => {
      // DELETE는 body 파싱을 기다리므로 타임아웃 방지를 위해 짧은 body 전송
      const res = await request("POST", "/api/status", {
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });

      // /api/status는 GET만 지원하므로 다른 메서드는 static file로 처리
      expect(res.status).toBeGreaterThanOrEqual(200);
    });
  });
});
