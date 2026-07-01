/**
 * Fatores de conversão de produtos.
 * Fonte única: tabela public.product_conversions.
 * Tipos: 'compra' (embalagem→estoque), 'preparo' (cru→pronto), 'porcionamento' (peça→porção).
 */
import { supabase } from "@/integrations/supabase/client";

export type ConversionType = "compra" | "preparo" | "porcionamento";

export interface ProductConversion {
  id: string;
  product_id: string;
  conversion_type: ConversionType;
  from_unit: string;
  from_qty: number;
  to_unit: string;
  to_qty: number;
  is_default: boolean;
  notes: string | null;
}

const CACHE = new Map<string, ProductConversion[]>();

export const getConversions = async (productId: string): Promise<ProductConversion[]> => {
  if (CACHE.has(productId)) return CACHE.get(productId)!;
  const { data } = await supabase
    .from("product_conversions")
    .select("id, product_id, conversion_type, from_unit, from_qty, to_unit, to_qty, is_default, notes")
    .eq("product_id", productId);
  const rows = (data ?? []) as ProductConversion[];
  CACHE.set(productId, rows);
  return rows;
};

export const clearConversionsCache = (productId?: string) => {
  if (productId) CACHE.delete(productId);
  else CACHE.clear();
};

/**
 * Fator to_qty / from_qty (quanto 1 unidade "from" vira em "to").
 * Retorna null se não houver conversão cadastrada.
 */
export const resolveFactor = (
  conversions: ProductConversion[],
  fromUnit: string,
  toUnit: string,
  type?: ConversionType,
): number | null => {
  const f = fromUnit.toUpperCase();
  const t = toUnit.toUpperCase();
  if (f === t) return 1;
  const candidates = conversions.filter(
    (c) => (!type || c.conversion_type === type) &&
      c.from_unit.toUpperCase() === f && c.to_unit.toUpperCase() === t,
  );
  const chosen = candidates.find((c) => c.is_default) ?? candidates[0];
  if (chosen) return Number(chosen.to_qty) / Number(chosen.from_qty);
  // tenta inverso
  const inv = conversions.filter(
    (c) => (!type || c.conversion_type === type) &&
      c.from_unit.toUpperCase() === t && c.to_unit.toUpperCase() === f,
  );
  const invChosen = inv.find((c) => c.is_default) ?? inv[0];
  if (invChosen) return Number(invChosen.from_qty) / Number(invChosen.to_qty);
  return null;
};

/**
 * Converte uma quantidade "pronto" para "cru" (baixa real de estoque).
 * Usa o único fator 'preparo' cadastrado (assume 1 default por produto).
 */
export const readyToRaw = (
  conversions: ProductConversion[],
  readyQty: number,
): number => {
  const prep = conversions.find((c) => c.conversion_type === "preparo" && c.is_default)
    ?? conversions.find((c) => c.conversion_type === "preparo");
  if (!prep) return readyQty;
  const factor = Number(prep.to_qty) / Number(prep.from_qty); // pronto por 1 cru
  return factor > 0 ? readyQty / factor : readyQty;
};

export const getPreparoFactor = (conversions: ProductConversion[]): ProductConversion | null => {
  return conversions.find((c) => c.conversion_type === "preparo" && c.is_default)
    ?? conversions.find((c) => c.conversion_type === "preparo")
    ?? null;
};
