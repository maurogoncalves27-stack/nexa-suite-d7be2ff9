// Backfill historical data from Parmê into parme_* tables
// Auth required (verify_jwt = true via config below). Returns counts.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PARME_ID = Deno.env.get("PARME_CONSUMER_ID") ?? "";
const PARME_SECRET = Deno.env.get("PARME_CONSUMER_SECRET") ?? "";
const PARME_BASE = "https://parme.lovable.app/api/public/export";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

type Resource = "reservations" | "tickets" | "conversations";

function mapRow(resource: Resource, row: any) {
  const now = new Date().toISOString();
  if (resource === "reservations") {
    return {
      parme_id: row.id,
      name: row.name ?? null,
      phone: row.phone ?? null,
      email: row.email ?? null,
      reservation_date: row.reservation_date ?? null,
      reservation_time: row.reservation_time ?? null,
      party_size: row.party_size ?? null,
      notes: row.notes ?? null,
      status: row.status ?? null,
      created_at: row.created_at ?? null,
      synced_at: now,
    };
  }
  if (resource === "tickets") {
    return {
      parme_id: row.id,
      description: row.description ?? null,
      order_number: row.order_number ?? null,
      contact: row.contact ?? null,
      status: row.status ?? null,
      created_at: row.created_at ?? null,
      synced_at: now,
    };
  }
  return {
    parme_id: row.id,
    session_id: row.session_id ?? null,
    message_count: row.message_count ?? null,
    last_message_at: row.last_message_at ?? null,
    extracted: row.extracted ?? null,
    extracted_at: row.extracted_at ?? null,
    client_meta: row.client_meta ?? null,
    created_at: row.created_at ?? null,
    synced_at: now,
  };
}

function tableFor(resource: Resource) {
  return resource === "reservations"
    ? "parme_reservations"
    : resource === "tickets"
      ? "parme_tickets"
      : "parme_conversations";
}

async function backfillOne(resource: Resource) {
  let cursor: string | null = null;
  let total = 0;
  let pages = 0;

  while (true) {
    const url = new URL(`${PARME_BASE}/${resource}`);
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("cursor", cursor);

    const resp = await fetch(url.toString(), {
      headers: {
        "X-Consumer-Id": PARME_ID,
        "X-Consumer-Secret": PARME_SECRET,
        "Content-Type": "application/json",
      },
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(
        `Parmê ${resource} [${resp.status}]: ${text.slice(0, 300)}`,
      );
    }

    const json = await resp.json();
    const items: any[] = json.data ?? json.items ?? json.results ?? [];
    if (items.length > 0) {
      const rows = items.map((r) => mapRow(resource, r));
      const { error } = await admin
        .from(tableFor(resource))
        .upsert(rows, { onConflict: "parme_id" });
      if (error) throw new Error(`upsert ${resource}: ${error.message}`);
      total += rows.length;
    }
    pages++;

    cursor = json.next_cursor ?? null;
    if (!cursor) break;
    if (pages > 1000) {
      // safety guard
      console.warn("backfill page limit reached", { resource });
      break;
    }
  }
  return { total, pages };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // verify caller
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userClient = createClient(
    SUPABASE_URL,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(
    authHeader.replace("Bearer ", ""),
  );
  if (claimsErr || !claims?.claims?.sub) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!PARME_ID || !PARME_SECRET) {
    return new Response(JSON.stringify({ error: "parme_secrets_missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const reservations = await backfillOne("reservations");
    const tickets = await backfillOne("tickets");
    const conversations = await backfillOne("conversations");

    return new Response(
      JSON.stringify({
        ok: true,
        counts: {
          reservations: reservations.total,
          tickets: tickets.total,
          conversations: conversations.total,
        },
        pages: {
          reservations: reservations.pages,
          tickets: tickets.pages,
          conversations: conversations.pages,
        },
        finished_at: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("backfill error", e);
    return new Response(
      JSON.stringify({ error: "backfill_failed", message: String(e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
