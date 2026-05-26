import { supabase } from "@/integrations/supabase/client";

const SW_URL = "/sw-push.js";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

function isPreviewOrIframe(): boolean {
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const h = window.location.hostname;
  return h.includes("id-preview--") || h.includes("lovableproject.com");
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function getPushPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  return Notification.permission;
}

async function getOrRegisterSW(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  // Tenta achar uma já registrada com nosso script
  const existing = await navigator.serviceWorker.getRegistrations();
  for (const r of existing) {
    const urls = [r.active?.scriptURL, r.installing?.scriptURL, r.waiting?.scriptURL].filter(Boolean) as string[];
    if (urls.some((url) => url.includes("/sw-push.js"))) {
      await r.update();
      return r;
    }
  }
  return await navigator.serviceWorker.register(SW_URL, { scope: "/" });
}

async function fetchVapidPublicKey(): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke("vapid-public-key", { method: "GET" });
  if (error || !data?.publicKey) return null;
  return data.publicKey as string;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function subscribeToPush(): Promise<{ ok: boolean; reason?: string }> {
  if (isPreviewOrIframe()) return { ok: false, reason: "preview" };
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };

  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session?.user) return { ok: false, reason: "no-auth" };

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "denied" };

  const reg = await getOrRegisterSW();
  if (!reg) return { ok: false, reason: "no-sw" };

  // Aguarda ativar
  if (!reg.active) {
    await new Promise<void>((resolve) => {
      const sw = reg.installing || reg.waiting;
      if (!sw) return resolve();
      sw.addEventListener("statechange", () => {
        if (sw.state === "activated") resolve();
      });
    });
  }

  const publicKey = await fetchVapidPublicKey();
  if (!publicKey) return { ok: false, reason: "no-vapid" };

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
    });
  }

  const json = sub.toJSON() as any;
  const endpoint = sub.endpoint;
  const p256dh = json.keys?.p256dh ?? arrayBufferToBase64(sub.getKey("p256dh"));
  const auth = json.keys?.auth ?? arrayBufferToBase64(sub.getKey("auth"));

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: sess.session.user.id,
        endpoint,
        p256dh,
        auth,
        user_agent: navigator.userAgent,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );
  if (error) return { ok: false, reason: error.message };

  return { ok: true };
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  }
}
