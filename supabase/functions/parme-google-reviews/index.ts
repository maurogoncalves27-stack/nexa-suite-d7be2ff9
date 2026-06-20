// Edge function pública: lê avaliações do Google guardadas em google_reviews.
// O cache é populado por outro processo (CRM/admin); esta função só lê.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const unit = url.searchParams.get("unit"); // ex: "asa-norte" ou "Asa Norte"
    const limit = Math.min(
      Number(url.searchParams.get("limit") || 24) || 24,
      100,
    );

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let q = supabase
      .from("google_reviews")
      .select(
        "id, unit_label, author_name, author_photo_url, rating, text, relative_time, published_at, language",
      )
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (unit) q = q.ilike("unit_label", `%${unit}%`);

    const { data, error } = await q;
    if (error) {
      console.error("[parme-google-reviews] err:", error);
      return new Response(JSON.stringify({ error: "db_error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ reviews: data ?? [] }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=120",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
