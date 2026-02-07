// HTTP server: static files + health check + WebSocket upgrade

import type { OpenClawConfig, PluginRuntime, ChannelLogSink } from "openclaw/plugin-sdk";
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { checkAuth, getGatewayToken } from "./auth.js";
import { listSessions, deleteSession } from "./message-store.js";
import { getVapidPublicKey, addSubscription, removeSubscription } from "./push.js";
import { setupWebSocketServer, closeWebSocketServer } from "./ws-server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "../dist/client");
const FALLBACK_DIR = path.resolve(__dirname, "../public");
const PUBLIC_DIR = fs.existsSync(DIST_DIR) ? DIST_DIR : FALLBACK_DIR;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

let httpServer: http.Server | null = null;

type ServerConfig = {
  port: number;
  host: string;
  cfg: OpenClawConfig;
  runtime: PluginRuntime;
  accountId: string;
  abortSignal: AbortSignal;
  log?: ChannelLogSink;
};

function jsonResponse(res: http.ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function serveStaticFile(res: http.ServerResponse, urlPath: string, cfg: OpenClawConfig): void {
  let filePath = urlPath === "/" ? "/index.html" : urlPath;
  filePath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const fullPath = path.join(PUBLIC_DIR, filePath);

  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      // SPA fallback: serve index.html for unknown paths
      const indexPath = path.join(PUBLIC_DIR, "index.html");
      if (filePath !== "/index.html" && fs.existsSync(indexPath)) {
        serveStaticFile(res, "/", cfg);
        return;
      }
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    const ext = path.extname(fullPath);
    let body: string | Buffer = data;

    // Inject auth token into HTML
    if (ext === ".html") {
      const token = getGatewayToken(cfg);
      body = data
        .toString()
        .replace("</head>", `<script>window.__PWA_AUTH_TOKEN__="${token}";</script></head>`);
    }

    res.writeHead(200, {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
    });
    res.end(body);
  });
}

export async function startHttpServer(config: ServerConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        if (req.method === "OPTIONS") {
          res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Auth-Token",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          });
          res.end();
          return;
        }

        const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

        if (url.pathname === "/api/status") {
          if (!checkAuth(req, config.cfg)) {
            jsonResponse(res, 401, { error: "Unauthorized" });
            return;
          }
          jsonResponse(res, 200, { ok: true, channel: "pwa-chat" });
          return;
        }

        // Media serving endpoint
        if (url.pathname === "/api/media") {
          if (!checkAuth(req, config.cfg)) {
            jsonResponse(res, 401, { error: "Unauthorized" });
            return;
          }
          const mediaPath = url.searchParams.get("path");
          if (!mediaPath) {
            jsonResponse(res, 400, { error: "Missing path parameter" });
            return;
          }

          // Security: resolve absolute path and check it's a real file
          const resolvedPath = path.resolve(mediaPath);
          if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
            res.writeHead(404);
            res.end("Not Found");
            return;
          }

          // Security: only allow image MIME types
          const ext = path.extname(resolvedPath).toLowerCase();
          const imageMimes: Record<string, string> = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".webp": "image/webp",
            ".svg": "image/svg+xml",
          };
          const mimeType = imageMimes[ext];
          if (!mimeType) {
            res.writeHead(403);
            res.end("Forbidden: not an image file");
            return;
          }

          fs.readFile(resolvedPath, (err, data) => {
            if (err) {
              res.writeHead(500);
              res.end("Error reading file");
              return;
            }
            res.writeHead(200, {
              "Content-Type": mimeType,
              "Cache-Control": "public, max-age=3600",
            });
            res.end(data);
          });
          return;
        }

        // Session management
        if (url.pathname === "/api/sessions" && req.method === "GET") {
          if (!checkAuth(req, config.cfg)) {
            jsonResponse(res, 401, { error: "Unauthorized" });
            return;
          }
          jsonResponse(res, 200, { sessions: listSessions() });
          return;
        }

        if (url.pathname === "/api/sessions" && req.method === "DELETE") {
          if (!checkAuth(req, config.cfg)) {
            jsonResponse(res, 401, { error: "Unauthorized" });
            return;
          }
          let body = "";
          req.on("data", (c) => (body += c));
          req.on("end", () => {
            try {
              const { sessionId } = JSON.parse(body);
              const deleted = deleteSession(sessionId);
              jsonResponse(res, 200, { ok: deleted });
            } catch {
              jsonResponse(res, 400, { error: "Invalid body" });
            }
          });
          return;
        }

        // Push notification endpoints
        if (url.pathname === "/api/push/vapid-public-key") {
          jsonResponse(res, 200, { publicKey: getVapidPublicKey() });
          return;
        }

        if (url.pathname === "/api/push/subscribe" && req.method === "POST") {
          if (!checkAuth(req, config.cfg)) {
            jsonResponse(res, 401, { error: "Unauthorized" });
            return;
          }
          let body = "";
          req.on("data", (c) => (body += c));
          req.on("end", () => {
            try {
              const { userId, subscription } = JSON.parse(body);
              addSubscription(userId ?? "default", subscription);
              config.log?.info(`pwa-chat: push subscription added for ${userId ?? "default"}`);
              jsonResponse(res, 200, { ok: true });
            } catch {
              jsonResponse(res, 400, { error: "Invalid body" });
            }
          });
          return;
        }

        if (url.pathname === "/api/push/unsubscribe" && req.method === "POST") {
          if (!checkAuth(req, config.cfg)) {
            jsonResponse(res, 401, { error: "Unauthorized" });
            return;
          }
          let body = "";
          req.on("data", (c) => (body += c));
          req.on("end", () => {
            try {
              const { userId, endpoint } = JSON.parse(body);
              removeSubscription(userId ?? "default", endpoint);
              jsonResponse(res, 200, { ok: true });
            } catch {
              jsonResponse(res, 400, { error: "Invalid body" });
            }
          });
          return;
        }

        // Static files (no auth needed for loading the app shell)
        serveStaticFile(res, url.pathname, config.cfg);
      } catch (err) {
        config.log?.error(`pwa-chat: request error: ${String(err)}`);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end("Internal Server Error");
        }
      }
    });

    httpServer = server;

    // Setup WebSocket on same server
    setupWebSocketServer(server, config.cfg, config.accountId, config.log);

    config.abortSignal.addEventListener("abort", () => {
      closeWebSocketServer();
      server.close();
      httpServer = null;
    });

    server.listen(config.port, config.host, () => {
      config.log?.info(`pwa-chat: server listening on http://${config.host}:${config.port}`);
      resolve();
    });

    server.on("error", (err) => {
      config.log?.error(`pwa-chat: server error: ${String(err)}`);
      reject(err);
    });
  });
}

export function stopHttpServer(): void {
  closeWebSocketServer();
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
}
