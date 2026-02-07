import type { OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk";
import * as http from "node:http";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import WebSocket from "ws";
import type { WsServerMessage, StoredMessage } from "../src/types.js";
import { appendMessage } from "../src/message-store.js";
import { setRuntime } from "../src/runtime.js";
import {
  setupWebSocketServer,
  pushOutboundMessage,
  closeWebSocketServer,
} from "../src/ws-server.js";

describe("ws-server.ts — WebSocket 서버 통합 테스트", () => {
  let server: http.Server;
  let port: number;
  const testUserId = "test-ws-user";

  // Mock config
  const mockConfig: OpenClawConfig = {
    gateway: {},
  } as OpenClawConfig;

  // Mock runtime
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
          // 가짜 응답 전달
          if (dispatcherOptions?.deliver) {
            await dispatcherOptions.deliver({ text: "안녕하세요!" }, { kind: "block" });
            await dispatcherOptions.deliver({ text: "" }, { kind: "final" });
          }
        },
      },
    },
  } as unknown as PluginRuntime;

  beforeEach(async () => {
    setRuntime(mockRuntime);

    // HTTP 서버 시작
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
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  describe("WebSocket 연결", () => {
    it.skip("클라이언트가 연결하면 hello 메시지 수신", async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?userId=${testUserId}`);

      const helloMsg = await new Promise<WsServerMessage>((resolve) => {
        ws.on("message", (data) => {
          const msg = JSON.parse(data.toString()) as WsServerMessage;
          if (msg.type === "hello") resolve(msg);
        });
      });

      expect(helloMsg.type).toBe("hello");
      expect(helloMsg.connectionId).toBeTruthy();
      expect(helloMsg.seq).toBeGreaterThanOrEqual(0);

      ws.close();
    });

    it("연결 시 history 메시지 수신", async () => {
      // 먼저 메시지 저장
      const msg: StoredMessage = {
        id: "test-1",
        text: "이전 메시지",
        timestamp: Date.now(),
        role: "user",
      };
      appendMessage(testUserId, msg);

      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?userId=${testUserId}`);

      const messages: WsServerMessage[] = [];
      await new Promise<void>((resolve) => {
        ws.on("message", (data) => {
          const parsed = JSON.parse(data.toString()) as WsServerMessage;
          messages.push(parsed);
          if (parsed.type === "history") resolve();
        });
      });

      const historyMsg = messages.find((m) => m.type === "history");
      expect(historyMsg).toBeTruthy();
      if (historyMsg && historyMsg.type === "history") {
        expect(historyMsg.messages.length).toBeGreaterThan(0);
        expect(historyMsg.messages[0].text).toBe("이전 메시지");
      }

      ws.close();
    });

    it.skip("인증 실패 시 연결 거부", async () => {
      // Skip: 서버 재설정으로 인한 handleUpgrade 중복 호출 이슈
      const mockConfigWithToken: OpenClawConfig = {
        gateway: {
          auth: { token: "secret123" },
        },
      } as any;

      closeWebSocketServer();
      setupWebSocketServer(server, mockConfigWithToken, "test-account");

      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?userId=${testUserId}`);

      await new Promise<void>((resolve, reject) => {
        ws.on("error", () => {
          // 연결 실패 예상
          resolve();
        });
        ws.on("open", () => {
          reject(new Error("연결이 성공해서는 안 됨"));
        });
        setTimeout(() => resolve(), 1000);
      });

      ws.close();
    });
  });

  describe("메시지 broadcast", () => {
    it("pushOutboundMessage로 메시지 전송 시 모든 클라이언트가 수신", async () => {
      const ws1 = new WebSocket(`ws://127.0.0.1:${port}/ws?userId=${testUserId}`);
      const ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws?userId=${testUserId}`);

      await Promise.all([
        new Promise((r) => ws1.on("open", r)),
        new Promise((r) => ws2.on("open", r)),
      ]);

      // hello, history 메시지 소비
      await new Promise((r) => setTimeout(r, 100));

      const received1: WsServerMessage[] = [];
      const received2: WsServerMessage[] = [];

      ws1.on("message", (data) => {
        received1.push(JSON.parse(data.toString()));
      });
      ws2.on("message", (data) => {
        received2.push(JSON.parse(data.toString()));
      });

      pushOutboundMessage(`pwa-chat:${testUserId}`, "브로드캐스트 테스트");

      await new Promise((r) => setTimeout(r, 100));

      const msg1 = received1.find((m) => m.type === "message");
      const msg2 = received2.find((m) => m.type === "message");

      expect(msg1).toBeTruthy();
      expect(msg2).toBeTruthy();
      if (msg1 && msg1.type === "message") {
        expect(msg1.msg.text).toBe("브로드캐스트 테스트");
      }

      ws1.close();
      ws2.close();
    });
  });

  describe("시퀀스 번호", () => {
    it("서버 메시지는 순차적인 seq를 가짐", async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?userId=${testUserId}`);

      const messages: WsServerMessage[] = [];
      ws.on("message", (data) => {
        messages.push(JSON.parse(data.toString()));
      });

      await new Promise((r) => ws.on("open", r));
      await new Promise((r) => setTimeout(r, 100));

      // hello, history는 순차적 seq를 가져야 함
      const hello = messages.find((m) => m.type === "hello");
      const history = messages.find((m) => m.type === "history");

      expect(hello).toBeTruthy();
      expect(history).toBeTruthy();

      if (hello && history) {
        expect(history.seq).toBeGreaterThan(hello.seq);
      }

      ws.close();
    });
  });

  describe("ping/pong", () => {
    it("ping 메시지에 pong으로 응답", async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?userId=${testUserId}`);
      await new Promise((r) => ws.on("open", r));

      // hello, history 소비
      await new Promise((r) => setTimeout(r, 100));

      const pongPromise = new Promise<WsServerMessage>((resolve) => {
        ws.on("message", (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === "pong") resolve(msg);
        });
      });

      ws.send(JSON.stringify({ type: "ping" }));

      const pong = await pongPromise;
      expect(pong.type).toBe("pong");

      ws.close();
    });
  });

  describe("reconnect & resync", () => {
    it("동일한 connectionId로 재연결 시 누락된 메시지만 수신", async () => {
      const ws1 = new WebSocket(`ws://127.0.0.1:${port}/ws?userId=${testUserId}`);

      let connectionId = "";
      let lastSeq = 0;

      const messages: WsServerMessage[] = [];
      ws1.on("message", (data) => {
        const msg = JSON.parse(data.toString()) as WsServerMessage;
        messages.push(msg);
        if (msg.type === "hello") {
          connectionId = msg.connectionId;
        }
        if ("seq" in msg && msg.seq !== undefined) {
          lastSeq = Math.max(lastSeq, msg.seq);
        }
      });

      await new Promise((r) => ws1.on("open", r));
      await new Promise((r) => setTimeout(r, 100));

      // 연결 종료 (서버는 메시지를 계속 보낼 수 있음)
      ws1.close();
      await new Promise((r) => setTimeout(r, 50));

      // 메시지 몇 개 추가 (buffer에 쌓임)
      pushOutboundMessage(`pwa-chat:${testUserId}`, "msg-1");
      pushOutboundMessage(`pwa-chat:${testUserId}`, "msg-2");
      await new Promise((r) => setTimeout(r, 50));

      // 같은 connectionId와 seq로 재연결
      const ws2 = new WebSocket(
        `ws://127.0.0.1:${port}/ws?userId=${testUserId}&connection_id=${connectionId}&sequence_number=${lastSeq + 1}`,
      );

      const reconnectMessages: WsServerMessage[] = [];
      ws2.on("message", (data) => {
        reconnectMessages.push(JSON.parse(data.toString()));
      });

      await new Promise((r) => ws2.on("open", r));
      await new Promise((r) => setTimeout(r, 200));

      // hello는 받지만 full history는 받지 않아야 함
      const hasHello = reconnectMessages.some((m) => m.type === "hello");
      const hasHistory = reconnectMessages.some((m) => m.type === "history");
      const messageCount = reconnectMessages.filter((m) => m.type === "message").length;

      expect(hasHello).toBe(true);
      expect(hasHistory).toBe(false); // full resync 없음
      expect(messageCount).toBeGreaterThan(0); // 누락된 메시지만 수신

      ws2.close();
    });
  });
});
