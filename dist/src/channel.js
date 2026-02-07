// ChannelPlugin implementation
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import { startHttpServer, stopHttpServer } from "./http-server.js";
import { CHANNEL_ID } from "./types.js";
import { pushOutboundMessage } from "./ws-server.js";
function resolveAccount(cfg, _accountId) {
    const section = cfg.channels?.[CHANNEL_ID];
    return {
        accountId: DEFAULT_ACCOUNT_ID,
        enabled: section?.enabled ?? true,
        port: section?.port ?? 19999,
        host: section?.host ?? "127.0.0.1",
    };
}
export const pwaChatPlugin = {
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
            return { channel: CHANNEL_ID, messageId: `pwa-${Date.now()}` };
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
        startAccount: async (ctx) => {
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
                runtime: ctx.runtime,
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
