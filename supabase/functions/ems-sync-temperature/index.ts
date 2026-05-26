// ems-sync-temperature: importa últimas leituras de ems_sensor_readings
// para nutri_temperature_readings dos equipamentos vinculados.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface Body {
  store_id?: string;
  date?: string; // yyyy-MM-dd
  lookback_hours?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = (await req.json().catch(() => ({}))) as Body;
    const storeId = body.store_id ?? null;
    const dateKey = body.date ?? new Date().toISOString().slice(0, 10);
    const lookback = Math.max(1, Math.min(72, body.lookback_hours ?? 24));
    const since = new Date(Date.now() - lookback * 3600 * 1000).toISOString();

    // 1. Equipamentos com sensor vinculado
    let eqQuery = supabase
      .from("nutri_equipment")
      .select("id, store_id, ems_sensor_code, name")
      .not("ems_sensor_code", "is", null);
    if (storeId) eqQuery = eqQuery.eq("store_id", storeId);
    const { data: equipment, error: eqErr } = await eqQuery;
    if (eqErr) throw eqErr;
    if (!equipment?.length) {
      return new Response(JSON.stringify({ inserted: 0, message: "Nenhum equipamento com sensor EMS-A" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let inserted = 0;
    for (const eq of equipment) {
      // Última leitura por sensor na janela
      const { data: readings, error: rdErr } = await supabase
        .from("ems_sensor_readings")
        .select("measurement, measured_at")
        .eq("sensor_code", eq.ems_sensor_code!)
        .gte("measured_at", since)
        .order("measured_at", { ascending: false })
        .limit(1);
      if (rdErr) continue;
      const latest = readings?.[0];
      if (!latest) continue;

      // Verifica se já temos uma leitura nesse exato recorded_at
      const { data: existing } = await supabase
        .from("nutri_temperature_readings")
        .select("id")
        .eq("equipment_id", eq.id)
        .eq("recorded_at", latest.measured_at)
        .maybeSingle();
      if (existing) continue;

      const recordedDate = new Date(latest.measured_at).toISOString().slice(0, 10);
      const useDate = recordedDate === dateKey ? dateKey : recordedDate;

      // Usa super-usuário como "EMS-A bot" para satisfazer NOT NULL em user_id
      const EMS_BOT_USER = "ec5e52b2-a4c3-46c7-8d11-a5b6cf406866";

      const { error: insErr } = await supabase.from("nutri_temperature_readings").insert({
        equipment_id: eq.id,
        store_id: eq.store_id,
        temperature: Number(latest.measurement),
        date: useDate,
        user_id: EMS_BOT_USER,
        recorded_at: latest.measured_at,
        note: "EMS-A",
      });
      if (!insErr) inserted++;
    }

    return new Response(JSON.stringify({ inserted, equipment_checked: equipment.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ems-sync-temperature error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
