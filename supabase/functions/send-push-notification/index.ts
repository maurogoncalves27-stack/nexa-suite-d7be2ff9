// Envia Web Push para os destinatários de um aviso (hr_announcements)
// Usa biblioteca web-push via npm specifier (Deno suportado)
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { requireCronOrRole } from "../_shared/requireRole.ts";


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
  announcement_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    if (!body?.announcement_id) {
      return new Response(JSON.stringify({ error: "announcement_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: ann, error: annErr } = await admin
      .from("hr_announcements")
      .select("id,title,message,priority,scope,store_id,employee_id,is_active,send_push")
      .eq("id", body.announcement_id)
      .maybeSingle();

    if (annErr || !ann) {
      return new Response(JSON.stringify({ error: "announcement not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!ann.is_active || !ann.send_push) {
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve user_ids destinatários
    let userIds: string[] = [];

    if (ann.scope === "global") {
      const { data: profiles } = await admin.from("profiles").select("user_id");
      userIds = (profiles ?? []).map((p: any) => p.user_id).filter(Boolean);
    } else if (ann.scope === "store" && ann.store_id) {
      const { data: emps } = await admin
        .from("employees")
        .select("user_id")
        .or(`store_id.eq.${ann.store_id},allocated_store_id.eq.${ann.store_id}`)
        .not("user_id", "is", null);
      userIds = (emps ?? []).map((e: any) => e.user_id);
    } else if (ann.scope === "employee" && ann.employee_id) {
      const { data: emp } = await admin
        .from("employees")
        .select("user_id")
        .eq("id", ann.employee_id)
        .maybeSingle();
      if (emp?.user_id) userIds = [emp.user_id];
    }

    userIds = Array.from(new Set(userIds));
    if (userIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no recipients" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .in("user_id", userIds);

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no subscriptions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.stringify({
      title: ann.title,
      body: ann.message,
      priority: ann.priority,
      url: "/",
      tag: `ann-${ann.id}`,
    });

    let sent = 0;
    let removed = 0;
    const stale: string[] = [];

    await Promise.all(
      subs.map(async (s: any) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload
          );
          sent++;
        } catch (err: any) {
          const status = err?.statusCode;
          if (status === 404 || status === 410) stale.push(s.id);
          console.error("push error", status, err?.body ?? err?.message);
        }
      })
    );

    if (stale.length > 0) {
      const { error: delErr } = await admin
        .from("push_subscriptions")
        .delete()
        .in("id", stale);
      if (!delErr) removed = stale.length;
    }

    return new Response(JSON.stringify({ sent, removed, total: subs.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e?.message ?? "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
