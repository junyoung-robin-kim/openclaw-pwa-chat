// Authentication logic

import type { IncomingMessage } from "node:http";
import type { OpenClawConfig } from "openclaw/plugin-sdk";

export function checkAuth(req: IncomingMessage, cfg: OpenClawConfig): boolean {
  // Tailscale Serve proxy
  if (req.headers["tailscale-user-login"]) return true;

  // Localhost
  const remote = req.socket?.remoteAddress ?? "";
  if (remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1") {
    return true;
  }

  // Token check
  const gateway = cfg.gateway as Record<string, unknown> | undefined;
  const auth = gateway?.auth as Record<string, unknown> | undefined;
  const token = auth?.token as string | undefined;
  if (!token) return true;

  const authHeader = req.headers["authorization"] as string | undefined;
  const xToken = req.headers["x-auth-token"] as string | undefined;
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const queryToken = url.searchParams.get("token");

  const provided = authHeader?.replace(/^Bearer\s+/i, "") ?? xToken ?? queryToken;
  return provided === token;
}

export function getGatewayToken(cfg: OpenClawConfig): string {
  const gateway = cfg.gateway as Record<string, unknown> | undefined;
  const auth = gateway?.auth as Record<string, unknown> | undefined;
  return (auth?.token as string) ?? "";
}
