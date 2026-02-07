// Lv.3 — Infrastructure: File-based message persistence

import * as fs from "node:fs";
import * as path from "node:path";
import { type StoredMessage, MAX_HISTORY } from "./types.js";

const STORE_DIR = path.join(process.env.HOME || "/tmp", ".openclaw", "pwa-chat-history");

function ensureStoreDir(): void {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }
}

function storagePath(userId: string): string {
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(STORE_DIR, `${safe}.json`);
}

export function readHistory(userId: string): StoredMessage[] {
  ensureStoreDir();
  const p = storagePath(userId);
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as StoredMessage[];
  } catch {
    return [];
  }
}

export function appendMessage(userId: string, msg: StoredMessage): void {
  const msgs = readHistory(userId);
  msgs.push(msg);
  while (msgs.length > MAX_HISTORY) msgs.shift();
  ensureStoreDir();
  fs.writeFileSync(storagePath(userId), JSON.stringify(msgs, null, 2));
}

export function listSessions(): {
  sessionId: string;
  messageCount: number;
  lastTimestamp: number;
}[] {
  ensureStoreDir();
  const files = fs.readdirSync(STORE_DIR).filter((f) => f.endsWith(".json"));
  return files
    .map((f) => {
      const sessionId = f.replace(/\.json$/, "");
      try {
        const msgs = JSON.parse(
          fs.readFileSync(path.join(STORE_DIR, f), "utf8"),
        ) as StoredMessage[];
        return {
          sessionId,
          messageCount: msgs.length,
          lastTimestamp: msgs.length > 0 ? msgs[msgs.length - 1].timestamp : 0,
        };
      } catch {
        return { sessionId, messageCount: 0, lastTimestamp: 0 };
      }
    })
    .sort((a, b) => b.lastTimestamp - a.lastTimestamp);
}

export function deleteSession(sessionId: string): boolean {
  const p = storagePath(sessionId);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    return true;
  }
  return false;
}

export function nextMessageId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${ts}-${rand}`;
}
