/**
 * channel.ts 엣지 케이스 테스트
 * 목표: 커버리지 70% → 80%+
 */

import type { OpenClawConfig, ChannelGatewayContext, RuntimeEnv } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ResolvedPwaChatAccount } from "../src/types.js";
import { pwaChatPlugin } from "../src/channel.js";
import { stopHttpServer } from "../src/http-server.js";

describe("channel.ts — 엣지 케이스 & 커버리지 향상", () => {
  const mockConfig = (overrides?: any): OpenClawConfig =>
    ({
      channels: {
        "pwa-chat": {
          enabled: true,
          port: 19997, // 충돌 방지
          host: "127.0.0.1",
          ...overrides,
        },
      },
    }) as OpenClawConfig;

  describe("gateway.startAccount (라인 96-120)", () => {
    let abortController: AbortController;

    beforeEach(() => {
      abortController = new AbortController();
    });

    afterEach(() => {
      if (!abortController.signal.aborted) {
        abortController.abort();
      }
      // 서버 정리
      stopHttpServer();
    });

    it("startAccount가 서버를 시작하고 상태를 업데이트함", async () => {
      const cfg = mockConfig();
      const account = pwaChatPlugin.config.resolveAccount(cfg, DEFAULT_ACCOUNT_ID);

      let currentStatus = {
        running: false,
        lastStartAt: null,
        lastStopAt: null,
        lastError: null,
      };

      const mockContext: ChannelGatewayContext<ResolvedPwaChatAccount> = {
        account,
        cfg,
        runtime: {} as RuntimeEnv,
        abortSignal: abortController.signal,
        log: {
          info: vi.fn(),
          error: vi.fn(),
        },
        getStatus: () => currentStatus,
        setStatus: (status) => {
          currentStatus = { ...currentStatus, ...status };
        },
      };

      // startAccount 호출
      await pwaChatPlugin.gateway.startAccount(mockContext);

      // 상태 확인
      expect(currentStatus.running).toBe(true);
      expect(currentStatus.lastStartAt).toBeGreaterThan(0);
      expect(currentStatus.lastError).toBeNull();

      // 로그 확인
      expect(mockContext.log?.info).toHaveBeenCalledWith(
        expect.stringContaining("starting PWA Chat"),
      );

      // 서버가 실제로 시작되었는지 확인
      const res = await fetch(`http://127.0.0.1:19997/`);
      expect(res.status).toBe(200);
    });

    it("startAccount 중 에러 발생 시 예외 전파", async () => {
      const cfg = mockConfig({ port: -1 }); // 잘못된 포트
      const account = pwaChatPlugin.config.resolveAccount(cfg, DEFAULT_ACCOUNT_ID);

      const mockContext: ChannelGatewayContext<ResolvedPwaChatAccount> = {
        account,
        cfg,
        runtime: {} as RuntimeEnv,
        abortSignal: abortController.signal,
        log: {
          info: vi.fn(),
          error: vi.fn(),
        },
        getStatus: () => ({
          running: false,
          lastStartAt: null,
          lastStopAt: null,
          lastError: null,
        }),
        setStatus: vi.fn(),
      };

      // startAccount 호출 시 에러 발생
      await expect(pwaChatPlugin.gateway.startAccount(mockContext)).rejects.toThrow();
    });
  });

  describe("gateway.logoutAccount (라인 121-124)", () => {
    it("logoutAccount가 서버를 중지하고 결과 반환", async () => {
      const { startHttpServer } = await import("../src/http-server.js");
      const abortController = new AbortController();

      await startHttpServer({
        port: 19996,
        host: "127.0.0.1",
        cfg: mockConfig(),
        runtime: {} as RuntimeEnv,
        accountId: DEFAULT_ACCOUNT_ID,
        abortSignal: abortController.signal,
      });

      // logoutAccount 호출
      const result = await pwaChatPlugin.gateway.logoutAccount({} as any);

      expect(result.cleared).toBe(true);
      expect(result.loggedOut).toBe(true);

      // 서버가 중지되었는지 확인
      await expect(async () => {
        await fetch(`http://127.0.0.1:19996/`);
      }).rejects.toThrow();

      abortController.abort();
    });
  });

  describe("status.buildAccountSnapshot 엣지 케이스", () => {
    it("runtime이 없을 때 null 값 반환", () => {
      const account = pwaChatPlugin.config.resolveAccount(mockConfig(), DEFAULT_ACCOUNT_ID);
      const snapshot = pwaChatPlugin.status.buildAccountSnapshot({
        account,
      } as any);

      expect(snapshot.running).toBe(false);
      expect(snapshot.lastStartAt).toBeNull();
      expect(snapshot.lastStopAt).toBeNull();
      expect(snapshot.lastError).toBeNull();
    });

    it("runtime이 있을 때 값 반환", () => {
      const account = pwaChatPlugin.config.resolveAccount(mockConfig(), DEFAULT_ACCOUNT_ID);
      const mockRuntime = {
        running: true,
        lastStartAt: 123456,
        lastStopAt: 789012,
        lastError: "Test error",
      };

      const snapshot = pwaChatPlugin.status.buildAccountSnapshot({
        account,
        runtime: mockRuntime,
      } as any);

      expect(snapshot.running).toBe(true);
      expect(snapshot.lastStartAt).toBe(123456);
      expect(snapshot.lastStopAt).toBe(789012);
      expect(snapshot.lastError).toBe("Test error");
    });
  });

  describe("config.resolveAccount 엣지 케이스", () => {
    it("enabled가 false일 때도 계정 해석", () => {
      const cfg = mockConfig({ enabled: false });
      const account = pwaChatPlugin.config.resolveAccount(cfg, DEFAULT_ACCOUNT_ID);

      expect(account.accountId).toBe(DEFAULT_ACCOUNT_ID);
      expect(account.enabled).toBe(false);
    });

    it("port와 host가 없을 때 기본값 사용", () => {
      const cfg = mockConfig({ port: undefined, host: undefined });
      const account = pwaChatPlugin.config.resolveAccount(cfg, DEFAULT_ACCOUNT_ID);

      expect(account.port).toBe(19999);
      expect(account.host).toBe("127.0.0.1");
    });

    it("channels.pwa-chat 설정이 없을 때 기본값 사용", () => {
      const cfg = {
        channels: {},
      } as OpenClawConfig;

      const account = pwaChatPlugin.config.resolveAccount(cfg, DEFAULT_ACCOUNT_ID);

      expect(account.accountId).toBe(DEFAULT_ACCOUNT_ID);
      expect(account.enabled).toBe(true);
      expect(account.port).toBe(19999);
      expect(account.host).toBe("127.0.0.1");
    });
  });

  describe("capabilities", () => {
    it("모든 capabilities가 정의됨", () => {
      const caps = pwaChatPlugin.capabilities;

      expect(caps.chatTypes).toBeDefined();
      expect(caps.blockStreaming).toBe(true);
      expect(caps.reactions).toBe(false);
      expect(caps.media).toBe(false);
      expect(caps.threads).toBe(false);
      expect(caps.nativeCommands).toBe(false);
    });
  });

  describe("meta 정보", () => {
    it("meta 정보가 완전함", () => {
      const meta = pwaChatPlugin.meta;

      expect(meta.id).toBe("pwa-chat");
      expect(meta.label).toBe("PWA Chat");
      expect(meta.blurb).toBeTruthy();
    });
  });
});
