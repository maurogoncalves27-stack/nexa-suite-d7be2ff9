/**
 * Builder de INI mínimo para emissão de NFC-e de homologação (teste R$ 0,01)
 * via ACBrLibNFe (NFE_CarregarINI / NFE_Assinar / NFE_Enviar).
 *
 * Mantém escopo restrito a teste ponta-a-ponta. NÃO é o emissor de produção
 * — esse continua via Focus NFe na edge function nfce-emit.
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
  /** Valor da NFC-e (default 0.01) */
  valor?: number;
  /** Município (default cidade da loja) */
  cMun?: number;
  /** UF código (default state da loja) */
  cUF?: number;
}

/**
 * Constrói INI mínimo válido para NFC-e de homologação.
 * - Produto: descrição obrigatória "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"
 * - 1 item R$ 0,01, pagamento dinheiro
 * - CST/CSOSN configurados conforme regime
 */
export function buildHomologacaoIni(store: StoreNfceCfg, opts: BuildOptions = {}): string {
  const cnpj = onlyDigits(store.cnpj);
  if (cnpj.length !== 14) throw new Error("CNPJ da loja inválido");

  const uf = (store.state ?? "").toUpperCase();
  const cUF = opts.cUF ?? UF_CODE[uf];
  if (!cUF) throw new Error(`UF '${uf}' sem código IBGE mapeado. Informe cUF manualmente.`);

  const cidadeKey = (store.city ?? "").toUpperCase().trim();
  const cMun = opts.cMun ?? MUN_CODE[cidadeKey];
  if (!cMun) throw new Error(`Município '${store.city}' sem código IBGE mapeado. Informe cMun manualmente.`);

  const serie = opts.serie ?? store.nfce_serie ?? 1;
  const nNF = opts.numeroNF ?? store.nfce_next_number ?? 1;
  const valor = (opts.valor ?? 0.01).toFixed(2);

  // Em homologação, xProd do PRIMEIRO item deve ser EXATAMENTE este texto.
  const xProdHomolog = "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

  // dhEmi com offset -03:00 (Brasília). Formato ISO sem milissegundos.
  const dt = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dhEmi = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T` +
                `${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}-03:00`;

  const tpAmb = store.nfce_environment === "producao" ? 1 : 2;
  const crt = store.regime_tributario === 3 ? 3 : 1; // 1=Simples, 3=Normal
  const ufEmit = uf;

  // Para Simples Nacional usa CSOSN 102; para Regime Normal usa CST 00.
  const usaCsosn = crt === 1;

  const lines: string[] = [];
  lines.push("[infNFe]");
  lines.push("versao=4.00");
  lines.push("");
  lines.push("[ide]");
  lines.push(`cUF=${cUF}`);
  lines.push("natOp=VENDA AO CONSUMIDOR");
  lines.push("mod=65");
  lines.push(`serie=${serie}`);
  lines.push(`nNF=${nNF}`);
  lines.push(`dhEmi=${dhEmi}`);
  lines.push("tpNF=1");
  lines.push("idDest=1");
  lines.push(`cMunFG=${cMun}`);
  lines.push("tpImp=4");
  lines.push("tpEmis=1");
  lines.push(`tpAmb=${tpAmb}`);
  lines.push("finNFe=1");
  lines.push("indFinal=1");
  lines.push("indPres=1");
  lines.push("procEmi=0");
  lines.push("");
  lines.push("[emit]");
  lines.push(`CNPJ=${cnpj}`);
  lines.push(`xNome=${store.legal_name ?? store.name}`);
  lines.push(`xFant=${store.name}`);
  lines.push(`IE=${onlyDigits(store.inscricao_estadual) || "ISENTO"}`);
  lines.push(`CRT=${crt}`);
  lines.push("");
  lines.push("[enderEmit]");
  lines.push(`xLgr=${store.address || "Rua Teste"}`);
  lines.push(`nro=${store.number || "S/N"}`);
  lines.push(`xBairro=${store.neighborhood || "Centro"}`);
  lines.push(`cMun=${cMun}`);
  lines.push(`xMun=${(store.city || "Brasilia").toUpperCase()}`);
  lines.push(`UF=${ufEmit}`);
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
  if (usaCsosn) {
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
