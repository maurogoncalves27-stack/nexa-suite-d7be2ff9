// ============================================================
// Wrapper koffi em torno da PGWebLib.dll (PayGo Integrado / Setis)
// ============================================================
// IMPORTANTE: NÃO usa ACBrLibTEFD. Fala direto com a API oficial
// PayGo Integrado (PW_i*). DLL e working dir vêm do instalador
// PayGo (PayGoLauncher já configura o PersonalizacaoConjunto.txt).
//
// Caminhos padrão (Windows):
//   x86 (instalador padrão): C:\Arquivos de Programas (x86)\PayGo\PGWebLib\x86\PGWebLib.dll
//   x64 (comum no Windows 64-bit): C:\Program Files (x86)\PayGo\PGWebLib\x64\PGWebLib.dll
// Pode sobrescrever com:
//   PAYGO_BASE      -> diretório onde está a PGWebLib.dll
//   PAYGO_WORKDIR   -> working dir passado para PW_iInit (default = PAYGO_BASE)
// ============================================================

const path = require("path");
const fs = require("fs");
const koffi = require("koffi");

function normalizeBaseCandidate(value) {
  if (!value) return null;
  return /\.dll$/i.test(value) ? path.dirname(value) : value;
}

const DEFAULT_BASES = [
  normalizeBaseCandidate(process.env.PAYGO_BASE),
  normalizeBaseCandidate(process.env.PathPGWebLib_x64),
  normalizeBaseCandidate(process.env.PathPGWebLib),
  "C:\\Arquivos de Programas (x86)\\PayGo\\PGWebLib\\x64",
  "C:\\Arquivos de Programas (x86)\\PayGo\\PGWebLib\\x86",
  "C:\\Program Files (x86)\\PayGo\\PGWebLib\\x64",
  "C:\\Program Files (x86)\\PayGo\\PGWebLib\\x86",
  "C:\\Program Files\\PayGo\\PGWebLib\\x64",
  "C:\\Program Files\\PayGo\\PGWebLib\\x86",
  "C:\\Arquivos de Programas (x86)\\PayGo\\PGWebLib",
  "C:\\Program Files (x86)\\PayGo\\PGWebLib",
  "C:\\Program Files\\PayGo\\PGWebLib",
].filter(Boolean);

const DEFAULT_WORK_DIR = path.join(
  process.env.ProgramData || "C:\\ProgramData",
  "PayGo",
  "PGWebLib",
);

function resolveBase() {
  // Para cada candidato, tenta o próprio diretório e também subpastas x64/x86.
  // Necessário porque o instalador PayGo costuma setar PathPGWebLib apontando
  // para a pasta base (sem x64/x86), mas a DLL real fica numa das subpastas.
  for (const b of DEFAULT_BASES) {
    const tries = [b, path.join(b, "x64"), path.join(b, "x86")];
    for (const t of tries) {
      try { if (fs.existsSync(path.join(t, "PGWebLib.dll"))) return t; } catch { /* ignore */ }
    }
  }
  return DEFAULT_BASES[0] || "C:\\Arquivos de Programas (x86)\\PayGo\\PGWebLib\\x64";
}

const PAYGO_BASE = resolveBase();
const DLL_PATH = path.join(PAYGO_BASE, "PGWebLib.dll");
const WORK_DIR = process.env.PAYGO_WORKDIR || DEFAULT_WORK_DIR;

// PayGo return codes (parcial — só o que importa pro fluxo)
const PWRET = {
  OK: 0,
  FROMHOSTINIT: -2554,
  FROMHOST: -2596,
  COMMERROR: -2553,
  CARDDIRECT: -2543,
  NOTINST: -2498,
  MOREDATA: -2497,
  DISPLAY: -2495,
  NOTHING: -2493,
  CANCEL: -2491,
  TIMEOUT: -2490,
  TRNNOTINIT: -2488,
  DLLNOTINIT: -2487,
  NOMANDATORY: -2483,
};

// PWINFO codes (entrada/saída)
const PWINFO = {
  AUTNAME: 21,
  AUTVER: 22,
  AUTDEV: 23,
  AUTCAP: 36,
  TOTAMNT: 37,       // valor total em centavos (string)
  CURRENCY: 38,      // 986 = BRL
  CURREXP: 39,       // 2 = centavos
  CARDTYPE: 41,      // 1 credito, 2 debito, 4 voucher
  FINTYPE: 59,       // 1 a vista, 2 parc emissor, 4 parc estab
  INSTALLMENTS: 60,  // qtd parcelas
  REQNUM: 50,
  AUTHSYST: 53,      // nome da rede/provedor
  VIRTMERCH: 54,
  RESULTMSG: 66,
  CNFREQ: 67,        // se 1, exige confirmação
  AUTLOCREF: 68,
  AUTEXTREF: 69,
  AUTHCODE: 70,
  RCPTMERCH: 83,     // via estabelecimento
  RCPTCHOLDER: 84,   // via cliente
  TRNORIGDATE: 87,
  TRNORIGNSU: 88,
  TRNORIGAMNT: 96,
  TRNORIGAUTH: 98,
  TRNORIGTIME: 115,
  DATETIME: 49,
};

const PWOPER = {
  INSTALL: 0x01,
  ADMIN: 0x20,
  SALE: 0x21,
  SALEVOID: 0x22,
};

const AUTOMATION_INFO = {
  name: "NEXA Suite",
  version: process.env.npm_package_version || "1.0.0",
  developer: "NEXA Gestao Inteligente",
  capabilities: "28",
};

const PAYGO_ENV = {
  PRODUCTION: 0,
  HOMOLOGATION: 1,
};

let lib = null;
let fn = {};
let initialized = false;
let available = null;
let lastInitError = null;

function normalizeRet(ret) {
  return ret > 32767 ? ret - 65536 : ret;
}

function explainRet(ret) {
  const code = normalizeRet(ret);
  switch (code) {
    case PWRET.NOTINST:
      return "PWRET_NOTINST: ponto de captura não instalado; faça a Instalação no PayGo antes da venda";
    case PWRET.DLLNOTINIT:
      return "PWRET_DLLNOTINIT: PW_iInit não foi executado";
    case PWRET.TRNNOTINIT:
      return "PWRET_TRNNOTINIT: PW_iNewTransac não foi executado";
    case PWRET.NOMANDATORY:
      return "PWRET_NOMANDATORY: faltam parâmetros obrigatórios da transação";
    case PWRET.COMMERROR:
    case PWRET.FROMHOST:
      return "erro de comunicação/host PayGo";
    default:
      return null;
  }
}

function resolveEnvironment(value) {
  if (value === undefined || value === null || value === "") return null;
  if (value === true || value === 1 || /^1|homolog/i.test(String(value))) return PAYGO_ENV.HOMOLOGATION;
  if (value === false || value === 0 || /^0|prod/i.test(String(value))) return PAYGO_ENV.PRODUCTION;
  return null;
}

function diagnostics() {
  return {
    dllExists: fs.existsSync(DLL_PATH),
    workdirExists: fs.existsSync(WORK_DIR),
    missing: [DLL_PATH, WORK_DIR].filter((p) => !fs.existsSync(p)),
    expected: { DLL_PATH, WORK_DIR, PAYGO_BASE },
    searchedBases: DEFAULT_BASES,
    arch: process.arch, // x64/ia32 — precisa casar com a DLL!
    initialized,
    lastInitError,
  };
}

function load() {
  if (lib) return lib;
  if (!fs.existsSync(DLL_PATH)) {
    available = false;
    throw new Error(`PGWebLib.dll não encontrada em ${DLL_PATH}.`);
  }
  lib = koffi.load(DLL_PATH);

  // PayGo Integrado usa __stdcall em Windows (WINAPI).
  fn.Init = lib.func("__stdcall", "PW_iInit", "short", ["string"]);
  fn.NewTransac = lib.func("__stdcall", "PW_iNewTransac", "short", ["short"]);
  fn.AddParam = lib.func("__stdcall", "PW_iAddParam", "short", ["short", "string"]);
  fn.ExecTransac = lib.func("__stdcall", "PW_iExecTransac", "short", ["void *", "_Inout_ short*"]);
  fn.GetResult = lib.func("__stdcall", "PW_iGetResult", "short", ["short", "_Out_ char*", "_Inout_ short*"]);
  fn.Confirmation = lib.func("__stdcall", "PW_iConfirmation", "short", ["short", "string", "string", "string", "string", "string"]);
  fn.PPEventLoop = lib.func("__stdcall", "PW_iPPEventLoop", "short", ["_Out_ char*", "_Inout_ short*"]);
  // Não há PW_iVersion oficial em todas as builds; usamos a leitura do INFO se faltar.
  try { fn.Version = lib.func("__stdcall", "PW_iVersion", "short", ["_Out_ char*", "_Inout_ short*"]); } catch { fn.Version = null; }
  try { fn.SetEnvironment = lib.func("__stdcall", "PW_iSetEnvironment", "short", ["short"]); } catch { fn.SetEnvironment = null; }

  available = true;
  return lib;
}

function getResult(code, bufSize = 1024) {
  let size = bufSize;
  const buf = Buffer.alloc(size);
  const sizeRef = [size];
  const ret = normalizeRet(fn.GetResult(code, buf, sizeRef));
  if (ret !== PWRET.OK) return null;
  return buf.slice(0, sizeRef[0]).toString("latin1").replace(/\0+$/, "");
}

function getResultAny(codes, bufSize = 1024) {
  for (const code of codes) {
    const value = getResult(code, bufSize);
    if (value) return value;
  }
  return null;
}

function addMandatoryAutomationParams() {
  fn.AddParam(PWINFO.AUTNAME, AUTOMATION_INFO.name);
  fn.AddParam(PWINFO.AUTVER, AUTOMATION_INFO.version);
  fn.AddParam(PWINFO.AUTDEV, AUTOMATION_INFO.developer);
  fn.AddParam(PWINFO.AUTCAP, AUTOMATION_INFO.capabilities);
}

function configureEnvironment(environment) {
  const env = resolveEnvironment(environment ?? process.env.PAYGO_ENV);
  if (env === null || !fn.SetEnvironment) return;
  if (initialized) {
    throw new Error(
      `PW_iSetEnvironment(${env}) exige PGWebLib ainda não inicializada neste processo; reinicie o agente local antes de instalar o PdC em ${env === PAYGO_ENV.HOMOLOGATION ? "homologação" : "produção"}`,
    );
  }

  const r = normalizeRet(fn.SetEnvironment(env));
  if (r !== PWRET.OK) {
    const detail = getResultAny([PWINFO.RESULTMSG], 2048);
    throw new Error(
      `PW_iSetEnvironment(${env}) falhou (${r})${explainRet(r) ? ` — ${explainRet(r)}` : ""}${detail ? ` — detalhe=${detail}` : ""}`,
    );
  }
}

function ensureInit({ environment } = {}) {
  if (initialized) return;
  load();
  configureEnvironment(environment);

  fs.mkdirSync(WORK_DIR, { recursive: true });

  const r = normalizeRet(fn.Init(WORK_DIR));
  if (r !== PWRET.OK) {
    lastInitError = `PW_iInit ret=${r}`;
    throw new Error(`PW_iInit falhou (${r})${explainRet(r) ? ` — ${explainRet(r)}` : ""} — workdir=${WORK_DIR}`);
  }
  initialized = true;
  lastInitError = null;
}

function startTransaction(op, label, { environment } = {}) {
  ensureInit({ environment });
  let r = normalizeRet(fn.NewTransac(op));

  if (r !== PWRET.OK) {
    const detail = getResultAny([PWINFO.RESULTMSG], 2048);
    throw new Error(
      `PW_iNewTransac(${label}) ret=${r}` +
      `${explainRet(r) ? ` — ${explainRet(r)}` : ""}` +
      `${detail ? ` — detalhe=${detail}` : ""}` +
      ` — workdir=${WORK_DIR}`,
    );
  }

  addMandatoryAutomationParams();
}

function isAvailable() {
  if (available !== null) return available;
  try { load(); return true; } catch { return false; }
}

function versao() {
  ensureInit();
  if (fn.Version) {
    const buf = Buffer.alloc(128);
    const sizeRef = [128];
    fn.Version(buf, sizeRef);
    return buf.slice(0, sizeRef[0]).toString("latin1").replace(/\0+$/, "") || "PGWebLib";
  }
  return "PGWebLib (sem PW_iVersion)";
}

function finalizar() {
  initialized = false;
  // PGWebLib não tem PW_iClose universal; reinicializar via PW_iInit cobre.
}

// Loop principal de execução de transação. Mantém polling até resposta final.
// onDisplay(msg) é chamado a cada PWRET_DISPLAY.
function runExecLoop({ onDisplay, timeoutMs = 120000 } = {}) {
  const start = Date.now();
  // PW_iExecTransac em alguns ambientes recebe ponteiro para struct de display;
  // passamos NULL e usamos PW_iPPEventLoop separadamente.
  while (true) {
    if (Date.now() - start > timeoutMs) throw new Error("Timeout transação TEF");

    const sizeRef = [0];
    const ret = normalizeRet(fn.ExecTransac(null, sizeRef));

    if (ret === PWRET.OK) return { ret };
    if (ret === PWRET.CANCEL) throw new Error("Transação cancelada (operador/pinpad)");
    if (ret === PWRET.TIMEOUT) throw new Error("Timeout no pinpad");
    if (ret === PWRET.COMMERROR) throw new Error("Erro de comunicação PayGo");

    if (ret === PWRET.DISPLAY || ret === PWRET.FROMHOST || ret === PWRET.FROMHOSTINIT
        || ret === PWRET.CARDDIRECT || ret === PWRET.MOREDATA || ret === PWRET.NOTHING) {
      // Lê mensagem de display se houver e segue o loop.
      const buf = Buffer.alloc(512);
      const dsr = [512];
      try {
        const r2 = normalizeRet(fn.PPEventLoop(buf, dsr));
        if (r2 === PWRET.OK && dsr[0] > 0 && onDisplay) {
          onDisplay(buf.slice(0, dsr[0]).toString("latin1").replace(/\0+$/, ""));
        }
      } catch { /* ignore */ }
      continue;
    }

    // Qualquer outro retorno não esperado: aborta com info.
    throw new Error(`PW_iExecTransac ret=${ret}${explainRet(ret) ? ` — ${explainRet(ret)}` : ""}`);
  }
}

function collectReceipts() {
  return {
    reqnum: getResult(PWINFO.REQNUM),
    nsu: getResult(PWINFO.AUTEXTREF),
    autorizacao: getResult(PWINFO.AUTHCODE),
    rede: getResult(PWINFO.AUTHSYST),
    resultado: getResult(PWINFO.RESULTMSG, 2048),
    locRef: getResult(PWINFO.AUTLOCREF),
    extRef: getResult(PWINFO.AUTEXTREF),
    virtMerch: getResult(PWINFO.VIRTMERCH),
    dataHora: getResult(PWINFO.DATETIME),
    requerConfirmacao: getResult(PWINFO.CNFREQ) === "1",
    viaEstabelecimento: getResult(PWINFO.RCPTMERCH, 4096),
    viaCliente: getResult(PWINFO.RCPTCHOLDER, 4096),
  };
}

/**
 * Iniciar pagamento.
 * @param {object} req { valor (number em reais), tipo, parcelas, financiamento, onDisplay }
 *   tipo: 'credito' | 'debito' | 'voucher' | 'pix'
 */
function efetuarPagamento({ valor, tipo = "credito", parcelas = 1, financiamento = 1, onDisplay } = {}) {
  if (!valor || valor <= 0) throw new Error("valor obrigatório");
  startTransaction(PWOPER.SALE, "sale");

  const centavos = Math.round(Number(valor) * 100).toString();
  const cardTypeMap = { credito: "1", debito: "2", voucher: "4" };
  const cardType = cardTypeMap[tipo] || null;

  fn.AddParam(PWINFO.TOTAMNT, centavos);
  fn.AddParam(PWINFO.CURRENCY, "986");
  fn.AddParam(PWINFO.CURREXP, "2");
  if (cardType) fn.AddParam(PWINFO.CARDTYPE, cardType);
  if (tipo === "credito" && parcelas > 1) {
    fn.AddParam(PWINFO.INSTALLMENTS, String(parcelas));
    fn.AddParam(PWINFO.FINTYPE, String(financiamento || 4));
  }

  runExecLoop({ onDisplay });
  const receipts = collectReceipts();

  // Confirmação se exigido
  if (receipts.requerConfirmacao) {
    try {
      fn.Confirmation(0, receipts.reqnum || "", receipts.locRef || "", receipts.extRef || "", receipts.virtMerch || "", receipts.rede || "");
    } catch { /* ignore */ }
  }
  return receipts;
}

function cancelarEmAndamento() {
  // PayGo não tem abort cooperativo: o operador cancela no pinpad.
  // Marcamos initialized=false para próxima chamada reiniciar limpa.
  initialized = false;
}

/**
 * Cancelamento administrativo (chama menu admin do pinpad).
 * @param {object} req { valor, nsu, data (DDMMAAAA) } — opcional, abre menu se vazio
 */
function cancelarVenda({ valor, nsu, data, onDisplay } = {}) {
  startTransaction(PWOPER.SALEVOID, "refund");

  fn.AddParam(PWINFO.CURRENCY, "986");
  fn.AddParam(PWINFO.CURREXP, "2");
  if (valor) fn.AddParam(PWINFO.TRNORIGAMNT, Math.round(Number(valor) * 100).toString());
  if (nsu) fn.AddParam(PWINFO.TRNORIGNSU, String(nsu));
  if (data) fn.AddParam(PWINFO.TRNORIGDATE, String(data).slice(0, 6));

  runExecLoop({ onDisplay });
  const receipts = collectReceipts();
  if (receipts.requerConfirmacao) {
    try {
      fn.Confirmation(0, receipts.reqnum || "", receipts.locRef || "", receipts.extRef || "", receipts.virtMerch || "", receipts.rede || "");
    } catch { /* ignore */ }
  }
  return receipts;
}

/**
 * Operação administrativa do pinpad (relatórios, teste comunicação).
 */
function administrativo({ onDisplay } = {}) {
  startTransaction(PWOPER.ADMIN, "admin");
  runExecLoop({ onDisplay });
  return collectReceipts();
}

function instalarPdc({ onDisplay, environment } = {}) {
  startTransaction(PWOPER.INSTALL, "install", { environment });
  runExecLoop({ onDisplay, timeoutMs: 180000 });
  return collectReceipts();
}

module.exports = {
  isAvailable,
  ensureInit,
  finalizar,
  versao,
  efetuarPagamento,
  cancelarEmAndamento,
  cancelarVenda,
  administrativo,
  instalarPdc,
  diagnostics,
  paths: { DLL_PATH, WORK_DIR, PAYGO_BASE },
};
