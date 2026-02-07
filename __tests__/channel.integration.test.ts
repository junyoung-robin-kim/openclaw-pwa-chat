import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import { describe, it, expect, vi } from "vitest";
import { pwaChatPlugin } from "../src/channel.js";

describe("channel.ts — ChannelPlugin 통합 테스트", () => {
  const mockConfig = (overrides?: any): OpenClawConfig =>
    ({
      channels: {
        "pwa-chat": {
          enabled: true,
          port: 19999,
          host: "127.0.0.1",
          ...overrides,
        },
      },
    }) as OpenClawConfig;

  describe("plugin metadata", () => {
    it("올바른 플러그인 ID", () => {
      expect(pwaChatPlugin.id).toBe("pwa-chat");
    });

    it("meta 정보가 올바름", () => {
      expect(pwaChatPlugin.meta.id).toBe("pwa-chat");
      expect(pwaChatPlugin.meta.label).toBe("PWA Chat");
      expect(pwaChatPlugin.meta.blurb).toContain("Browser-based");
    });

    it("capabilities 정의", () => {
      expect(pwaChatPlugin.capabilities.chatTypes).toContain("direct");
      expect(pwaChatPlugin.capabilities.blockStreaming).toBe(true);
      expect(pwaChatPlugin.capabilities.reactions).toBe(false);
    });
  });

  describe("config.resolveAccount", () => {
    it("기본 설정으로 계정 해석", () => {
      const cfg = mockConfig();
      const account = pwaChatPlugin.config.resolveAccount(cfg, DEFAULT_ACCOUNT_ID);

      expect(account.accountId).toBe(DEFAULT_ACCOUNT_ID);
      expect(account.enabled).toBe(true);
      expect(account.port).toBe(19999);
      expect(account.host).toBe("127.0.0.1");
    });

    it("커스텀 설정으로 계정 해석", () => {
      const cfg = mockConfig({
        enabled: false,
        port: 8888,
        host: "0.0.0.0",
      });
      const account = pwaChatPlugin.config.resolveAccount(cfg, DEFAULT_ACCOUNT_ID);

      expect(account.enabled).toBe(false);
      expect(account.port).toBe(8888);
      expect(account.host).toBe("0.0.0.0");
    });

    it("설정이 없으면 기본값 사용", () => {
      const cfg = { channels: {} } as OpenClawConfig;
      const account = pwaChatPlugin.config.resolveAccount(cfg, DEFAULT_ACCOUNT_ID);

      expect(account.enabled).toBe(true);
      expect(account.port).toBe(19999);
      expect(account.host).toBe("127.0.0.1");
    });
  });

  describe("config lifecycle", () => {
    it("listAccountIds는 DEFAULT_ACCOUNT_ID 반환", () => {
      const accounts = pwaChatPlugin.config.listAccountIds();
      expect(accounts).toEqual([DEFAULT_ACCOUNT_ID]);
    });

    it("defaultAccountId는 DEFAULT_ACCOUNT_ID 반환", () => {
      const defaultId = pwaChatPlugin.config.defaultAccountId();
      expect(defaultId).toBe(DEFAULT_ACCOUNT_ID);
    });

    it("isConfigured는 항상 true", () => {
      const configured = pwaChatPlugin.config.isConfigured();
      expect(configured).toBe(true);
    });

    it("isEnabled는 계정 enabled 값 반환", () => {
      const cfg = mockConfig({ enabled: true });
      const account = pwaChatPlugin.config.resolveAccount(cfg, DEFAULT_ACCOUNT_ID);
      expect(pwaChatPlugin.config.isEnabled(account)).toBe(true);

      const cfg2 = mockConfig({ enabled: false });
      const account2 = pwaChatPlugin.config.resolveAccount(cfg2, DEFAULT_ACCOUNT_ID);
      expect(pwaChatPlugin.config.isEnabled(account2)).toBe(false);
    });

    it("describeAccount 정보 반환", () => {
      const cfg = mockConfig();
      const account = pwaChatPlugin.config.resolveAccount(cfg, DEFAULT_ACCOUNT_ID);
      const desc = pwaChatPlugin.config.describeAccount(account);

      expect(desc.accountId).toBe(DEFAULT_ACCOUNT_ID);
      expect(desc.enabled).toBe(true);
      expect(desc.configured).toBe(true);
      expect(desc.port).toBe(19999);
    });
  });

  describe("security.resolveDmPolicy", () => {
    it("open 정책 반환", () => {
      const policy = pwaChatPlugin.security.resolveDmPolicy();

      expect(policy.policy).toBe("open");
      expect(policy.allowFromPath).toBe("channels.pwa-chat.allowFrom");
    });
  });

  describe("outbound.sendText", () => {
    it("메시지를 전송하고 messageId 반환", async () => {
      const result = await pwaChatPlugin.outbound.sendText({
        to: "pwa-chat:test-user",
        text: "안녕하세요",
      } as any);

      expect(result.channel).toBe("pwa-chat");
      expect(result.messageId).toMatch(/^pwa-\d+$/);
    });

    it("여러 메시지를 순차적으로 전송", async () => {
      const result1 = await pwaChatPlugin.outbound.sendText({
        to: "pwa-chat:user1",
        text: "첫 번째",
      } as any);

      // 타임스탬프가 다르도록 대기
      await new Promise((r) => setTimeout(r, 10));

      const result2 = await pwaChatPlugin.outbound.sendText({
        to: "pwa-chat:user2",
        text: "두 번째",
      } as any);

      expect(result1.messageId).not.toBe(result2.messageId);
      expect(result1.channel).toBe("pwa-chat");
      expect(result2.channel).toBe("pwa-chat");
    });
  });

  describe("status", () => {
    it("buildChannelSummary 구조", () => {
      const summary = pwaChatPlugin.status.buildChannelSummary({
        snapshot: {
          running: true,
          lastStartAt: Date.now(),
          lastError: null,
        },
      } as any);

      expect(summary.configured).toBe(true);
      expect(summary.running).toBe(true);
      expect(summary.lastStartAt).toBeTruthy();
      expect(summary.lastError).toBeNull();
    });

    it("buildAccountSnapshot 구조", () => {
      const cfg = mockConfig();
      const account = pwaChatPlugin.config.resolveAccount(cfg, DEFAULT_ACCOUNT_ID);

      const snapshot = pwaChatPlugin.status.buildAccountSnapshot({
        account,
        runtime: {
          running: false,
          lastStartAt: null,
          lastStopAt: Date.now(),
          lastError: null,
        },
      } as any);

      expect(snapshot.accountId).toBe(DEFAULT_ACCOUNT_ID);
      expect(snapshot.enabled).toBe(true);
      expect(snapshot.configured).toBe(true);
      expect(snapshot.running).toBe(false);
    });
  });

  describe("reload config", () => {
    it("reload 설정에 올바른 prefix", () => {
      expect(pwaChatPlugin.reload.configPrefixes).toContain("channels.pwa-chat");
    });
  });
});
