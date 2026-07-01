// Cálculo de custo e fator de rendimento de uma ficha técnica.
// Funciona recursivamente: se um ingrediente também é produto produzido,
// busca a receita dele e soma o custo proporcional. Tem proteção anti-loop.
import { supabase } from "@/integrations/supabase/client";

export interface RecipeCostResult {
  totalCost: number;             // custo total dos ingredientes da receita
  yieldQty: number;              // rendimento da receita
  yieldUnit: string;
  costPerYieldUnit: number;      // custo por unidade do produto produzido
  inputBaseQty: number;          // soma das quantidades dos ingredientes "base" (não-produzidos)
  conversionFactor: number;      // yieldQty / inputBaseQty (quando faz sentido)
  ingredientLines: Array<{
    productId: string;
    name: string;
    quantity: number;
    unit: string;
    unitCost: number;
    lineCost: number;
    isProduced: boolean;
  }>;
}

const MAX_DEPTH = 6;

async function costPerUnitOfProduct(
  productId: string,
  visited: Set<string>,
  depth: number,
): Promise<number> {
  if (visited.has(productId) || depth > MAX_DEPTH) return 0;
  visited.add(productId);

  const { data: prod } = await supabase
    .from("inventory_products")
    .select("id, average_cost, last_cost, product_type")
    .eq("id", productId)
    .maybeSingle();

  if (!prod) return 0;

  // Se for produzido, tenta calcular via receita ativa
  if (prod.product_type === "produzido") {
    const { data: rec } = await supabase
      .from("recipes")
      .select("id, yield_quantity")
      .eq("output_product_id", productId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (rec) {
      const r = await calcRecipeCostInternal(rec.id, visited, depth + 1);
      if (r && r.yieldQty > 0) return r.totalCost / r.yieldQty;
    }
  }

  // fallback: custo médio do estoque
  const avg = Number(prod.average_cost ?? 0);
  if (avg > 0) return avg;
  return Number(prod.last_cost ?? 0);
}

async function calcRecipeCostInternal(
  recipeId: string,
  visited: Set<string>,
  depth: number,
): Promise<RecipeCostResult | null> {
  const { data: recipe } = await supabase
    .from("recipes")
    .select("id, yield_quantity, yield_unit")
    .eq("id", recipeId)
    .maybeSingle();
  if (!recipe) return null;

  const { data: ings } = await supabase
    .from("recipe_ingredients")
    .select("product_id, quantity, unit, ingredient_state, product:inventory_products(name, product_type)")
    .eq("recipe_id", recipeId);

  const productIds = Array.from(new Set((ings ?? []).map((i: any) => i.product_id)));
  const { data: convs } = productIds.length
    ? await supabase
        .from("product_conversions")
        .select("product_id, from_qty, to_qty, is_default")
        .eq("conversion_type", "preparo")
        .in("product_id", productIds)
    : { data: [] as any[] };
  const prepByProduct = new Map<string, { from_qty: number; to_qty: number }>();
  ((convs as any[]) ?? []).forEach((c) => {
    const existing = prepByProduct.get(c.product_id);
    if (!existing || c.is_default) prepByProduct.set(c.product_id, { from_qty: Number(c.from_qty), to_qty: Number(c.to_qty) });
  });

  const lines: RecipeCostResult["ingredientLines"] = [];
  let total = 0;
  let inputBase = 0;

  for (const i of (ings ?? []) as any[]) {
    let qty = Number(i.quantity ?? 0);
    // Se o ingrediente é usado "pronto" e o produto tem fator de preparo,
    // converte para cru (baixa real de estoque).
    if (i.ingredient_state === "pronto") {
      const c = prepByProduct.get(i.product_id);
      if (c && c.from_qty > 0 && c.to_qty > 0) {
        const preparedPerRaw = c.to_qty / c.from_qty;
        if (preparedPerRaw > 0) qty = qty / preparedPerRaw;
      }
    }
    const unitCost = await costPerUnitOfProduct(i.product_id, new Set(visited), depth);
    const lineCost = qty * unitCost;
    const isProduced = i.product?.product_type === "produzido";
    total += lineCost;
    if (!isProduced) inputBase += qty;
    lines.push({
      productId: i.product_id,
      name: i.product?.name ?? "—",
      quantity: qty,
      unit: i.unit ?? "",
      unitCost,
      lineCost,
      isProduced,
    });
  }

  const yieldQty = Number(recipe.yield_quantity ?? 0);
  return {
    totalCost: total,
    yieldQty,
    yieldUnit: recipe.yield_unit ?? "",
    costPerYieldUnit: yieldQty > 0 ? total / yieldQty : 0,
    inputBaseQty: inputBase,
    conversionFactor: inputBase > 0 ? yieldQty / inputBase : 0,
    ingredientLines: lines,
  };
}

export async function calcRecipeCost(recipeId: string): Promise<RecipeCostResult | null> {
  return calcRecipeCostInternal(recipeId, new Set(), 0);
}
