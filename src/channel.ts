// ChannelPlugin implementation

import type { ChannelPlugin, ChannelGatewayContext, OpenClawConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import { startHttpServer, stopHttpServer } from "./http-server.js";
import { type ResolvedPwaChatAccount, CHANNEL_ID } from "./types.js";
import { pushOutboundMessage } from "./ws-server.js";

function resolveAccount(cfg: OpenClawConfig, _accountId?: string | null): ResolvedPwaChatAccount {
  const section = (cfg.channels as Record<string, unknown>)?.[CHANNEL_ID] as
    | Record<string, unknown>
    | undefined;
  return {
    accountId: DEFAULT_ACCOUNT_ID,
    enabled: (section?.enabled as boolean) ?? true,
    port: (section?.port as number) ?? 19999,
    host: (section?.host as string) ?? "127.0.0.1",
  };
}

export const pwaChatPlugin: ChannelPlugin<ResolvedPwaChatAccount> = {
  id: CHANNEL_ID,
  meta: {
    id: CHANNEL_ID,
    label: "PWA Chat",
    selectionLabel: "PWA Chat (Browser)",
    detailLabel: "PWA Chat",
    docsPath: "/channels/pwa-chat",
    docsLabel: "pwa-chat",
    blurb: "Browser-based PWA messenger channel plugin.",
  },
  capabilities: {
    chatTypes: ["direct"],
    reactions: false,
    threads: false,
    media: false,
    nativeCommands: false,
    blockStreaming: true,
  },
  reload: { configPrefixes: [`channels.${CHANNEL_ID}`] },
  config: {
    listAccountIds: () => [DEFAULT_ACCOUNT_ID],
    resolveAccount: (cfg, accountId) => resolveAccount(cfg, accountId),
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    isConfigured: () => true,
    isEnabled: (account) => account.enabled,
    describeAccount: (account) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: true,
      port: account.port,
    }),
  },
  security: {
    resolveDmPolicy: () => ({
      policy: "open",
      allowFrom: [],
      allowFromPath: `channels.${CHANNEL_ID}.allowFrom`,
      approveHint: `Add user to channels.${CHANNEL_ID}.allowFrom`,
    }),
  },
  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 10000,
    sendText: async ({ to, text }) => {
      pushOutboundMessage(to, text);
      return { channel: CHANNEL_ID, messageId: `pwa-${Date.now()}` } as any;
    },
    sendMedia: async ({ to, text, mediaUrl }) => {
      // PWA does not support media yet — deliver caption text as fallback
      const fallback = [text, mediaUrl].filter(Boolean).join("\n");
      pushOutboundMessage(to, fallback || "(media)");
      return { channel: CHANNEL_ID, messageId: `pwa-${Date.now()}` } as any;
    },
  },
  status: {
    buildChannelSummary: ({ snapshot }) => ({
      configured: true,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastError: snapshot.lastError ?? null,
    }),
    buildAccountSnapshot: ({ account, runtime }) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: true,
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
    }),
  },
  gateway: {
    startAccount: async (ctx: ChannelGatewayContext<ResolvedPwaChatAccount>) => {
      const { account } = ctx;
      ctx.log?.info(`[${account.accountId}] starting PWA Chat on ${account.host}:${account.port}`);
      ctx.setStatus({
        ...ctx.getStatus(),
        running: true,
        lastStartAt: Date.now(),
        lastError: null,
      });
      await startHttpServer({
        port: account.port,
        host: account.host,
        cfg: ctx.cfg,
        runtime: ctx.runtime as any,
        accountId: account.accountId,
        abortSignal: ctx.abortSignal,
        log: ctx.log,
      });
    },
    logoutAccount: async () => {
      stopHttpServer();
      return { cleared: true, loggedOut: true };
    },
  },
};
