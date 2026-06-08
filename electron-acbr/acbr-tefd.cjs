// ============================================================
// Wrapper koffi em torno da PGWebLib.dll (PayGo Integrado / Setis)
// ============================================================
// IMPORTANTE: NÃO usa ACBrLibTEFD. Fala direto com a API oficial
// PayGo Integrado (PW_i*). DLL e working dir vêm do instalador
// PayGo (PayGoLauncher já configura o PersonalizacaoConjunto.txt).
//
// Caminhos padrão (Windows):
//   x86 (instalador padrão): C:\Arquivos de Programas (x86)\PayGo\PGWebLib\PGWebLib.dll
//   x64 (raro):              C:\Program Files\PayGo\PGWebLib\PGWebLib.dll
// Pode sobrescrever com:
//   PAYGO_BASE      -> diretório onde está a PGWebLib.dll
//   PAYGO_WORKDIR   -> working dir passado para PW_iInit (default = PAYGO_BASE)
// ============================================================

const path = require("path");
const fs = require("fs");
const koffi = require("koffi");

const DEFAULT_BASES = [
  process.env.PAYGO_BASE,
  "C:\\Arquivos de Programas (x86)\\PayGo\\PGWebLib",
  "C:\\Program Files (x86)\\PayGo\\PGWebLib",
  "C:\\Program Files\\PayGo\\PGWebLib",
].filter(Boolean);

function resolveBase() {
  for (const b of DEFAULT_BASES) {
    try { if (fs.existsSync(path.join(b, "PGWebLib.dll"))) return b; } catch { /* ignore */ }
  }
  return DEFAULT_BASES[0] || "C:\\Arquivos de Programas (x86)\\PayGo\\PGWebLib";
}

const PAYGO_BASE = resolveBase();
const DLL_PATH = path.join(PAYGO_BASE, "PGWebLib.dll");
const WORK_DIR = process.env.PAYGO_WORKDIR || PAYGO_BASE;

// PayGo return codes (parcial — só o que importa pro fluxo)
const PWRET = {
  OK: 0,
  NOTHING: 1,
  MOREDATA: 2,
  CANCEL: 9,
  TIMEOUT: 11,
  DISPLAY: 23,
  OPERATION_REQUEST: 31,
  COMMERROR: 18,
  FROMHOST: 24,
  FROMHOSTINIT: 25,
  CARDDIRECT: 32,
  PINPAD_INIT_FAIL: 16,
};

// PWINFO codes (entrada/saída)
const PWINFO = {
  TOTAMNT: 515,      // valor total em centavos (string)
  CURRENCY: 514,     // 986 = BRL
  PAYMTYPE: 517,     // 1 credito, 2 debito, 4 voucher, 5 outros, M menu, P PIX
  INSTALLMENTS: 522, // qtd parcelas
  FINTYPE: 524,      // 1 a vista, 2 parc emissor, 3 parc estab
  HOSTNSU: 132,
  AUTHCODE: 134,
  AUTHSYST: 138,     // nome da rede
  CNFREQ: 121,       // se 1, exige confirmação
  RCPTPRN: 129,      // via cliente
  RCPTMERCH: 130,    // via estabelecimento
  RCPTCHOLDER: 131,  // via portador
  TRNDATE: 136,
  TRNTIME: 137,
};

const PWOPER = {
  ADMIN: 0x20,
  SALE: 0x21,
  SALEVOID: 0x22,
};

let lib = null;
let fn = {};
let initialized = false;
let available = null;
let lastInitError = null;

function diagnostics() {
  return {
    dllExists: fs.existsSync(DLL_PATH),
    workdirExists: fs.existsSync(WORK_DIR),
    missing: [DLL_PATH, WORK_DIR].filter((p) => !fs.existsSync(p)),
    expected: { DLL_PATH, WORK_DIR, PAYGO_BASE },
    arch: process.arch, // x64/ia32 — precisa casar com a DLL!
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
  fn.Init = lib.func("__stdcall", "PW_iInit", "int", ["string"]);
  fn.NewTransac = lib.func("__stdcall", "PW_iNewTransac", "int", ["short"]);
  fn.AddParam = lib.func("__stdcall", "PW_iAddParam", "int", ["short", "string"]);
  fn.ExecTransac = lib.func("__stdcall", "PW_iExecTransac", "int", ["void *", "_Inout_ short*"]);
  fn.GetResult = lib.func("__stdcall", "PW_iGetResult", "int", ["short", "_Out_ char*", "_Inout_ short*"]);
  fn.Confirmation = lib.func("__stdcall", "PW_iConfirmation", "int", ["short", "string"]);
  fn.PPEventLoop = lib.func("__stdcall", "PW_iPPEventLoop", "int", ["_Out_ char*", "_Inout_ short*"]);
  // Não há PW_iVersion oficial em todas as builds; usamos a leitura do INFO se faltar.
  try { fn.Version = lib.func("__stdcall", "PW_iVersion", "int", ["_Out_ char*", "_Inout_ short*"]); } catch { fn.Version = null; }

  available = true;
  return lib;
}

function getResult(code, bufSize = 1024) {
  let size = bufSize;
  const buf = Buffer.alloc(size);
  const sizeRef = [size];
  const ret = fn.GetResult(code, buf, sizeRef);
  if (ret !== PWRET.OK) return null;
  return buf.slice(0, sizeRef[0]).toString("latin1").replace(/\0+$/, "");
}

function ensureInit() {
  if (initialized) return;
  load();
  const r = fn.Init(WORK_DIR);
  if (r !== PWRET.OK) {
    lastInitError = `PW_iInit ret=${r}`;
    throw new Error(`PW_iInit falhou (${r}) — workdir=${WORK_DIR}`);
  }
  initialized = true;
  lastInitError = null;
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
    const ret = fn.ExecTransac(null, sizeRef);

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
        const r2 = fn.PPEventLoop(buf, dsr);
        if (r2 === PWRET.OK && dsr[0] > 0 && onDisplay) {
          onDisplay(buf.slice(0, dsr[0]).toString("latin1").replace(/\0+$/, ""));
        }
      } catch { /* ignore */ }
      continue;
    }

    // Qualquer outro retorno não esperado: aborta com info.
    throw new Error(`PW_iExecTransac ret=${ret}`);
  }
}

function collectReceipts() {
  return {
    nsu: getResult(PWINFO.HOSTNSU),
    autorizacao: getResult(PWINFO.AUTHCODE),
    rede: getResult(PWINFO.AUTHSYST),
    data: getResult(PWINFO.TRNDATE),
    hora: getResult(PWINFO.TRNTIME),
    requerConfirmacao: getResult(PWINFO.CNFREQ) === "1",
    viaCliente: getResult(PWINFO.RCPTPRN, 4096),
    viaEstabelecimento: getResult(PWINFO.RCPTMERCH, 4096),
    viaPortador: getResult(PWINFO.RCPTCHOLDER, 4096),
  };
}

/**
 * Iniciar pagamento.
 * @param {object} req { valor (number em reais), tipo, parcelas, financiamento, onDisplay }
 *   tipo: 'credito' | 'debito' | 'voucher' | 'pix'
 */
function efetuarPagamento({ valor, tipo = "credito", parcelas = 1, financiamento = 1, onDisplay } = {}) {
  ensureInit();
  if (!valor || valor <= 0) throw new Error("valor obrigatório");

  let r = fn.NewTransac(PWOPER.SALE);
  if (r !== PWRET.OK) throw new Error(`PW_iNewTransac ret=${r}`);

  const centavos = Math.round(Number(valor) * 100).toString();
  const paymTypeMap = { credito: "1", debito: "2", voucher: "4", pix: "P" };
  const paymType = paymTypeMap[tipo] || "M"; // M = menu, deixa pinpad decidir

  fn.AddParam(PWINFO.TOTAMNT, centavos);
  fn.AddParam(PWINFO.CURRENCY, "986");
  fn.AddParam(PWINFO.PAYMTYPE, paymType);
  if (tipo === "credito" && parcelas > 1) {
    fn.AddParam(PWINFO.INSTALLMENTS, String(parcelas));
    fn.AddParam(PWINFO.FINTYPE, String(financiamento || 2));
  }

  runExecLoop({ onDisplay });
  const receipts = collectReceipts();

  // Confirmação se exigido
  if (receipts.requerConfirmacao) {
    try { fn.Confirmation(0 /* CNF_CONF */, receipts.nsu || ""); } catch { /* ignore */ }
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
  ensureInit();
  const r = fn.NewTransac(PWOPER.SALEVOID);
  if (r !== PWRET.OK) throw new Error(`PW_iNewTransac(refund) ret=${r}`);

  fn.AddParam(PWINFO.CURRENCY, "986");
  if (valor) fn.AddParam(PWINFO.TOTAMNT, Math.round(Number(valor) * 100).toString());
  if (nsu) fn.AddParam(PWINFO.HOSTNSU, String(nsu));
  if (data) fn.AddParam(PWINFO.TRNDATE, String(data));

  runExecLoop({ onDisplay });
  const receipts = collectReceipts();
  if (receipts.requerConfirmacao) {
    try { fn.Confirmation(0, receipts.nsu || ""); } catch { /* ignore */ }
  }
  return receipts;
}

/**
 * Operação administrativa do pinpad (relatórios, teste comunicação).
 */
function administrativo({ onDisplay } = {}) {
  ensureInit();
  const r = fn.NewTransac(PWOPER.ADMIN);
  if (r !== PWRET.OK) throw new Error(`PW_iNewTransac(admin) ret=${r}`);
  runExecLoop({ onDisplay });
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
  diagnostics,
  paths: { DLL_PATH, WORK_DIR, PAYGO_BASE },
};
