import { describe, it, expect } from "vitest";
import { calcRescission } from "@/lib/rescissionCalc";

const base = {
  salary: 3000,
  hireDate: "2023-01-10",
  terminationDate: "2026-06-20",
};

const findLine = (lines: { label: string; amount: number }[], label: string) =>
  lines.find((l) => l.label.toLowerCase().includes(label.toLowerCase()));

describe("calcRescission", () => {
  it("calcula saldo de salário proporcional aos dias trabalhados", () => {
    const r = calcRescission({ ...base, reason: "dismissal_without_cause" });
    const saldo = findLine(r.earnings, "Saldo de salário");
    expect(saldo).toBeDefined();
    // 20 dias × (3000 / 30) = 2000
    expect(saldo!.amount).toBeCloseTo(2000, 2);
  });

  it("justa causa não gera 13º proporcional, férias nem aviso", () => {
    const r = calcRescission({ ...base, reason: "dismissal_with_cause" });
    expect(findLine(r.earnings, "13º salário proporcional")).toBeUndefined();
    expect(findLine(r.earnings, "Férias proporcionais")).toBeUndefined();
    expect(findLine(r.earnings, "Aviso prévio")).toBeUndefined();
    expect(r.fgtsFine).toBeUndefined();
  });

  it("dispensa sem justa causa paga aviso prévio com 3 dias por ano completo", () => {
    const r = calcRescission({ ...base, reason: "dismissal_without_cause" });
    const aviso = findLine(r.earnings, "Aviso prévio indenizado");
    expect(aviso).toBeDefined();
    // 3 anos completos → 30 + 9 = 39 dias × 100/dia
    expect(aviso!.amount).toBeCloseTo(3900, 2);
  });

  it("aviso prévio é limitado a 90 dias", () => {
    const r = calcRescission({
      salary: 3000,
      hireDate: "1995-01-10",
      terminationDate: "2026-06-20",
      reason: "dismissal_without_cause",
    });
    const aviso = findLine(r.earnings, "Aviso prévio indenizado");
    expect(aviso!.amount).toBeCloseTo(9000, 2); // 90 dias × 100
  });

  it("acordo 484-A paga metade do aviso e multa de 20% do FGTS", () => {
    const semAcordo = calcRescission({ ...base, reason: "dismissal_without_cause" });
    const acordo = calcRescission({ ...base, reason: "mutual_agreement_484a", fgtsBalance: 10000 });
    const avisoCheio = findLine(semAcordo.earnings, "Aviso prévio indenizado")!.amount;
    const avisoMetade = findLine(acordo.earnings, "Aviso prévio indenizado")!.amount;
    expect(avisoMetade).toBeCloseTo(avisoCheio / 2, 2);
    expect(acordo.fgtsFine).toBeCloseTo(2000, 2);
  });

  it("dispensa sem justa causa calcula multa de 40% do FGTS informado", () => {
    const r = calcRescission({ ...base, reason: "dismissal_without_cause", fgtsBalance: 10000 });
    expect(r.fgtsFine).toBeCloseTo(4000, 2);
  });

  it("pedido de demissão não gera aviso indenizado nem multa de FGTS", () => {
    const r = calcRescission({ ...base, reason: "employee_resignation", fgtsBalance: 10000 });
    expect(findLine(r.earnings, "Aviso prévio indenizado")).toBeUndefined();
    expect(r.fgtsFine).toBeUndefined();
  });

  it("líquido é sempre proventos menos descontos e nunca fica indefinido", () => {
    const r = calcRescission({ ...base, reason: "dismissal_without_cause" });
    expect(r.net).toBeCloseTo(r.earningsTotal - r.deductionsTotal, 2);
    expect(Number.isFinite(r.net)).toBe(true);
  });

  it("salário zero ou inválido não quebra o cálculo", () => {
    const r = calcRescission({ ...base, salary: 0, reason: "dismissal_without_cause" });
    expect(r.earningsTotal).toBe(0);
    expect(r.deductionsTotal).toBe(0);
    expect(r.net).toBe(0);
  });
});
