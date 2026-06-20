import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PARME_BASE = "https://parme.lovable.app";

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
    const ticketId: string | undefined = body?.ticket_id;
    if (!ticketId || typeof ticketId !== "string") {
      return new Response(JSON.stringify({ error: "ticket_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const consumerId = Deno.env.get("PARME_CONSUMER_ID");
    const consumerSecret = Deno.env.get("PARME_CONSUMER_SECRET");
    if (!consumerId || !consumerSecret) {
      return new Response(
        JSON.stringify({ error: "missing_parme_credentials" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const url = `${PARME_BASE}/api/public/tickets/${encodeURIComponent(ticketId)}/messages`;
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "X-Consumer-Id": consumerId,
        "X-Consumer-Secret": consumerSecret,
        Accept: "application/json",
      },
    });

    const text = await resp.text();
    const isHtml = text.trimStart().startsWith("<");

    if (resp.status === 404 || isHtml) {
      return new Response(
        JSON.stringify({
          error: "parme_endpoint_unavailable",
          message:
            "O Parmê ainda não expõe GET /api/public/tickets/:id/messages.",
        }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!resp.ok) {
      return new Response(
        JSON.stringify({
          error: "parme_fetch_failed",
          status: resp.status,
          body: text.slice(0, 500),
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let payload: any = {};
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }

    // Normaliza: aceita {messages: [...]} ou array direto
    const messages = Array.isArray(payload)
      ? payload
      : (payload.messages ?? payload.data ?? []);

    return new Response(
      JSON.stringify({ ok: true, ticket_id: ticketId, messages }),
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
