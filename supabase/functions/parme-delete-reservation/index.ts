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
    const parmeId: string | undefined = body?.parme_id;
    if (!parmeId || typeof parmeId !== "string") {
      return new Response(
        JSON.stringify({ error: "parme_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
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

    const url = `${PARME_BASE}/api/public/reservations/${encodeURIComponent(parmeId)}`;
    const resp = await fetch(url, {
      method: "DELETE",
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
            "O Parmê ainda não expõe DELETE /api/public/reservations/:id.",
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
          error: "parme_delete_failed",
          status: resp.status,
          body: text.slice(0, 500),
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { error: delError } = await admin
      .from("parme_reservations")
      .delete()
      .eq("parme_id", parmeId);

    if (delError) {
      return new Response(
        JSON.stringify({
          error: "local_delete_failed",
          message: delError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ ok: true, parme_id: parmeId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
