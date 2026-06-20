// Dado um ticket_id, localiza a conversa local que originou esse ticket
// (matchando por contato/telefone, e-mail ou número do pedido nas mensagens).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type MsgOut = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

function normalizeContact(s: string | null | undefined) {
  if (!s) return "";
  return s.replace(/\D/g, "").replace(/^55/, "");
}

function extractMessages(convo: {
  id: string;
  messages: unknown;
  created_at: string;
  last_message_at: string | null;
}): MsgOut[] {
  const raw = Array.isArray(convo.messages)
    ? (convo.messages as Array<Record<string, unknown>>)
    : [];
  const out: MsgOut[] = [];
  for (let i = 0; i < raw.length; i++) {
    const m = raw[i] ?? {};
    const roleRaw = String(m.role ?? "").toLowerCase();
    if (roleRaw !== "user" && roleRaw !== "assistant") continue;
    const content = typeof m.content === "string" ? m.content.trim() : "";
    if (!content) continue;
    const rawId = typeof m.id === "string" && m.id.trim() ? m.id.trim() : "";
    out.push({
      id: rawId || `${convo.id}-${i}`,
      role: roleRaw as "user" | "assistant",
      content,
      created_at:
        (typeof m.ts === "string" && m.ts) ||
        (typeof m.created_at === "string" && m.created_at) ||
        (typeof m.timestamp === "string" && m.timestamp) ||
        convo.last_message_at ||
        convo.created_at,
    });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authError } = await supabase.auth.getClaims(
      token,
    );
    if (authError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const ticketId: string | undefined = body?.ticket_id ?? body?.id;
    if (!ticketId || typeof ticketId !== "string") {
      return new Response(JSON.stringify({ error: "ticket_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: ticket, error: tErr } = await admin
      .from("support_tickets")
      .select("id, contact, order_number, created_at")
      .eq("id", ticketId)
      .maybeSingle();

    if (tErr) {
      return new Response(
        JSON.stringify({ error: "db_error", message: tErr.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (!ticket) {
      return new Response(
        JSON.stringify({ error: "ticket_not_found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const contactDigits = normalizeContact(ticket.contact);
    const contactLower = (ticket.contact ?? "").toLowerCase().trim();
    const orderNumber = (ticket.order_number ?? "").trim();

    const { data: convos, error: cErr } = await admin
      .from("chat_conversations")
      .select("id, session_id, messages, created_at, last_message_at")
      .order("last_message_at", { ascending: false })
      .limit(500);

    if (cErr) {
      return new Response(
        JSON.stringify({ error: "db_error", message: cErr.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const needles: string[] = [];
    if (contactDigits.length >= 8) needles.push(contactDigits.slice(-8));
    if (contactLower) needles.push(contactLower);
    if (orderNumber) needles.push(orderNumber);

    let matched: NonNullable<typeof convos>[number] | null = null;
    for (const c of convos ?? []) {
      const blob = JSON.stringify(c.messages ?? []);
      const digits = blob.replace(/\D/g, "");
      const hit = needles.some((n) =>
        /^\d+$/.test(n)
          ? digits.includes(n)
          : blob.toLowerCase().includes(n.toLowerCase()),
      );
      if (hit) {
        matched = c;
        break;
      }
    }

    if (!matched) {
      return new Response(
        JSON.stringify({ ok: true, ticket_id: ticketId, messages: [] }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        ticket_id: ticketId,
        messages: extractMessages(matched as any),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "internal_error", message: String(e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
