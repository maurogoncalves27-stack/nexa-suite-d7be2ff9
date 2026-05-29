// Edge Function: saipos-sync
// Importa vendas do Saipos PDV (Saipos Data API) e baixa estoque por nome.
//
// API docs: https://saipos-data-api.readme.io
//   GET https://data.saipos.io/v1/search_sales       → vendas (cabeçalho)
//   GET https://data.saipos.io/v1/sales_items        → itens das vendas
//
// Autenticação: Header `Authorization: Bearer <JWT do Saipos>`
// Filtro de data: usa `shift_date` (recomendado pela própria Saipos)
// Limite por consulta: até 15 dias por requisição.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SAIPOS_BASE_URL = "https://data.saipos.io/v1";
const MAX_PAGE = 1000;

// ===== Tipos =====
interface SaiposSale {
  id_sale: number | string;
  id_store: number | string;
  sale_number?: number | string | null;
  desc_sale?: string | null;
  created_at?: string;
  updated_at?: string;
  shift_date?: string;
  total_amount?: number;
  canceled?: "Y" | "N";
  customer?: { name?: string } | null;
  payments?: Array<{ desc_payment_method?: string; payment_method?: string }> | null;
}

interface SaiposItemChoice {
  desc_sale_item_choice?: string;
  desc_store_choice_item?: string;
  aditional_price?: number;
  deleted?: boolean;
}

interface SaiposItemEntry {
  id_sale_item?: number | string;
  id_store_item?: number | string;
  desc_sale_item?: string;
  quantity?: number;
  unit_price?: number;
  deleted?: boolean;
  integration_code?: string;
  choices?: SaiposItemChoice[];
}

interface SaiposItemsRow {
  id_sale: number | string;
  id_store: number | string;
  shift_date?: string;
  items?: SaiposItemEntry[];
}

// ===== Utils =====
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function fmtSaiposDate(iso: string): string {
  // A API espera formato "YYYY-MM-DDTHH:mm:ss" (sem timezone)
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

async function saiposGet<T>(
  path: string,
  apiKey: string,
  params: Record<string, string | number>,
): Promise<T> {
  const url = new URL(`${SAIPOS_BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  // Defensive: o usuário pode ter colado o token já com "Bearer " no início.
  // Removemos qualquer prefixo Bearer/Token para evitar "Bearer Bearer ...".
  const cleanToken = apiKey.replace(/^\s*(Bearer|Token)\s+/i, "").trim();
  const resp = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; LovableSaiposSync/1.0)",
    },
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Saipos ${path} ${resp.status}: ${body.slice(0, 400)}`);
  }
  const data = await resp.json();
  return data as T;
}

function extractList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["data", "result", "results", "items", "sales", "rows"]) {
      if (Array.isArray(obj[key])) return obj[key] as T[];
    }
  }
  return [];
}

async function fetchAllPages<T>(
  path: string,
  apiKey: string,
  startIso: string,
  endIso: string,
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const data = await saiposGet<unknown>(path, apiKey, {
      p_date_column_filter: "shift_date",
      p_filter_date_start: fmtSaiposDate(startIso),
      p_filter_date_end: fmtSaiposDate(endIso),
      p_limit: MAX_PAGE,
      p_offset: offset,
    });
    const rows = extractList<T>(data);
    all.push(...rows);
    if (rows.length < MAX_PAGE) break;
    offset += MAX_PAGE;
    if (offset > 50000) break; // hard cap de segurança
  }
  return all;
}

// ===== Handler =====
// REATIVADO temporariamente (29/05/2026) a pedido do usuário, até o /pdv-novo
// assumir 100% das vendas. Mantemos a função legada como implementação ativa.
Deno.serve((req) => _legacySaiposSync(req));

// ============================================================
// Implementação legada do saipos-sync (volta a ser a ativa).
// ============================================================
async function _legacySaiposSync(req: Request) {


  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SAIPOS_API_KEY = Deno.env.get("SAIPOS_API_KEY");

  if (!SAIPOS_API_KEY) {
    return new Response(
      JSON.stringify({ error: "SAIPOS_API_KEY não configurada" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: { store_id?: string; trigger_type?: string; user_id?: string; since?: string; until?: string } = {};
  try { body = await req.json(); } catch { /* GET ou body vazio */ }

  const storeId = body.store_id ?? null;
  const triggerType = body.trigger_type ?? "manual";
  const userId = body.user_id ?? null;
  // Janela padrão: últimas 24h. API permite no máximo 15 dias por chamada.
  const sinceIso = body.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const untilIso = body.until ?? new Date().toISOString();

  // Cria log
  const { data: logRow, error: logErr } = await supabase
    .from("pos_sync_logs")
    .insert({
      store_id: storeId,
      triggered_by: userId,
      trigger_type: triggerType,
      status: "running",
    })
    .select("id")
    .single();

  if (logErr || !logRow) {
    return new Response(JSON.stringify({ error: logErr?.message ?? "log error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const logId = logRow.id;

  try {
    // Busca lojas locais
    let targetStores: { id: string; name: string }[] = [];
    if (storeId) {
      const { data, error } = await supabase
        .from("stores").select("id, name").eq("id", storeId);
      if (error) throw error;
      targetStores = data ?? [];
    } else {
      const { data, error } = await supabase
        .from("stores").select("id, name");
      if (error) throw error;
      targetStores = data ?? [];
    }
    if (targetStores.length === 0) throw new Error("Nenhuma loja encontrada");

    // Catálogo de produtos para match por nome (uma vez só)
    const { data: products } = await supabase
      .from("inventory_products").select("id, name");
    const productMap = new Map<string, string>();
    for (const p of products ?? []) {
      productMap.set(normalizeName(p.name), p.id);
    }

    // Mapeamentos manuais nome→produto/receita
    const { data: mappings } = await supabase
      .from("pos_item_mappings")
      .select("pos_item_name, inventory_product_id, recipe_id");
    const productMappings = new Map<string, string>();
    const recipeMappings = new Map<string, string>();
    for (const m of mappings ?? []) {
      const key = normalizeName(m.pos_item_name);
      if (m.inventory_product_id) productMappings.set(key, m.inventory_product_id);
      if (m.recipe_id) recipeMappings.set(key, m.recipe_id);
    }

    // Carrega ingredientes das receitas usadas em mapeamentos
    const recipeIds = Array.from(new Set(Array.from(recipeMappings.values())));
    const recipeIngredients = new Map<string, Array<{ product_id: string; ratio: number; recipe_name: string }>>();
    if (recipeIds.length > 0) {
      const { data: recipes } = await supabase
        .from("recipes")
        .select("id, name, yield_quantity, recipe_ingredients(product_id, quantity)")
        .in("id", recipeIds);
      for (const r of recipes ?? []) {
        const yield_ = Number(r.yield_quantity) || 1;
        const ings = (r.recipe_ingredients ?? []).map((ri: { product_id: string; quantity: number }) => ({
          product_id: ri.product_id,
          ratio: Number(ri.quantity) / yield_,
          recipe_name: r.name,
        }));
        recipeIngredients.set(r.id, ings);
      }
    }

    // 1) Busca vendas e itens da Saipos (1 chamada de cada — a API é multi-loja)
    const sales = await fetchAllPages<SaiposSale>(
      "/search_sales",
      SAIPOS_API_KEY,
      sinceIso,
      untilIso,
    );
    const itemRows = await fetchAllPages<SaiposItemsRow>(
      "/sales_items",
      SAIPOS_API_KEY,
      sinceIso,
      untilIso,
    );

    // Mapa: id_sale → items
    const itemsBySale = new Map<string, SaiposItemEntry[]>();
    for (const row of itemRows) {
      itemsBySale.set(String(row.id_sale), row.items ?? []);
    }

    let salesImported = 0;
    let itemsMatched = 0;
    let itemsUnmatched = 0;
    const details: Record<string, unknown> = {
      total_sales_from_api: sales.length,
      total_item_rows_from_api: itemRows.length,
      stores: [] as unknown[],
    };

    // Mapa loja Saipos → loja interna (todas as lojas se não filtrado, ou só a filtrada)
    // Como a API Saipos retorna id_store no payload, distribuímos por id_store.
    // Usuário pode opcionalmente cadastrar saipos_store_id em stores futuramente.
    // Por ora: se houver apenas 1 loja interna, todas as vendas vão para ela.
    // Se houver várias e nenhum mapeamento, vendas vão para a primeira loja-alvo.
    const defaultStore = targetStores[0];

    for (const sale of sales) {
      if (sale.canceled === "Y") continue;

      const externalId = String(sale.id_sale);
      const soldAt = sale.created_at ?? sale.shift_date ?? new Date().toISOString();
      const total = Number(sale.total_amount ?? 0);
      const paymentMethod = sale.payments?.[0]?.desc_payment_method ?? sale.payments?.[0]?.payment_method ?? null;
      const customerName = sale.customer?.name ?? null;
      const orderNumber = sale.sale_number != null ? String(sale.sale_number) : (sale.desc_sale ?? null);

      // upsert venda
      const { data: saleRow, error: saleErr } = await supabase
        .from("pos_sales")
        .upsert(
          {
            store_id: defaultStore.id,
            external_id: externalId,
            order_number: orderNumber,
            sold_at: soldAt,
            total_amount: total,
            payment_method: paymentMethod,
            customer_name: customerName,
            status: "completed",
            raw_payload: sale as unknown as Record<string, unknown>,
          },
          { onConflict: "store_id,external_id" },
        )
        .select("id, stock_applied")
        .single();
      if (saleErr || !saleRow) continue;
      salesImported++;

      const items = itemsBySale.get(externalId) ?? [];
      for (const it of items) {
        if (it.deleted) continue;
        const name = it.desc_sale_item ?? "Produto";
        const qty = Number(it.quantity ?? 0);
        const unit = Number(it.unit_price ?? 0);
        const normName = normalizeName(name);

        // Prioridade: mapeamento manual (produto direto > receita) > match automático
        const mappedProductId = productMappings.get(normName);
        const mappedRecipeId = recipeMappings.get(normName);
        const matched = mappedProductId ?? productMap.get(normName) ?? null;
        const useRecipe = !mappedProductId && mappedRecipeId ? mappedRecipeId : null;

        const matchStatus = matched ? "matched" : useRecipe ? "recipe" : "unmatched";
        if (matched || useRecipe) itemsMatched++;
        else itemsUnmatched++;

        await supabase.from("pos_sale_items").insert({
          sale_id: saleRow.id,
          external_product_id: it.id_store_item ? String(it.id_store_item) : null,
          product_name: name,
          quantity: qty,
          unit_price: unit,
          total_price: unit * qty,
          inventory_product_id: matched,
          match_status: matchStatus,
        });

        if (saleRow.stock_applied || qty <= 0) continue;

        // Baixa estoque: produto direto
        if (matched) {
          await supabase.from("inventory_stock_movements").insert({
            store_id: defaultStore.id,
            product_id: matched,
            movement_type: "saida",
            quantity: qty,
            reason: `PDV Saipos - Venda ${orderNumber ?? externalId}`,
          });
        }
        // Baixa estoque: ingredientes da receita
        else if (useRecipe) {
          const ings = recipeIngredients.get(useRecipe) ?? [];
          for (const ing of ings) {
            const need = ing.ratio * qty;
            if (need <= 0) continue;
            await supabase.from("inventory_stock_movements").insert({
              store_id: defaultStore.id,
              product_id: ing.product_id,
              movement_type: "saida",
              quantity: need,
              reason: `PDV Saipos - Receita ${ing.recipe_name} - Venda ${orderNumber ?? externalId}`,
            });
          }
        }
      }

      if (!saleRow.stock_applied) {
        await supabase
          .from("pos_sales")
          .update({ stock_applied: true, stock_applied_at: new Date().toISOString() })
          .eq("id", saleRow.id);
      }
    }

    (details.stores as unknown[]).push({
      store_id: defaultStore.id,
      name: defaultStore.name,
      sales: salesImported,
    });

    await supabase
      .from("pos_sync_logs")
      .update({
        finished_at: new Date().toISOString(),
        sales_imported: salesImported,
        items_matched: itemsMatched,
        items_unmatched: itemsUnmatched,
        status: "success",
        details,
      })
      .eq("id", logId);

    return new Response(
      JSON.stringify({
        success: true,
        sales_imported: salesImported,
        items_matched: itemsMatched,
        items_unmatched: itemsUnmatched,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("saipos-sync error:", msg);
    await supabase
      .from("pos_sync_logs")
      .update({
        finished_at: new Date().toISOString(),
        status: "error",
        error_message: msg,
      })
      .eq("id", logId);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
// fim _legacySaiposSync — não usar.
void _legacySaiposSync;
