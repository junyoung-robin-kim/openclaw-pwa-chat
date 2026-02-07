// Authentication logic
export function checkAuth(req, cfg) {
    // Tailscale Serve proxy
    if (req.headers["tailscale-user-login"])
        return true;
    // Localhost
    const remote = req.socket?.remoteAddress ?? "";
    if (remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1") {
        return true;
    }
    // Token check
    const gateway = cfg.gateway;
    const auth = gateway?.auth;
    const token = auth?.token;
    if (!token)
        return true;
    const authHeader = req.headers["authorization"];
    const xToken = req.headers["x-auth-token"];
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const queryToken = url.searchParams.get("token");
    const provided = authHeader?.replace(/^Bearer\s+/i, "") ?? xToken ?? queryToken;
    return provided === token;
}
export function getGatewayToken(cfg) {
    const gateway = cfg.gateway;
    const auth = gateway?.auth;
    return auth?.token ?? "";
}
