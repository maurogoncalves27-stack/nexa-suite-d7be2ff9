// Heurística: deduz categoria a partir da descrição da rubrica

import type { RubricCategory } from "./types";

export const guessCategoryFromDescription = (desc: string): RubricCategory => {
  const s = desc
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/\binss\b/.test(s)) return "inss";
  if (/\birrf\b|imposto de renda/.test(s)) return "irrf";
  if (/vale.?trans|\bvt\b/.test(s)) return "transport_voucher";
  if (/vale.?aliment|\bva\b|aliment/.test(s)) return "food_voucher";
  if (/plano.?(de )?saude|assist.?med|odonto/.test(s)) return "health_plan";
  if (/adiantament/.test(s)) return "advance";
  if (/infrac|advert|suspens|multa/.test(s)) return "infraction";
  if (/bonus|bonific|premia|gratific/.test(s)) return "bonus";
  if (/salario|ordenado|vencimento/.test(s)) return "salary";
  return "other_earning";
};
