// Edge function temporária para migrar dados do projeto NutriControl para o RH Plus.
// Lê do projeto NutriControl (via service_role) e insere no RH Plus (via service_role local).
// Uso único — pode ser removida após a migração.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NUTRI_URL = "https://teccnuutjtlkxzknvass.supabase.co";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const NUTRI_KEY = Deno.env.get("NUTRICONTROL_SERVICE_ROLE_KEY")?.trim();
    const RH_URL = Deno.env.get("SUPABASE_URL");
    const RH_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    console.log("env check", {
      hasNutri: !!NUTRI_KEY,
      nutriLen: NUTRI_KEY?.length,
      hasRhUrl: !!RH_URL,
      hasRhKey: !!RH_KEY,
    });
    if (!NUTRI_KEY || !RH_URL || !RH_KEY) throw new Error("Faltam credenciais");

    const nutri = createClient(NUTRI_URL, NUTRI_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${NUTRI_KEY}`, apikey: NUTRI_KEY } },
    });
    const rh = createClient(RH_URL, RH_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Teste rápido de credenciais
    const probe = await nutri.from("stores").select("id", { count: "exact", head: true });
    console.log("nutri probe", { error: probe.error?.message, count: probe.count });
    if (probe.error) throw new Error(`NutriControl auth falhou: ${probe.error.message}`);

    const log: Record<string, unknown> = {};

    // 1) Lojas do NutriControl
    const { data: nutriStores, error: storesErr } = await nutri.from("stores").select("id, name");
    if (storesErr) throw storesErr;
    log.nutriStores = nutriStores?.length ?? 0;

    // 2) Lojas do RH Plus
    const { data: rhStores, error: rhStoresErr } = await rh.from("stores").select("id, name");
    if (rhStoresErr) throw rhStoresErr;
    log.rhStores = rhStores?.length ?? 0;

    // 3) Mapeamento por similaridade de nome
    const norm = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

    const storeMap: Record<string, string> = {}; // nutriStoreId -> rhStoreId
    const unmatched: { id: string; name: string }[] = [];
    for (const ns of nutriStores ?? []) {
      const nname = norm(ns.name);
      let best = (rhStores ?? []).find((rs) => norm(rs.name) === nname);
      if (!best) {
        // tenta matching parcial: o nome NutriControl está contido no RH ou vice-versa
        best = (rhStores ?? []).find((rs) => {
          const rn = norm(rs.name);
          return rn.includes(nname) || nname.includes(rn);
        });
      }
      if (best) storeMap[ns.id] = best.id;
      else unmatched.push({ id: ns.id, name: ns.name });
    }
    log.matchedStores = Object.keys(storeMap).length;
    log.unmatchedStores = unmatched;

    if (Object.keys(storeMap).length === 0) {
      return new Response(JSON.stringify({ error: "Nenhuma loja casou", log }, null, 2), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Helpers
    const fetchAll = async (table: string, columns = "*") => {
      const all: any[] = [];
      const pageSize = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await nutri
          .from(table)
          .select(columns)
          .range(from, from + pageSize - 1);
        if (error) throw new Error(`fetch ${table}: ${error.message}`);
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return all;
    };

    const insertChunked = async (table: string, rows: any[]) => {
      if (rows.length === 0) return { count: 0 };
      const chunkSize = 500;
      let count = 0;
      const errors: any[] = [];
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await rh.from(table).upsert(chunk, { onConflict: "id" });
        if (error) errors.push({ table, chunkIndex: i, error: error.message });
        else count += chunk.length;
      }
      return { count, errors };
    };

    const dryRun = new URL(req.url).searchParams.get("dry") === "1";

    // Itens (sem store) - copia direto
    const items = await fetchAll("items");
    log.items_fetched = items.length;
    if (!dryRun) log.items_inserted = await insertChunked("nutri_items", items);

    // Equipment
    const equipment = await fetchAll("equipment");
    log.equipment_fetched = equipment.length;
    if (!dryRun) log.equipment_inserted = await insertChunked("nutri_equipment", equipment);

    // Visit checklist items
    const visitItems = await fetchAll("visit_checklist_items");
    log.visit_items_fetched = visitItems.length;
    if (!dryRun) log.visit_items_inserted = await insertChunked("nutri_visit_checklist_items", visitItems);

    // Tabelas com store_id - precisa mapear
    const remap = (rows: any[]) =>
      rows
        .map((r) => ({ ...r, store_id: storeMap[r.store_id] }))
        .filter((r) => r.store_id);

    const dayRecords = remap(await fetchAll("day_records"));
    log.day_records_fetched = dayRecords.length;
    if (!dryRun) log.day_records_inserted = await insertChunked("nutri_day_records", dayRecords);

    const tempReadings = remap(await fetchAll("temperature_readings"));
    log.temperature_fetched = tempReadings.length;
    if (!dryRun) log.temperature_inserted = await insertChunked("nutri_temperature_readings", tempReadings);

    const maint = remap(await fetchAll("maintenance_records"));
    log.maintenance_fetched = maint.length;
    if (!dryRun) log.maintenance_inserted = await insertChunked("nutri_maintenance_records", maint);

    const merch = remap(await fetchAll("merchandise_receipts"));
    log.merchandise_fetched = merch.length;
    if (!dryRun) log.merchandise_inserted = await insertChunked("nutri_merchandise_receipts", merch);

    const oil = remap(await fetchAll("oil_quality_records"));
    log.oil_fetched = oil.length;
    if (!dryRun) log.oil_inserted = await insertChunked("nutri_oil_quality_records", oil);

    const pestOcc = remap(await fetchAll("pest_occurrences"));
    log.pest_occ_fetched = pestOcc.length;
    if (!dryRun) log.pest_occ_inserted = await insertChunked("nutri_pest_occurrences", pestOcc);

    const pestCtrl = remap(await fetchAll("pest_control_records"));
    log.pest_ctrl_fetched = pestCtrl.length;
    if (!dryRun) log.pest_ctrl_inserted = await insertChunked("nutri_pest_control_records", pestCtrl);

    const water = remap(await fetchAll("water_tank_cleanings"));
    log.water_fetched = water.length;
    if (!dryRun) log.water_inserted = await insertChunked("nutri_water_tank_cleanings", water);

    const visits = remap(await fetchAll("visit_reports"));
    log.visits_fetched = visits.length;
    if (!dryRun) log.visits_inserted = await insertChunked("nutri_visit_reports", visits);

    // Visit checklist responses (FK para visit_reports)
    const visitResp = await fetchAll("visit_checklist_responses");
    log.visit_resp_fetched = visitResp.length;
    if (!dryRun) log.visit_resp_inserted = await insertChunked("nutri_visit_checklist_responses", visitResp);

    return new Response(JSON.stringify({ ok: true, dryRun, log }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const err = e as Error;
    return new Response(JSON.stringify({ error: err.message ?? String(e) }, null, 2), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
