// Parser genérico de folha de pagamento (XLS/XLSX/PDF)
// Extrai blocos por colaborador identificando matrícula, nome, cargo e rubricas detalhadas.
import * as XLSX from "xlsx";

export type RubricKind = "earning" | "deduction" | "informative";

export interface ParsedRubric {
  code: string | null;
  description: string;
  reference: string | null;
  kind: RubricKind;
  value: number;
}

export type EntryStatus = "active" | "termination" | "leave_inss";

export interface ParsedBlock {
  registration_number: string | null;
  full_name: string;
  cpf: string | null;
  position: string | null;
  admission_date: string | null;
  rubrics: ParsedRubric[];
  // Totais consolidados
  salary: number;
  total_earnings: number;
  total_discounts: number;
  net_amount: number;
  // Descontos típicos (mantidos para compat com a tabela existente)
  advance_discount: number;
  food_voucher_discount: number;
  vt_discount: number;
  health_plan_discount: number;
  inss_discount: number;
  irrf_discount: number;
  fgts_base: number;
  fgts_value: number;
  other_discounts: number;
  // Situação detectada no holerite
  entry_status: EntryStatus;
}

export interface ParsedPayroll {
  competence: string | null; // MM/YYYY
  blocks: ParsedBlock[];
}

// ----------------- Helpers -----------------
const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export const toNumberBR = (v: any): number => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  let s = String(v).trim();
  if (!s) return 0;
  s = s.replace(/[R$\s]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

const isHeaderName = (t: string) => {
  const u = t.toUpperCase().trim();
  // Razão social/nome de escritório de contabilidade que emite a folha
  // (aparece no cabeçalho do PDF e não deve ser tratado como colaborador)
  if (/\bCONTABIL(IDADE)?\b/.test(u)) return true;
  if (/\bEXACT\b/.test(u)) return true;
  if (/\b(LTDA|ME|EPP|EIRELI|S\.?\/?A|MEI)\b/.test(u)) return true;
  if (/\bESCRIT[ÓO]RIO\b/.test(u)) return true;
  return [
    "TRABALHADORES", "PROVENTOS", "DESCONTOS", "FOLHA DE PAGAMENTO",
    "COMPETÊN", "COMPETEN", "EMPRESA", "CNPJ", "TOTAL GERAL",
    "BASE DE CÁLCULO", "BASE DE CALCULO", "REFERÊNCIA", "REFERENCIA",
    "MATRÍCULA", "MATRICULA", "COLABORADOR", "FUNCIONÁRIO", "FUNCIONARIO",
    "CARGO", "FUNÇÃO", "FUNCAO", "ADMISSÃO", "ADMISSAO", "SALÁRIO", "SALARIO",
    "LÍQUIDO", "LIQUIDO", "INSS", "IRRF", "FGTS", "VALE", "ADIANTAMENTO",
    "TOTAL", "TOTAIS", "RESUMO",
  ].some((k) => u.startsWith(k));
};

const isEmployeeNameLine = (s: string) => {
  const t = s.trim();
  if (!t || t.length < 5 || t.length > 80) return false;
  if (/\d/.test(t)) return false;
  if (!/\s/.test(t)) return false;
  if (isHeaderName(t)) return false;
  const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length === 0) return false;
  const upper = letters.replace(/[^A-ZÀ-Ý]/g, "");
  return upper.length / letters.length > 0.85;
};

const cleanPossibleEmployeeName = (text: string): string => {
  return text
    .replace(/\bCPF\b.*$/i, "")
    .replace(/\b(?:CARGO|FUN[ÇC][ÃA]O|ADMISS[ÃA]O|DATA\s+ADMISS[ÃA]O|SAL[ÁA]RIO)\b.*$/i, "")
    .replace(/\d{2}\/\d{2}\/\d{4}.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
};

const findEmployeeStart = (cells: string[], joined: string, current: ParsedBlock | null): {
  registration_number: string | null;
  full_name: string;
  cpf: string | null;
} | null => {
  const cpfMatch = joined.match(/(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/);
  const cpf = cpfMatch ? cpfMatch[1].replace(/\D/g, "") : null;
  const registration = cells.find((c) => /^\d{2,8}$/.test(c)) ?? null;
  const nameCell = cells.find(isEmployeeNameLine);
  const hasCurrencyLikeValue = /(?:^|\s)-?\d{1,3}(?:\.\d{3})*,\d{2}(?:\s|$)/.test(joined);
  const hasEmployeeContext = /MATR[IÍ]CULA|CPF|COLABORADOR|FUNCION[ÁA]RIO|EMPREGADO|TRABALHADOR/i.test(joined);

  if (nameCell && !hasCurrencyLikeValue && (registration || cpf || hasEmployeeContext || !current || !current.full_name)) {
    return { registration_number: registration, full_name: nameCell.trim(), cpf };
  }

  if (hasCurrencyLikeValue && !hasEmployeeContext) return null;

  const compact = joined.match(/^(\d{2,8})\s+(.+)$/);
  if (compact) {
    const name = cleanPossibleEmployeeName(compact[2]);
    if (isEmployeeNameLine(name)) {
      return { registration_number: compact[1], full_name: name, cpf };
    }
  }

  return null;
};

const isRegistrationRubricLine = (cells: string[]): boolean => {
  if (!/^\d{2,8}$/.test(cells[0] ?? "")) return false;
  if (cells.length < 2) return false;
  return /^\d{1,5}\s+/.test(cells[1]);
};

// Heurística de classificação por descrição da rubrica (fallback quando não há código mapeado)
const classifyByText = (desc: string): { kind: RubricKind; bucket?: keyof ParsedBlock } => {
  const d = norm(desc);
  if (!d) return { kind: "informative" };

  // Bases informativas (FGTS é base / valor; tratamos especial fora)
  if (/base.*fgts|fgts.*base/.test(d)) return { kind: "informative", bucket: "fgts_base" };
  if (/^fgts\b|fgts (mes|mês|sobre)/.test(d) || /\bfgts\b/.test(d) && !/desc/.test(d))
    return { kind: "informative", bucket: "fgts_value" };
  if (/base.*inss|inss.*base/.test(d)) return { kind: "informative" };
  if (/base.*irrf|irrf.*base/.test(d)) return { kind: "informative" };

  // Descontos
  if (/adiantamento/.test(d)) return { kind: "deduction", bucket: "advance_discount" };
  if (/vale.*alimenta|\bva\b|alimenta/.test(d)) return { kind: "deduction", bucket: "food_voucher_discount" };
  if (/vale.*transp|\bvt\b|transporte/.test(d)) return { kind: "deduction", bucket: "vt_discount" };
  if (/plano.*sa[uú]de|\bsa[uú]de\b|odonto/.test(d)) return { kind: "deduction", bucket: "health_plan_discount" };
  if (/inss/.test(d) && !/base/.test(d)) return { kind: "deduction", bucket: "inss_discount" };
  if (/irrf|imposto.*renda|i\.?r\.?\b/.test(d) && !/base/.test(d)) return { kind: "deduction", bucket: "irrf_discount" };
  if (/desc/.test(d) || /pens[aã]o/.test(d) || /falta/.test(d) || /atraso/.test(d))
    return { kind: "deduction", bucket: "other_discounts" };

  // Proventos
  if (/sal[aá]rio/.test(d)) return { kind: "earning", bucket: "salary" };
  if (/produt|hora.*extra|adicional|comiss|gratific|prem|bonus|bônus|insalubr|periculos|dsr|ferias|f[eé]rias|aviso.*indenizado|abono|saldo.*sal[aá]rio/.test(d))
    return { kind: "earning" };

  return { kind: "informative" };
};

// Acumula uma rubrica extraída no bucket correspondente do bloco
const applyRubric = (block: ParsedBlock, rubric: ParsedRubric) => {
  block.rubrics.push(rubric);
  const cls = classifyByText(rubric.description);
  // FGTS sempre vai pro bucket informativo
  if (cls.bucket === "fgts_base") { block.fgts_base = Math.max(block.fgts_base, rubric.value); return; }
  if (cls.bucket === "fgts_value") { block.fgts_value = Math.max(block.fgts_value, rubric.value); return; }
  if (rubric.kind === "informative") return;
  if (cls.bucket && typeof (block as any)[cls.bucket] === "number") {
    (block as any)[cls.bucket] += rubric.value;
  } else if (rubric.kind === "deduction") {
    block.other_discounts += rubric.value;
  }
};

const discountCodes = new Set(["80", "81", "89", "100", "129", "300", "316", "391", "999", "0999", "1074", "1075"]);

const parseRubricsFromCells = (block: ParsedBlock, cells: string[]): boolean => {
  const tokens = cells.flatMap((cell) =>
    cell
      .replace(/\s+/g, " ")
      .replace(/(\d{1,3}(?:\.\d{3})*,\d{2})\s+(?=\d{1,5}\s+[A-ZÀ-Ý])/g, "$1§")
      .split("§")
      .map((part) => part.trim())
      .filter(Boolean)
  );
  let current: { code: string; description: string; numbers: string[] } | null = null;
  let parsed = false;

  const flushRubric = () => {
    if (!current || current.numbers.length === 0) return;
    const value = Math.abs(toNumberBR(current.numbers[current.numbers.length - 1]));
    if (!value) return;
    const description = current.description.trim();
    if (!description || isHeaderName(description)) return;
    const cls = classifyByText(description);
    applyRubric(block, {
      code: current.code,
      description,
      reference: current.numbers.length >= 2 ? current.numbers[current.numbers.length - 2] : null,
      kind: discountCodes.has(current.code) ? "deduction" : cls.kind,
      value,
    });
    parsed = true;
  };

  for (const token of tokens) {
    const rubricStart = token.match(/^(\d{1,5})\s+(.+)$/);
    if (rubricStart && !/^\d{1,5}\s*,\d{2}$/.test(token)) {
      flushRubric();
      current = { code: rubricStart[1], description: rubricStart[2].trim(), numbers: [] };
      continue;
    }
    if (current && /^-?\d{1,3}(?:\.\d{3})*,\d{2}$|^-?\d+,\d{2}$/.test(token)) {
      current.numbers.push(token);
      continue;
    }
    if (current && !isHeaderName(token) && !/^[:/]+$/.test(token)) {
      current.description = `${current.description} ${token}`.trim();
    }
  }

  flushRubric();
  return parsed;
};

const finalize = (block: ParsedBlock) => {
  const earnings = block.rubrics.filter((r) => r.kind === "earning").reduce((a, r) => a + r.value, 0);
  const deductions = block.rubrics.filter((r) => r.kind === "deduction").reduce((a, r) => a + r.value, 0);
  block.total_earnings = earnings || block.salary;
  block.total_discounts = deductions ||
    (block.advance_discount + block.food_voucher_discount + block.vt_discount +
      block.health_plan_discount + block.inss_discount + block.irrf_discount + block.other_discounts);
  block.net_amount = Math.max(0, block.total_earnings - block.total_discounts);
};

const newBlock = (): ParsedBlock => ({
  registration_number: null, full_name: "", cpf: null, position: null, admission_date: null,
  rubrics: [], salary: 0, total_earnings: 0, total_discounts: 0, net_amount: 0,
  advance_discount: 0, food_voucher_discount: 0, vt_discount: 0, health_plan_discount: 0,
  inss_discount: 0, irrf_discount: 0, fgts_base: 0, fgts_value: 0, other_discounts: 0,
  entry_status: "active",
});

// ----------------- Parser principal por matriz de células / linhas -----------------
// Aceita tanto matriz vinda de XLSX (any[][]) quanto array de linhas de texto (de PDF)
// Marca o início da seção de totalização da empresa que aparece no fim do PDF/XLS.
// A partir dessa marca o parser para de processar para evitar criar um "colaborador fantasma"
// com os totais consolidados (TOTAL GERAL, RESUMO DA FOLHA, BASES DA EMPRESA etc.).
const isTotalsBoundary = (text: string): boolean => {
  const u = text.toUpperCase();
  // Apenas marcadores claramente AGREGADOS DA EMPRESA (não por colaborador).
  // Evitar termos genéricos como "TOTAL DA FOLHA" / "RESUMO" porque muitos
  // layouts repetem isso por colaborador, o que truncaria o parsing após o
  // primeiro funcionário.
  return [
    "TOTAL GERAL DA EMPRESA",
    "TOTAIS GERAIS DA EMPRESA",
    "RESUMO DA EMPRESA",
    "RESUMO GERAL DA EMPRESA",
    "TOTAL DA EMPRESA",
    "TOTAIS DA EMPRESA",
    "BASES DA EMPRESA",
    "BASE DA EMPRESA",
    "ENCARGOS DA EMPRESA",
    "RESUMO POR DEPARTAMENTO",
    "RESUMO POR LOTACAO",
    "RESUMO POR LOTAÇÃO",
    "TOTALIZACAO DA EMPRESA",
    "TOTALIZAÇÃO DA EMPRESA",
  ].some((k) => u.includes(k));
};

const parseFromLines = (lines: string[][]): ParsedPayroll => {
  let competence: string | null = null;
  const blocks: ParsedBlock[] = [];
  let cur: ParsedBlock | null = null;
  let waitingPosition = false;
  let pendingNameFromRegistration = false;

  const flush = () => {
    if (cur && cur.full_name) {
      finalize(cur);
      blocks.push(cur);
    }
    cur = null;
  };

  for (const row of lines) {
    if (!row || row.length === 0) continue;
    let cells = row.map((c) => (c == null ? "" : String(c).trim())).filter((c) => c !== "");
    if (cells.length === 0) continue;
    let joined = cells.join(" ").replace(/\s+/g, " ").trim();
    if (!joined) continue;

    // Atingiu a seção de totalização final → encerra o parsing.
    if (isTotalsBoundary(joined)) {
      flush();
      break;
    }

    if (cur && pendingNameFromRegistration) {
      const maybeName = cells.find(isEmployeeNameLine) ?? (isEmployeeNameLine(joined) ? joined : null);
      if (maybeName) {
        cur.full_name = maybeName.trim();
        pendingNameFromRegistration = false;
        waitingPosition = true;
        continue;
      }
    }

    // Competência (uma única vez)
    if (!competence) {
      const m = joined.match(/COMPET[ÊE]NCIA\s*[:\-]?\s*(\d{2})\s*[\/\-]\s*(\d{4})/i);
      if (m) competence = `${m[1]}/${m[2]}`;
      else {
        const m2 = joined.match(/(\d{2})\/(\d{4})/);
        if (m2 && /folha|pagamento|recibo|holerite/i.test(joined)) competence = `${m2[1]}/${m2[2]}`;
      }
    }

    // Detecta bloco pelo padrão "Matrícula: 1234 - NOME COMPLETO" / "Matricula 1234 NOME"
    const matric = joined.match(/MATR[IÍ]CULA\s*[:\-]?\s*(\d{2,8})\s*[-–]?\s*([A-ZÀ-Ý][A-ZÀ-Ý\s.\-]{4,})?/i);
    if (matric) {
      flush();
      cur = newBlock();
      cur.registration_number = matric[1];
      if (matric[2]) cur.full_name = matric[2].trim();
      else pendingNameFromRegistration = true; // nome pode vir na próxima linha
      // CPF se aparecer na mesma linha
      const cpfMatch = joined.match(/(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/);
      if (cpfMatch) cur.cpf = cpfMatch[1].replace(/\D/g, "");
      continue;
    }

    if (isRegistrationRubricLine(cells)) {
      flush();
      cur = newBlock();
      cur.registration_number = cells[0];
      pendingNameFromRegistration = true;
      waitingPosition = false;
      cells = cells.slice(1);
      joined = cells.join(" ").replace(/\s+/g, " ").trim();
    }

    // Quando não tem matrícula explícita, detecta pelo nome em maiúsculas
    const employeeStart = findEmployeeStart(cells, joined, cur);
    if (employeeStart) {
      const isSameEmployee = cur?.full_name && norm(cur.full_name) === norm(employeeStart.full_name);
      if (!isSameEmployee) {
        flush();
        cur = newBlock();
      } else if (!cur) {
        cur = newBlock();
      }
      cur.full_name = employeeStart.full_name;
      if (employeeStart.registration_number && !cur.registration_number) cur.registration_number = employeeStart.registration_number;
      if (employeeStart.cpf && !cur.cpf) cur.cpf = employeeStart.cpf;
      waitingPosition = true;
      continue;
    }

    if (!cur) continue;

    // Preencher cargo após nome
    if (waitingPosition && !cur.position) {
      const candidate = cells.find((c) =>
        c && !/\d/.test(c) && !/admiss/i.test(c) && !/sal[áa]rio/i.test(c) && c.length > 2
      );
      if (candidate) {
        cur.position = candidate;
        waitingPosition = false;
        continue;
      }
    }

    // Admissão
    const adm = joined.match(/Admiss[ãa]o\s*(?:em)?\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (adm) {
      const [d, m, y] = adm[1].split("/");
      cur.admission_date = `${y}-${m}-${d}`;
      continue;
    }

    // Linha de rubrica: tipicamente [código] [descrição] [referência] [valor] (e talvez [base])
    if (parseRubricsFromCells(cur, cells)) continue;

    // Aceita: primeiro item numérico curto = código, último número decimal = valor
    const codeMatch = cells[0].match(/^(\d{1,5})$/);
    const numbers: { idx: number; value: number }[] = [];
    cells.forEach((c, i) => {
      if (/^-?[\d.,]+$/.test(c)) {
        const n = toNumberBR(c);
        if (n !== 0 || c === "0" || c === "0,00") numbers.push({ idx: i, value: n });
      }
    });

    if (numbers.length >= 1 && cells.length >= 2) {
      const valueObj = numbers[numbers.length - 1];
      const value = Math.abs(valueObj.value);
      if (value === 0) continue;

      // descrição = células entre o código e o primeiro número
      const startDesc = codeMatch ? 1 : 0;
      const endDesc = numbers[0].idx;
      const descCells = cells.slice(startDesc, endDesc).filter((c) => c && !/^\d{1,5}$/.test(c));
      const description = descCells.join(" ").trim();
      if (!description || isHeaderName(description)) continue;

      // referência = célula numérica antes do valor (se houver)
      const reference = numbers.length >= 2 ? String(cells[numbers[numbers.length - 2].idx]) : null;

      // Decisão provento/desconto: na maioria dos relatórios há colunas separadas.
      // Heurística: se a descrição contém "DESC", "INSS", "IRRF", "VALE", "ADIANT" → desconto.
      const cls = classifyByText(description);
      // Códigos podem dar pistas: 81/300/316/391/1074 são descontos comuns
      const code = codeMatch ? codeMatch[1] : null;

      const rubric: ParsedRubric = {
        code,
        description,
        reference,
        kind: cls.kind,
        value,
      };
      applyRubric(cur, rubric);
      continue;
    }
  }

  flush();
  return { competence, blocks };
};

// =====================================================================
// Parser PDF "column-aware" — funciona com layouts de 3 colunas
// (Trabalhadores | Proventos | Descontos) tipo Exact / Domínio.
// Estratégia:
//  1. Lê todos os itens de texto com (x, y, str, page).
//  2. Detecta os 3 X-anchors pelos cabeçalhos da primeira página.
//  3. Para cada item, classifica em qual coluna ele cai (TRAB/PROV/DESC).
//  4. Agrupa por (page, y) → vira "linha" mas com cada célula já na coluna certa.
//  5. Identifica novo colaborador pela coluna TRAB com padrão `^\d{6}\s+NOME`.
//  6. Acumula proventos (coluna PROV) e descontos (coluna DESC) até trocar.
//  7. Líquido: usa SALÁRIO LÍQUIDO se >0, senão `0999 PAGAMENTO DE RESCISÃO`,
//     senão zero (afastado).
// =====================================================================

interface PdfItem { page: number; x: number; y: number; str: string; }

const COL = { TRAB: 0, PROV: 1, DESC: 2 } as const;
type ColIdx = 0 | 1 | 2;

const parseDateBR = (s: string): string | null => {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
};

const detectColumnAnchors = (items: PdfItem[]): { x: number; col: ColIdx }[] | null => {
  // procura cabeçalhos na primeira página
  const firstPage = items.filter((i) => i.page === 1);
  // junta itens próximos da mesma linha
  const headerRow = firstPage.filter((i) =>
    /^TRABALHADOR|^PROVENTO|^DESCONTO/i.test(i.str.trim()),
  );
  if (headerRow.length < 3) return null;
  // pega o primeiro de cada
  const findX = (re: RegExp) => headerRow.find((i) => re.test(i.str.trim()))?.x;
  const xT = findX(/^TRABALHADOR/i);
  const xP = findX(/^PROVENTO/i);
  const xD = findX(/^DESCONTO/i);
  if (xT == null || xP == null || xD == null) return null;
  return [
    { x: xT, col: COL.TRAB },
    { x: xP, col: COL.PROV },
    { x: xD, col: COL.DESC },
  ].sort((a, b) => a.x - b.x) as { x: number; col: ColIdx }[];
};

const classifyColumn = (
  x: number,
  anchors: { x: number; col: ColIdx }[],
): ColIdx => {
  // distância para cada anchor (margem de tolerância: encaixa na anchor mais próxima
  // cuja x esteja <= x + 30)
  let best: ColIdx = anchors[0].col;
  let bestDist = Infinity;
  for (const a of anchors) {
    const d = x < a.x - 30 ? Infinity : Math.abs(x - a.x);
    if (d < bestDist) { bestDist = d; best = a.col; }
  }
  return best;
};

// Junta itens da mesma linha (mesmo page+y arredondado) ordenados por x,
// já etiquetados por coluna. Retorna { page, y, byCol: string[] }
interface PdfRow { page: number; y: number; byCol: [string, string, string]; }

const buildRows = (items: PdfItem[], anchors: { x: number; col: ColIdx }[]): PdfRow[] => {
  // chave de linha: (page, yBucket) — yBucket = y arredondado a 2px
  const map = new Map<string, { page: number; y: number; cols: [PdfItem[], PdfItem[], PdfItem[]] }>();
  for (const it of items) {
    if (!it.str.trim()) continue;
    const yKey = Math.round(it.y / 2) * 2;
    const k = `${it.page}:${yKey}`;
    let row = map.get(k);
    if (!row) {
      row = { page: it.page, y: yKey, cols: [[], [], []] };
      map.set(k, row);
    }
    const c = classifyColumn(it.x, anchors);
    row.cols[c].push(it);
  }
  const rows: PdfRow[] = [];
  for (const r of map.values()) {
    const join = (arr: PdfItem[]) =>
      arr.sort((a, b) => a.x - b.x).map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
    rows.push({
      page: r.page,
      y: r.y,
      byCol: [join(r.cols[0]), join(r.cols[1]), join(r.cols[2])],
    });
  }
  // ordem: page asc, y desc (PDF y cresce para cima)
  rows.sort((a, b) => (a.page - b.page) || (b.y - a.y));
  return rows;
};

// Detecta linha que abre um colaborador na coluna TRAB.
// Padrão Exact: "000005 CLÁUDIO CLEONDO DE OLIVEIRA"
const matchEmployeeHeader = (s: string): { reg: string; name: string } | null => {
  const m = s.match(/^(\d{4,8})\s+([A-ZÀ-Ý][A-ZÀ-Ý\s.\-']{2,})$/);
  if (!m) return null;
  if (isHeaderName(m[2])) return null;
  return { reg: m[1], name: m[2].trim() };
};

// Extrai todas as rubricas da string completa de uma coluna (PROV ou DESC),
// que pode ter sido juntada de várias linhas.
// Formato típico: "59 PRODUTIVIDADE 5% 100,00\n97 SALARIO MES CIVIL 31,00 2.000,00 ..."
const extractRubricsFromColumnText = (text: string, kind: RubricKind): ParsedRubric[] => {
  if (!text) return [];
  // normaliza: insere quebra antes de cada padrão "<código 1-5 dig> <DESC...>"
  // só quando o anterior termina em valor monetário
  const normalized = text
    .replace(/(\d{1,3}(?:\.\d{3})*,\d{2})\s+(?=\d{1,5}\s+[A-ZÀ-Ý0-9])/g, "$1\n")
    .replace(/\bTOTAL\s+DE/gi, "\nTOTAL DE")
    .replace(/\bBASE\s+DO/gi, "\nBASE DO")
    .replace(/\bSAL[ÁA]RIO\s+L[IÍ]QUIDO/gi, "\nSALÁRIO LÍQUIDO");
  const lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);
  const out: ParsedRubric[] = [];
  for (const line of lines) {
    // ignora informativos / totais (são tratados à parte)
    if (/^TOTAL\b|^BASE\b|^SAL[ÁA]RIO\s+L[IÍ]QUIDO|^FGTS\b/i.test(line)) continue;
    const m = line.match(/^(\d{1,5})\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})(?:\s+(\d{1,3}(?:\.\d{3})*,\d{2}))?\s*$/);
    if (!m) continue;
    const code = m[1];
    const description = m[2].replace(/\s+\d+,\d{2}\s*$/, "").trim();
    // último valor da linha = valor real da rubrica
    const lastValue = m[4] ?? m[3];
    const reference = m[4] ? m[3] : null;
    const value = Math.abs(toNumberBR(lastValue));
    if (!value || isHeaderName(description)) continue;
    out.push({ code, description, reference, kind, value });
  }
  return out;
};

// Extrai do texto de uma coluna (PROV ou DESC) totais e bases informativos
const extractTotalsFromColumn = (text: string): {
  totalEarnings: number; totalDiscounts: number; netAmount: number;
  fgtsBase: number; fgtsValue: number; salaryBase: number;
} => {
  const get = (re: RegExp) => {
    const m = text.match(re);
    return m ? toNumberBR(m[1]) : 0;
  };
  return {
    totalEarnings: get(/TOTAL\s+DE\s+PROVENTOS\s*[:\-]?\s*(\d[\d.,]*)/i),
    totalDiscounts: get(/TOTAL\s+DE\s+DESCONTOS\s*[:\-]?\s*(\d[\d.,]*)/i),
    netAmount: get(/SAL[ÁA]RIO\s+L[ÍI]QUIDO\s*[:\-]?\s*(\d[\d.,]*)/i),
    fgtsBase: get(/BASE\s+DO\s+FGTS\s*[:\-]?\s*(\d[\d.,]*)/i),
    fgtsValue: get(/FGTS\s+A\s+RECOLHER[^:\d]*[:\-]?\s*(\d[\d.,]*)/i),
    salaryBase: get(/SAL[ÁA]RIO\s+BASE\s*[:\-]?\s*(\d[\d.,]*)/i),
  };
};

// Detecta status do colaborador na coluna TRAB
const detectStatus = (trabText: string): EntryStatus => {
  if (/Rescis[aã]o\s+\d{2}\/\d{2}\/\d{4}/i.test(trabText)) return "termination";
  if (/Acid\.?\s*trabalho|Afast(?:amento|\.)|Auxilio\s+doen[cç]a|INSS\s+afastado/i.test(trabText)) return "leave_inss";
  return "active";
};

// Junta itens próximos por y (tolerância 2px) e ordena por x → string
const joinByY = (items: PdfItem[], yTarget: number, tol = 2): string => {
  return items
    .filter((i) => Math.abs(i.y - yTarget) <= tol)
    .sort((a, b) => a.x - b.x)
    .map((i) => i.str)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
};

const parsePdfColumnAware = (items: PdfItem[]): ParsedPayroll => {
  // 1) competência — pode estar fragmentada em vários itens (ex: "COMPETÊNCIA" e "03/2026" em itens separados na mesma linha y)
  let competence: string | null = null;
  // tenta linha onde aparece "COMPETÊNCIA"
  const compItem = items.find((i) => /^COMPET[ÊE]NCIA$/i.test(i.str.trim()));
  if (compItem) {
    const sameLine = items
      .filter((i) => i.page === compItem.page && Math.abs(i.y - compItem.y) <= 2)
      .sort((a, b) => a.x - b.x)
      .map((i) => i.str)
      .join(" ");
    const m = sameLine.match(/(\d{2})\s*\/\s*(\d{4})/);
    if (m) competence = `${m[1]}/${m[2]}`;
  }

  // 2) Coleta matrículas (x ~28, padrão ^\d{4,8}$). Cada matrícula = 1 colaborador.
  const regs = items
    .filter((i) => i.x < 40 && /^\d{4,8}$/.test((i.str ?? "").trim()))
    .map((i) => ({ page: i.page, y: i.y, reg: (i.str ?? "").trim() }));

  if (regs.length === 0) return { competence, blocks: [] };

  // Agrupa itens por página para acelerar
  const byPage = new Map<number, PdfItem[]>();
  for (const it of items) {
    const arr = byPage.get(it.page) ?? [];
    arr.push(it);
    byPage.set(it.page, arr);
  }

  // Para cada matrícula, define o range vertical do bloco:
  // do y dela até o y da próxima matrícula (mesma página) ou até y mínimo da página.
  // Ordena matrículas por (page, y desc).
  regs.sort((a, b) => (a.page - b.page) || (b.y - a.y));

  const blocks: ParsedBlock[] = [];

  for (let idx = 0; idx < regs.length; idx++) {
    const r = regs[idx];
    const next = regs[idx + 1];
    const sameNext = next && next.page === r.page;
    // y máximo (topo) = y da matrícula + 2 (inclui linha do nome que pode estar 1px acima/abaixo)
    const yTop = r.y + 3;
    // y mínimo (base) = y da próxima matrícula + 1, ou 0 se acabou a página
    const yBot = sameNext ? next!.y + 1 : 0;
    const pageItems = (byPage.get(r.page) ?? []).filter((i) => i.y <= yTop && i.y > yBot);

    const block = newBlock();
    block.registration_number = r.reg;

    // Nome: x ~49, mesma y±2 da matrícula
    const nameItem = pageItems.find(
      (i) => i.x >= 45 && i.x < 200 && Math.abs(i.y - r.y) <= 2 && /[A-ZÀ-Ý]/.test(i.str) && i.str.trim().length > 3,
    );
    if (nameItem) block.full_name = nameItem.str.trim();
    else {
      // tenta linha imediatamente acima (alguns PDFs colocam o nome 1-2 px acima)
      const alt = pageItems.find((i) => i.x >= 45 && i.x < 200 && Math.abs(i.y - r.y) <= 4 && /^[A-ZÀ-Ý][A-ZÀ-Ý\s.\-']{3,}$/.test(i.str.trim()));
      if (alt) block.full_name = alt.str.trim();
    }
    if (!block.full_name) continue;

    // Cargo: x ~49, ~10px abaixo do nome, contém "/0001"
    const trabZone = pageItems.filter((i) => i.x >= 45 && i.x < 200);
    const posLine = trabZone.find((i) => /\/\s*\d{3,5}/.test(joinByY(trabZone, i.y, 1))) ;
    if (posLine) {
      const txt = joinByY(trabZone, posLine.y, 1).replace(/\/\s*\d+.*$/, "").trim();
      if (txt) block.position = txt;
    }

    // Admissão
    const admItem = pageItems.find((i) => /Admiss[ãa]o/i.test(i.str));
    if (admItem) {
      const line = joinByY(pageItems, admItem.y, 1);
      const m = line.match(/(\d{2}\/\d{2}\/\d{4})/);
      if (m) block.admission_date = parseDateBR(m[1]);
    }

    // Salário base
    const salItem = pageItems.find((i) => /SAL[ÁA]RIO\s+BASE/i.test(i.str) || (i.x < 100 && /SAL[ÁA]RIO/i.test(i.str)));
    if (salItem) {
      const line = joinByY(pageItems, salItem.y, 2);
      const m = line.match(/SAL[ÁA]RIO\s+BASE\s*:?\s*(\d[\d.,]*)/i);
      if (m) block.salary = toNumberBR(m[1]);
    }

    // Status (rescisão / afastamento) — buscar na zona TRAB do bloco
    const trabText = trabZone.map((i) => i.str).join(" ");
    block.entry_status = detectStatus(trabText);
    // checa também na zona PROV (texto "AFASTAMENTO ACIDENT" aparece na PROV em alguns casos)
    const fullText = pageItems.map((i) => i.str).join(" ");
    if (block.entry_status === "active" && /AFASTAMENTO|ACID(ENTE|\.)|AUX[IÍ]LIO\s+DOEN/i.test(fullText)) {
      block.entry_status = "leave_inss";
    }

    // ----- Rubricas: agrupa por linhas y dentro do bloco, separa por X em PROV (~196-369) e DESC (~376-560) -----
    // PROV: x ∈ [190, 370). DESC: x ∈ [370, 600).
    const PROV_MIN = 190, PROV_MAX = 370, DESC_MIN = 370, DESC_MAX = 600;

    // Agrupa por y (bucket de 1px) — só itens dentro das colunas de rubricas
    const yBuckets = new Map<number, PdfItem[]>();
    for (const it of pageItems) {
      if (it.x < PROV_MIN || it.x >= DESC_MAX) continue;
      const yk = Math.round(it.y);
      const arr = yBuckets.get(yk) ?? [];
      arr.push(it);
      yBuckets.set(yk, arr);
    }

    const parseRubricCells = (cells: PdfItem[], kind: RubricKind) => {
      if (cells.length === 0) return;
      const sorted = cells.sort((a, b) => a.x - b.x);
      // primeira célula = código (1-5 dígitos), depois descrição, depois números.
      const first = sorted[0].str.trim();
      if (!/^\d{1,5}$/.test(first)) return;
      const code = first;
      const descParts: string[] = [];
      const numbers: string[] = [];
      for (let k = 1; k < sorted.length; k++) {
        const s = sorted[k].str.trim();
        if (!s) continue;
        if (/^-?\d{1,3}(?:\.\d{3})*,\d{2}$|^-?\d+,\d{2}$/.test(s)) {
          numbers.push(s);
        } else if (numbers.length === 0) {
          descParts.push(s);
        } else {
          // texto após número ainda faz parte da descrição (ex: "INSS - MENSAL")
          descParts.push(s);
        }
      }
      if (numbers.length === 0) return;
      const description = descParts.join(" ").replace(/\s+/g, " ").trim();
      if (!description) return;
      const value = Math.abs(toNumberBR(numbers[numbers.length - 1]));
      if (!value) return;
      const reference = numbers.length >= 2 ? numbers[numbers.length - 2] : null;
      applyRubric(block, { code, description, reference, kind, value });
    };

    for (const [, cells] of yBuckets) {
      const provCells = cells.filter((c) => c.x >= PROV_MIN && c.x < PROV_MAX);
      const descCells = cells.filter((c) => c.x >= DESC_MIN && c.x < DESC_MAX);
      parseRubricCells(provCells, "earning");
      parseRubricCells(descCells, "deduction");
    }

    // Totais explícitos do holerite. Como itens são fragmentados, monto strings por linha (y bucket) e busco neles.
    const lineMap = new Map<number, string>();
    {
      const grouped = new Map<number, PdfItem[]>();
      for (const it of pageItems) {
        const yk = Math.round(it.y);
        const arr = grouped.get(yk) ?? [];
        arr.push(it);
        grouped.set(yk, arr);
      }
      for (const [yk, arr] of grouped) {
        lineMap.set(yk, arr.sort((a, b) => a.x - b.x).map((i) => i.str).join(" ").replace(/\s+/g, " ").trim());
      }
    }
    const findValueOnLine = (re: RegExp): number => {
      for (const line of lineMap.values()) {
        const m = line.match(new RegExp(re.source + "\\s*:?\\s*(\\d[\\d.,]*)", re.flags));
        if (m) return toNumberBR(m[1]);
      }
      return 0;
    };
    const tProv = findValueOnLine(/TOTAL\s+DE\s+PROVENTOS/i);
    const tDesc = findValueOnLine(/TOTAL\s+DE\s+DESCONTOS/i);
    const tNet = findValueOnLine(/SAL[ÁA]RIO\s+L[ÍI]QUIDO/i);
    const tFgtsBase = findValueOnLine(/BASE\s+DO\s+FGTS\s+M[ÊE]S/i);
    const tFgtsVal = findValueOnLine(/FGTS\s+A\s+RECOLHER\s+M[ÊE]S/i);

    if (tProv) block.total_earnings = tProv;
    else block.total_earnings = block.rubrics.filter((x) => x.kind === "earning").reduce((a, x) => a + x.value, 0);
    if (tDesc) block.total_discounts = tDesc;
    else block.total_discounts = block.rubrics.filter((x) => x.kind === "deduction").reduce((a, x) => a + x.value, 0);
    if (tFgtsBase) block.fgts_base = tFgtsBase;
    if (tFgtsVal) block.fgts_value = tFgtsVal;

    if (tNet > 0) {
      block.net_amount = tNet;
    } else if (block.entry_status === "termination") {
      const r999 = block.rubrics.find((x) => x.code === "0999" || x.code === "999");
      block.net_amount = r999?.value ?? 0;
    } else {
      block.net_amount = Math.max(0, block.total_earnings - block.total_discounts);
    }

    blocks.push(block);
  }

  return { competence, blocks };
};

// (helpers internos acima)


// ----------------- Entradas públicas -----------------
export const parseXlsxFile = async (file: File): Promise<ParsedPayroll> => {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const allLines: string[][] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const matrix: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    matrix.forEach((row) => allLines.push(row.map((c) => (c == null ? "" : String(c)))));
  }
  return parseFromLines(allLines);
};

export const parsePdfFile = async (file: File): Promise<ParsedPayroll> => {
  const pdfjs: any = await import("pdfjs-dist/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc =
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;

  // 1) coleta TODOS os itens com (page, x, y, str)
  const allItems: PdfItem[] = [];
  const linesFallback: string[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const it of content.items as any[]) {
      allItems.push({
        page: p,
        x: it.transform[4],
        y: it.transform[5],
        str: String(it.str ?? ""),
      });
    }
    // mantém fallback no formato antigo (linha-por-linha) caso o column-aware falhe
    const byY = new Map<number, { x: number; str: string }[]>();
    for (const it of content.items as any[]) {
      const y = Math.round(it.transform[5]);
      const x = it.transform[4];
      const arr = byY.get(y) ?? [];
      arr.push({ x, str: it.str });
      byY.set(y, arr);
    }
    const sortedY = [...byY.keys()].sort((a, b) => b - a);
    for (const y of sortedY) {
      const items = byY.get(y)!.sort((a, b) => a.x - b.x);
      const cells: string[] = [];
      let last = -Infinity;
      let cur = "";
      for (const it of items) {
        if (it.x - last > 8 && cur) { cells.push(cur.trim()); cur = ""; }
        cur += (cur ? " " : "") + it.str;
        last = it.x + it.str.length * 4;
      }
      if (cur.trim()) cells.push(cur.trim());
      if (cells.length) linesFallback.push(cells);
    }
  }

  // 2) tenta column-aware (layout 3 colunas Trabalhadores/Proventos/Descontos)
  const columnAware = parsePdfColumnAware(allItems);
  if (columnAware.blocks.length > 0) return columnAware;

  // 3) fallback: parser antigo linha-por-linha
  return parseFromLines(linesFallback);
};

// =====================================================================
// Parser para XML "QXDocument" (formato de exportação visual do Exact /
// outros sistemas que exportam o relatório de folha como XML com X/Y
// preservados). Estrutura: <Page Number="N"> contendo vários
// <Item Type="Text" X=".." Y=".."> com o texto. Y cresce para BAIXO
// (oposto do PDF). Coordenadas em mm.
// =====================================================================
export const isQxDocumentXml = (text: string): boolean =>
  /<QXDocument\b/i.test(text) && /<Item\s+Type="Text"/i.test(text);

interface QxItem { page: number; x: number; y: number; str: string; }

// Detecta status no texto da zona TRAB do bloco
const detectStatusQx = (trabText: string): EntryStatus => {
  if (/Rescis[aã]o\s+\d{2}\/\d{2}\/\d{4}/i.test(trabText)) return "termination";
  if (/Acid\.?\s*trabalho|Afast(?:amento|\.)|Auxilio\s+doen[cç]a|INSS\s+afastado|AFASTAMENTO|AUX[IÍ]LIO\s+DOEN/i.test(trabText)) return "leave_inss";
  return "active";
};

// Códigos da Exact que são puramente informativos (não somam em prov/desc).
// 1025 = AFASTAMENTO POR ACIDENTE/DOENÇA (registro do INSS)
const informativeCodes = new Set(["1025", "1026", "1027"]);

// Extrai rubricas de uma string que pode conter PROV à esquerda e DESC à direita
// Ex: "59 PRODUTIVIDADE 5%      100,00    80 VALE TRANSPORTE 6%   120,00"
// Estratégia: detecta o split point procurando o gap mais largo de espaços (≥4)
// no MEIO da linha (entre 30% e 70% do comprimento). Tudo antes = PROV, depois = DESC.
const extractRubricsFromQxLine = (line: string): ParsedRubric[] => {
  const out: ParsedRubric[] = [];
  // Detecta split: maior sequência de espaços (>=3) cuja posição esteja entre 30% e 75% do comprimento
  let splitCol = line.length; // default: tudo é PROV
  const len = line.length;
  const gapRe = /\s{3,}/g;
  let gm;
  let bestGap = { pos: -1, width: 0 };
  while ((gm = gapRe.exec(line)) !== null) {
    const pos = gm.index;
    if (pos < len * 0.25 || pos > len * 0.85) continue;
    if (gm[0].length > bestGap.width) bestGap = { pos, width: gm[0].length };
  }
  if (bestGap.pos > 0) splitCol = bestGap.pos + bestGap.width;

  const re = /(\d{1,5})\s+([A-ZÀ-Ý][A-ZÀ-Ý0-9.\s%/\-]*?)(?:\s{2,}(\d{1,3}(?:\.\d{3})*,\d{2}))?\s{2,}(\d{1,3}(?:\.\d{3})*,\d{2})/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    const code = m[1];
    const description = m[2].replace(/\s+/g, " ").trim();
    const reference = m[3] ?? null;
    const value = Math.abs(toNumberBR(m[4]));
    if (!value || !description || description.length < 2) continue;
    if (informativeCodes.has(code)) continue; // ignora rubricas informativas (ex: 1025 afastamento)
    const col = m.index;
    const kind: RubricKind = col < splitCol ? "earning" : "deduction";
    out.push({ code, description, reference, kind, value });
  }
  return out;
};

const parseValueAfter = (text: string, label: RegExp): number => {
  const m = text.match(new RegExp(label.source + "\\s*:?\\s*(\\d{1,3}(?:\\.\\d{3})*,\\d{2})", label.flags));
  return m ? toNumberBR(m[1]) : 0;
};

export const parseQxDocumentXml = (xmlText: string): ParsedPayroll => {
  // 1) extrai todos os items de texto com (page, x, y, str)
  const items: QxItem[] = [];
  const pageRe = /<Page\s+Number="(\d+)">([\s\S]*?)<\/Page>/g;
  const itemRe = /<Item\s+Type="Text"[^>]*X="([\d,.\-]+)"[^>]*Y="([\d,.\-]+)"[^>]*>([\s\S]*?)<\/Item>/g;
  const num = (s: string) => parseFloat(s.replace(",", "."));
  const decode = (s: string) => s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  let pm: RegExpExecArray | null;
  while ((pm = pageRe.exec(xmlText)) !== null) {
    const page = +pm[1];
    const body = pm[2];
    let im: RegExpExecArray | null;
    itemRe.lastIndex = 0;
    while ((im = itemRe.exec(body)) !== null) {
      const x = num(im[1]);
      const y = num(im[2]);
      const inner = im[3].trim();
      const cm = inner.match(/<Contents>([\s\S]*?)<\/Contents>/);
      const raw = (cm ? cm[1] : inner).trim();
      const str = decode(raw);
      if (!str || /^_+$/.test(str)) continue;
      items.push({ page, x, y, str });
    }
  }
  if (items.length === 0) return { competence: null, blocks: [] };

  // 2) competência — geralmente no item "COMPETÊNCIA : MM/AAAA"
  let competence: string | null = null;
  for (const it of items) {
    const m = it.str.match(/COMPET[ÊE]NCIA\s*[:\-]?\s*(\d{2})\s*[\/\-]\s*(\d{4})/i);
    if (m) { competence = `${m[1]}/${m[2]}`; break; }
  }

  // 3) coleta matrículas (x pequeno, ^\d{4,8}$)
  const regs = items
    .filter((i) => i.x < 25 && /^\d{4,8}$/.test(i.str))
    .map((i) => ({ page: i.page, y: i.y, reg: i.str }));
  if (regs.length === 0) return { competence, blocks: [] };

  // ordena: page asc, y asc (no XML Y cresce para baixo)
  regs.sort((a, b) => (a.page - b.page) || (a.y - b.y));

  // boundary final: "Totalização" / "TOTAL GERAL"
  const boundary = items.find((i) => /Totaliza[çc][aã]o|TOTAL\s+GERAL/i.test(i.str));

  const blocks: ParsedBlock[] = [];
  for (let idx = 0; idx < regs.length; idx++) {
    const r = regs[idx];
    const next = regs[idx + 1];
    const sameNext = next && next.page === r.page;
    const yTop = r.y - 1; // tudo da matrícula pra baixo (Y cresce p/ baixo)
    const yBot = sameNext
      ? next!.y - 0.5
      : (boundary && boundary.page === r.page ? boundary.y : Number.POSITIVE_INFINITY);
    const blockItems = items.filter((i) => i.page === r.page && i.y >= yTop && i.y < yBot);

    const block = newBlock();
    block.registration_number = r.reg;

    // Nome: x ~17.9, mesma y±0.5 da matrícula
    const nameItem = blockItems.find(
      (i) => i.x >= 15 && i.x < 80 && Math.abs(i.y - r.y) <= 0.6 && /^[A-ZÀ-Ý][A-ZÀ-Ý\s.\-']{3,}$/.test(i.str.trim()),
    );
    if (nameItem) block.full_name = nameItem.str.trim();
    if (!block.full_name) continue;

    // Cargo: linha ~3-4mm abaixo do nome, antes do "/"
    const posItem = blockItems.find(
      (i) => i.x >= 15 && i.x < 80 && i.y > r.y + 2 && i.y < r.y + 5
        && /^[A-ZÀ-Ý][A-ZÀ-Ý\s.()\-]{2,}$/.test(i.str.trim()),
    );
    if (posItem) block.position = posItem.str.trim();

    // Admissão
    const admItem = blockItems.find((i) => /Admiss[ãa]o\s+em\s+\d{2}\/\d{2}\/\d{4}/i.test(i.str));
    if (admItem) {
      const m = admItem.str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (m) block.admission_date = `${m[3]}-${m[2]}-${m[1]}`;
    }

    // Salário base
    for (const it of blockItems) {
      if (/SAL[ÁA]RIO\s+BASE/i.test(it.str)) {
        // valor pode estar no mesmo item ou em outro item próximo (mesma y, x>=44)
        let v = parseValueAfter(it.str, /SAL[ÁA]RIO\s+BASE/i);
        if (!v) {
          const sameLine = blockItems.filter((j) => Math.abs(j.y - it.y) <= 0.6 && j.x > it.x);
          for (const j of sameLine) {
            const m = j.str.match(/^(\d{1,3}(?:\.\d{3})*,\d{2})$/);
            if (m) { v = toNumberBR(m[1]); break; }
          }
        }
        if (v) block.salary = v;
        break;
      }
    }

    // Status (procura nas linhas TRAB do bloco — x < 80)
    const trabText = blockItems.filter((i) => i.x < 80).map((i) => i.str).join(" ");
    block.entry_status = detectStatusQx(trabText);
    // texto completo para AFASTAMENTO/ACIDENTE que pode aparecer na coluna PROV
    if (block.entry_status === "active") {
      const allText = blockItems.map((i) => i.str).join(" ");
      if (/AFASTAMENTO|ACID(ENTE|\.)|AUX[IÍ]LIO\s+DOEN/i.test(allText)) {
        block.entry_status = "leave_inss";
      }
    }

    // ----- Rubricas -----
    // Linhas de rubrica: items com x≈10.3 cuja string começa com código numérico.
    // O texto contém PROV à esquerda e DESC à direita. Split em ~52 chars.
    const rubricLines = blockItems.filter(
      (i) => i.x < 12 && /^\d{1,5}\s+[A-ZÀ-Ý]/.test(i.str),
    );
    for (const line of rubricLines) {
      const found = extractRubricsFromQxLine(line.str);
      for (const rubric of found) {
        applyRubric(block, rubric);
      }
    }

    // ----- Totais explícitos do holerite -----
    // Linhas como "TOTAL DE PROVENTOS : 2.100,00     TOTAL DE DESCONTOS : 785,68"
    // IMPORTANTE: distinguir "não encontrado" (null) de "explicitamente zero" (0).
    const allLines = blockItems.filter((i) => i.x < 12).map((i) => i.str);
    const findValue = (label: RegExp): number | null => {
      for (const ln of allLines) {
        const m = ln.match(new RegExp(label.source + "\\s*:?\\s*(\\d{1,3}(?:\\.\\d{3})*,\\d{2})", label.flags));
        if (m) return toNumberBR(m[1]);
      }
      return null;
    };
    const tProv = findValue(/TOTAL\s+DE\s+PROVENTOS/i);
    const tDesc = findValue(/TOTAL\s+DE\s+DESCONTOS/i);
    const tNet = findValue(/SAL[ÁA]RIO\s+L[ÍI]QUIDO/i);
    let tFgtsBase = 0, tFgtsVal = 0;
    // FGTS pode estar fragmentado em itens separados — busca em todos os items com label
    for (const it of blockItems) {
      if (!tFgtsBase && /BASE\s+DO\s+FGTS\s+M[ÊE]S/i.test(it.str)) {
        const sameLine = blockItems.filter((j) => Math.abs(j.y - it.y) <= 0.6 && j.x > it.x);
        for (const j of sameLine) {
          const m = j.str.match(/^(\d{1,3}(?:\.\d{3})*,\d{2})$/);
          if (m) { tFgtsBase = toNumberBR(m[1]); break; }
        }
      }
      if (!tFgtsVal && /FGTS\s+A\s+RECOLHER\s+M[ÊE]S/i.test(it.str)) {
        const sameLine = blockItems.filter((j) => Math.abs(j.y - it.y) <= 0.6 && j.x > it.x);
        for (const j of sameLine) {
          const m = j.str.match(/^(\d{1,3}(?:\.\d{3})*,\d{2})$/);
          if (m) { tFgtsVal = toNumberBR(m[1]); break; }
        }
      }
    }

    block.total_earnings = tProv !== null ? tProv : block.rubrics.filter((x) => x.kind === "earning").reduce((a, x) => a + x.value, 0);
    block.total_discounts = tDesc !== null ? tDesc : block.rubrics.filter((x) => x.kind === "deduction").reduce((a, x) => a + x.value, 0);
    if (tFgtsBase) block.fgts_base = tFgtsBase;
    if (tFgtsVal) block.fgts_value = tFgtsVal;

    if (tNet !== null && tNet > 0) {
      block.net_amount = tNet;
    } else if (block.entry_status === "termination") {
      const r999 = block.rubrics.find((x) => x.code === "0999" || x.code === "999");
      block.net_amount = r999?.value ?? Math.max(0, block.total_earnings - block.total_discounts);
    } else {
      block.net_amount = Math.max(0, block.total_earnings - block.total_discounts);
    }

    blocks.push(block);
  }

  return { competence, blocks };
};

