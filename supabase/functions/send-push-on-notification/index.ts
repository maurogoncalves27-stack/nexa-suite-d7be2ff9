// Disparado automaticamente (via trigger pg_net) sempre que uma linha é inserida em user_notifications.
// Lê a notificação, busca todas as push_subscriptions do usuário e envia Web Push.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const RAW_VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";
const VAPID_SUBJECT = /^(mailto:|https?:\/\/)/i.test(RAW_VAPID_SUBJECT)
  ? RAW_VAPID_SUBJECT
  : `mailto:${RAW_VAPID_SUBJECT}`;

let vapidReady = false;
try {
  if (VAPID_PUBLIC && VAPID_PRIVATE) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    vapidReady = true;
  }
} catch (e) {
  console.error("VAPID setup failed", e);
}

interface Body {
  notification_id: string;
}

const PUBLIC_SITE_URL = (Deno.env.get("PUBLIC_SITE_URL") ?? "https://nexa.aquelaparme.com.br").replace(/\/$/, "");

const STORE_ICON_MAP: Record<string, string> = {
  "ASA NORTE": "/notification-icons/dot-asa-norte.png",
  "AGUAS CLARAS": "/notification-icons/dot-aguas-claras.png",
  "ÁGUAS CLARAS": "/notification-icons/dot-aguas-claras.png",
  "ASA SUL": "/notification-icons/dot-asa-sul.png",
  "LAGO SUL": "/notification-icons/dot-lago-sul.png",
};

const STORE_EMOJI_MAP: Record<string, string> = {
  "ASA NORTE": "🟢",
  "AGUAS CLARAS": "🔵",
  "ÁGUAS CLARAS": "🔵",
  "ASA SUL": "🟡",
  "LAGO SUL": "🟣",
};

const EMOJI_PREFIX_RE = /^(?:🟢|🔵|🟡|🟣|🟣|🔴|🟠|🟤|⚪|⚫)\s*/u;

const titleWithStoreEmoji = (title: string, store: string | null) => {
  if (!store) return title;
  const emoji = STORE_EMOJI_MAP[store];
  if (!emoji) return title;
  const cleaned = title.replace(EMOJI_PREFIX_RE, "");
  return `${emoji} ${cleaned}`;
};

const detectStore = (text: string): string | null => {
  const upper = (text || "").toUpperCase();
  for (const key of Object.keys(STORE_ICON_MAP)) {
    if (upper.includes(key)) return key;
  }
  return null;
};

const bodyWithoutOccurrenceStore = (message: string) =>
  message
    .replace(/^\s*(ASA\s*NORTE|[ÁA]GUAS\s*CLARAS|ASA\s*SUL|LAGO\s*SUL)\s*[•·\-—]?\s*/i, "")
    .replace(/^\s*[•·\-—]\s*/, "")
    .trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    if (!body?.notification_id) {
      return new Response(JSON.stringify({ error: "notification_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!vapidReady) {
      return new Response(JSON.stringify({ ok: false, reason: "vapid-not-configured" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: notif, error: nErr } = await admin
      .from("user_notifications")
      .select("id, user_id, title, message, url, tag, category")
      .eq("id", body.notification_id)
      .maybeSingle();

    if (nErr || !notif) {
      return new Response(JSON.stringify({ error: "notification not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", notif.user_id);

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: "no-subs" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isOccurrence = notif.category === "occurrence";
    const pushBody = isOccurrence ? bodyWithoutOccurrenceStore(notif.message) : notif.message;
    const store = isOccurrence ? detectStore(`${notif.title} ${notif.message}`) : null;
    const icon = store ? `${PUBLIC_SITE_URL}${STORE_ICON_MAP[store]}` : undefined;
    const finalTitle = titleWithStoreEmoji(notif.title, store);
    const payload = JSON.stringify({
      title: finalTitle,
      body: pushBody,
      url: notif.url ?? "/",
      tag: notif.tag ?? notif.category ?? "general",
      category: notif.category ?? "general",
      store,
      icon,
    });

    let sent = 0;
    const stale: string[] = [];
    await Promise.all(
      subs.map(async (s: any) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          );
          sent++;
        } catch (err: any) {
          const status = err?.statusCode;
          if (status === 404 || status === 410) stale.push(s.id);
          console.error("push error", status, err?.body ?? err?.message);
        }
      }),
    );

    if (stale.length > 0) {
      await admin.from("push_subscriptions").delete().in("id", stale);
    }

    return new Response(JSON.stringify({ ok: true, sent, removed: stale.length, total: subs.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("send-push-on-notification error", e);
    return new Response(JSON.stringify({ error: e?.message ?? "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
