// Tipos compartilhados dos parsers do eSocial

export type RubricCategory =
  | "salary"
  | "advance"
  | "food_voucher"
  | "transport_voucher"
  | "health_plan"
  | "inss"
  | "irrf"
  | "infraction"
  | "bonus"
  | "other_earning"
  | "other_discount"
  | "informative";

export interface S1010Rubric {
  cod_rubr: string;
  ide_tab_rubr: string | null;
  description: string;
  nat_rubr: string | null;
  /** 1=Vencimento(provento) 2=Desconto 3=Informativa 4=Informativa dedutora */
  tp_rubr: string | null;
}

export interface S1200Rubric {
  cod_rubr: string;
  ide_tab_rubr: string | null;
  qtd_rubr: number | null;
  fator_rubr: number | null;
  vr_unit: number | null;
  vr_rubr: number;
}

export interface S1200Worker {
  cpf: string;
  nm_trab: string | null;
  matricula: string | null;
  cod_categ: string | null;
  /** YYYY-MM */
  per_apur: string | null;
  rubrics: S1200Rubric[];
}

export interface ParsedEsocial {
  type: "S-1010" | "S-1200" | "unknown";
  per_apur: string | null;
  /** populado para S-1010 */
  rubrics_table: S1010Rubric[];
  /** populado para S-1200 */
  workers: S1200Worker[];
}
