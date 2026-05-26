// Emite NFC-e via Focus NFe a partir de um pdv_orders.id
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FOCUS_TOKEN_HOMOLOG = Deno.env.get("FOCUS_NFE_TOKEN_HOMOLOG") ?? "";
const FOCUS_TOKEN_PROD = Deno.env.get("FOCUS_NFE_TOKEN_PROD") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function baseUrl(env: string) {
  return env === "producao"
    ? "https://api.focusnfe.com.br"
    : "https://homologacao.focusnfe.com.br";
}

function basicAuth(token: string) {
  return "Basic " + btoa(token + ":");
}

function onlyDigits(s: string | null | undefined) {
  return (s ?? "").replace(/\D+/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  let invoiceId: string | null = null;

  try {
    const { order_id } = await req.json();
    if (!order_id) throw new Error("order_id obrigatório");

    // 1. Pedido + items + canal/loja
    const { data: order, error: orderErr } = await sb
      .from("pdv_orders")
      .select("*, pdv_order_items(*), pdv_channels!inner(store_id)")
      .eq("id", order_id)
      .single();
    if (orderErr || !order) throw new Error("pedido não encontrado");

    const physicalStoreId = (order as any).pdv_channels.store_id;
    // Loja virtual (iFood) ou física? Subimos pra física (parent) se preciso
    const { data: storeRow } = await sb
      .from("stores")
      .select("*")
      .eq("id", physicalStoreId)
      .single();
    let store = storeRow;
    if (store?.is_virtual && (store as any).parent_store_id) {
      const { data: parent } = await sb.from("stores").select("*").eq("id", (store as any).parent_store_id).single();
      if (parent) store = parent;
    }
    if (!store) throw new Error("loja não encontrada");

    const env = (store as any).nfce_environment ?? "homologacao";
    const token = env === "producao" ? FOCUS_TOKEN_PROD : FOCUS_TOKEN_HOMOLOG;
    if (!token) throw new Error(`Token Focus NFe (${env}) não configurado`);

    // 2. Cria registro pendente (tem unique no focus_ref)
    const focusRef = `pedido-${order_id.slice(0, 8)}-${Date.now()}`;
    const { data: invoice, error: invErr } = await sb
      .from("pdv_fiscal_invoices")
      .insert({
        order_id,
        store_id: store.id,
        environment: env,
        provider: "focus_nfe",
        status: "processing",
        focus_ref: focusRef,
      })
      .select()
      .single();
    if (invErr) throw invErr;
    invoiceId = invoice.id;

    // 3. Buscar fiscal dos itens (recipes)
    const itemsRaw = (order as any).pdv_order_items as any[];
    const recipeIds = itemsRaw.map((i) => i.menu_item_id).filter(Boolean);
    const fiscalByRecipe: Record<string, any> = {};
    if (recipeIds.length) {
      const { data: recipes } = await sb
        .from("recipes")
        .select("id, ncm, cest, cfop, origem_mercadoria, csosn, cst, unidade_comercial, ean")
        .in("id", recipeIds);
      for (const r of recipes ?? []) fiscalByRecipe[r.id] = r;
    }

    // 4. Monta items NFC-e
    const nfceItems = itemsRaw.map((it, idx) => {
      const f = fiscalByRecipe[it.menu_item_id] ?? {};
      const qty = Number(it.quantity) || 1;
      const unit = Number(it.unit_price) || 0;
      return {
        numero_item: idx + 1,
        codigo_produto: it.menu_item_id ?? `ITEM${idx + 1}`,
        descricao: it.name?.slice(0, 120) ?? "Produto",
        cfop: f.cfop ?? "5102",
        unidade_comercial: f.unidade_comercial ?? "UN",
        quantidade_comercial: qty,
        valor_unitario_comercial: unit,
        valor_unitario_tributavel: unit,
        unidade_tributavel: f.unidade_comercial ?? "UN",
        quantidade_tributavel: qty,
        valor_bruto: Number((qty * unit).toFixed(2)),
        codigo_barras_comercial: f.ean ?? "SEM GTIN",
        codigo_barras_tributavel: f.ean ?? "SEM GTIN",
        codigo_ncm: f.ncm ?? "21069090",
        icms_origem: f.origem_mercadoria ?? 0,
        icms_situacao_tributaria: f.csosn ?? "102",
        pis_situacao_tributaria: "07",
        cofins_situacao_tributaria: "07",
      };
    });

    // 5. Pagamento (somatório por método)
    const { data: payments } = await sb
      .from("pdv_payments")
      .select("method, amount")
      .eq("order_id", order_id);
    const formaMap: Record<string, string> = {
      cash: "01",
      credit: "03",
      debit: "04",
      pix: "17",
      voucher: "10",
    };
    const rawPayments = (payments && payments.length
      ? payments
      : [{ method: "cash", amount: order.total }]);
    const totalPago = rawPayments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
    // A SEFAZ valida o troco contra o total fiscal da NFC-e (soma dos itens),
    // não contra o total interno do pedido, que pode conter o valor recebido em dinheiro.
    const totalNotaFiscal = Number(nfceItems.reduce((s, it) => s + Number(it.valor_bruto || 0), 0).toFixed(2));
    const troco = Number((totalPago - totalNotaFiscal).toFixed(2));
    const formas_pagamento = rawPayments.map((p: any, idx: number) => {
      const fp: any = {
        forma_pagamento: formaMap[p.method] ?? "99",
        valor_pagamento: Number(p.amount) || 0,
      };
      return fp;
    });

    // 6. Payload NFC-e
    const isDelivery = order.order_type === "delivery";
    const customerDoc = order.customer_document ? onlyDigits(order.customer_document) : "";
    const hasCustomerId = customerDoc.length === 11 || customerDoc.length === 14;

    // SEFAZ exige identificação do destinatário em entrega a domicílio (presença=4).
    // Sem CPF/CNPJ do cliente, cai pra presencial (1) pra não ser rejeitada.
    const presenca = isDelivery && hasCustomerId ? 4 : 1;

    const payload: any = {
      natureza_operacao: "Venda ao consumidor",
      data_emissao: new Date().toISOString(),
      tipo_documento: 1,
      finalidade_emissao: 1,
      consumidor_final: 1,
      presenca_comprador: presenca,
      cnpj_emitente: onlyDigits((store as any).cnpj),
      nome_emitente: (store as any).legal_name ?? store.name,
      nome_fantasia_emitente: store.name,
      logradouro_emitente: (store as any).address ?? "Rua Teste",
      numero_emitente: (store as any).number ?? "S/N",
      bairro_emitente: (store as any).neighborhood ?? "Centro",
      municipio_emitente: (store as any).city ?? "Brasília",
      uf_emitente: (store as any).state ?? "DF",
      cep_emitente: onlyDigits((store as any).zip_code) || "70000000",
      inscricao_estadual_emitente: (store as any).inscricao_estadual,
      regime_tributario_emitente: (store as any).regime_tributario ?? 1,
      modalidade_frete: 9,
      local_destino: 1,
      items: nfceItems,
      formas_pagamento,
    };

    if (troco > 0) payload.valor_troco = troco;

    if (hasCustomerId) {
      if (customerDoc.length === 11) payload.cpf_destinatario = customerDoc;
      else payload.cnpj_destinatario = customerDoc;
      if (order.customer_name) payload.nome_destinatario = order.customer_name;

      if (isDelivery) {
        const addr = (order as any).delivery_address ?? {};
        payload.logradouro_destinatario = addr.street ?? addr.logradouro ?? "Rua Teste";
        payload.numero_destinatario = addr.number ?? addr.numero ?? "S/N";
        payload.bairro_destinatario = addr.neighborhood ?? addr.bairro ?? "Centro";
        payload.municipio_destinatario = addr.city ?? addr.municipio ?? (store as any).city ?? "Brasília";
        payload.uf_destinatario = addr.state ?? addr.uf ?? (store as any).state ?? "DF";
        payload.cep_destinatario = onlyDigits(addr.zip_code ?? addr.cep ?? "") || "70000000";
      }
    }

    // 7. Envia pra Focus NFe (com detecção de contingência por rede/timeout/5xx)
    const url = `${baseUrl(env)}/v2/nfce?ref=${focusRef}`;
    let focusResp: Response | null = null;
    let focusText = "";
    let focusData: any = {};
    let networkErr: any = null;

    try {
      const ctrl = new AbortController();
      const tmo = setTimeout(() => ctrl.abort(), 15000); // 15s
      focusResp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: basicAuth(token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      clearTimeout(tmo);
      focusText = await focusResp.text();
      try { focusData = JSON.parse(focusText); } catch { focusData = { raw: focusText }; }
      console.log("Focus NFe response:", focusResp.status, focusText.slice(0, 1000));
    } catch (e: any) {
      networkErr = e;
      console.error("Focus NFe network error:", e?.message ?? e);
    }

    // Contingência: SEFAZ/Focus indisponível (timeout, erro de rede ou HTTP 5xx).
    // A nota fica salva e será reenviada pelo job nfce-retry-contingency.
    const isContingency =
      !!networkErr || (focusResp != null && focusResp.status >= 500);

    let status: string;
    if (isContingency) {
      status = "contingency";
    } else if (focusData.status === "autorizado") {
      status = "authorized";
    } else if (focusData.status === "processando_autorizacao") {
      status = "processing";
    } else if (focusData.status === "denegado" || focusData.status === "erro_autorizacao") {
      status = "rejected";
    } else if (focusResp?.ok) {
      status = "processing";
    } else {
      status = "error";
    }

    const update: any = {
      status,
      request_payload: payload,
      response_payload: isContingency
        ? { contingency: true, error: networkErr ? String(networkErr.message ?? networkErr) : `HTTP ${focusResp?.status}` }
        : focusData,
      numero: focusData.numero ? Number(focusData.numero) : null,
      serie: focusData.serie ? Number(focusData.serie) : null,
      chave_acesso: focusData.chave_nfe ?? null,
      protocolo: focusData.protocolo ?? null,
      danfe_url: focusData.caminho_danfe ? `${baseUrl(env)}${focusData.caminho_danfe}` : null,
      xml_url: focusData.caminho_xml_nota_fiscal ? `${baseUrl(env)}${focusData.caminho_xml_nota_fiscal}` : null,
      rejection_code: isContingency
        ? null
        : (focusData.codigo ?? focusData.codigo_erro ?? focusData.codigo_status?.toString() ?? (focusResp?.ok ? null : String(focusResp?.status))),
      rejection_reason: isContingency
        ? null
        : (focusData.mensagem ?? focusData.mensagem_sefaz ?? focusData.erros?.[0]?.mensagem ?? focusData.raw ?? (focusResp?.ok ? null : `HTTP ${focusResp?.status}`)),
      emitted_at: status === "authorized" ? new Date().toISOString() : null,
    };

    if (isContingency) {
      update.contingency_reason = networkErr
        ? `Falha de rede: ${String(networkErr.message ?? networkErr)}`
        : `Focus NFe HTTP ${focusResp?.status}`;
      update.last_contingency_at = new Date().toISOString();
    }

    await sb.from("pdv_fiscal_invoices").update(update).eq("id", invoiceId);

    return new Response(
      JSON.stringify({
        ok: true,
        invoice_id: invoiceId,
        status,
        contingency: isContingency,
        danfe_url: update.danfe_url,
        xml_url: update.xml_url,
        focus: focusData,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("nfce-emit error:", e);
    if (invoiceId) {
      await sb
        .from("pdv_fiscal_invoices")
        .update({ status: "error", rejection_reason: String(e.message ?? e) })
        .eq("id", invoiceId);
    }
    return new Response(
      JSON.stringify({ ok: false, error: String(e.message ?? e) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
