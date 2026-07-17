// Analisa sinais (humor, atestados de saúde mental, docs SST) e sugere riscos psicossociais NR-1.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SYSTEM = `Você é um especialista em NR-1 / PGR analisando sinais psicossociais de uma rede de restaurantes.
Receberá agregados anônimos (humor semanal médio, número de atestados de saúde mental por CID F, docs SST vigentes) por loja.
Devolva APENAS um JSON:
{
  "risks": [
    {
      "store_id": string | null,
      "category": "carga_de_trabalho" | "assedio" | "relacionamento" | "reconhecimento" | "autonomia" | "violencia_externa" | "saude_mental" | "outros",
      "description": string,
      "severity": "low" | "medium" | "high" | "critical",
      "probability": "low" | "medium" | "high",
      "action_plan": string,
      "evidence": string
    }
  ]
}
Regras:
- Só sugerir riscos com evidência real (humor médio <3, ≥2 atestados F no trimestre, etc.).
- action_plan objetivo e aplicável em restaurante.
- Se nada relevante, retorne {"risks": []}.
- Nada fora do JSON.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const since90 = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const since180 = new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    // Sinais
    const [{ data: stores }, { data: employees }, { data: moods }, { data: certs }, { data: sst }] = await Promise.all([
      admin.from("stores").select("id, name").eq("is_virtual", false),
      admin.from("employees").select("id, store_id, status"),
      admin.from("mood_checkins").select("employee_id, mood_score, needs_support, week_start, skipped").gte("week_start", since90),
      admin.from("medical_certificates").select("employee_id, cid_code, cid_description, certificate_date, days_off").gte("certificate_date", since180),
      admin.from("sst_documents").select("doc_type, valid_until, is_active").eq("is_active", true),
    ]);

    const empStore = new Map<string, string | null>();
    (employees ?? []).forEach((e: any) => empStore.set(e.id, e.store_id));

    // Agregação por loja
    type Agg = {
      store_id: string | null;
      store_name: string;
      active_employees: number;
      mood_avg: number | null;
      mood_samples: number;
      needs_support_count: number;
      mental_certs_count: number;
      mental_certs_days: number;
      top_cids: string[];
    };
    const bucket = new Map<string, Agg>();
    const addStore = (id: string | null, name: string) => {
      const key = id ?? "__all__";
      if (!bucket.has(key)) bucket.set(key, {
        store_id: id, store_name: name, active_employees: 0,
        mood_avg: null, mood_samples: 0, needs_support_count: 0,
        mental_certs_count: 0, mental_certs_days: 0, top_cids: [],
      });
      return bucket.get(key)!;
    };
    (stores ?? []).forEach((s: any) => addStore(s.id, s.name));
    (employees ?? []).filter((e: any) => e.status === "active").forEach((e: any) => {
      const st = (stores ?? []).find((s: any) => s.id === e.store_id);
      if (st) addStore(st.id, st.name).active_employees++;
    });

    const moodSum = new Map<string, { sum: number; n: number; support: number }>();
    (moods ?? []).filter((m: any) => !m.skipped && m.mood_score != null).forEach((m: any) => {
      const sid = empStore.get(m.employee_id) ?? null;
      const key = sid ?? "__all__";
      const cur = moodSum.get(key) ?? { sum: 0, n: 0, support: 0 };
      cur.sum += Number(m.mood_score);
      cur.n += 1;
      if (m.needs_support) cur.support += 1;
      moodSum.set(key, cur);
    });
    for (const [key, v] of moodSum) {
      const agg = bucket.get(key);
      if (!agg) continue;
      agg.mood_avg = v.n > 0 ? +(v.sum / v.n).toFixed(2) : null;
      agg.mood_samples = v.n;
      agg.needs_support_count = v.support;
    }

    (certs ?? []).forEach((c: any) => {
      const cid = (c.cid_code || "").toUpperCase();
      if (!cid.startsWith("F")) return;
      const sid = empStore.get(c.employee_id) ?? null;
      const agg = bucket.get(sid ?? "__all__");
      if (!agg) return;
      agg.mental_certs_count += 1;
      agg.mental_certs_days += Number(c.days_off || 0);
      if (agg.top_cids.length < 5 && cid) agg.top_cids.push(cid);
    });

    const signals = Array.from(bucket.values());
    const sstSummary = (sst ?? []).map((d: any) => ({ doc_type: d.doc_type, valid_until: d.valid_until }));

    const userPayload = {
      period_days: 90,
      signals,
      sst_documents_active: sstSummary,
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Analise e sugira riscos psicossociais:\n${JSON.stringify(userPayload)}` },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return new Response(JSON.stringify({ error: "gateway", status: res.status, details: t }), {
        status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = typeof raw === "string" ? JSON.parse(raw) : raw; }
    catch { const m = String(raw).match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); }
    const suggestions = Array.isArray(parsed?.risks) ? parsed.risks : [];

    // Inserir como auto_generated (evitar duplicar: só insere se não houver risco aberto igual mesma categoria+loja auto)
    const { data: existing } = await admin
      .from("psychosocial_risks")
      .select("id, store_id, category, status, auto_generated")
      .eq("auto_generated", true)
      .in("status", ["open", "in_progress"]);
    const existingKeys = new Set((existing ?? []).map((r: any) => `${r.store_id ?? ""}|${r.category}`));

    let inserted = 0;
    for (const s of suggestions) {
      const key = `${s.store_id ?? ""}|${s.category}`;
      if (existingKeys.has(key)) continue;
      const { error } = await admin.from("psychosocial_risks").insert({
        store_id: s.store_id ?? null,
        category: s.category,
        description: s.description + (s.evidence ? `\n\nEvidência: ${s.evidence}` : ""),
        severity: s.severity ?? "medium",
        probability: s.probability ?? "medium",
        source: "ia_signals",
        action_plan: s.action_plan ?? null,
        status: "open",
        auto_generated: true,
      });
      if (!error) inserted++;
    }

    return new Response(JSON.stringify({ ok: true, inserted, signals, suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[suggest-psychosocial-risks]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
