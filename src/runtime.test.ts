import type { PluginRuntime } from "openclaw/plugin-sdk";
import { describe, it, expect, beforeEach } from "vitest";
import { setRuntime, getRuntime } from "./runtime.js";

describe("runtime.ts — PluginRuntime 싱글톤", () => {
  // Mock PluginRuntime
  const mockRuntime = {
    channel: {
      session: {
        resolveStorePath: () => "/tmp/store",
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
        dispatchReplyWithBufferedBlockDispatcher: async () => {},
      },
    },
  } as unknown as PluginRuntime;

  beforeEach(() => {
    // 각 테스트 전에 runtime 초기화
    setRuntime(mockRuntime);
  });

  describe("setRuntime", () => {
    it("runtime을 설정할 수 있음", () => {
      const newRuntime = { ...mockRuntime } as PluginRuntime;
      setRuntime(newRuntime);
      expect(getRuntime()).toBe(newRuntime);
    });
  });

  describe("getRuntime", () => {
    it("설정된 runtime을 반환", () => {
      expect(getRuntime()).toBe(mockRuntime);
    });

    it("runtime이 설정되지 않았으면 에러 발생", () => {
      // runtime을 null로 재설정
      (setRuntime as any)(null);

      expect(() => getRuntime()).toThrow("PWA Chat runtime not initialized");
    });
  });

  describe("싱글톤 동작", () => {
    it("동일한 인스턴스를 반환", () => {
      const runtime1 = getRuntime();
      const runtime2 = getRuntime();
      expect(runtime1).toBe(runtime2);
    });

    it("새 runtime으로 교체 가능", () => {
      const runtime1 = getRuntime();
      const newRuntime = { ...mockRuntime } as PluginRuntime;

      setRuntime(newRuntime);
      const runtime2 = getRuntime();

      expect(runtime2).not.toBe(runtime1);
      expect(runtime2).toBe(newRuntime);
    });
  });
});
