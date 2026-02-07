import { useEffect, useState, useCallback } from "react";

type PushState = "unsupported" | "denied" | "prompt" | "subscribed" | "error";

function getAuthToken(): string {
  return (window as any).__PWA_AUTH_TOKEN__ || "";
}

async function getVapidPublicKey(): Promise<string> {
  const res = await fetch("/api/push/vapid-public-key");
  const data = await res.json();
  return data.publicKey;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function usePushNotification() {
  const [pushState, setPushState] = useState<PushState>("prompt");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setPushState("denied");
    } else if (Notification.permission === "granted") {
      // Check if already subscribed
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setPushState(sub ? "subscribed" : "prompt");
        });
      });
    }
  }, []);

  const subscribe = useCallback(async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushState("denied");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const vapidKey = await getVapidPublicKey();

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      }

      // Register with server
      const token = getAuthToken();
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "X-Auth-Token": token } : {}),
        },
        body: JSON.stringify({
          userId: "default",
          subscription: sub.toJSON(),
        }),
      });

      setPushState("subscribed");
    } catch (err) {
      console.error("[pwa-chat] push subscribe error:", err);
      setPushState("error");
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();

        const token = getAuthToken();
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { "X-Auth-Token": token } : {}),
          },
          body: JSON.stringify({ userId: "default", endpoint }),
        });
      }
      setPushState("prompt");
    } catch (err) {
      console.error("[pwa-chat] push unsubscribe error:", err);
      setPushState("error");
    }
  }, []);

  return { pushState, subscribe, unsubscribe };
}
