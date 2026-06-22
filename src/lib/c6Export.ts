import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";

export type C6BatchSource =
  | "payroll"
  | "weekly_bonus"
  | "internship"
  | "freelancer"
  | "rescission"
  | "training"
  | "other";

export interface C6PixRow {
  /** Nome do beneficiário (Nome do funcionário / recebedor) */
  name: string;
  /** Chave PIX cadastrada (CPF, e-mail, telefone, aleatória ou copia-e-cola) */
  pixKey: string;
  /** Tipo da chave PIX, quando conhecido. Usado para normalizar telefone (+55DDDNNNNNNNN). */
  pixKeyType?: "cpf" | "cnpj" | "email" | "phone" | "random" | string | null;
  /** Valor líquido a pagar */
  amount: number;
  /** Descrição livre (até ~140 chars) */
  description?: string;
  /** (opcional) Colaborador vinculado — usado pelo registro do lote */
  employeeId?: string | null;
  /** (opcional) Loja específica desta linha (sobrescreve a loja padrão do lote) */
  storeId?: string | null;
  /** (opcional) Categoria específica desta linha */
  categoryId?: string | null;
}

export interface ExportC6Options {
  /** Linhas a incluir. Quem não tiver pixKey/valor é descartado. */
  rows: C6PixRow[];
  /** Nome do arquivo final (sem extensão) */
  fileName: string;
  /** Data de pagamento (Date). Default: hoje. */
  paymentDate?: Date;
  /** Origem do lote (folha, bonificação, estágio, etc.). Default: 'other'. */
  source?: C6BatchSource;
  /** Identificador legível da origem (ex.: "Folha 2026-05", "Bonificação semana 17/05"). */
  sourceRef?: string;
  /** Loja padrão (usada na conciliação para gerar contas a pagar quando a linha não tem loja específica). */
  defaultStoreId?: string | null;
  /** Categoria financeira padrão. */
  defaultCategoryId?: string | null;
}


const formatDateBR = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/**
 * Remove acentos/diacríticos.
 */
const stripAccents = (s: string) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Higieniza Nome do recebedor:
 * sem acentos, apenas letras A-Z, números, espaço, hífen e ponto.
 */
const sanitizeText = (s: string) =>
  stripAccents(s ?? "")
    .replace(/[^A-Za-z0-9\s.\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Higieniza Descrição (mais restrito que nome).
 * O C6 rejeita acentos e símbolos. Mantém apenas letras A-Z, números e espaço.
 */
const sanitizeDescription = (s: string) =>
  stripAccents(s ?? "")
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizePhonePix = (value: string) => {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  return /^\d{2}[2-9]\d{7,8}$/.test(digits) ? `+55${digits}` : "";
};

const isValidEmailPix = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isValidRandomPix = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const isValidPixCopyPaste = (value: string) => value.startsWith("000201") && /br\.gov\.bcb\.pix/i.test(value);

const isValidCpf = (digits: string) => {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const calc = (size: number) => {
    const sum = digits
      .slice(0, size)
      .split("")
      .reduce((acc, n, idx) => acc + Number(n) * (size + 1 - idx), 0);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return calc(9) === Number(digits[9]) && calc(10) === Number(digits[10]);
};

const isValidCnpj = (digits: string) => {
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false;
  const calc = (size: number) => {
    const weights = size === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = digits
      .slice(0, size)
      .split("")
      .reduce((acc, n, idx) => acc + Number(n) * weights[idx], 0);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  return calc(12) === Number(digits[12]) && calc(13) === Number(digits[13]);
};

/**
 * Normaliza chave PIX conforme regras C6:
 *   - Telefone: sempre no formato +55DDDNNNNNNNN (regra #10)
 *   - CPF/CNPJ: apenas dígitos
 *   - E-mail: minúsculo, sem espaços
 *   - Aleatória / outras: apenas trim
 */
const normalizePixKey = (key: string, type?: string | null) => {
  const raw = (key ?? "").trim();
  if (!raw) return "";
  const t = (type ?? "").toLowerCase();

  if (t === "phone") {
    // Regra C6 #10: telefone sempre no formato +55DDDNNNNNNNN
    return normalizePhonePix(raw);
  }

  if (t === "cpf") {
    const digits = raw.replace(/\D/g, "");
    return isValidCpf(digits) ? digits : normalizePhonePix(raw);
  }
  if (t === "cnpj") {
    const digits = raw.replace(/\D/g, "");
    return isValidCnpj(digits) ? digits : "";
  }
  if (t === "email") return raw.toLowerCase().replace(/\s+/g, "");
  if (t === "random") return isValidRandomPix(raw) || isValidPixCopyPaste(raw) ? raw : "";

  // Auto-detecção quando o tipo não foi informado
  // E-mail
  if (isValidEmailPix(raw)) return raw.toLowerCase();

  // Apenas dígitos: pode ser telefone, CPF ou CNPJ
  const onlyDigits = raw.replace(/\D/g, "");
  if (onlyDigits && onlyDigits === raw.replace(/[\s().+-]/g, "")) {
    if (onlyDigits.length === 11 && isValidCpf(onlyDigits)) return onlyDigits;
    if (onlyDigits.length === 14 && isValidCnpj(onlyDigits)) return onlyDigits;
    if (onlyDigits.length === 10 || onlyDigits.length === 11 || onlyDigits.length === 12 || onlyDigits.length === 13) {
      // Telefone (com ou sem DDI)
      return normalizePhonePix(onlyDigits);
    }
  }

  // Telefone informado com + na origem
  if (/^\+\d{10,15}$/.test(raw)) {
    return normalizePhonePix(raw);
  }

  return isValidRandomPix(raw) || isValidPixCopyPaste(raw) ? raw : "";
};

/**
 * Gera o arquivo .xlsx no formato OFICIAL do C6 Bank
 * (template "Pagar salários via PIX", aba "PIX chave ou código"),
 * seguindo RIGOROSAMENTE as 14 regras de preenchimento do banco:
 *
 *   1. Template original preservado (cabeçalhos, validações, formatação).
 *   3. Dados a partir da linha 3.
 *   4. Sem linhas em branco entre pagamentos.
 *   5. Todos os campos obrigatórios preenchidos (Nome, Chave, Valor, Data).
 *   6. Caracteres especiais só na coluna "Chave PIX".
 *   7. Valor numérico com 2 casas decimais.
 *   8. Data pode ser hoje ou agendada (até 1 ano).
 *   9. Data no formato dd/mm/aaaa.
 *   10. Telefone no layout +55DDDNNNNNNNN.
 *   11-14. Descrição é o que aparece no comprovante.
 *
 * Layout (a partir da linha 3):
 *   A: Nome do recebedor
 *   B: Chave ou código Pix
 *   C: Valor (numérico, 2 casas)
 *   D: Data de pagamento (data Excel, formato dd/mm/aaaa)
 *   E: Descrição (opcional, até ~140 chars)
 */
export async function exportC6PixFile({
  rows,
  fileName,
  paymentDate,
  source,
  sourceRef,
  defaultStoreId,
  defaultCategoryId,
}: ExportC6Options): Promise<{ included: number; skipped: C6PixRow[]; batchId: string | null }> {
  // Pré-processa cada linha (normalização + sanitização)
  const prepared = rows.map((r) => {
    const name = sanitizeText(r.name);
    // No template oficial a descrição é opcional; deixamos em branco para evitar rejeição do validador C6.
    const finalDesc = "";
    return {
      name,
      pixKey: normalizePixKey(r.pixKey ?? "", r.pixKeyType),
      pixKeyType: r.pixKeyType ?? null,
      amount: Number((r.amount ?? 0).toFixed(2)),
      description: finalDesc,
      employeeId: r.employeeId ?? null,
      storeId: r.storeId ?? null,
      categoryId: r.categoryId ?? null,
      original: r,
    };
  });

  // Regra #5 — todos obrigatórios: nome, chave, valor > 0
  const valid = prepared.filter((r) => r.name !== "" && r.pixKey !== "" && r.amount > 0);
  const skipped = prepared
    .filter((r) => !(r.name !== "" && r.pixKey !== "" && r.amount > 0))
    .map((r) => r.original);

  if (valid.length === 0) {
    return { included: 0, skipped, batchId: null };
  }

  const resp = await fetch("/templates/c6-pagar-salarios-via-pix.xlsx");
  if (!resp.ok) throw new Error("Falha ao carregar template do C6");
  const buf = await resp.arrayBuffer();

  // Regra C6: cada aba precisa ter EXATAMENTE 100 linhas de dados (linhas 3..102).
  // Se houver mais de 100 pagamentos, descartamos o excedente para skipped.
  const MAX_ROWS = 100;
  const overflow = valid.length > MAX_ROWS ? valid.slice(MAX_ROWS).map((r) => r.original) : [];
  const finalValid = valid.slice(0, MAX_ROWS);
  skipped.push(...overflow);

  const effectivePaymentDate = paymentDate ?? new Date();
  const paymentDateText = formatDateBR(effectivePaymentDate);
  const zip = await JSZip.loadAsync(buf);
  const mainSheet = zip.file("xl/worksheets/sheet2.xml");
  if (!mainSheet) throw new Error(`Aba "PIX chave ou código" não encontrada no template`);

  const textCell = (ref: string, style: number, value?: string) =>
    value
      ? `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`
      : `<c r="${ref}" s="${style}"/>`;
  const numberCell = (ref: string, style: number, value?: number) =>
    typeof value === "number" ? `<c r="${ref}" s="${style}"><v>${value.toFixed(2)}</v></c>` : `<c r="${ref}" s="${style}"/>`;
  const replaceRowCells = (xml: string, row: number, cells: string) =>
    xml.replace(new RegExp(`(<row\\b[^>]*\\br="${row}"[^>]*>)[\\s\\S]*?(</row>)`), `$1${cells}$2`);

  let sheetXml = await mainSheet.async("string");
  for (let i = 0; i < MAX_ROWS; i++) {
    const row = 3 + i;
    const r = finalValid[i];
    const isLastDataRow = row === 102;
    sheetXml = replaceRowCells(
      sheetXml,
      row,
      r
        ? [
            textCell(`A${row}`, isLastDataRow ? 40 : 7, r.name),
            textCell(`B${row}`, isLastDataRow ? 41 : 30, r.pixKey),
            numberCell(`C${row}`, 31, r.amount),
            textCell(`D${row}`, isLastDataRow ? 40 : 7, paymentDateText),
            textCell(`E${row}`, isLastDataRow ? 40 : 7, r.description),
          ].join("")
        : [
            textCell(`A${row}`, isLastDataRow ? 40 : 7),
            textCell(`B${row}`, isLastDataRow ? 41 : 30),
            numberCell(`C${row}`, 31),
            textCell(`D${row}`, isLastDataRow ? 40 : 7),
            textCell(`E${row}`, isLastDataRow ? 40 : 7),
          ].join("")
    );
  }

  const totalNum = finalValid.reduce((sum, r) => sum + r.amount, 0);
  const total = totalNum.toFixed(2);
  sheetXml = sheetXml.replace(/(<c r="C103"[^>]*><f>SUM\(C3:C102\)<\/f><v>)[^<]*(<\/v><\/c>)/, `$1${total}$2`);
  zip.file("xl/worksheets/sheet2.xml", sheetXml);

  // Registra o lote no banco (best-effort, não bloqueia o download)
  let batchId: string | null = null;
  try {
    const isoDate = `${effectivePaymentDate.getFullYear()}-${String(effectivePaymentDate.getMonth() + 1).padStart(2, "0")}-${String(effectivePaymentDate.getDate()).padStart(2, "0")}`;
    const { data: { user } } = await supabase.auth.getUser();
    const { data: batch, error: batchErr } = await supabase
      .from("c6_payment_batches" as any)
      .insert({
        source: source ?? "other",
        source_ref: sourceRef ?? null,
        payment_date: isoDate,
        total: Number(total),
        line_count: finalValid.length,
        file_name: `${fileName}.xlsx`,
        category_id: defaultCategoryId ?? null,
        default_store_id: defaultStoreId ?? null,
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();
    if (batchErr) throw batchErr;
    batchId = (batch as any)?.id ?? null;
    if (batchId) {
      const lines = finalValid.map((r) => ({
        batch_id: batchId,
        name: r.name,
        pix_key: r.pixKey,
        pix_key_type: r.pixKeyType,
        amount: r.amount,
        description: r.description || null,
        employee_id: r.employeeId,
        store_id: r.storeId,
        category_id: r.categoryId,
      }));
      const { error: linesErr } = await supabase.from("c6_payment_batch_lines" as any).insert(lines);
      if (linesErr) throw linesErr;
    }
  } catch (err) {
    console.warn("[c6Export] Falha ao registrar lote (download segue):", err);
  }

  const out = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(out);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileName}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  return { included: finalValid.length, skipped, batchId };
}

