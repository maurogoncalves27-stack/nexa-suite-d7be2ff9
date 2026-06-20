// Webhook receiver for Parmê integration
// Public endpoint — validates HMAC-SHA256 signature against PARME_CONSUMER_SECRET
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-parme-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PARME_SECRET = Deno.env.get("PARME_CONSUMER_SECRET") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rawBody = await req.text();
  const sigHeader = (req.headers.get("X-Parme-Signature") || "")
    .replace(/^sha256=/i, "")
    .trim()
    .toLowerCase();

  if (!PARME_SECRET) {
    console.error("PARME_CONSUMER_SECRET not configured");
    return new Response(JSON.stringify({ error: "server_not_configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const expected = await hmacHex(PARME_SECRET, rawBody);
  if (!sigHeader || !timingSafeEqual(sigHeader, expected)) {
    console.warn("Invalid signature", { got: sigHeader, expected });
    return new Response(JSON.stringify({ error: "invalid_signature" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { event_id, event_type, data } = body ?? {};
  if (!event_id || !event_type) {
    return new Response(JSON.stringify({ error: "missing_fields" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Idempotency: log event; if already present, return 200 without re-processing
  const { error: logErr, data: logRow } = await admin
    .from("parme_events")
    .insert({ event_id, event_type, payload: body })
    .select("id")
    .maybeSingle();

  if (logErr) {
    // 23505 = unique violation → already processed
    if ((logErr as any).code === "23505") {
      return new Response(JSON.stringify({ ok: true, duplicate: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("event log error", logErr);
    return new Response(JSON.stringify({ error: "log_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    if (event_type === "reservation.created" && data?.id) {
      await admin.from("parme_reservations").upsert(
        {
          parme_id: data.id,
          name: data.name ?? null,
          phone: data.phone ?? null,
          email: data.email ?? null,
          reservation_date: data.reservation_date ?? null,
          reservation_time: data.reservation_time ?? null,
          party_size: data.party_size ?? null,
          notes: data.notes ?? null,
          status: data.status ?? null,
          created_at: data.created_at ?? null,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "parme_id" },
      );
    } else if (event_type === "ticket.created" && data?.id) {
      await admin.from("parme_tickets").upsert(
        {
          parme_id: data.id,
          description: data.description ?? null,
          order_number: data.order_number ?? null,
          contact: data.contact ?? null,
          status: data.status ?? null,
          created_at: data.created_at ?? null,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "parme_id" },
      );
    } else if (event_type === "conversation.extracted" && data?.id) {
      await admin.from("parme_conversations").upsert(
        {
          parme_id: data.id,
          session_id: data.session_id ?? null,
          message_count: data.message_count ?? null,
          last_message_at: data.last_message_at ?? null,
          extracted: data.extracted ?? null,
          extracted_at: data.extracted_at ?? null,
          client_meta: data.client_meta ?? null,
          created_at: data.created_at ?? null,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "parme_id" },
      );
    } else if (event_type === "test.ping") {
      console.log("test.ping received", { event_id });
    } else {
      console.warn("unhandled event_type", event_type);
    }
  } catch (e) {
    console.error("dispatch error", e);
    // We already logged the event; do not fail the webhook
  }

  return new Response(JSON.stringify({ ok: true, id: logRow?.id }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
