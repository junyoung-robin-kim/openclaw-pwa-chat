#!/usr/bin/env node
// Lv.4 — TUI Client: Terminal chat via WebSocket

import * as readline from "node:readline";
import { WebSocket } from "ws";
import type { WsServerMessage, StoredMessage } from "./types.js";

const args = process.argv.slice(2);
const port = getArg("--port", "19999");
const host = getArg("--host", "127.0.0.1");
const token = getArg("--token", "");
const userId = getArg("--userId", "default");

function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return fallback;
  return args[idx + 1];
}

const wsUrl = `ws://${host}:${port}/ws?userId=${encodeURIComponent(userId)}${token ? `&token=${encodeURIComponent(token)}` : ""}`;

let ws: WebSocket;
let streamingLine = "";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "\x1b[36myou>\x1b[0m ",
});

function connect(): void {
  console.log(`\x1b[90mConnecting to ${wsUrl}...\x1b[0m`);

  const headers: Record<string, string> = {};
  if (token) headers["X-Auth-Token"] = token;

  ws = new WebSocket(wsUrl, { headers });

  ws.on("open", () => {
    console.log("\x1b[32m● Connected\x1b[0m\n");
    rl.prompt();
  });

  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString()) as WsServerMessage;

    switch (msg.type) {
      case "history":
        if (msg.messages.length > 0) {
          console.log("\x1b[90m--- History ---\x1b[0m");
          for (const m of msg.messages) {
            printMessage(m);
          }
          console.log("\x1b[90m--- End ---\x1b[0m\n");
        }
        break;

      case "message":
        if (msg.msg.role === "assistant") {
          // Clear streaming line if any
          if (streamingLine) {
            process.stdout.write("\r\x1b[K");
            streamingLine = "";
          }
          printMessage(msg.msg);
          rl.prompt();
        }
        break;

      case "streaming": {
        // Overwrite current line with streaming text
        const preview = msg.text.length > 80 ? msg.text.slice(msg.text.length - 80) : msg.text;
        process.stdout.write(`\r\x1b[K\x1b[33m...\x1b[0m ${preview.replace(/\n/g, " ")}`);
        streamingLine = msg.text;
        break;
      }

      case "streaming_end":
        if (streamingLine) {
          process.stdout.write("\r\x1b[K");
          streamingLine = "";
        }
        break;
    }
  });

  ws.on("close", () => {
    console.log("\n\x1b[31m● Disconnected\x1b[0m");
    setTimeout(connect, 2000);
  });

  ws.on("error", (err) => {
    console.error(`\x1b[31mWS error: ${err.message}\x1b[0m`);
  });
}

function printMessage(m: StoredMessage): void {
  const time = new Date(m.timestamp).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (m.role === "user") {
    console.log(`\x1b[90m[${time}]\x1b[0m \x1b[36myou>\x1b[0m ${m.text}`);
  } else {
    console.log(`\x1b[90m[${time}]\x1b[0m \x1b[35mbot>\x1b[0m ${m.text}`);
  }
}

rl.on("line", (line) => {
  const text = line.trim();
  if (!text) {
    rl.prompt();
    return;
  }

  if (text === "/quit" || text === "/exit") {
    console.log("Bye!");
    process.exit(0);
  }

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "message", text }));
  } else {
    console.log("\x1b[31mNot connected\x1b[0m");
  }

  rl.prompt();
});

rl.on("close", () => {
  process.exit(0);
});

connect();
