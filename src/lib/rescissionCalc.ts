// Cálculo de verbas rescisórias CLT (estimativa).
// Não substitui homologação contábil — uso interno gerencial.

import { calcINSS, calcIRRF, IRRF_DEPENDENT_DEDUCTION } from "./payrollTables";

export type TerminationReason =
  | "dismissal_without_cause"
  | "employee_resignation"
  | "dismissal_with_cause"
  | "end_of_trial_contract"
  | "end_of_fixed_term"
  | "mutual_agreement_484a";

export const TERMINATION_REASON_LABELS: Record<TerminationReason, string> = {
  dismissal_without_cause: "Sem justa causa (empregador)",
  employee_resignation: "Pedido de demissão",
  dismissal_with_cause: "Justa causa",
  end_of_trial_contract: "Fim de contrato de experiência",
  end_of_fixed_term: "Fim de contrato por prazo determinado",
  mutual_agreement_484a: "Acordo (art. 484-A)",
};

export interface RescissionInput {
  salary: number;
  hireDate: string;          // YYYY-MM-DD
  terminationDate: string;   // YYYY-MM-DD
  reason: TerminationReason;
  dependentsIRRF?: number;
  fgtsBalance?: number;      // saldo informado, opcional (apenas informativo)
}

export interface RescissionLine {
  label: string;
  amount: number;
  taxable?: boolean;
  detail?: string;
}

export interface RescissionResult {
  earnings: RescissionLine[];
  deductions: RescissionLine[];
  earningsTotal: number;
  deductionsTotal: number;
  net: number;
  fgtsFine?: number;     // 40% informativa
  notes: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function diffMonthsCeil(start: Date, end: Date): number {
  // 13º e férias: cada fração ≥ 15 dias = 1 avo (até 12 avos por período aquisitivo)
  let months = 0;
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    const a = cur < start ? start : cur;
    const b = end < monthEnd ? end : monthEnd;
    const days = Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (days >= 15) months++;
    cur.setMonth(cur.getMonth() + 1);
  }
  return Math.min(12, months);
}

function fullYears(hire: Date, term: Date): number {
  let years = term.getFullYear() - hire.getFullYear();
  const m = term.getMonth() - hire.getMonth();
  const d = term.getDate() - hire.getDate();
  if (m < 0 || (m === 0 && d < 0)) years--;
  return Math.max(0, years);
}

export function calcRescission(input: RescissionInput): RescissionResult {
  const salary = Math.max(0, Number(input.salary || 0));
  const hire = new Date(input.hireDate + "T00:00:00");
  const term = new Date(input.terminationDate + "T00:00:00");
  const reason = input.reason;
  const earnings: RescissionLine[] = [];
  const deductions: RescissionLine[] = [];
  const notes: string[] = [];

  // 1) Saldo de salário (dias trabalhados no mês)
  const lastDay = new Date(term.getFullYear(), term.getMonth() + 1, 0).getDate();
  const workedDays = term.getDate();
  const dailySalary = salary / 30;
  const saldoSalario = round2(dailySalary * workedDays);
  earnings.push({
    label: "Saldo de salário",
    amount: saldoSalario,
    taxable: true,
    detail: `${workedDays}/${lastDay} dias × ${(salary / 30).toFixed(2)}/dia`,
  });

  // 2) 13º proporcional (avos do ano corrente)
  const yearStart = new Date(term.getFullYear(), 0, 1);
  const baseStart13 = hire > yearStart ? hire : yearStart;
  // justa causa: NÃO recebe 13º proporcional
  const has13 = reason !== "dismissal_with_cause";
  const avos13 = has13 ? diffMonthsCeil(baseStart13, term) : 0;
  if (avos13 > 0) {
    const v = round2((salary / 12) * avos13);
    earnings.push({
      label: `13º salário proporcional`,
      amount: v,
      taxable: true,
      detail: `${avos13}/12 avos`,
    });
  }

  // 3) Férias proporcionais + 1/3 (sempre devidas, exceto justa causa)
  const hasFerias = reason !== "dismissal_with_cause";
  if (hasFerias) {
    // período aquisitivo aberto: último aniversário de admissão antes da rescisão
    const yearsCompleted = fullYears(hire, term);
    const periodStart = new Date(hire);
    periodStart.setFullYear(periodStart.getFullYear() + yearsCompleted);
    const avosFerias = diffMonthsCeil(periodStart, term);
    if (avosFerias > 0) {
      const ferias = round2((salary / 12) * avosFerias);
      const tercio = round2(ferias / 3);
      earnings.push({
        label: `Férias proporcionais`,
        amount: ferias,
        taxable: false,
        detail: `${avosFerias}/12 avos`,
      });
      earnings.push({ label: `1/3 sobre férias proporcionais`, amount: tercio, taxable: false });
    }
  }

  // 4) Aviso prévio indenizado
  // Devido (pago): sem justa causa, fim de experiência rompido pelo empregador (não cobrimos), acordo 484-A (50%)
  let avisoIndenizado = 0;
  const yearsForAviso = fullYears(hire, term);
  const avisoDays = Math.min(90, 30 + Math.max(0, yearsForAviso) * 3);
  if (reason === "dismissal_without_cause") {
    avisoIndenizado = round2(dailySalary * avisoDays);
    notes.push(`Aviso prévio: ${avisoDays} dias (Lei 12.506/2011).`);
  } else if (reason === "mutual_agreement_484a") {
    avisoIndenizado = round2((dailySalary * avisoDays) / 2);
    notes.push(`Acordo (art. 484-A): aviso pago pela METADE (${avisoDays} dias × 50%).`);
  }
  if (avisoIndenizado > 0) {
    earnings.push({
      label: "Aviso prévio indenizado",
      amount: avisoIndenizado,
      taxable: false,
      detail: `${avisoDays} dias${reason === "mutual_agreement_484a" ? " (50%)" : ""}`,
    });
    // 13º incidente sobre aviso (avos do aviso projetado): 1 avo extra
    if (reason === "dismissal_without_cause" || reason === "mutual_agreement_484a") {
      const extra13 = round2(salary / 12);
      earnings.push({
        label: "13º sobre aviso prévio",
        amount: reason === "mutual_agreement_484a" ? round2(extra13 / 2) : extra13,
        taxable: true,
        detail: "1/12 avo projetado",
      });
    }
  }

  if (reason === "employee_resignation") {
    notes.push("Pedido de demissão: sem aviso indenizado, sem multa de FGTS, FGTS não sacável.");
  }
  if (reason === "dismissal_with_cause") {
    notes.push("Justa causa: sem 13º prop., sem férias prop., sem aviso, sem multa FGTS.");
  }

  // 5) Multa 40% FGTS (informativa; saldo pode não estar disponível)
  let fgtsFine: number | undefined;
  if (reason === "dismissal_without_cause" || reason === "end_of_trial_contract") {
    const saldo = Number(input.fgtsBalance || 0);
    fgtsFine = round2(saldo * 0.4);
    if (saldo > 0) notes.push(`Multa 40% FGTS sobre saldo informado (R$ ${saldo.toFixed(2)}): R$ ${fgtsFine.toFixed(2)} — paga via guia GRRF, não entra no líquido.`);
    else notes.push("Multa 40% FGTS devida — informe o saldo do FGTS para calcular (paga via GRRF, fora do líquido).");
  } else if (reason === "mutual_agreement_484a") {
    const saldo = Number(input.fgtsBalance || 0);
    fgtsFine = round2(saldo * 0.2);
    if (saldo > 0) notes.push(`Acordo 484-A: multa 20% FGTS = R$ ${fgtsFine.toFixed(2)} (saque de até 80% do saldo).`);
    else notes.push("Acordo 484-A: multa 20% FGTS — informe o saldo para calcular.");
  }

  // 6) Descontos
  // INSS incide sobre verbas tributáveis (saldo + 13º). 13º é cálculo separado, mas para simplificar somamos.
  const baseINSS = earnings.filter((l) => l.taxable).reduce((s, l) => s + l.amount, 0);
  const inss = round2(calcINSS(baseINSS));
  if (inss > 0) {
    deductions.push({ label: "INSS sobre rescisão", amount: inss, detail: `Base R$ ${baseINSS.toFixed(2)}` });
  }
  const irrf = round2(calcIRRF(baseINSS, inss, input.dependentsIRRF || 0));
  if (irrf > 0) {
    deductions.push({
      label: "IRRF sobre rescisão",
      amount: irrf,
      detail: `Base R$ ${(baseINSS - inss).toFixed(2)}${input.dependentsIRRF ? ` · ${input.dependentsIRRF} dep. (R$ ${IRRF_DEPENDENT_DEDUCTION.toFixed(2)} cada)` : ""}`,
    });
  }

  const earningsTotal = round2(earnings.reduce((s, l) => s + l.amount, 0));
  const deductionsTotal = round2(deductions.reduce((s, l) => s + l.amount, 0));
  const net = round2(earningsTotal - deductionsTotal);

  return { earnings, deductions, earningsTotal, deductionsTotal, net, fgtsFine, notes };
}
