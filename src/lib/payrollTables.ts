/**
 * Tabelas oficiais usadas no cálculo da folha (vigência 2026).
 * Atualize aqui quando o governo publicar nova tabela.
 *
 * Fontes:
 * - INSS: Portaria Interministerial MPS/MF (faixas progressivas)
 * - IRRF: Receita Federal (tabela mensal)
 * - Salário-família: Portaria MPS
 */

export const PAYROLL_TABLES_VERSION = "2026-01";

/** INSS — faixas progressivas mensais (empregado). */
export const INSS_BRACKETS: { upTo: number; rate: number }[] = [
  { upTo: 1621.00, rate: 0.075 },
  { upTo: 2793.88, rate: 0.09 },
  { upTo: 4190.83, rate: 0.12 },
  { upTo: 8157.41, rate: 0.14 }, // teto INSS 2026 (atualize quando sair valor oficial definitivo)
];

/** Calcula o INSS do empregado (progressivo). Retorna o valor a descontar. */
export function calcINSS(grossBase: number): number {
  if (grossBase <= 0) return 0;
  let remaining = grossBase;
  let lastCap = 0;
  let total = 0;
  for (const b of INSS_BRACKETS) {
    const slice = Math.max(0, Math.min(remaining, b.upTo - lastCap));
    total += slice * b.rate;
    remaining -= slice;
    lastCap = b.upTo;
    if (remaining <= 0) break;
  }
  return Math.round(total * 100) / 100;
}

/** IRRF — tabela mensal progressiva (vigência 2026). */
export const IRRF_BRACKETS: { upTo: number; rate: number; deduction: number }[] = [
  { upTo: 2428.80, rate: 0,    deduction: 0 },
  { upTo: 2826.65, rate: 0.075, deduction: 182.16 },
  { upTo: 3751.05, rate: 0.15,  deduction: 394.16 },
  { upTo: 4664.68, rate: 0.225, deduction: 675.49 },
  { upTo: Infinity, rate: 0.275, deduction: 908.73 },
];

export const IRRF_DEPENDENT_DEDUCTION = 189.59;
/** Desconto simplificado mensal opcional (Lei 14.973/24) */
export const IRRF_SIMPLIFIED_DEDUCTION = 564.80;

/**
 * Calcula o IRRF.
 * Base = bruto - INSS - (dependentes × dedução por dependente).
 * Aplica também o desconto simplificado (escolhe a base que resultar em menor imposto).
 */
export function calcIRRF(
  gross: number,
  inss: number,
  dependentsCount: number,
): number {
  if (gross <= 0) return 0;

  const traditionalBase = Math.max(0, gross - inss - dependentsCount * IRRF_DEPENDENT_DEDUCTION);
  const simplifiedBase = Math.max(0, gross - IRRF_SIMPLIFIED_DEDUCTION);
  const base = Math.min(traditionalBase, simplifiedBase);

  for (const b of IRRF_BRACKETS) {
    if (base <= b.upTo) {
      const tax = base * b.rate - b.deduction;
      return tax > 0 ? Math.round(tax * 100) / 100 : 0;
    }
  }
  return 0;
}

/** Salário-família — limite e cota (vigência 2026). */
export const FAMILY_ALLOWANCE_LIMIT = 1906.04;
export const FAMILY_ALLOWANCE_QUOTA = 65.00;

/**
 * Cota de salário-família.
 * Pago por dependente <14 anos quando o salário de contribuição não exceder o limite.
 */
export function calcFamilyAllowance(grossBase: number, dependentsUnder14: number): number {
  if (grossBase > FAMILY_ALLOWANCE_LIMIT || dependentsUnder14 <= 0) return 0;
  return Math.round(dependentsUnder14 * FAMILY_ALLOWANCE_QUOTA * 100) / 100;
}

/** FGTS = 8% sobre o salário bruto (informativo, não desconta do líquido). */
export function calcFGTS(grossBase: number): number {
  return Math.round(grossBase * 0.08 * 100) / 100;
}
