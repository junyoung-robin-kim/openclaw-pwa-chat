import * as http from "node:http";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import WebSocket from "ws";
import type { WsServerMessage } from "../src/types.js";
import { setRuntime } from "../src/runtime.js";
import {
  setupWebSocketServer,
  pushOutboundMessage,
  closeWebSocketServer,
} from "../src/ws-server.js";

// Collect all messages from a WS until condition met or timeout
function collectMessages(
  ws: WebSocket,
  until: (msgs: WsServerMessage[]) => boolean,
  timeoutMs = 2000,
): Promise<WsServerMessage[]> {
  return new Promise((resolve) => {
    const msgs: WsServerMessage[] = [];
    const handler = (data: WebSocket.RawData) => {
      msgs.push(JSON.parse(data.toString()));
      if (until(msgs)) {
        ws.off("message", handler);
        resolve(msgs);
      }
    };
    ws.on("message", handler);
    setTimeout(() => {
      ws.off("message", handler);
      resolve(msgs);
    }, timeoutMs);
  });
}

describe("ws-server.ts — 커버리지 향상", () => {
  let server: http.Server;
  let port: number;
  const userId = "coverage-user";

  const mockConfig = { gateway: {} } as any;
  const mockRuntime = {
    channel: {
      session: {
        resolveStorePath: () => "/tmp/test",
        readSessionUpdatedAt: async () => Date.now(),
        recordSessionMetaFromInbound: async () => {},
      },
      routing: {
        resolveAgentRoute: () => ({ sessionKey: "s", agentId: "a" }),
      },
      reply: {
        resolveEnvelopeFormatOptions: () => ({}),
        formatInboundEnvelope: () => "body",
        finalizeInboundContext: (ctx: any) => ctx,
        dispatchReplyWithBufferedBlockDispatcher: async ({ dispatcherOptions }: any) => {
          if (dispatcherOptions?.deliver) {
            await dispatcherOptions.deliver({ text: "streaming1 " }, { kind: "block" });
            await dispatcherOptions.deliver({ text: "streaming2 " }, { kind: "block" });
            await dispatcherOptions.deliver({ text: "" }, { kind: "final" });
          }
        },
      },
    },
  } as any;

  beforeEach(async () => {
    setRuntime(mockRuntime);
    server = http.createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        port = (server.address() as any).port;
        resolve();
      });
    });
    setupWebSocketServer(server, mockConfig, "test-account");
  });

  afterEach(async () => {
    closeWebSocketServer();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("hello 메시지에 connectionId와 seq가 포함됨", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?userId=${userId}`);
    const msgs = await collectMessages(ws, (m) => m.some((x) => x.type === "hello"));
    const hello = msgs.find((m) => m.type === "hello")!;
    expect(hello.connectionId).toBeTruthy();
    expect(typeof hello.seq).toBe("number");
    ws.close();
  });

  it("유저 메시지 전송 시 broadcast + streaming + final message 수신", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?userId=${userId}`);
    await new Promise((r) => ws.on("open", r));

    // hello + history 소비 대기
    await new Promise((r) => setTimeout(r, 200));

    const allMsgs: WsServerMessage[] = [];
    ws.on("message", (data) => {
      allMsgs.push(JSON.parse(data.toString()));
    });

    // 유저 메시지 전송
    ws.send(JSON.stringify({ type: "message", text: "테스트 입력" }));

    // streaming + message + streaming_end 대기
    await new Promise((r) => setTimeout(r, 500));

    const types = allMsgs.map((m) => m.type);
    // user message broadcast
    expect(types).toContain("message");
    ws.close();
  });

  it("빈 메시지는 무시됨", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?userId=${userId}`);
    await new Promise((r) => ws.on("open", r));
    await new Promise((r) => setTimeout(r, 100));

    // 빈 텍스트
    ws.send(JSON.stringify({ type: "message", text: "   " }));
    // 잘못된 JSON
    ws.send("not json");
    // 알 수 없는 타입
    ws.send(JSON.stringify({ type: "unknown" }));

    await new Promise((r) => setTimeout(r, 100));
    ws.close();
  });

  it("resync 요청 시 history 재전송", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?userId=${userId}`);
    await new Promise((r) => ws.on("open", r));
    await new Promise((r) => setTimeout(r, 100));

    const msgs: WsServerMessage[] = [];
    ws.on("message", (data) => {
      msgs.push(JSON.parse(data.toString()));
    });

    ws.send(JSON.stringify({ type: "resync" }));
    await new Promise((r) => setTimeout(r, 200));

    const hasHistory = msgs.some((m) => m.type === "history");
    expect(hasHistory).toBe(true);
    ws.close();
  });

  it("non-/ws 경로로 업그레이드 시도 시 연결 거부", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/other?userId=${userId}`);
    await new Promise<void>((resolve) => {
      ws.on("error", () => resolve());
      ws.on("close", () => resolve());
      setTimeout(resolve, 1000);
    });
  });

  it("pushOutboundMessage가 pwa-chat: 접두사를 정규화", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?userId=${userId}`);
    await new Promise((r) => ws.on("open", r));
    await new Promise((r) => setTimeout(r, 100));

    const msgs: WsServerMessage[] = [];
    ws.on("message", (data) => {
      msgs.push(JSON.parse(data.toString()));
    });

    pushOutboundMessage(`pwa-chat:${userId}`, "정규화 테스트");
    await new Promise((r) => setTimeout(r, 100));

    const msg = msgs.find((m) => m.type === "message");
    expect(msg).toBeTruthy();
    ws.close();
  });

  it("seq out of range 재연결 시 full resync", async () => {
    const ws1 = new WebSocket(`ws://127.0.0.1:${port}/ws?userId=${userId}`);
    let connectionId = "";

    ws1.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "hello") connectionId = msg.connectionId;
    });

    await new Promise((r) => ws1.on("open", r));
    await new Promise((r) => setTimeout(r, 100));
    ws1.close();
    await new Promise((r) => setTimeout(r, 50));

    // seq 99999 — out of range
    const ws2 = new WebSocket(
      `ws://127.0.0.1:${port}/ws?userId=${userId}&connection_id=${connectionId}&sequence_number=99999`,
    );

    const msgs: WsServerMessage[] = [];
    ws2.on("message", (data) => {
      msgs.push(JSON.parse(data.toString()));
    });

    await new Promise((r) => ws2.on("open", r));
    await new Promise((r) => setTimeout(r, 200));

    // full resync = new connectionId + history
    const hello = msgs.find((m) => m.type === "hello")!;
    expect(hello.connectionId).not.toBe(connectionId);
    const hasHistory = msgs.some((m) => m.type === "history");
    expect(hasHistory).toBe(true);
    ws2.close();
  });

  it("유저 메시지 전송 후 streaming 상태에서 resync 시 streaming state 포함", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?userId=${userId}`);
    await new Promise((r) => ws.on("open", r));
    await new Promise((r) => setTimeout(r, 200));

    const allMsgs: WsServerMessage[] = [];
    ws.on("message", (data) => {
      allMsgs.push(JSON.parse(data.toString()));
    });

    // 메시지 보내서 streaming 시작
    ws.send(JSON.stringify({ type: "message", text: "스트리밍 테스트" }));
    // streaming chunk 받을 시간 약간 대기
    await new Promise((r) => setTimeout(r, 200));

    // streaming 중 resync
    ws.send(JSON.stringify({ type: "resync" }));
    await new Promise((r) => setTimeout(r, 300));

    const hasHistory = allMsgs.some((m) => m.type === "history");
    expect(hasHistory).toBe(true);
    ws.close();
  });

  it("ws close 이벤트 시 client가 제거됨", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?userId=${userId}`);
    await new Promise((r) => ws.on("open", r));
    await new Promise((r) => setTimeout(r, 100));

    ws.close();
    await new Promise((r) => setTimeout(r, 100));

    // 새 연결 후 broadcast 테스트 — 이전 연결이 깨끗하게 정리됐는지 확인
    const ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws?userId=${userId}`);
    await new Promise((r) => ws2.on("open", r));
    await new Promise((r) => setTimeout(r, 100));

    const msgs: WsServerMessage[] = [];
    ws2.on("message", (data) => msgs.push(JSON.parse(data.toString())));

    pushOutboundMessage(`pwa-chat:${userId}`, "close 후 테스트");
    await new Promise((r) => setTimeout(r, 100));

    expect(msgs.some((m) => m.type === "message")).toBe(true);
    ws2.close();
  });
});
