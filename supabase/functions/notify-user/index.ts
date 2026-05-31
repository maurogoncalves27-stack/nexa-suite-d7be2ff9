// Envia Web Push direto para um usuário (notificações genéricas do app).
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const RAW_VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";
// Aceita "email@dominio" e converte para "mailto:email@dominio" automaticamente
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
  user_id: string;
  title: string;
  message: string;
  url?: string;
  tag?: string;
  category?: string;
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

const detectStore = (text: string): string | null => {
  const upper = (text || "").toUpperCase();
  for (const key of Object.keys(STORE_ICON_MAP)) {
    if (upper.includes(key)) return key;
  }
  return null;
};

const EMOJI_PREFIX_RE = /^(?:🟢|🔵|🟡|🟣|🟣|🔴|🟠|🟤|⚪|⚫)\s*/u;

const titleWithStoreEmoji = (title: string, store: string | null) => {
  if (!store) return title;
  const emoji = STORE_EMOJI_MAP[store];
  if (!emoji) return title;
  const cleaned = title.replace(EMOJI_PREFIX_RE, "");
  return `${emoji} ${cleaned}`;
};

const bodyWithoutOccurrenceStore = (message: string) =>
  message
    .replace(/^\s*(ASA\s*NORTE|[ÁA]GUAS\s*CLARAS|ASA\s*SUL|LAGO\s*SUL)\s*[•·\-—]?\s*/i, "")
    .replace(/^\s*[•·\-—]\s*/, "")
    .trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth: aceita service-role key (chamadas internas) OU usuário autenticado com role staff
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const isServiceRole = token && token === SERVICE_ROLE;

  if (!isServiceRole) {
    const adminCheck = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await adminCheck.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roles } = await createClient(SUPABASE_URL, SERVICE_ROLE)
      .from("user_roles").select("role").eq("user_id", userData.user.id);
    const allowed = new Set(["admin", "manager", "hr", "supervisor", "employee"]);
    const ok = (roles ?? []).some((r: any) => allowed.has(r.role));
    if (!ok) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const body = (await req.json()) as Body;
    if (!body?.user_id || !body?.title || !body?.message) {
      return new Response(
        JSON.stringify({ error: "user_id, title and message are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const isOccurrence = body.category === "occurrence";
    const detectedStore = isOccurrence ? detectStore(`${body.title} ${body.message}`) : null;
    const finalTitle = titleWithStoreEmoji(body.title, detectedStore);

    // 1) Sempre grava notificação in-app (fallback caso usuário não tenha push)
    const { error: insErr } = await admin.from("user_notifications").insert({
      user_id: body.user_id,
      title: finalTitle,
      message: body.message,
      url: body.url ?? "/",
      tag: body.tag ?? "general",
      category: body.category ?? "general",
    });
    if (insErr) console.error("user_notifications insert error", insErr);

    // 2) Tenta enviar push (se tiver subscriptions)
    const { data: subs, error: subsErr } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", body.user_id);

    if (subsErr) {
      return new Response(JSON.stringify({ error: subsErr.message, in_app: !insErr }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!vapidReady) {
      return new Response(JSON.stringify({ ok: true, sent: 0, in_app: !insErr, reason: "vapid-not-configured" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, in_app: !insErr, reason: "no-subs" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pushBody = isOccurrence ? bodyWithoutOccurrenceStore(body.message) : body.message;
    const icon = detectedStore ? `${PUBLIC_SITE_URL}${STORE_ICON_MAP[detectedStore]}` : undefined;
    const payload = JSON.stringify({
      title: finalTitle,
      body: pushBody,
      url: body.url ?? "/",
      tag: body.tag ?? "general",
      category: body.category ?? "general",
      store: detectedStore,
      icon,
    });

    let sent = 0;
    let removed = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          );
          sent += 1;
        } catch (err: any) {
          // 404/410 = subscription gone
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
            removed += 1;
          } else {
            console.error("push error", err?.statusCode, err?.body);
          }
        }
      }),
    );

    // 3) Canal WhatsApp (paralelo, fire-and-forget). Apenas categorias relevantes.
    const WA_ENABLED_CATEGORIES = new Set(["occurrence", "announcement", "payslip", "schedule"]);
    if (WA_ENABLED_CATEGORIES.has(body.category ?? "")) {
      fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE}`,
        },
        body: JSON.stringify({
          user_id: body.user_id,
          message: `*${finalTitle}*\n${body.message}`,
          category: body.category,
          tag: body.tag,
        }),
      }).catch((e) => console.error("send-whatsapp dispatch error", e));
    }

    return new Response(JSON.stringify({ ok: true, sent, removed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("notify-user error", e);
    return new Response(JSON.stringify({ error: e?.message ?? "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
