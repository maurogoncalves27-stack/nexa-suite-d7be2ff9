// Retorna as mensagens de uma conversa local (chat_conversations.messages).
// Aceita `conversation_id` (id local) ou `session_id`.
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
  const seenAssistant = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const m = raw[i] ?? {};
    const roleRaw = String(m.role ?? "").toLowerCase();
    if (roleRaw !== "user" && roleRaw !== "assistant") continue;
    const content = typeof m.content === "string" ? m.content.trim() : "";
    if (!content) continue;
    const rawId = typeof m.id === "string" && m.id.trim() ? m.id.trim() : "";
    if (roleRaw === "assistant") {
      const key = content.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
      if (seenAssistant.has(key)) continue;
      seenAssistant.add(key);
    }
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
    const conversationId: string | undefined = body?.conversation_id;
    const sessionId: string | undefined = body?.session_id;
    if (!conversationId && !sessionId) {
      return new Response(
        JSON.stringify({ error: "conversation_id or session_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let query = admin
      .from("chat_conversations")
      .select("id, session_id, messages, created_at, last_message_at");
    if (conversationId) {
      query = query.eq("id", conversationId);
    } else {
      query = query.eq("session_id", sessionId!);
    }

    const { data: convo, error: cErr } = await query.maybeSingle();
    if (cErr) {
      return new Response(
        JSON.stringify({ error: "db_error", message: cErr.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (!convo) {
      return new Response(
        JSON.stringify({ ok: true, messages: [] }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        conversation_id: convo.id,
        session_id: convo.session_id,
        messages: extractMessages(convo as any),
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
