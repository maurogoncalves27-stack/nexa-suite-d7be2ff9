// Grava resultado da emissão ACBr local (service role) — prepare + finalize.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireRole } from "../_shared/requireRole.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function resolveStore(sb: ReturnType<typeof createClient>, order: any) {
  const physicalStoreId = order.store_id ?? order.pdv_channels?.store_id;
  const { data: storeRow } = await sb.from("stores").select("*").eq("id", physicalStoreId).single();
  let store = storeRow;
  if (store?.is_virtual && store.parent_store_id) {
    const { data: parent } = await sb.from("stores").select("*").eq("id", store.parent_store_id).single();
    if (parent) store = parent;
  }
  return store;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const auth = await requireRole(req, ["admin", "manager", "employee"], corsHeaders);
    if (!auth.ok) return auth.response!;

    const body = await req.json();
    const action = body.action as string;

    if (action === "prepare") {
      const { order_id, closure_id } = body;
      if (!order_id) throw new Error("order_id obrigatório");

      const { data: order, error: orderErr } = await sb
        .from("pdv_orders")
        .select("*, pdv_channels(store_id)")
        .eq("id", order_id)
        .single();
      if (orderErr || !order) throw new Error("pedido não encontrado");

      const store = await resolveStore(sb, order);
      if (!store) throw new Error("loja não encontrada");
      if ((store as any).nfce_emission_provider !== "acbr_local") {
        throw new Error("loja não configurada para emissão ACBr local");
      }

      const env = (store as any).nfce_environment ?? "homologacao";
      const numero = (store as any).nfce_next_number ?? 1;
      const serie = (store as any).nfce_serie ?? 1;

      const { data: invoice, error: invErr } = await sb
        .from("pdv_fiscal_invoices")
        .insert({
          order_id,
          store_id: store.id,
          environment: env,
          provider: "acbr_local",
          status: "processing",
          numero,
          serie,
          closure_id: closure_id ?? null,
        })
        .select()
        .single();
      if (invErr) throw invErr;

      const { data: tefCfg } = await sb
        .from("pdv_tef_config")
        .select("agent_url")
        .eq("store_id", store.id)
        .eq("is_active", true)
        .maybeSingle();

      return new Response(
        JSON.stringify({
          ok: true,
          invoice_id: invoice.id,
          store_id: store.id,
          numero,
          serie,
          environment: env,
          agent_url: tefCfg?.agent_url ?? "http://127.0.0.1:3030",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "finalize") {
      const {
        invoice_id,
        order_id,
        retorno,
        authorized,
        c_stat,
        x_motivo,
        chave_acesso,
        protocolo,
        numero,
        serie,
      } = body;
      if (!invoice_id) throw new Error("invoice_id obrigatório");

      const status = authorized ? "authorized" : "rejected";
      const update: Record<string, unknown> = {
        status,
        response_payload: { retorno, c_stat, x_motivo },
        chave_acesso: chave_acesso ?? null,
        protocolo: protocolo ?? null,
        numero: numero ?? null,
        serie: serie ?? null,
        rejection_code: authorized ? null : (c_stat ?? null),
        rejection_reason: authorized ? null : (x_motivo ?? "Rejeitada pela SEFAZ"),
        emitted_at: authorized ? new Date().toISOString() : null,
      };

      await sb.from("pdv_fiscal_invoices").update(update).eq("id", invoice_id);

      if (authorized && order_id) {
        const { data: inv } = await sb
          .from("pdv_fiscal_invoices")
          .select("store_id, numero")
          .eq("id", invoice_id)
          .single();
        if (inv?.store_id && inv.numero) {
          const next = Number(inv.numero) + 1;
          await sb.from("stores").update({ nfce_next_number: next }).eq("id", inv.store_id);
        }
      }

      return new Response(
        JSON.stringify({ ok: true, status, invoice_id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    throw new Error("action inválida (prepare | finalize)");
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e.message ?? e) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
