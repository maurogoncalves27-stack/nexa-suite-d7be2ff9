// Edge function pública: retorna disponibilidade da data para reservas.
// GET ?date=YYYY-MM-DD  → { paused, full, maxPerDay, reserved }
// Sem date: retorna mapa dos próximos 30 dias.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const date = url.searchParams.get("date");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cfgRow } = await supabase
      .from("parme_site_settings")
      .select("value")
      .eq("key", "reservations")
      .maybeSingle();
    const cfg = (cfgRow?.value ?? {}) as {
      maxPerDay?: number;
      pausedDates?: string[];
    };
    const maxPerDay = Number(cfg.maxPerDay) > 0 ? Number(cfg.maxPerDay) : 0; // 0 = ilimitado
    const pausedDates = Array.isArray(cfg.pausedDates) ? cfg.pausedDates : [];

    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const { count } = await supabase
        .from("reservations")
        .select("id, party_size", { count: "exact", head: false })
        .eq("reservation_date", date)
        .neq("status", "cancelled");
      const reserved = count ?? 0;
      const paused = pausedDates.includes(date);
      const full = maxPerDay > 0 && reserved >= maxPerDay;
      return j({ date, paused, full, maxPerDay, reserved });
    }

    // mapa dos próximos 30 dias
    const today = new Date().toISOString().slice(0, 10);
    const maxDate = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
    const { data: rows } = await supabase
      .from("reservations")
      .select("reservation_date")
      .gte("reservation_date", today)
      .lte("reservation_date", maxDate)
      .neq("status", "cancelled");
    const counts: Record<string, number> = {};
    (rows ?? []).forEach((r: { reservation_date: string | null }) => {
      if (r.reservation_date) counts[r.reservation_date] = (counts[r.reservation_date] ?? 0) + 1;
    });
    const days: Record<string, { paused: boolean; full: boolean; reserved: number }> = {};
    Object.keys(counts).forEach((d) => {
      days[d] = {
        paused: pausedDates.includes(d),
        full: maxPerDay > 0 && counts[d] >= maxPerDay,
        reserved: counts[d],
      };
    });
    pausedDates.forEach((d) => {
      if (!days[d]) days[d] = { paused: true, full: false, reserved: counts[d] ?? 0 };
    });
    return j({ maxPerDay, pausedDates, days });
  } catch (e) {
    console.error("[parme-reservation-availability] fatal:", e);
    return j({ error: "internal_error" }, 500);
  }
});
