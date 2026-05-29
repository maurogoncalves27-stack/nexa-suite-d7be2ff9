// dfe-sync: lista NF-e destinadas via Focus NFe, baixa XML e popula dfe_inbound_notes/items.
// Pode ser chamada para 1 CNPJ (body: { company_id }) ou todos os ativos (sem body / { all: true }).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireCronOrRole } from "../_shared/requireRole.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const baseUrl = (env: string) =>
  env === "producao" ? "https://api.focusnfe.com.br" : "https://homologacao.focusnfe.com.br";
const basicAuth = (t: string) => "Basic " + btoa(t + ":");

interface FocusNote {
  numero?: string | number;
  serie?: string | number;
  chave_nfe?: string;
  valor_total?: string | number;
  data_emissao?: string;
  cnpj_emitente?: string;
  nome_emitente?: string;
  ultimo_nsu?: string;
  nsu?: string;
  caminho_xml_nota_fiscal?: string;
  caminho_download_nota_fiscal?: string;
  ciencia_operacao?: string;
}

// Extrai número e série da chave de acesso NFe (44 dígitos).
// Layout: cUF(2) AAMM(4) CNPJ(14) modelo(2) serie(3) numero(9) tpEmis(1) cNF(8) cDV(1)
function parseChave(chave: string | null | undefined): { serie: string | null; numero: string | null } {
  if (!chave || chave.length !== 44 || !/^\d+$/.test(chave)) return { serie: null, numero: null };
  const serie = chave.substring(22, 25).replace(/^0+/, "") || "0";
  const numero = chave.substring(25, 34).replace(/^0+/, "") || "0";
  return { serie, numero };
}

// ----- XML helpers (regex; NFe é XML simples e bem-formado) -----
const tag = (xml: string, name: string): string | null => {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1].trim() : null;
};

const tagEmitCnpj = (xml: string): string | null => {
  const emitMatch = xml.match(/<emit>([\s\S]*?)<\/emit>/);
  if (!emitMatch) return null;
  const emit = emitMatch[1];
  const cnpj = tag(emit, "CNPJ") ?? tag(emit, "CPF");
  return cnpj;
};

const normalizeDesc = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

interface ParsedItem {
  line_number: number;
  description: string;
  ncm: string | null;
  cfop: string | null;
  unit: string | null;
  quantity: number | null;
  unit_value: number | null;
  total_value: number | null;
  ean: string | null;
  supplier_code: string | null;
  trib_unit: string | null;
  trib_quantity: number | null;
  trib_unit_value: number | null;
  suggested_pack_size: number | null;
  suggested_pack_unit: string | null;
}

function parseNfeXml(xml: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const detRe = /<det\s+nItem="(\d+)"[^>]*>([\s\S]*?)<\/det>/g;
  let m: RegExpExecArray | null;
  while ((m = detRe.exec(xml)) !== null) {
    const nItem = Number(m[1]);
    const det = m[2];
    const prodMatch = det.match(/<prod>([\s\S]*?)<\/prod>/);
    if (!prodMatch) continue;
    const prod = prodMatch[1];
    const ean = tag(prod, "cEAN");

    const uCom = tag(prod, "uCom");
    const qCom = Number(tag(prod, "qCom") ?? 0) || null;
    const vUnCom = Number(tag(prod, "vUnCom") ?? 0) || null;
    const uTrib = tag(prod, "uTrib");
    const qTrib = Number(tag(prod, "qTrib") ?? 0) || null;
    const vUnTrib = Number(tag(prod, "vUnTrib") ?? 0) || null;

    // Conversão sugerida: qTrib/qCom quando a razão é != 1 e ambos > 0.
    // Significa que o fornecedor vende em "uCom" (ex.: FARDO) mas cada um contém
    // qTrib/qCom unidades de "uTrib" (ex.: 30 KG).
    let suggested_pack_size: number | null = null;
    let suggested_pack_unit: string | null = null;
    if (qCom && qTrib && qCom > 0) {
      const ratio = qTrib / qCom;
      if (Math.abs(ratio - 1) > 0.001) {
        suggested_pack_size = Math.round(ratio * 1000) / 1000;
        suggested_pack_unit = uTrib;
      }
    }

    items.push({
      line_number: nItem,
      description: tag(prod, "xProd") ?? "",
      ncm: tag(prod, "NCM"),
      cfop: tag(prod, "CFOP"),
      unit: uCom ?? uTrib,
      quantity: qCom ?? qTrib,
      unit_value: vUnCom ?? vUnTrib,
      total_value: Number(tag(prod, "vProd") ?? 0) || null,
      ean: ean && ean !== "SEM GTIN" ? ean : null,
      supplier_code: tag(prod, "cProd"),
      trib_unit: uTrib,
      trib_quantity: qTrib,
      trib_unit_value: vUnTrib,
      suggested_pack_size,
      suggested_pack_unit,
    });
  }
  return items;
}

async function fetchXml(env: string, path: string, token: string): Promise<string | null> {
  const url = path.startsWith("http") ? path : `${baseUrl(env)}${path}`;
  const r = await fetch(url, { headers: { Authorization: basicAuth(token) } });
  if (!r.ok) return null;
  const txt = await r.text();
  if (txt.trim().startsWith("<")) return txt;
  // resposta JSON contendo o XML — comum em alguns endpoints da Focus
  try {
    const j = JSON.parse(txt);
    const inner = j?.xml ?? j?.caminho_xml_nota_fiscal ?? j?.caminho_download_nota_fiscal;
    if (typeof inner === "string" && inner.trim().startsWith("<")) return inner;
    if (typeof inner === "string" && inner.startsWith("/")) {
      const r2 = await fetch(`${baseUrl(env)}${inner}`, { headers: { Authorization: basicAuth(token) } });
      if (r2.ok) return await r2.text();
    }
  } catch { /* não é JSON */ }
  return null;
}

async function fetchXmlByChave(env: string, chave: string, token: string): Promise<string | null> {
  // tenta endpoints conhecidos da Focus para baixar o XML por chave
  const candidates = [
    `/v2/nfes_recebidas/${chave}.xml`,
    `/v2/nfes_recebidas/${chave}`,
    `/v2/nfe_destinada/${chave}.xml`,
  ];
  for (const p of candidates) {
    const xml = await fetchXml(env, p, token);
    if (xml) return xml;
  }
  return null;
}

// Envia manifestação de CIÊNCIA à Focus. Só após a ciência a Focus libera o XML completo
// (com <det>/<prod>). Sem isso, /v2/nfes_recebidas devolve apenas resumo (nfe_completa=false).
async function sendCienciaToFocus(env: string, token: string, cnpj: string, chave: string): Promise<boolean> {
  try {
    const r = await fetch(`${baseUrl(env)}/v2/nfes_recebidas/manifesto`, {
      method: "POST",
      headers: { Authorization: basicAuth(token), "Content-Type": "application/json" },
      body: JSON.stringify({ cnpj, chave, tipo_evento: "ciencia_operacao" }),
    });
    const txt = await r.text();
    // 200/201 = aceita; 409 = já manifestada antes (também ok pra liberar XML)
    if (r.ok || r.status === 409) return true;
    console.warn("ciência rejeitada", chave, r.status, txt.slice(0, 200));
    return false;
  } catch (e) {
    console.error("ciência falhou", chave, e);
    return false;
  }
}

async function persistItems(
  sb: any,
  noteId: string,
  supplierCnpj: string | null,
  parsed: ParsedItem[],
) {
  if (parsed.length === 0) return;

  // pré-carrega mapa do fornecedor
  let supplierMap: Record<string, string> = {};
  if (supplierCnpj) {
    const { data: maps } = await sb
      .from("dfe_supplier_product_map")
      .select("description_norm, product_id")
      .eq("supplier_cnpj", supplierCnpj);
    for (const row of maps ?? []) supplierMap[row.description_norm] = row.product_id;
  }

  const rows = parsed.map((it) => {
    const norm = normalizeDesc(it.description);
    const suggested = supplierMap[norm] ?? null;
    return {
      note_id: noteId,
      line_number: it.line_number,
      description: it.description,
      ncm: it.ncm,
      cfop: it.cfop,
      unit: it.unit,
      quantity: it.quantity,
      unit_value: it.unit_value,
      total_value: it.total_value,
      trib_unit: it.trib_unit,
      trib_quantity: it.trib_quantity,
      trib_unit_value: it.trib_unit_value,
      suggested_pack_size: it.suggested_pack_size,
      suggested_pack_unit: it.suggested_pack_unit,
      suggested_product_id: suggested,
      raw: {
        ean: it.ean,
        supplier_code: it.supplier_code,
        description_norm: norm,
      },
    };
  });

  await sb.from("dfe_inbound_items").upsert(rows, { onConflict: "note_id,line_number" });
}

async function syncCompany(sb: any, company: any) {
  const env = company.environment === "producao" ? "producao" : "homolog";
  const token = env === "producao"
    ? Deno.env.get("FOCUS_NFE_TOKEN_PROD")
    : Deno.env.get("FOCUS_NFE_TOKEN_HOMOLOG");
  if (!token) throw new Error(`token Focus (${env}) não configurado`);

  const url = `${baseUrl(env)}/v2/nfes_recebidas?cnpj=${encodeURIComponent(company.cnpj)}&ultimo_nsu=${encodeURIComponent(company.last_nsu ?? "0")}`;
  const r = await fetch(url, { headers: { Authorization: basicAuth(token) } });
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!r.ok) {
    await sb.from("dfe_companies").update({
      last_sync_at: new Date().toISOString(),
      last_sync_error: typeof data === "string" ? data : (data?.mensagem ?? `HTTP ${r.status}`),
    }).eq("id", company.id);
    return { company_id: company.id, ok: false, error: `HTTP ${r.status}`, payload: data };
  }

  const notes: FocusNote[] = Array.isArray(data) ? data : (data?.notas ?? data?.nfes ?? []);
  let inserted = 0;
  let parsedCount = 0;
  let lastNsu = company.last_nsu ?? "0";

  for (const n of notes) {
    const chave = n.chave_nfe;
    if (!chave) continue;
    const nsu = String(n.nsu ?? n.ultimo_nsu ?? lastNsu);
    if (Number(nsu) > Number(lastNsu)) lastNsu = nsu;

    // dedupe by chave
    const { data: existing } = await sb
      .from("dfe_inbound_notes")
      .select("id")
      .eq("chave_acesso", chave)
      .maybeSingle();
    if (existing) continue;

    const xmlPath = n.caminho_xml_nota_fiscal ?? n.caminho_download_nota_fiscal ?? null;
    const xmlUrl = xmlPath ? (xmlPath.startsWith("http") ? xmlPath : `${baseUrl(env)}${xmlPath}`) : null;

    // Tenta obter CNPJ do payload; se não vier, tenta do XML depois
    let supplierCnpj = n.cnpj_emitente ?? null;

    const { data: inserted_note, error: noteErr } = await sb
      .from("dfe_inbound_notes")
      .insert({
        dfe_company_id: company.id,
        store_id: company.store_id ?? null,
        target_store_id: company.store_id ?? null,
        supplier_cnpj: supplierCnpj,
        supplier_name: n.nome_emitente ?? null,
        numero: n.numero != null ? String(n.numero) : parseChave(chave).numero,
        serie: n.serie != null ? String(n.serie) : parseChave(chave).serie,
        chave_acesso: chave,
        emission_date: n.data_emissao ?? null,
        total_amount: n.valor_total != null ? Number(n.valor_total) : null,
        status: company.auto_ciencia ? "ready" : "awaiting_sefaz",
        origin: "focus",
        nsu,
        xml_url: xmlUrl,
        ciencia_at: company.auto_ciencia ? new Date().toISOString() : null,
        raw_payload: n,
      })
      .select("id")
      .single();
    if (noteErr || !inserted_note) continue;
    inserted++;

    // baixa XML e popula itens (fallback por chave quando o caminho não vem na listagem)
    try {
      // Focus só libera o XML completo (com <det>) APÓS manifestação de ciência.
      // Se a empresa tem auto_ciencia, enviamos antes de tentar baixar.
      if (company.auto_ciencia) {
        await sendCienciaToFocus(env, token!, company.cnpj, chave);
      }
      let xml: string | null = null;
      if (xmlPath) xml = await fetchXml(env, xmlPath, token!);
      if (!xml) xml = await fetchXmlByChave(env, chave, token!);
      if (xml) {
        // Se o CNPJ do fornecedor não veio no payload da listagem, extrai do XML
        if (!supplierCnpj) {
          const cnpjFromXml = tagEmitCnpj(xml);
          if (cnpjFromXml) {
            supplierCnpj = cnpjFromXml;
            await sb.from("dfe_inbound_notes")
              .update({ supplier_cnpj: cnpjFromXml })
              .eq("id", inserted_note.id);
          }
        }
        const parsed = parseNfeXml(xml);
        if (parsed.length > 0) {
          await persistItems(sb, inserted_note.id, supplierCnpj, parsed);
          parsedCount++;
          // se conseguiu via chave, registra a URL pra uso futuro
          if (!xmlUrl) {
            await sb.from("dfe_inbound_notes")
              .update({ xml_url: `${baseUrl(env)}/v2/nfes_recebidas/${chave}.xml` })
              .eq("id", inserted_note.id);
          }
        } else {
          console.warn("XML sem <det> para", chave);
        }
      } else {
        console.warn("XML indisponível na Focus para", chave);
      }
    } catch (e) {
      console.error("xml parse falhou para", chave, e);
    }
  }

  await sb.from("dfe_companies").update({
    last_nsu: lastNsu,
    last_sync_at: new Date().toISOString(),
    last_sync_error: null,
  }).eq("id", company.id);

  return { company_id: company.id, ok: true, inserted, parsed: parsedCount, last_nsu: lastNsu };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireCronOrRole(req, ["admin", "manager", "contabilidade"], corsHeaders);
  if (!auth.ok) return auth.response!;


  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const companyId = body?.company_id as string | undefined;
    const reparseIds = (body?.reparse_note_id
      ? (Array.isArray(body.reparse_note_id) ? body.reparse_note_id : [body.reparse_note_id])
      : []) as string[];

    // ---- modo "reparse": baixa XML por chave e popula itens das notas indicadas ----
    if (reparseIds.length > 0) {
      const { data: notes, error: nerr } = await sb
        .from("dfe_inbound_notes")
        .select("id, chave_acesso, supplier_cnpj, dfe_company_id")
        .in("id", reparseIds);
      if (nerr) throw nerr;

      const results: any[] = [];
      for (const n of notes ?? []) {
        try {
          const { data: comp } = await sb
            .from("dfe_companies").select("environment, cnpj").eq("id", n.dfe_company_id).single();
          const env = comp?.environment === "producao" ? "producao" : "homolog";
          const token = env === "producao"
            ? Deno.env.get("FOCUS_NFE_TOKEN_PROD")
            : Deno.env.get("FOCUS_NFE_TOKEN_HOMOLOG");
          if (!token || !n.chave_acesso) {
            results.push({ note_id: n.id, ok: false, error: "sem token ou chave" });
            continue;
          }
          // garante ciência antes de baixar (Focus só libera XML completo após ciência)
          if (comp?.cnpj) {
            await sendCienciaToFocus(env, token, comp.cnpj, n.chave_acesso);
          }
          const xml = await fetchXmlByChave(env, n.chave_acesso, token);
          if (!xml) { results.push({ note_id: n.id, ok: false, error: "xml indisponível" }); continue; }
          // Se a nota não tem CNPJ do fornecedor, extrai do XML
          let supplierCnpj = n.supplier_cnpj;
          if (!supplierCnpj) {
            const cnpjFromXml = tagEmitCnpj(xml);
            if (cnpjFromXml) {
              supplierCnpj = cnpjFromXml;
              await sb.from("dfe_inbound_notes")
                .update({ supplier_cnpj: cnpjFromXml })
                .eq("id", n.id);
            }
          }
          const parsed = parseNfeXml(xml);
          if (parsed.length === 0) { results.push({ note_id: n.id, ok: false, error: "sem <det>" }); continue; }
          await persistItems(sb, n.id, supplierCnpj, parsed);
          await sb.from("dfe_inbound_notes")
            .update({ xml_url: `${baseUrl(env)}/v2/nfes_recebidas/${n.chave_acesso}.xml`, ciencia_at: new Date().toISOString() })
            .eq("id", n.id);
          results.push({ note_id: n.id, ok: true, items: parsed.length, supplier_cnpj: supplierCnpj });
        } catch (e: any) {
          results.push({ note_id: n.id, ok: false, error: String(e.message ?? e) });
        }
      }
      return new Response(JSON.stringify({ ok: true, reparsed: results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const query = sb.from("dfe_companies").select("*").eq("active", true);
    const { data: companies, error } = companyId
      ? await query.eq("id", companyId)
      : await query;
    if (error) throw error;

    const results: any[] = [];
    for (const c of companies ?? []) {
      try { results.push(await syncCompany(sb, c)); }
      catch (e: any) { results.push({ company_id: c.id, ok: false, error: String(e.message ?? e) }); }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e.message ?? e) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
