import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }) }) },
}));

import { resolveFactor, readyToRaw, getPreparoFactor, type ProductConversion } from "@/lib/conversions";

const conv = (partial: Partial<ProductConversion>): ProductConversion => ({
  id: Math.random().toString(36).slice(2),
  product_id: "p1",
  conversion_type: "compra",
  from_unit: "CX",
  from_qty: 1,
  to_unit: "KG",
  to_qty: 10,
  is_default: false,
  notes: null,
  ...partial,
});

describe("resolveFactor", () => {
  it("retorna 1 quando as unidades são iguais (ignorando caixa)", () => {
    expect(resolveFactor([], "kg", "KG")).toBe(1);
  });

  it("resolve o fator direto", () => {
    const list = [conv({ from_unit: "CX", from_qty: 1, to_unit: "KG", to_qty: 12 })];
    expect(resolveFactor(list, "CX", "KG")).toBe(12);
  });

  it("prefere a conversão marcada como padrão", () => {
    const list = [
      conv({ from_unit: "CX", to_unit: "KG", from_qty: 1, to_qty: 8 }),
      conv({ from_unit: "CX", to_unit: "KG", from_qty: 1, to_qty: 10, is_default: true }),
    ];
    expect(resolveFactor(list, "CX", "KG")).toBe(10);
  });

  it("resolve o fator inverso quando só existe o caminho contrário", () => {
    const list = [conv({ from_unit: "KG", from_qty: 4, to_unit: "CX", to_qty: 1 })];
    expect(resolveFactor(list, "CX", "KG")).toBe(4);
  });

  it("respeita o filtro por tipo de conversão", () => {
    const list = [conv({ conversion_type: "preparo", from_unit: "KG", to_unit: "G", from_qty: 1, to_qty: 1000 })];
    expect(resolveFactor(list, "KG", "G", "compra")).toBeNull();
    expect(resolveFactor(list, "KG", "G", "preparo")).toBe(1000);
  });

  it("retorna null quando não há conversão cadastrada", () => {
    expect(resolveFactor([], "CX", "KG")).toBeNull();
  });
});

describe("readyToRaw", () => {
  it("converte quantidade pronta em quantidade crua usando o fator de preparo", () => {
    const list = [conv({ conversion_type: "preparo", from_qty: 1, to_qty: 0.8, is_default: true })];
    // rendimento 80%: para 800g prontos são necessários 1000g crus
    expect(readyToRaw(list, 800)).toBeCloseTo(1000, 6);
  });

  it("devolve a mesma quantidade quando não há fator de preparo", () => {
    expect(readyToRaw([], 500)).toBe(500);
  });

  it("não divide por zero quando o fator é inválido", () => {
    const list = [conv({ conversion_type: "preparo", from_qty: 1, to_qty: 0 })];
    expect(readyToRaw(list, 500)).toBe(500);
  });
});

describe("getPreparoFactor", () => {
  it("prioriza o preparo padrão", () => {
    const a = conv({ conversion_type: "preparo", to_qty: 0.5 });
    const b = conv({ conversion_type: "preparo", to_qty: 0.9, is_default: true });
    expect(getPreparoFactor([a, b])).toBe(b);
  });

  it("retorna null sem conversões de preparo", () => {
    expect(getPreparoFactor([conv({ conversion_type: "compra" })])).toBeNull();
  });
});
