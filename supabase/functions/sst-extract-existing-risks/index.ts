// Extrai riscos de um documento SST já existente (PGR/LTCAT/Psicossocial NR-1/Relatório Psicossocial)
// via Gemini e insere em psychosocial_risks (auto_generated=true, status='open').
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SYS = `Você é um especialista em SST/NR-1. Analise o PDF anexado (PGR, LTCAT, Psicossocial NR-1 ou Relatório Psicossocial brasileiro) e EXTRAIA todos os riscos identificados no texto. Devolva APENAS JSON:
{"risks":[{"category":"organizacao_trabalho|relacoes_socioprofissionais|condicoes_ambiente|reconhecimento_crescimento|interface_trabalho_vida|outros","description":"...","severity":"low|medium|high","probability":"low|medium|high","action_plan":"medida de controle sugerida ou razoável","deadline":"YYYY-MM-DD|null"}]}
Regras:
- EXTRAIA os riscos descritos no documento — não devolva lista vazia se o documento cita riscos, dimensões, categorias, perigos, agentes, etc.
- PGR/LTCAT: mapeie riscos físicos/químicos/ergonômicos/biológicos para "condicoes_ambiente" ou "outros".
- Psicossocial NR-1: mapeie para as categorias psicossociais.
- Se o doc traz score/percentual por dimensão, gere um risco por dimensão com severity/probability proporcional.
- NADA fora do JSON.`;

async function toB64(buf: ArrayBuffer): Promise<string> {
  const b = new Uint8Array(buf);
  let s = "";
  const c = 0x8000;
  for (let i = 0; i < b.length; i += c) s += String.fromCharCode(...b.subarray(i, i + c));
  return btoa(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { document_id, dry_run } = await req.json();
    if (!document_id) throw new Error("document_id obrigatório");
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: doc, error: dErr } = await admin
      .from("sst_documents")
      .select("id, doc_type, current_version")
      .eq("id", document_id)
      .single();
    if (dErr || !doc) throw new Error(dErr?.message || "documento não encontrado");

    const { data: ver, error: vErr } = await admin
      .from("sst_document_versions")
      .select("id, file_path, version")
      .eq("document_id", document_id)
      .is("superseded_at", null)
      .order("version", { ascending: false })
      .limit(1)
      .single();
    if (vErr || !ver) throw new Error(vErr?.message || "versão não encontrada");

    const { data: blob, error: bErr } = await admin.storage
      .from("sst-documents")
      .download(ver.file_path);
    if (bErr || !blob) throw new Error(bErr?.message || "download falhou");

    const b64 = await toB64(await blob.arrayBuffer());

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
      body: JSON.stringify({
        model: "google/gemini-3-pro-preview",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYS },
          { role: "user", content: [
            { type: "text", text: `Documento tipo: ${doc.doc_type}. Extraia TODOS os riscos.` },
            { type: "file", file: { filename: "doc.pdf", file_data: `data:application/pdf;base64,${b64}` } },
          ]},
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

    const risks = Array.isArray(parsed?.risks) ? parsed.risks : [];
    const source = `documento:${doc.doc_type} v${ver.version}`;

    if (dry_run) {
      return new Response(JSON.stringify({ doc_type: doc.doc_type, version: ver.version, risks }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // limpa versões anteriores auto-geradas por este mesmo source (idempotente)
    await admin.from("psychosocial_risks").delete().eq("source", source).eq("auto_generated", true);

    const rows = risks
      .filter((r: any) => r && r.description)
      .map((r: any) => ({
        category: String(r.category || "outros"),
        description: String(r.description).slice(0, 2000),
        severity: ["low","medium","high"].includes(r.severity) ? r.severity : "medium",
        probability: ["low","medium","high"].includes(r.probability) ? r.probability : "medium",
        action_plan: r.action_plan ? String(r.action_plan).slice(0, 2000) : null,
        deadline: r.deadline && /^\d{4}-\d{2}-\d{2}$/.test(r.deadline) ? r.deadline : null,
        source,
        auto_generated: true,
        status: "open",
      }));

    let inserted = 0;
    if (rows.length) {
      const { data: ins, error: iErr } = await admin
        .from("psychosocial_risks")
        .insert(rows)
        .select("id");
      if (iErr) throw new Error(iErr.message);
      inserted = ins?.length ?? 0;
    }

    return new Response(JSON.stringify({ doc_type: doc.doc_type, version: ver.version, extracted: risks.length, inserted, source }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
