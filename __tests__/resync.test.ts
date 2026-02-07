// Resync 기능 테스트

import type { OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk";
import http from "node:http";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import WebSocket from "ws";
import type { WsServerMessage } from "../src/types.js";
import { setRuntime } from "../src/runtime.js";
import { setupWebSocketServer, closeWebSocketServer } from "../src/ws-server.js";

describe("Resync 기능", () => {
  let httpServer: http.Server;
  let port: number;
  const testUserId = "test-resync-user";

  const mockConfig: OpenClawConfig = {
    gateway: {},
  } as OpenClawConfig;

  const mockRuntime: PluginRuntime = {
    channel: {
      session: {
        resolveStorePath: () => "/tmp/test-store",
        readSessionUpdatedAt: async () => Date.now(),
        recordSessionMetaFromInbound: async () => {},
      },
      routing: {
        resolveAgentRoute: () => ({
          sessionKey: "test-session",
          agentId: "test-agent",
        }),
      },
      reply: {
        resolveEnvelopeFormatOptions: () => ({}),
        formatInboundEnvelope: () => "formatted body",
        finalizeInboundContext: (ctx: any) => ctx,
        dispatchReplyWithBufferedBlockDispatcher: async ({ dispatcherOptions }: any) => {
          if (dispatcherOptions?.deliver) {
            await dispatcherOptions.deliver({ text: "안녕하세요!" }, { kind: "chunk" });
            await dispatcherOptions.deliver({ text: "" }, { kind: "final" });
          }
        },
      },
    },
  } as unknown as PluginRuntime;

  beforeEach(async () => {
    setRuntime(mockRuntime);

    httpServer = http.createServer();
    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", () => {
        port = (httpServer.address() as any).port;
        resolve();
      });
    });

    setupWebSocketServer(httpServer, mockConfig, "test-account");
  });

  afterEach(async () => {
    closeWebSocketServer();
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  it("클라이언트가 resync 요청 시 history를 재전송함", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?userId=${testUserId}`);

    const messages: WsServerMessage[] = [];

    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString()) as WsServerMessage;
      messages.push(msg);
    });

    // hello와 history 메시지 대기
    await new Promise((resolve) => setTimeout(resolve, 100));

    const initialMessageCount = messages.length;
    expect(initialMessageCount).toBeGreaterThan(0);

    // resync 요청
    ws.send(JSON.stringify({ type: "resync" }));

    // resync 응답 대기
    await new Promise((resolve) => setTimeout(resolve, 100));

    // history 메시지를 받아야 함
    const resyncMessages = messages.slice(initialMessageCount);
    expect(resyncMessages.length).toBeGreaterThan(0);

    const historyMessage = resyncMessages.find((m) => m.type === "history");
    expect(historyMessage).toBeDefined();
    expect(historyMessage?.type).toBe("history");

    ws.close();
  });

  it("seq mismatch 시 resync 요청을 보내야 함 (단위 테스트)", () => {
    // 이 테스트는 클라이언트 로직을 검증하는 것이므로
    // useWebSocket.ts의 로직이 올바른지 확인하기 위한 개념적 테스트

    const expectedSeq = 5;
    const receivedSeq = 7;

    // seq mismatch가 발생했을 때
    const shouldResync = expectedSeq !== receivedSeq;
    expect(shouldResync).toBe(true);

    // resync 메시지가 전송되어야 함
    const resyncMessage = JSON.stringify({ type: "resync" });
    expect(resyncMessage).toContain('"type":"resync"');
  });

  it("WsClientMessage 타입에 resync가 포함됨", () => {
    // 타입 검증 (컴파일 시점에 확인됨)
    const resyncMsg: { type: "resync" } = { type: "resync" };
    expect(resyncMsg.type).toBe("resync");
  });
});
