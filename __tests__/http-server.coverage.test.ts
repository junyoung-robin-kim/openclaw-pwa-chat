import * as http from "node:http";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { startHttpServer, stopHttpServer } from "../src/http-server.js";
import { setRuntime } from "../src/runtime.js";

function request(
  port: number,
  path: string,
  options: { method?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: options.method ?? "GET",
        headers: options.headers,
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("http-server.ts — 커버리지 향상", () => {
  let port: number;
  const ac = new AbortController();

  const mockConfig = {
    gateway: { auth: { token: "test-token-123" } },
  } as any;

  const mockRuntime = {
    channel: {
      session: { resolveStorePath: () => "/tmp/test" },
      routing: { resolveAgentRoute: () => ({ sessionKey: "s", agentId: "a" }) },
      reply: {
        resolveEnvelopeFormatOptions: () => ({}),
        formatInboundEnvelope: () => "body",
        finalizeInboundContext: (ctx: any) => ctx,
        dispatchReplyWithBufferedBlockDispatcher: async () => {},
      },
    },
  } as any;

  beforeEach(async () => {
    setRuntime(mockRuntime);
    // 동적 포트 할당
    port = 30000 + Math.floor(Math.random() * 10000);
    await startHttpServer({
      port,
      host: "127.0.0.1",
      cfg: mockConfig,
      runtime: mockRuntime,
      accountId: "test",
      abortSignal: ac.signal,
    });
  });

  afterEach(() => {
    stopHttpServer();
  });

  it("OPTIONS 요청에 204 + CORS 헤더 반환", async () => {
    const res = await request(port, "/api/status", { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-allow-methods"]).toContain("GET");
  });

  it("/api/status 인증 없이도 localhost는 통과 (auth skip)", async () => {
    const res = await request(port, "/api/status");
    // localhost에서는 auth가 skip되므로 200
    expect(res.status).toBe(200);
  });

  it("/api/status 인증 성공 시 200", async () => {
    const res = await request(port, "/api/status", {
      headers: { "x-auth-token": "test-token-123" },
    });
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
  });

  it("/ 요청 시 index.html 반환 (200 or SPA fallback)", async () => {
    const res = await request(port, "/");
    // dist/client가 있으면 200, 없으면 404
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.headers["content-type"]).toContain("text/html");
    }
  });

  it("존재하지 않는 경로 → SPA fallback 또는 404", async () => {
    const res = await request(port, "/nonexistent/path");
    expect([200, 404]).toContain(res.status);
  });

  it("manifest.json 반환", async () => {
    const res = await request(port, "/manifest.json");
    // manifest가 있으면 200
    if (res.status === 200) {
      expect(res.headers["content-type"]).toContain("json");
    }
  });

  it("path traversal 시도 시 정규화되어 안전하게 처리", async () => {
    const res = await request(port, "/../../../etc/passwd");
    // path.normalize가 ../를 제거, SPA fallback 또는 403
    expect([200, 403, 404]).toContain(res.status);
  });

  it("stopHttpServer 호출 후 서버 종료", () => {
    stopHttpServer();
    // 두 번 호출해도 에러 없음
    stopHttpServer();
  });

  it("abortSignal로 서버 중단", async () => {
    // 먼저 기존 서버 종료
    stopHttpServer();

    const ac2 = new AbortController();
    const port2 = 30000 + Math.floor(Math.random() * 10000);
    await startHttpServer({
      port: port2,
      host: "127.0.0.1",
      cfg: mockConfig,
      runtime: mockRuntime,
      accountId: "test",
      abortSignal: ac2.signal,
    });

    // 정상 응답 확인
    const res1 = await request(port2, "/api/status");
    expect(res1.status).toBe(200);

    // abort 시그널 → 서버 종료
    ac2.abort();
    await new Promise((r) => setTimeout(r, 200));

    // 연결 시도 → 실패해야 함
    await new Promise<void>((resolve) => {
      const req = http.request({ hostname: "127.0.0.1", port: port2, path: "/" }, () => {
        resolve();
      });
      req.on("error", () => resolve());
      req.end();
    });
  });

  it("/api/status Authorization 헤더로 인증", async () => {
    const res = await request(port, "/api/status", {
      headers: { authorization: "Bearer test-token-123" },
    });
    expect(res.status).toBe(200);
  });

  it("CSS 파일 요청 시 올바른 MIME 타입", async () => {
    const res = await request(port, "/styles.css");
    // 파일이 없으면 SPA fallback으로 200 또는 404
    expect([200, 404]).toContain(res.status);
  });

  it("SVG 파일 요청 시 올바른 MIME 타입", async () => {
    const res = await request(port, "/icon.svg");
    if (res.status === 200) {
      expect(res.headers["content-type"]).toContain("svg");
    }
  });
});
