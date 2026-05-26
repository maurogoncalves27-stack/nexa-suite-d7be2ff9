import * as XLSX from "xlsx";

// ---------------- Types ----------------
export interface ComplementOption {
  id: string;
  group_id: string;
  name: string;
  price: number;
  sort_order: number;
}
export interface ComplementGroup {
  id: string;
  recipe_id: string;
  name: string;
  is_required: boolean;
  sort_order: number;
  options: ComplementOption[];
}
export interface MenuItem {
  product_id: string;
  recipe_id: string | null;
  name: string;
  category: string;
  price: number;
  pos_item_name: string | null;
  groups: ComplementGroup[];
}

export interface SaiposComplement {
  complement: string;
  option: string;
  price: number;
}
export interface SaiposDish {
  name: string;
  category: string;
  price: number;
  saipos_code: string;
  complements: SaiposComplement[];
}

// ---------------- Helpers ----------------
export const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const parsePrice = (raw: unknown): number => {
  if (typeof raw === "number") return raw;
  if (typeof raw !== "string") return 0;
  const cleaned = raw
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};

export const splitComplement = (raw: string) => {
  const idx = raw.indexOf(" - ");
  if (idx === -1) return { complement: "", option: raw.trim() };
  return {
    complement: raw.slice(0, idx).trim(),
    option: raw.slice(idx + 3).trim(),
  };
};

/** Parses a Saipos XLSX file into a deduped/sorted list of dishes. */
export async function parseSaiposXlsx(file: File): Promise<SaiposDish[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  const map = new Map<string, SaiposDish>();
  for (const r of rows) {
    const tipo = String(r["Tipo"] ?? "").trim().toUpperCase();
    const inativo = String(r["Inativo"] ?? "Ativo").trim().toLowerCase();
    if (inativo === "inativo") continue;
    const codigoFull = String(r["Código Saipos"] ?? "").trim();
    const baseCode = codigoFull.split(".")[0];
    const category = String(r["Categoria"] ?? "").trim();
    const name = String(r["Descrição"] ?? "").trim();
    const price = parsePrice(r["Preço"]);
    const complementoRaw = String(r["Complemento"] ?? "").trim();
    if (!baseCode || !name) continue;
    if (tipo === "PRATO") {
      const existing = map.get(baseCode);
      map.set(baseCode, {
        name,
        category,
        price,
        saipos_code: baseCode,
        complements: existing?.complements ?? [],
      });
    } else if (tipo === "COMPLEMENTO") {
      const parent = map.get(baseCode) ?? {
        name,
        category,
        price: 0,
        saipos_code: baseCode,
        complements: [],
      };
      if (complementoRaw && complementoRaw !== "-") {
        const split = splitComplement(complementoRaw);
        parent.complements.push({ ...split, price });
      }
      map.set(baseCode, parent);
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    (a.category + a.name).localeCompare(b.category + b.name, "pt-BR"),
  );
}
