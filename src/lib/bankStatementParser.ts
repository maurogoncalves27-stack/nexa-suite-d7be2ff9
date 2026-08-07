// Parser genérico de extratos bancários em CSV / XLS / XLSX (C6 Bank, entre outros).
// Converte para o mesmo formato do OFX para reaproveitar a conciliação.
import * as XLSX from "xlsx";
import type { ParsedOfx, OfxTransaction } from "./ofxParser";

const norm = (s: string) =>
  s
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const DATE_KEYS = ["data", "data lancamento", "data do lancamento", "data mov", "data movimento", "dt", "data da transacao"];
const DESC_KEYS = ["descricao", "historico", "lancamento", "detalhe", "memo", "descricao do lancamento", "titulo"];
const VALUE_KEYS = ["valor", "valor (r$)", "valor r$", "montante", "vlr", "valor do lancamento"];
const DEBIT_KEYS = ["debito", "saida", "saidas", "valor debito"];
const CREDIT_KEYS = ["credito", "entrada", "entradas", "valor credito"];
const DOC_KEYS = ["documento", "doc", "numero do documento", "identificador", "id"];

function findIdx(header: string[], keys: string[]): number {
  const h = header.map(norm);
  for (const k of keys) {
    const i = h.indexOf(k);
    if (i >= 0) return i;
  }
  for (let i = 0; i < h.length; i++) {
    if (keys.some((k) => h[i].includes(k))) return i;
  }
  return -1;
}

function parseDate(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, "0")}-${String(raw.getDate()).padStart(2, "0")}`;
  }
  if (typeof raw === "number") {
    // serial de data do Excel
    const d = XLSX.SSF.parse_date_code(raw);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(raw).trim();
  let m = s.match(/^(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})[\/\-.](\d{2})[\/\-.](\d{2})$/);
  if (m) return `20${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function parseAmount(raw: unknown): number {
  if (raw == null || raw === "") return NaN;
  if (typeof raw === "number") return raw;
  let s = String(raw).trim();
  const negative = /^\(.*\)$/.test(s) || /(^|\s)-/.test(s) || /\bD\b\s*$/i.test(s);
  s = s.replace(/[()]/g, "").replace(/[Rr]\$\s?/g, "").replace(/\s/g, "").replace(/[CDcd]$/g, "");
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  s = s.replace(/[^0-9.\-]/g, "");
  const n = parseFloat(s);
  if (Number.isNaN(n)) return NaN;
  return negative && n > 0 ? -n : n;
}

// Hash determinístico (djb2) para gerar fit_id estável quando o arquivo não traz um.
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

function sheetToRows(file: ArrayBuffer | string, isText: boolean): unknown[][] {
  const wb = isText
    ? XLSX.read(file as string, { type: "string", raw: false, cellDates: true })
    : XLSX.read(file as ArrayBuffer, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, raw: false });
}

export function parseBankStatementRows(rows: unknown[][]): ParsedOfx {
  // Localiza a linha de cabeçalho (a primeira que tenha data + (valor ou débito/crédito))
  let headerIdx = -1;
  let idx = { date: -1, desc: -1, value: -1, debit: -1, credit: -1, doc: -1 };
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const header = (rows[i] || []).map((c) => (c == null ? "" : String(c)));
    if (header.filter(Boolean).length < 2) continue;
    const cand = {
      date: findIdx(header, DATE_KEYS),
      desc: findIdx(header, DESC_KEYS),
      value: findIdx(header, VALUE_KEYS),
      debit: findIdx(header, DEBIT_KEYS),
      credit: findIdx(header, CREDIT_KEYS),
      doc: findIdx(header, DOC_KEYS),
    };
    if (cand.date >= 0 && (cand.value >= 0 || cand.debit >= 0 || cand.credit >= 0)) {
      headerIdx = i;
      idx = cand;
      break;
    }
  }
  if (headerIdx < 0) {
    throw new Error(
      "Não encontrei as colunas de data e valor no arquivo. Exporte o extrato em CSV pelo internet banking (colunas Data, Descrição e Valor).",
    );
  }

  const transactions: OfxTransaction[] = [];
  const seen = new Map<string, number>();

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const postedAt = parseDate(row[idx.date]);
    if (!postedAt) continue;

    let amount = NaN;
    if (idx.value >= 0) amount = parseAmount(row[idx.value]);
    if (Number.isNaN(amount) && (idx.debit >= 0 || idx.credit >= 0)) {
      const d = idx.debit >= 0 ? parseAmount(row[idx.debit]) : NaN;
      const c = idx.credit >= 0 ? parseAmount(row[idx.credit]) : NaN;
      if (!Number.isNaN(c) && c !== 0) amount = Math.abs(c);
      else if (!Number.isNaN(d) && d !== 0) amount = -Math.abs(d);
    }
    if (Number.isNaN(amount)) continue;

    const memo = idx.desc >= 0 ? String(row[idx.desc] ?? "").trim() : "";
    const doc = idx.doc >= 0 ? String(row[idx.doc] ?? "").trim() : "";

    const base = `${postedAt}|${amount.toFixed(2)}|${norm(memo)}|${doc}`;
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);

    transactions.push({
      fitId: doc ? `${postedAt.replace(/-/g, "")}${doc}-${occurrence}` : `CSV${hash(base)}-${occurrence}`,
      postedAt,
      amount,
      trnType: amount < 0 ? "DEBIT" : "CREDIT",
      memo,
      checkNumber: doc || null,
      payee: null,
    });
  }

  if (transactions.length === 0) {
    throw new Error("Nenhuma transação válida encontrada no arquivo.");
  }

  const dates = transactions.map((t) => t.postedAt).sort();

  return {
    bankId: null,
    accountId: null,
    accountType: null,
    periodStart: dates[0],
    periodEnd: dates[dates.length - 1],
    openingBalance: null,
    closingBalance: null,
    transactions,
  };
}

export async function parseBankStatementFile(file: File): Promise<ParsedOfx> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv" || ext === "txt") {
    let text = await file.text();
    // Remove BOM
    text = text.replace(/^\uFEFF/, "");
    return parseBankStatementRows(sheetToRows(text, true));
  }
  const buf = await file.arrayBuffer();
  return parseBankStatementRows(sheetToRows(buf, false));
}
