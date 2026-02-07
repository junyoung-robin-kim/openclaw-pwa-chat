// Web Push Notification: subscription management + send

import * as fs from "node:fs";
import * as path from "node:path";
// @ts-ignore — no type declarations for web-push
import webpush from "web-push";

const STORE_DIR = path.join(process.env.HOME || "/tmp", ".openclaw", "pwa-chat-push");
const VAPID_PATH = path.join(STORE_DIR, "vapid.json");
const SUBS_PATH = path.join(STORE_DIR, "subscriptions.json");

function ensureDir(): void {
  if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
}

// --- VAPID keys ---

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

function loadOrCreateVapidKeys(): VapidKeys {
  ensureDir();
  if (fs.existsSync(VAPID_PATH)) {
    return JSON.parse(fs.readFileSync(VAPID_PATH, "utf8")) as VapidKeys;
  }
  const keys = webpush.generateVAPIDKeys();
  const vapid: VapidKeys = { publicKey: keys.publicKey, privateKey: keys.privateKey };
  fs.writeFileSync(VAPID_PATH, JSON.stringify(vapid, null, 2));
  return vapid;
}

let vapidKeys: VapidKeys | null = null;

export function getVapidPublicKey(): string {
  if (!vapidKeys) vapidKeys = loadOrCreateVapidKeys();
  return vapidKeys.publicKey;
}

function initWebPush(): void {
  if (!vapidKeys) vapidKeys = loadOrCreateVapidKeys();
  webpush.setVapidDetails("mailto:pwa-chat@openclaw.ai", vapidKeys.publicKey, vapidKeys.privateKey);
}

// --- Subscription storage ---

export interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface SubscriptionStore {
  [userId: string]: PushSubscription[];
}

function readSubscriptions(): SubscriptionStore {
  ensureDir();
  if (!fs.existsSync(SUBS_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(SUBS_PATH, "utf8")) as SubscriptionStore;
  } catch {
    return {};
  }
}

function writeSubscriptions(store: SubscriptionStore): void {
  ensureDir();
  fs.writeFileSync(SUBS_PATH, JSON.stringify(store, null, 2));
}

export function addSubscription(userId: string, sub: PushSubscription): void {
  const store = readSubscriptions();
  if (!store[userId]) store[userId] = [];
  // Deduplicate by endpoint
  const existing = store[userId].findIndex((s) => s.endpoint === sub.endpoint);
  if (existing >= 0) {
    store[userId][existing] = sub;
  } else {
    store[userId].push(sub);
  }
  writeSubscriptions(store);
}

export function removeSubscription(userId: string, endpoint: string): void {
  const store = readSubscriptions();
  if (!store[userId]) return;
  store[userId] = store[userId].filter((s) => s.endpoint !== endpoint);
  if (store[userId].length === 0) delete store[userId];
  writeSubscriptions(store);
}

// --- Send push ---

export async function sendPushNotification(
  userId: string,
  payload: { title: string; body: string; tag?: string },
  log?: { info: (msg: string) => void; error: (msg: string) => void },
): Promise<void> {
  initWebPush();
  const store = readSubscriptions();
  const subs = store[userId];
  if (!subs || subs.length === 0) return;

  const data = JSON.stringify(payload);
  const expired: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, data);
        log?.info(`pwa-chat: push sent to ${userId} (${sub.endpoint.slice(-20)})`);
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription expired
          expired.push(sub.endpoint);
        } else {
          log?.error(`pwa-chat: push failed: ${String(err)}`);
        }
      }
    }),
  );

  // Clean up expired subscriptions
  if (expired.length > 0) {
    for (const ep of expired) removeSubscription(userId, ep);
  }
}
