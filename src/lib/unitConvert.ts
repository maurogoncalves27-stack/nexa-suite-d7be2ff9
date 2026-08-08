/**
 * Conversão entre unidades compatíveis (massa e volume).
 * Usado para calcular custo de ingrediente quando a unidade da ficha técnica
 * difere da unidade de estoque do produto (ex.: receita em G, custo médio por KG).
 */

const MASS: Record<string, number> = { MG: 0.000001, G: 0.001, GR: 0.001, GRAMA: 0.001, KG: 1, KILO: 1 };
const VOLUME: Record<string, number> = { ML: 0.001, L: 1, LT: 1, LITRO: 1 };

const norm = (u?: string | null) => (u ?? "").trim().toUpperCase();

/**
 * Fator para converter uma quantidade expressa em `fromUnit` para `toUnit`.
 * Retorna 1 quando as unidades são iguais ou incompatíveis (sem conversão conhecida).
 */
export const unitFactor = (fromUnit?: string | null, toUnit?: string | null): number => {
  const f = norm(fromUnit);
  const t = norm(toUnit);
  if (!f || !t || f === t) return 1;
  for (const table of [MASS, VOLUME]) {
    const a = table[f];
    const b = table[t];
    if (a && b) return a / b;
  }
  return 1;
};

/** Converte a quantidade de `fromUnit` para `toUnit` (sem conversão conhecida = valor original). */
export const convertQty = (qty: number, fromUnit?: string | null, toUnit?: string | null): number =>
  qty * unitFactor(fromUnit, toUnit);

/** true quando as unidades pertencem à mesma família e a conversão é confiável. */
export const isConvertible = (fromUnit?: string | null, toUnit?: string | null): boolean => {
  const f = norm(fromUnit);
  const t = norm(toUnit);
  if (!f || !t) return false;
  if (f === t) return true;
  return [MASS, VOLUME].some((table) => !!table[f] && !!table[t]);
};
