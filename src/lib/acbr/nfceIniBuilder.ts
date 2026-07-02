/**
 * Builder de INI para emissão NFC-e via ACBrLibNFe.
 * - buildHomologacaoIni: teste R$ 0,01 (NfceTester)
 * - buildOrderNfceIni: itens reais do pedido (totem/PDV piloto ACBr)
 */

const onlyDigits = (s: string | null | undefined) => (s ?? "").replace(/\D+/g, "");

// Códigos IBGE — expandimos conforme novas UFs aparecerem
const UF_CODE: Record<string, number> = {
  AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53, ES: 32, GO: 52,
  MA: 21, MT: 51, MS: 50, MG: 31, PA: 15, PB: 25, PR: 41, PE: 26, PI: 22,
  RJ: 33, RN: 24, RS: 43, RO: 11, RR: 14, SC: 42, SP: 35, SE: 28, TO: 17,
};

// Municípios usados pelo grupo (DF). Outras cidades podem ser informadas manualmente.
const MUN_CODE: Record<string, number> = {
  "BRASILIA": 5300108,
  "BRASÍLIA": 5300108,
};

export interface StoreNfceCfg {
  cnpj: string;
  legal_name: string | null;
  name: string;
  inscricao_estadual: string | null;
  regime_tributario: number | null; // 1=Simples, 3=Normal
  address: string | null;
  number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  nfce_serie: number | null;
  nfce_next_number: number | null;
  nfce_environment: "homologacao" | "producao";
}

export interface BuildOptions {
  /** Sobrescreve o nNF (caso esteja repetindo um número). */
  numeroNF?: number;
  /** Sobrescreve a série (default = stores.nfce_serie || 1). */
  serie?: number;
  /** Valor da NFC-e (default 0.01) — só para homologação de teste. */
  valor?: number;
  /** Município (default cidade da loja) */
  cMun?: number;
  /** UF código (default state da loja) */
  cUF?: number;
}

export interface OrderNfceItem {
  menu_item_id?: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  fiscal?: {
    ncm?: string | null;
    cfop?: string | null;
    csosn?: string | null;
    cst?: string | null;
    origem_mercadoria?: number | null;
    unidade_comercial?: string | null;
    ean?: string | null;
  };
}

export interface OrderNfcePayment {
  method: string;
  amount: number;
}

const FORMA_PAG_MAP: Record<string, string> = {
  cash: "01",
  credit: "03",
  debit: "04",
  pix: "17",
  voucher: "10",
};

const HOMOLOG_XPROD =
  "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

function storeBasics(store: StoreNfceCfg, opts: BuildOptions = {}) {
  const cnpj = onlyDigits(store.cnpj);
  if (cnpj.length !== 14) throw new Error("CNPJ da loja inválido");

  const uf = (store.state ?? "").toUpperCase();
  const cUF = opts.cUF ?? UF_CODE[uf];
  if (!cUF) throw new Error(`UF '${uf}' sem código IBGE mapeado.`);

  const cidadeKey = (store.city ?? "").toUpperCase().trim();
  const cMun = opts.cMun ?? MUN_CODE[cidadeKey];
  if (!cMun) throw new Error(`Município '${store.city}' sem código IBGE mapeado.`);

  const serie = opts.serie ?? store.nfce_serie ?? 1;
  const nNF = opts.numeroNF ?? store.nfce_next_number ?? 1;
  const tpAmb = store.nfce_environment === "producao" ? 1 : 2;
  const crt = store.regime_tributario === 3 ? 3 : 1;
  const usaCsosn = crt === 1;

  const dt = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dhEmi =
    `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T` +
    `${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}-03:00`;

  return { cnpj, uf, cUF, cMun, serie, nNF, tpAmb, crt, usaCsosn, dhEmi };
}

/**
 * NFC-e a partir de itens reais do pedido (totem/PDV) via ACBr local.
 */
export function buildOrderNfceIni(
  store: StoreNfceCfg,
  items: OrderNfceItem[],
  payments: OrderNfcePayment[],
  opts: { numeroNF?: number; serie?: number; customerDocument?: string | null } = {},
): string {
  if (!items.length) throw new Error("Pedido sem itens para NFC-e");

  const basics = storeBasics(store, opts);
  const lines: string[] = [];

  lines.push("[infNFe]");
  lines.push("versao=4.00");
  lines.push("");
  lines.push("[ide]");
  lines.push(`cUF=${basics.cUF}`);
  lines.push("natOp=VENDA AO CONSUMIDOR");
  lines.push("mod=65");
  lines.push(`serie=${basics.serie}`);
  lines.push(`nNF=${basics.nNF}`);
  lines.push(`dhEmi=${basics.dhEmi}`);
  lines.push("tpNF=1");
  lines.push("idDest=1");
  lines.push(`cMunFG=${basics.cMun}`);
  lines.push("tpImp=4");
  lines.push("tpEmis=1");
  lines.push(`tpAmb=${basics.tpAmb}`);
  lines.push("finNFe=1");
  lines.push("indFinal=1");
  lines.push("indPres=1");
  lines.push("procEmi=0");
  lines.push("");
  lines.push("[emit]");
  lines.push(`CNPJ=${basics.cnpj}`);
  lines.push(`xNome=${store.legal_name ?? store.name}`);
  lines.push(`xFant=${store.name}`);
  lines.push(`IE=${onlyDigits(store.inscricao_estadual) || "ISENTO"}`);
  lines.push(`CRT=${basics.crt}`);
  lines.push("");
  lines.push("[enderEmit]");
  lines.push(`xLgr=${store.address || "Rua Teste"}`);
  lines.push(`nro=${store.number || "S/N"}`);
  lines.push(`xBairro=${store.neighborhood || "Centro"}`);
  lines.push(`cMun=${basics.cMun}`);
  lines.push(`xMun=${(store.city || "Brasilia").toUpperCase()}`);
  lines.push(`UF=${basics.uf}`);
  lines.push(`CEP=${onlyDigits(store.zip_code) || "70000000"}`);
  lines.push("cPais=1058");
  lines.push("xPais=BRASIL");
  lines.push("");

  const doc = onlyDigits(opts.customerDocument);
  if (doc.length === 11 || doc.length === 14) {
    lines.push("[dest]");
    if (doc.length === 11) lines.push(`CPF=${doc}`);
    else lines.push(`CNPJ=${doc}`);
    lines.push("indIEDest=9");
    lines.push("");
  }

  let totalProd = 0;
  items.forEach((it, idx) => {
    const n = String(idx + 1).padStart(3, "0");
    const qty = Number(it.quantity) || 1;
    const unit = Number(it.unit_price) || 0;
    const vProd = Number((qty * unit).toFixed(2));
    totalProd += vProd;
    const f = it.fiscal ?? {};
    const xProd =
      basics.tpAmb === 2 && idx === 0
        ? HOMOLOG_XPROD
        : (it.name?.slice(0, 120) || "Produto");

    lines.push(`[det${n}]`);
    lines.push("");
    lines.push(`[prod${n}]`);
    lines.push(`cProd=${it.menu_item_id?.slice(0, 20) || `ITEM${idx + 1}`}`);
    lines.push(`cEAN=${f.ean || "SEM GTIN"}`);
    lines.push(`xProd=${xProd}`);
    lines.push(`NCM=${f.ncm || "21069090"}`);
    lines.push(`CFOP=${f.cfop || "5102"}`);
    lines.push(`uCom=${f.unidade_comercial || "UN"}`);
    lines.push(`qCom=${qty.toFixed(4)}`);
    lines.push(`vUnCom=${unit.toFixed(2)}`);
    lines.push(`vProd=${vProd.toFixed(2)}`);
    lines.push(`cEANTrib=${f.ean || "SEM GTIN"}`);
    lines.push(`uTrib=${f.unidade_comercial || "UN"}`);
    lines.push(`qTrib=${qty.toFixed(4)}`);
    lines.push(`vUnTrib=${unit.toFixed(2)}`);
    lines.push("indTot=1");
    lines.push("");
    lines.push(`[ICMS${n}]`);
    if (basics.usaCsosn) {
      lines.push(`CSOSN=${f.csosn || "102"}`);
      lines.push(`Orig=${f.origem_mercadoria ?? 0}`);
    } else {
      lines.push(`CST=${f.cst || "00"}`);
      lines.push(`Orig=${f.origem_mercadoria ?? 0}`);
      lines.push("modBC=0");
      lines.push("vBC=0.00");
      lines.push("pICMS=0.00");
      lines.push("vICMS=0.00");
    }
    lines.push("");
    lines.push(`[PIS${n}]`);
    lines.push("CST=49");
    lines.push("");
    lines.push(`[COFINS${n}]`);
    lines.push("CST=49");
    lines.push("");
  });

  const payRows =
    payments.length > 0 ? payments : [{ method: "credit", amount: totalProd }];
  const totalPago = payRows.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  lines.push("[pag]");
  lines.push("");
  payRows.forEach((p, idx) => {
    const n = String(idx + 1).padStart(3, "0");
    lines.push(`[detPag${n}]`);
    lines.push("indPag=0");
    lines.push(`tPag=${FORMA_PAG_MAP[p.method] ?? "99"}`);
    lines.push(`vPag=${Number(p.amount).toFixed(2)}`);
    lines.push("");
  });

  const troco = Number((totalPago - totalProd).toFixed(2));
  if (troco > 0) {
    lines.push("[pag]");
    lines.push(`vTroco=${troco.toFixed(2)}`);
    lines.push("");
  }

  return lines.join("\r\n");
}

/**
 * Constrói INI mínimo válido para NFC-e de homologação.
 * - Produto: descrição obrigatória "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"
 * - 1 item R$ 0,01, pagamento dinheiro
 * - CST/CSOSN configurados conforme regime
 */
export function buildHomologacaoIni(store: StoreNfceCfg, opts: BuildOptions = {}): string {
  const basics = storeBasics(store, opts);
  const valor = (opts.valor ?? 0.01).toFixed(2);
  const xProdHomolog = HOMOLOG_XPROD;

  const lines: string[] = [];
  lines.push("[infNFe]");
  lines.push("versao=4.00");
  lines.push("");
  lines.push("[ide]");
  lines.push(`cUF=${basics.cUF}`);
  lines.push("natOp=VENDA AO CONSUMIDOR");
  lines.push("mod=65");
  lines.push(`serie=${basics.serie}`);
  lines.push(`nNF=${basics.nNF}`);
  lines.push(`dhEmi=${basics.dhEmi}`);
  lines.push("tpNF=1");
  lines.push("idDest=1");
  lines.push(`cMunFG=${basics.cMun}`);
  lines.push("tpImp=4");
  lines.push("tpEmis=1");
  lines.push(`tpAmb=${basics.tpAmb}`);
  lines.push("finNFe=1");
  lines.push("indFinal=1");
  lines.push("indPres=1");
  lines.push("procEmi=0");
  lines.push("");
  lines.push("[emit]");
  lines.push(`CNPJ=${basics.cnpj}`);
  lines.push(`xNome=${store.legal_name ?? store.name}`);
  lines.push(`xFant=${store.name}`);
  lines.push(`IE=${onlyDigits(store.inscricao_estadual) || "ISENTO"}`);
  lines.push(`CRT=${basics.crt}`);
  lines.push("");
  lines.push("[enderEmit]");
  lines.push(`xLgr=${store.address || "Rua Teste"}`);
  lines.push(`nro=${store.number || "S/N"}`);
  lines.push(`xBairro=${store.neighborhood || "Centro"}`);
  lines.push(`cMun=${basics.cMun}`);
  lines.push(`xMun=${(store.city || "Brasilia").toUpperCase()}`);
  lines.push(`UF=${basics.uf}`);
  lines.push(`CEP=${onlyDigits(store.zip_code) || "70000000"}`);
  lines.push("cPais=1058");
  lines.push("xPais=BRASIL");
  lines.push("");
  // Item 001
  lines.push("[det001]");
  lines.push("infAdProd=");
  lines.push("");
  lines.push("[prod001]");
  lines.push("cProd=001");
  lines.push("cEAN=SEM GTIN");
  lines.push(`xProd=${xProdHomolog}`);
  lines.push("NCM=21069090");
  lines.push("CFOP=5102");
  lines.push("uCom=UN");
  lines.push("qCom=1.0000");
  lines.push(`vUnCom=${valor}`);
  lines.push(`vProd=${valor}`);
  lines.push("cEANTrib=SEM GTIN");
  lines.push("uTrib=UN");
  lines.push("qTrib=1.0000");
  lines.push(`vUnTrib=${valor}`);
  lines.push("indTot=1");
  lines.push("");
  lines.push("[ICMS001]");
  if (basics.usaCsosn) {
    lines.push("CSOSN=102");
    lines.push("Orig=0");
  } else {
    lines.push("CST=00");
    lines.push("Orig=0");
    lines.push("modBC=0");
    lines.push("vBC=0.00");
    lines.push("pICMS=0.00");
    lines.push("vICMS=0.00");
  }
  lines.push("");
  lines.push("[PIS001]");
  lines.push("CST=49");
  lines.push("");
  lines.push("[COFINS001]");
  lines.push("CST=49");
  lines.push("");
  // Pagamento dinheiro
  lines.push("[pag]");
  lines.push("");
  lines.push("[detPag001]");
  lines.push("indPag=0");
  lines.push("tPag=01");
  lines.push(`vPag=${valor}`);
  lines.push("");

  return lines.join("\r\n");
}
