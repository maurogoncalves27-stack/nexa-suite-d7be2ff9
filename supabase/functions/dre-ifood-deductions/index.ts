import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SPREADSHEET_ID = "15HAeEE7KO1UQlAg9Grs5f71oXQPfUPrT7bDV6z6jBe4";
const SHEET = "Vendas ifood";
const YEAR = 2026; // planilha "Parme - DRE - 2026"

const parseBR = (raw: string): number => {
  if (!raw) return 0;
  const s = raw.replace(/\./g, "").replace(",", ".").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const norm = (s: string) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SHEETS_KEY = Deno.env.get("GOOGLE_SHEETS_API_KEY");
    if (!LOVABLE_API_KEY || !SHEETS_KEY) {
      return new Response(JSON.stringify({ error: "Conexão Google Sheets não configurada." }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const range = encodeURIComponent(`${SHEET}!A1:N1000`).replace(/!/g, "!");
    // Não codificar `!`/`:` — gateway repassa direto
    const url = `https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET.replace(/ /g, "%20")}!A1:N1000`;
    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": SHEETS_KEY,
      },
    });
    if (!r.ok) {
      const body = await r.text();
      return new Response(JSON.stringify({ error: `Sheets gateway ${r.status}: ${body}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const json = await r.json();
    const rows: string[][] = json.values ?? [];

    // Cabeçalho na linha 2 (índice 1). Dados a partir do índice 2.
    const by_month: Record<string, number> = {};
    const by_store_month: Record<string, number> = {};
    const by_brand_store_month: Record<string, number> = {};

    for (let i = 2; i < rows.length; i++) {
      const row = rows[i] || [];
      const brand = (row[0] || "").trim();
      const store = (row[1] || "").trim();
      const monthRaw = (row[2] || "").trim();
      const totalCustos = parseBR(row[12] || ""); // coluna M, normalmente negativo
      if (!brand || !store || !monthRaw) continue;
      const m = Number(monthRaw);
      if (!Number.isFinite(m) || m < 1 || m > 12) continue;
      // Convenção DRE: dedução é positiva (subtrai da receita bruta)
      const ded = Math.abs(totalCustos);
      if (ded === 0) continue;
      const monthKey = `${YEAR}-${String(m).padStart(2, "0")}`;
      by_month[monthKey] = (by_month[monthKey] ?? 0) + ded;
      const sKey = `${norm(store)}|${monthKey}`;
      by_store_month[sKey] = (by_store_month[sKey] ?? 0) + ded;
      const bsKey = `${norm(brand)}|${norm(store)}|${monthKey}`;
      by_brand_store_month[bsKey] = (by_brand_store_month[bsKey] ?? 0) + ded;
    }

    return new Response(
      JSON.stringify({
        source: "google_sheets",
        sheet: SHEET,
        year: YEAR,
        by_month,
        by_store_month,
        by_brand_store_month,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
