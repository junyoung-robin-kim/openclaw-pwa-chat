// Lv.3 — Infrastructure: File-based message persistence
import * as fs from "node:fs";
import * as path from "node:path";
import { MAX_HISTORY } from "./types.js";
const STORE_DIR = path.join(process.env.HOME || "/tmp", ".openclaw", "pwa-chat-history");
function ensureStoreDir() {
    if (!fs.existsSync(STORE_DIR)) {
        fs.mkdirSync(STORE_DIR, { recursive: true });
    }
}
function storagePath(userId) {
    const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(STORE_DIR, `${safe}.json`);
}
export function readHistory(userId) {
    ensureStoreDir();
    const p = storagePath(userId);
    if (!fs.existsSync(p))
        return [];
    try {
        return JSON.parse(fs.readFileSync(p, "utf8"));
    }
    catch {
        return [];
    }
}
export function appendMessage(userId, msg) {
    const msgs = readHistory(userId);
    msgs.push(msg);
    while (msgs.length > MAX_HISTORY)
        msgs.shift();
    ensureStoreDir();
    fs.writeFileSync(storagePath(userId), JSON.stringify(msgs, null, 2));
}
export function nextMessageId(prefix) {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 6);
    return `${prefix}-${ts}-${rand}`;
}
