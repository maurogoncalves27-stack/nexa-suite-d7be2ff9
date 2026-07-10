import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const CSV_URL = "https://id-preview--b68f3ba2-e21a-49ee-b084-80c47f8ad72b.lovable.app/__l5e/assets-v1/d5246f80-a007-4f80-9e18-eb4dbbf8f064/dre_snap.csv";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const resp = await fetch(CSV_URL);
  if (!resp.ok) {
    return new Response(JSON.stringify({ error: `Failed to fetch CSV: ${resp.status}` }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const text = await resp.text();
  const lines = text.trim().split("\n");
  const header = lines.shift()!;
  const rows = lines.map((l) => {
    const [year, month, store_key, line_key, amount] = l.split(",");
    return {
      year: Number(year),
      month: Number(month),
      store_key,
      line_key,
      amount: Number(amount),
    };
  });

  // Clear anything <= 2026-04 first so partial imports don't leave stale rows
  const { error: delErr } = await supabase
    .from("dre_historical_snapshot")
    .delete()
    .or("year.lt.2026,and(year.eq.2026,month.lte.4)");
  if (delErr) {
    return new Response(JSON.stringify({ error: delErr.message, step: "delete" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Upsert in chunks of 500
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("dre_historical_snapshot")
      .upsert(chunk, { onConflict: "year,month,store_key,line_key" });
    if (error) {
      return new Response(JSON.stringify({ error: error.message, at: i, header }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    inserted += chunk.length;
  }

  return new Response(JSON.stringify({ ok: true, inserted, total: rows.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
