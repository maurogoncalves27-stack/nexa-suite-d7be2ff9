// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { parse as parseXml } from "https://deno.land/x/xml@2.1.3/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "Não autenticado" }, 401);

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supa.auth.getUser();
    if (!userData?.user) return json({ ok: false, error: "Sessão inválida" }, 401);

    const contentType = req.headers.get("content-type") ?? "";
    let xmlText: string | undefined;

    try {
      if (contentType.includes("application/json")) {
        const body = await req.json();
        xmlText = getXmlFromBody(body);
      } else if (contentType.includes("text/xml") || contentType.includes("application/xml") || contentType.includes("text/plain")) {
        xmlText = await req.text();
      } else {
        const raw = await req.text();
        if (raw.trim().startsWith("{")) {
          try {
            const body = JSON.parse(raw);
            xmlText = getXmlFromBody(body);
          } catch {
            xmlText = raw;
          }
        } else if (raw.trim().startsWith("<")) {
          xmlText = raw;
        }
      }
    } catch (e) {
      console.error("parse-nfe-xml: erro lendo body", e);
    }

    console.log("parse-nfe-xml: content-type=", contentType, "xml_len=", xmlText?.length ?? 0);

    if (!xmlText || typeof xmlText !== "string" || xmlText.trim().length === 0) {
      return json({ ok: false, error: "Não foi possível ler o XML enviado" }, 400);
    }

    xmlText = xmlText.replace(/^\uFEFF/, "").trim();

    let parsed: any;
    try {
      parsed = parseXml(xmlText);
    } catch (e) {
      return json({ ok: false, error: "XML inválido: " + (e instanceof Error ? e.message : String(e)) }, 400);
    }

    const inf =
      parsed?.nfeProc?.NFe?.infNFe ??
      parsed?.NFe?.infNFe ??
      parsed?.infNFe ??
      parsed?.["nfe:nfeProc"]?.["nfe:NFe"]?.["nfe:infNFe"];
    if (!inf) {
      return json({ ok: false, error: "XML não parece ser uma NF-e (infNFe não encontrado)" }, 400);
    }

    const ide = inf.ide ?? {};
    const emit = inf.emit ?? {};
    const total = inf.total?.ICMSTot ?? {};
    const chave = (inf["@Id"] ?? inf["@id"] ?? "").toString().replace(/^NFe/, "");

    const items: any[] = [];
    const detRaw = inf.det ?? [];
    const det = Array.isArray(detRaw) ? detRaw : [detRaw];
    for (const d of det) {
      const prod = d?.prod ?? {};
      items.push({
        line_number: Number(d?.["@nItem"] ?? d?.["@nitem"] ?? items.length + 1),
        original_code: prod?.cProd ? String(prod.cProd) : null,
        original_barcode: prod?.cEAN && prod.cEAN !== "SEM GTIN" ? String(prod.cEAN) : null,
        original_description: prod?.xProd ? String(prod.xProd) : "(sem descrição)",
        original_ncm: prod?.NCM ? String(prod.NCM) : null,
        unit: prod?.uCom ? String(prod.uCom).toUpperCase() : "UN",
        quantity: Number(prod?.qCom ?? 0),
        unit_value: Number(prod?.vUnCom ?? 0),
        total_value: Number(prod?.vProd ?? 0),
      });
    }

    const result = {
      nota: {
        chave_acesso: chave,
        numero: ide?.nNF ? String(ide.nNF) : null,
        serie: ide?.serie ? String(ide.serie) : null,
        data_emissao: ide?.dhEmi ? String(ide.dhEmi).slice(0, 10) : null,
        fornecedor_nome: emit?.xNome ? String(emit.xNome) : null,
        fornecedor_cnpj: emit?.CNPJ ? String(emit.CNPJ) : null,
        valor_total: total?.vNF != null ? Number(total.vNF) : null,
      },
      itens: items,
      itens_count: items.length,
    };

    return json({ ok: true, data: result }, 200);
  } catch (err) {
    console.error("parse-nfe-xml error", err);
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return json({ ok: false, error: msg }, 500);
  }
});

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getXmlFromBody(body: any): string | undefined {
  if (typeof body?.xml === "string" && body.xml.trim().length > 0) {
    return body.xml;
  }

  const base64 = typeof body?.xmlBase64 === "string"
    ? body.xmlBase64
    : typeof body?.fileBase64 === "string"
      ? body.fileBase64
      : undefined;

  if (!base64) return undefined;

  try {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

    for (const encoding of ["utf-8", "iso-8859-1", "windows-1252"] as const) {
      try {
        const text = new TextDecoder(encoding).decode(bytes).replace(/^\uFEFF/, "");
        if (text.trim()) return text;
      } catch {
        // tenta a próxima codificação
      }
    }
  } catch (error) {
    console.error("parse-nfe-xml: erro ao decodificar base64", error);
  }

  return undefined;
}
