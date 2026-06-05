// ems-ingest: puxa leituras da API pública da EMS-A (be-mts.ems-a.com)
// e grava em public.ems_sensor_readings.
// Roda via pg_cron a cada 5 minutos.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { requireCronOrRole } from "../_shared/requireRole.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMS_BASE = "https://be-mts.ems-a.com/v1/equipments_registers/history";

// Formato da EMS-A: "YYYY-MM-DD HH:MM:SS" em horário UTC (mesmo formato do datetime devolvido)
function fmtEms(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

interface Reading {
  datetime: string;
  // a API retorna com typo "mesuarement"
  mesuarement?: number;
  measurement?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireCronOrRole(req, ["admin", "manager", "nutritionist"], corsHeaders);
  if (!auth.ok) return auth.response!;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Janela: últimas 6 horas (cobre folga caso o cron tenha falhado)
    const body = (await req.json().catch(() => ({}))) as { lookback_hours?: number };
    const lookback = Math.max(1, Math.min(72, body.lookback_hours ?? 6));
    const end = new Date();
    const begin = new Date(end.getTime() - lookback * 3600 * 1000);
    const qs = `?begin=${encodeURIComponent(fmtEms(begin))}&end=${encodeURIComponent(fmtEms(end))}`;

    const { data: sensors, error: sErr } = await supabase
      .from("ems_sensors")
      .select("unique_code, store_id, active")
      .eq("active", true);
    if (sErr) throw sErr;
    if (!sensors?.length) {
      return new Response(JSON.stringify({ inserted: 0, message: "Nenhum sensor ativo" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result: Record<string, { fetched: number; inserted: number; error?: string }> = {};

    for (const sensor of sensors) {
      const code = sensor.unique_code as string;
      try {
        const res = await fetch(`${EMS_BASE}/${encodeURIComponent(code)}${qs}`, {
          headers: { "Origin": "https://painel.ems-a.com" },
        });
        if (!res.ok) {
          result[code] = { fetched: 0, inserted: 0, error: `EMS-A ${res.status}` };
          continue;
        }
        const rows = (await res.json()) as Reading[];
        if (!Array.isArray(rows) || rows.length === 0) {
          result[code] = { fetched: 0, inserted: 0 };
          continue;
        }
        const payload = rows
          .map((r) => {
            const m = r.measurement ?? r.mesuarement;
            if (m == null || !r.datetime) return null;
            return {
              sensor_code: code,
              store_id: sensor.store_id,
              measurement: Number(m),
              measured_at: new Date(r.datetime).toISOString(),
            };
          })
          .filter(Boolean) as Array<{ sensor_code: string; store_id: string | null; measurement: number; measured_at: string }>;

        if (payload.length === 0) {
          result[code] = { fetched: rows.length, inserted: 0 };
          continue;
        }

        const { error: upErr, count } = await supabase
          .from("ems_sensor_readings")
          .upsert(payload, { onConflict: "sensor_code,measured_at", count: "exact", ignoreDuplicates: true });
        if (upErr) {
          result[code] = { fetched: rows.length, inserted: 0, error: upErr.message };
        } else {
          result[code] = { fetched: rows.length, inserted: count ?? payload.length };
        }
      } catch (e) {
        result[code] = { fetched: 0, inserted: 0, error: (e as Error).message };
      }
    }

    const totalInserted = Object.values(result).reduce((s, r) => s + r.inserted, 0);
    return new Response(
      JSON.stringify({ ok: true, total_inserted: totalInserted, by_sensor: result, window: { begin: fmtEms(begin), end: fmtEms(end) } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("ems-ingest error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
