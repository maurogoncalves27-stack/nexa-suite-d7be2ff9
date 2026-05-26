// OFX (SGML/XML) parser — extrai transações de extratos bancários brasileiros.
// Suporta OFX 1.x (SGML) e OFX 2.x (XML). Foca nos campos usados na conciliação.

export interface OfxTransaction {
  fitId: string;
  postedAt: string; // YYYY-MM-DD
  amount: number;   // negativo = débito, positivo = crédito
  trnType: string;
  memo: string;
  checkNumber: string | null;
  payee: string | null;
}

export interface ParsedOfx {
  bankId: string | null;
  accountId: string | null;
  accountType: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  openingBalance: number | null;
  closingBalance: number | null;
  transactions: OfxTransaction[];
}

// Converte SGML "tag" estilo OFX 1.x para XML válido fechando tags soltas.
// OFX 1.x permite tags sem fechamento para campos de valor (leaf nodes), por exemplo:
//   <DTPOSTED>20240115
//   <TRNAMT>-150.00
// Tags container (com filhos), como <OFX>, <STMTTRN>, devem manter <TAG>...</TAG>.
function normalizeOfx(raw: string): string {
  // Tenta achar <OFX> case-insensitive
  const match = raw.match(/<OFX[\s>]/i);
  if (!match || match.index === undefined) return raw;
  let body = raw.slice(match.index);

  // Normaliza quebras de linha
  body = body.replace(/\r\n?/g, "\n");

  // Detecta se já é XML 2.x bem-formado (tem tags de fechamento de leaf comuns).
  // Nesse caso retorna como está — o DOMParser cuida do resto.
  if (/<\/(FITID|TRNAMT|DTPOSTED|BANKID|ACCTID|MEMO|TRNTYPE)>/i.test(body)) {
    return body;
  }

  // Garante uma tag por linha — OFX SGML pode vir "minificado" sem quebras.
  // Insere \n antes de cada '<' (exceto o primeiro caractere).
  body = body.replace(/(?!^)</g, "\n<");

  // Processa linha a linha: para cada linha que tem APENAS uma tag de abertura
  // seguida de um valor (sem tag de fechamento na mesma linha), adiciona </TAG>.
  // Tags container ficam sozinhas na linha (ex.: "<STMTTRN>") e são preservadas.
  const lines = body.split("\n");
  const out: string[] = [];
  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Linhas de fechamento (</TAG>) ou já completas (<TAG>val</TAG>) passam direto
    if (trimmed.startsWith("</") || trimmed.includes("</")) {
      out.push(trimmed);
      continue;
    }
    // Casa: <TAG>valor (sem </...> no resto da linha)
    const m = trimmed.match(/^<([A-Za-z0-9._:]+)>([^<]*)$/);
    if (m && m[2].length > 0) {
      out.push(`<${m[1]}>${m[2].trim()}</${m[1]}>`);
    } else {
      out.push(trimmed);
    }
  }
  return out.join("\n");
}

function ofxDateToIso(s: string | null | undefined): string | null {
  if (!s) return null;
  // OFX: YYYYMMDDHHMMSS[.XXX][TZ]   ou apenas YYYYMMDD
  const m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function getFirst(el: Element | Document, tag: string): string | null {
  const found = el.getElementsByTagName(tag)[0];
  return found?.textContent?.trim() || null;
}

export function parseOfx(raw: string): ParsedOfx {
  const xml = normalizeOfx(raw);
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");

  // Procura BANKACCTFROM e BANKTRANLIST (extrato bancário)
  const acct = doc.getElementsByTagName("BANKACCTFROM")[0] || doc.getElementsByTagName("CCACCTFROM")[0];
  const tranList = doc.getElementsByTagName("BANKTRANLIST")[0];

  const bankId = acct ? getFirst(acct, "BANKID") : null;
  const accountId = acct ? getFirst(acct, "ACCTID") : null;
  const accountType = acct ? getFirst(acct, "ACCTTYPE") : null;

  const periodStart = ofxDateToIso(tranList ? getFirst(tranList, "DTSTART") : null);
  const periodEnd = ofxDateToIso(tranList ? getFirst(tranList, "DTEND") : null);

  const ledgerBalEl = doc.getElementsByTagName("LEDGERBAL")[0];
  const closingBalance = ledgerBalEl
    ? parseFloat((getFirst(ledgerBalEl, "BALAMT") ?? "").replace(",", ".")) || null
    : null;

  // OFX não traz saldo inicial padrão — deixa null e o usuário pode informar manualmente
  const openingBalance: number | null = null;

  const transactions: OfxTransaction[] = [];
  const stmtTrns = doc.getElementsByTagName("STMTTRN");
  for (let i = 0; i < stmtTrns.length; i++) {
    const t = stmtTrns[i];
    const fitId = getFirst(t, "FITID") || "";
    const postedAt = ofxDateToIso(getFirst(t, "DTPOSTED"));
    const amountStr = (getFirst(t, "TRNAMT") ?? "").replace(",", ".");
    const amount = parseFloat(amountStr);
    if (!fitId || !postedAt || Number.isNaN(amount)) continue;
    transactions.push({
      fitId,
      postedAt,
      amount,
      trnType: getFirst(t, "TRNTYPE") || "",
      memo: getFirst(t, "MEMO") || "",
      checkNumber: getFirst(t, "CHECKNUM"),
      payee: getFirst(t, "NAME"),
    });
  }

  return {
    bankId,
    accountId,
    accountType,
    periodStart,
    periodEnd,
    openingBalance,
    closingBalance,
    transactions,
  };
}
