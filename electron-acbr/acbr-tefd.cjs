// ============================================================
// Wrapper koffi em torno da PGWebLib.dll (PayGo Integrado / Setis)
// ============================================================
// Alinhado 100% ao demo oficial C# da Setis:
//   https://github.com/adminti2/Integracao-PayGoWeb-CSharp
//   (PDV/Muxx.Lib/Services/PGWebLib.cs + Fluxos.cs)
//
// Assinaturas, struct PW_GetData, params iniciais e códigos PWCNF
// replicam exatamente o que o demo C# usa em produção/sandbox.
//
// IMPORTANTE: NÃO usa ACBrLibTEFD. Fala direto com a API PW_i*.
// Roda em Electron ia32 (32-bit) — carrega PGWebLib.dll de 32-bit.
//
// Override via env: PAYGO_BASE, PAYGO_WORKDIR
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
  normalizeBaseCandidate(process.env.PathPGWebLib_x86),
  normalizeBaseCandidate(process.env.PathPGWebLib),
  // x64 primeiro (build atual do agente é x64)
  "C:\\Arquivos de Programas (x86)\\PayGo\\PGWebLib\\x64",
  "C:\\Program Files (x86)\\PayGo\\PGWebLib\\x64",
  "C:\\Program Files\\PayGo\\PGWebLib\\x64",
  // fallback 32-bit (caso o agente seja reempacotado em ia32)
  "C:\\Arquivos de Programas (x86)\\PayGo\\PGWebLib\\x86",
  "C:\\Program Files (x86)\\PayGo\\PGWebLib\\x86",
  "C:\\Program Files\\PayGo\\PGWebLib\\x86",
  // raiz (instalações antigas)
  "C:\\Arquivos de Programas (x86)\\PayGo\\PGWebLib",
  "C:\\Program Files (x86)\\PayGo\\PGWebLib",
  "C:\\Program Files\\PayGo\\PGWebLib",
  "C:\\NexaACBr\\bin",
  "C:\\NexaACBr",
].filter(Boolean);

// Workdir do PGWebLib precisa apontar para a MESMA pasta onde o PayGo Windows
// (UI Setis) instalou o PdC. Senão a DLL integrada não enxerga o PdC e devolve
// PWRET_NOTINST (-2498). PayGo Windows instala, por padrão, em "C:\PGWebLib"
// (raiz do disco) — é lá que ele cria a subpasta <PontoDeCaptura>\ com os
// arquivos de configuração. Como fallback, tentamos %ProgramData%\PGWebLib e
// só por último o %LOCALAPPDATA% (que NUNCA terá PdC instalado pela UI).
const PDC_FROM_ENV = (process.env.PontoDeCaptura || process.env.PDC || "").trim();

const WORK_DIR_CANDIDATES = [
  process.env.PAYGO_WORKDIR,
  "C:\\PGWebLib",
  path.join(process.env.ProgramData || "C:\\ProgramData", "PGWebLib"),
  path.join(process.env.ProgramData || "C:\\ProgramData", "PayGo", "PGWebLib"),
  path.join(process.env.PUBLIC || "C:\\Users\\Public", "PGWebLib"),
  path.join(process.env.LOCALAPPDATA || process.env.APPDATA || "C:\\ProgramData", "NexaACBr", "PayGo"),
].filter(Boolean);

function resolveBase() {
  // Em processo x64, prioriza pasta x64; em ia32, prioriza x86.
  const archSubdir = process.arch === "ia32" ? "x86" : "x64";
  for (const b of DEFAULT_BASES) {
    const tries = [path.join(b, archSubdir), b, path.dirname(b)];
    for (const t of tries) {
      try { if (fs.existsSync(path.join(t, "PGWebLib.dll"))) return t; } catch { /* ignore */ }
    }
  }
  return DEFAULT_BASES[0] || "C:\\Arquivos de Programas (x86)\\PayGo\\PGWebLib";
}

function hasPdcInstalled(workdir, pdc) {
  if (!workdir) return false;
  try {
    if (!fs.existsSync(workdir)) return false;
    // PayGo cria <workdir>\<PontoDeCaptura>\ com arquivos .dat/.bin após install
    if (pdc) {
      const pdcDir = path.join(workdir, pdc);
      if (fs.existsSync(pdcDir)) return true;
    }
    // Heurística: workdir tem algum subdiretório com nome só de dígitos (id PdC)
    const entries = fs.readdirSync(workdir, { withFileTypes: true });
    return entries.some((e) => e.isDirectory() && /^\d{4,}$/.test(e.name));
  } catch {
    return false;
  }
}

function resolveWorkDir() {
  // 1) Workdir que já tem o PdC instalado vence sempre
  for (const w of WORK_DIR_CANDIDATES) {
    if (hasPdcInstalled(w, PDC_FROM_ENV)) return w;
  }
  // 2) Senão, primeiro candidato existente (preferindo C:\PGWebLib)
  for (const w of WORK_DIR_CANDIDATES) {
    try { if (fs.existsSync(w)) return w; } catch { /* ignore */ }
  }
  // 3) Último recurso: LOCALAPPDATA (será criado em runtime)
  return WORK_DIR_CANDIDATES[WORK_DIR_CANDIDATES.length - 1];
}

const PAYGO_BASE = resolveBase();
const DLL_PATH = path.join(PAYGO_BASE, "PGWebLib.dll");
const WORK_DIR = resolveWorkDir();

// ============================================================
// Enums do C# (Muxx.Lib/ValueObjects/Enums)
// ============================================================
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

// PWINFO — IDs alinhados ao demo Setis PowerShell (PGWebLib.dll).
const PWINFO = {
  PPPPWD: 0x03,
  AUTIP: 0x05,
  AUTPORT: 0x07,
  POSID: 0x11,
  AUTNAME: 0x15,
  AUTVER: 0x16,
  AUTDEV: 0x17,
  DESTTCPIP: 0x1B,
  MERCHCNPJCPF: 0x1C,
  AUTCAP: 0x24,
  TOTAMNT: 0x25,
  CURRENCY: 0x26,
  CURREXP: 0x27,
  FISCALREF: 0x28,
  CARDTYPE: 0x29,
  REQNUM: 0x32,
  DATETIME: 0x31, // não usado diretamente; mantido por compat.
  AUTHSYST: 0x35,
  VIRTMERCH: 0x36,
  FINTYPE: 0x3B,
  INSTALLMENTS: 0x3C,
  RESULTMSG: 0x42,
  CNFREQ: 0x43,
  AUTLOCREF: 0x44,
  AUTEXTREF: 0x45,
  AUTHCODE: 0x46,
  CARDNAME: 0x4B,
  RCPTFULL: 0x52,
  RCPTMERCH: 0x53,
  RCPTCHOLDER: 0x54,
  TRNORIGDATE: 87,
  TRNORIGNSU: 88,
  TRNORIGAMNT: 96,
  TRNORIGAUTH: 98,
  TRNORIGTIME: 115,
  AUTHMNGTUSER: 0xF5,
  AUTHTECHUSER: 0xF6,
  DSPQRPREF: 0x7F50,
  PAYMNTTYPE: 0x1F21,
  USINGPINPAD: 0x7F01,
  PPCOMMPORT: 0x7F02,
  AUTADDRESS: 0x7F1F,
};

const PWOPER = {
  INSTALL: 0x01,
  ADMIN: 0x20,
  SALE: 0x21,
  SALEVOID: 0x22,
};

// PWINFO_AUTCAP bitmask (demo Setis usa 452 = VALOR_FIXO + CUPOM_VIAS_DIFERENCIADAS
// + REMOCAO_CARTAO + DSP_CHECKOUT + DSP_QRCODE).
const PWINFO_AUTCAP = {
  TROCO_SAQUE: 1,
  DESCONTO: 2,
  VALOR_FIXO: 4,
  CUPOM_VIAS_DIFERENCIADAS: 8,
  CUPOM_REDUZIDO: 16,
  SALDO_TOTAL_VOUCHER: 32,
  REMOCAO_CARTAO: 64,
  DSP_CHECKOUT: 128,
  DSP_QRCODE: 256,
};

// PWDAT — tipos de captura solicitados pelo MOREDATA.
// VALORES OFICIAIS DA PGWebLib (bridge Setis):
const PWDAT = {
  MENU: 1,
  TYPED: 2,
  CARDINF: 3,
  PPENTRY: 5,
  PPENCPIN: 6,
  CARDOFF: 9,
  CARDONL: 10,
  PPCONF: 11,
  BARCODE: 12,
  PPREMCRD: 13,
  PPGENCMD: 14,
  PPDATAPOSCNF: 16,
  USERAUTH: 17,
  DSPCHECKOUT: 18,
  TSTKEY: 19,
  DSPQRCODE: 20,
};

// PWCNF — confirmação (valores oficiais do demo)
const PWCNF = {
  CNF_AUTO: 0x121,
  CNF_MANU_AUT: 0x3221,
  REV_MANU_AUT: 0x3231,
  REV_ABORT: 0x43131,
};

// Params iniciais (alinhados ao demo Setis: AUTCAP=452, DSPQRPREF=2).
const AUTOMATION_INFO = {
  name: "PDV",
  version: "1.0.0",
  developer: "PayGo",
  capabilities: "452",
  dspqrpref: "2", // EXIBE_CHECKOUT
};

let lib = null;
let fn = {};
let initialized = false;
let available = null;
let lastInitError = null;

// ============================================================
// Struct PW_GetData (LayoutKind.Sequential, CharSet = Ansi)
// Replica bit-a-bit Muxx.Lib/ValueObjects/Structs/PW_GetData.cs
// ============================================================
let PW_GetData = null;
let PW_GetDataArray9 = null;

function defineStruct() {
  if (PW_GetData) return;
  const TextoMenu = koffi.struct("TextoMenu", {
    szTextoMenu: koffi.array("char", 41, "String"),
  });
  const ValorMenu = koffi.struct("ValorMenu", {
    szValorMenu: koffi.array("char", 256, "String"),
  });
  PW_GetData = koffi.struct("PW_GetData", {
    wIdentificador: "uint16",
    bTipoDeDado: "uint8",
    szPrompt: koffi.array("char", 84, "String"),
    bNumOpcoesMenu: "uint8",
    vszTextoMenu: koffi.array(TextoMenu, 40),
    vszValorMenu: koffi.array(ValorMenu, 40),
    szMascaraDeCaptura: koffi.array("char", 41, "String"),
    bTiposEntradaPermitidos: "uint8",
    bTamanhoMinimo: "uint8",
    bTamanhoMaximo: "uint8",
    ulValorMinimo: "int32",
    ulValorMaximo: "int32",
    bOcultarDadosDigitados: "uint8",
    bValidacaoDado: "uint8",
    bAceitaNulo: "uint8",
    szValorInicial: koffi.array("char", 41, "String"),
    bTeclasDeAtalho: "uint8",
    szMsgValidacao: koffi.array("char", 84, "String"),
    szMsgConfirmacao: koffi.array("char", 84, "String"),
    szMsgDadoMaior: koffi.array("char", 84, "String"),
    szMsgDadoMenor: koffi.array("char", 84, "String"),
    bCapturarDataVencCartao: "uint8",
    ulTipoEntradaCartao: "int32",
    bItemInicial: "uint8",
    bNumeroCapturas: "uint8",
    szMsgPrevia: koffi.array("char", 84, "String"),
    bTipoEntradaCodigoBarras: "uint8",
    bOmiteMsgAlerta: "uint8",
    bStartFromLeft: "uint8",
    bNotificarCancelamento: "uint8",
  });
  PW_GetDataArray9 = koffi.array(PW_GetData, 9);
}

function normalizeRet(ret) {
  return ret > 32767 ? ret - 65536 : ret;
}

function explainRet(ret) {
  const code = normalizeRet(ret);
  switch (code) {
    case PWRET.NOTINST:
      return "PWRET_NOTINST: ponto de captura não instalado; ative o PdC pela UI do PayGo Windows antes da venda";
    case PWRET.DLLNOTINIT:
      return "PWRET_DLLNOTINIT: PW_iInit não foi executado";
    case PWRET.TRNNOTINIT:
      return "PWRET_TRNNOTINIT: PW_iNewTransac não foi executado";
    case PWRET.NOMANDATORY:
      return "PWRET_NOMANDATORY: faltam parâmetros obrigatórios da transação";
    case PWRET.COMMERROR:
    case PWRET.FROMHOST:
      return "erro de comunicação/host PayGo";
    case PWRET.CANCEL:
      return "PWRET_CANCEL: operação cancelada pelo operador ou pinpad";
    case PWRET.TIMEOUT:
      return "PWRET_TIMEOUT: tempo esgotado aguardando pinpad";
    default:
      return null;
  }
}

function diagnostics() {
  const pdcInstalledAt = WORK_DIR_CANDIDATES.find((w) => hasPdcInstalled(w, PDC_FROM_ENV)) || null;
  return {
    dllExists: fs.existsSync(DLL_PATH),
    workdirExists: fs.existsSync(WORK_DIR),
    missing: [DLL_PATH, WORK_DIR].filter((p) => !fs.existsSync(p)),
    expected: { DLL_PATH, WORK_DIR, PAYGO_BASE },
    searchedBases: DEFAULT_BASES,
    workDirCandidates: WORK_DIR_CANDIDATES,
    pdcFromEnv: PDC_FROM_ENV || null,
    pdcInstalledAt,
    arch: process.arch,
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
  defineStruct();
  lib = koffi.load(DLL_PATH);

  // Convenção CDECL — alinhado à demo funcional Setis/PowerShell.
  // Demo C# original também declarou CallingConvention.Cdecl em TODOS
  // os delegates PW_i*. Usar __stdcall corrompia o stack e causava
  // PWRET inesperado / TIMEOUT.
  fn.Init = lib.func("__cdecl", "PW_iInit", "short", ["string"]);
  fn.NewTransac = lib.func("__cdecl", "PW_iNewTransac", "short", ["uint8"]);
  fn.AddParam = lib.func("__cdecl", "PW_iAddParam", "short", ["uint16", "string"]);
  fn.ExecTransac = lib.func(
    "__cdecl",
    "PW_iExecTransac",
    "short",
    [koffi.out(koffi.pointer(PW_GetDataArray9)), koffi.inout(koffi.pointer("int16"))],
  );
  fn.GetResult = lib.func(
    "__cdecl",
    "PW_iGetResult",
    "short",
    ["int16", koffi.out("char*"), "uint32"],
  );
  fn.Confirmation = lib.func(
    "__cdecl",
    "PW_iConfirmation",
    "short",
    ["uint32", "string", "string", "string", "string", "string"],
  );
  fn.PPEventLoop = lib.func(
    "__cdecl",
    "PW_iPPEventLoop",
    "short",
    [koffi.out("char*"), "uint32"],
  );
  try {
    fn.PPAbort = lib.func("__cdecl", "PW_iPPAbort", "short", []);
  } catch { fn.PPAbort = null; }

  try { fn.PPGetCard = lib.func("__cdecl", "PW_iPPGetCard", "short", ["uint16"]); } catch { fn.PPGetCard = null; }
  try { fn.PPGetPIN = lib.func("__cdecl", "PW_iPPGetPIN", "short", ["uint16"]); } catch { fn.PPGetPIN = null; }
  try { fn.PPGetData = lib.func("__cdecl", "PW_iPPGetData", "short", ["uint16"]); } catch { fn.PPGetData = null; }
  try { fn.PPGoOnChip = lib.func("__cdecl", "PW_iPPGoOnChip", "short", ["uint16"]); } catch { fn.PPGoOnChip = null; }
  try { fn.PPFinishChip = lib.func("__cdecl", "PW_iPPFinishChip", "short", ["uint16"]); } catch { fn.PPFinishChip = null; }
  try { fn.PPConfirmData = lib.func("__cdecl", "PW_iPPConfirmData", "short", ["uint16"]); } catch { fn.PPConfirmData = null; }
  try { fn.PPRemoveCard = lib.func("__cdecl", "PW_iPPRemoveCard", "short", []); } catch { fn.PPRemoveCard = null; }
  try { fn.PPGenericCMD = lib.func("__cdecl", "PW_iPPGenericCMD", "short", ["uint16"]); } catch { fn.PPGenericCMD = null; }
  try { fn.PPPositiveConfirmation = lib.func("__cdecl", "PW_iPPPositiveConfirmation", "short", ["uint16"]); } catch { fn.PPPositiveConfirmation = null; }
  try { fn.PPTestKey = lib.func("__cdecl", "PW_iPPTestKey", "short", ["uint16"]); } catch { fn.PPTestKey = null; }

  available = true;
  return lib;
}

function getResult(code, bufSize = 1024) {
  const buf = Buffer.alloc(bufSize);
  const ret = normalizeRet(fn.GetResult(code, buf, bufSize));
  if (ret !== PWRET.OK) return null;
  // String ANSI terminada em nulo.
  const end = buf.indexOf(0);
  return buf.slice(0, end >= 0 ? end : bufSize).toString("latin1");
}

function getResultAny(codes, bufSize = 1024) {
  for (const code of codes) {
    const value = getResult(code, bufSize);
    if (value) return value;
  }
  return null;
}

// Params obrigatórios em TODA transação (igual MainWindow.xaml.cs do demo).
function addMandatoryAutomationParams() {
  fn.AddParam(PWINFO.AUTNAME, AUTOMATION_INFO.name);
  fn.AddParam(PWINFO.AUTVER, AUTOMATION_INFO.version);
  fn.AddParam(PWINFO.AUTDEV, AUTOMATION_INFO.developer);
  fn.AddParam(PWINFO.AUTCAP, AUTOMATION_INFO.capabilities);
  fn.AddParam(PWINFO.DSPQRPREF, AUTOMATION_INFO.dspqrpref);
}

function safeMkdir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch (e) {
    if (e && (e.code === "EPERM" || e.code === "EACCES")) {
      const fallback = path.join(
        process.env.LOCALAPPDATA || process.env.APPDATA || process.env.TEMP || "C:\\Temp",
        "NexaACBr", "PayGo",
      );
      try { fs.mkdirSync(fallback, { recursive: true }); return fallback; }
      catch { /* ignore */ }
    }
    throw e;
  }
}

function ensureInit() {
  if (initialized) return;
  load();
  const workdir = safeMkdir(WORK_DIR);
  const r = normalizeRet(fn.Init(workdir));
  if (r !== PWRET.OK) {
    lastInitError = `PW_iInit ret=${r}`;
    throw new Error(`PW_iInit falhou (${r})${explainRet(r) ? ` — ${explainRet(r)}` : ""} — workdir=${workdir}`);
  }
  initialized = true;
  lastInitError = null;
}

function startTransaction(op, label) {
  ensureInit();
  const r = normalizeRet(fn.NewTransac(op));
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
  return "PGWebLib (PayGo Integrado)";
}

function finalizar() {
  initialized = false;
}

// ============================================================
// ============================================================
// Loop principal — replica Fluxos.FluxoExecTransac do demo Setis.
// Aloca PW_GetData[9], chama PW_iExecTransac e PILOTA O PINPAD
// (PW_iPPGetCard, PW_iPPGetPIN, PW_iPPRemoveCard, etc.) conforme
// o tipo retornado em cada slot. Sem essa pilotagem, o pinpad
// fica esperando para sempre e a transação dá timeout.
// ============================================================

// Sentinel: timeout depois de PPREMCRD com mensagem "AUTORIZADA"
// é tratado como OK — pinpad já liberou a transação, só travou
// na finalização do remove-card.
const BRIDGE_AUTHORIZED_AFTER_REMOVE_TIMEOUT = 1;

function readDisplay(bufSize = 512) {
  const dbuf = Buffer.alloc(bufSize);
  try {
    const r = normalizeRet(fn.PPEventLoop(dbuf, bufSize));
    const end = dbuf.indexOf(0);
    const msg = dbuf.slice(0, end >= 0 ? end : bufSize).toString("latin1").trim();
    return { ret: r, msg };
  } catch {
    return { ret: -1, msg: "" };
  }
}

function isAuthorizedMessage(msg) {
  return (msg || "").toUpperCase().includes("AUTORIZ");
}

// PinpadLoop síncrono — drena PW_iPPEventLoop até PWRET_OK ou erro.
function pinpadLoop({ context = "", onDisplay, timeoutMs = 270000 } = {}) {
  const deadline = Date.now() + (context === "removeCard" ? Math.min(timeoutMs, 30000) : timeoutMs);
  let lastDisplay = "";
  // Sleep curto: PWRET_NOTHING significa "pinpad ainda processando".
  // Bloqueante (Atomics.wait) pra não floodar — só é usado no caminho
  // síncrono. O async tem sleep via setTimeout.
  const sleepSync = (ms) => {
    const sab = new SharedArrayBuffer(4);
    Atomics.wait(new Int32Array(sab), 0, 0, ms);
  };
  while (true) {
    if (Date.now() > deadline) {
      if (fn.PPAbort) { try { fn.PPAbort(); } catch { /* ignore */ } }
      return PWRET.TIMEOUT;
    }
    const { ret, msg } = readDisplay(256);
    if (ret === PWRET.OK) return PWRET.OK;
    if (ret === PWRET.DISPLAY || ret === PWRET.NOTHING) {
      if (ret === PWRET.DISPLAY && msg && msg !== lastDisplay) {
        lastDisplay = msg;
        if (onDisplay) onDisplay(msg);
      }
      sleepSync(150);
      continue;
    }
    return ret;
  }
}

function pinpadLoopAsync({ context = "", onDisplay, timeoutMs = 270000, shouldAbort } = {}) {
  return new Promise((resolve) => {
    const deadline = Date.now() + (context === "removeCard" ? Math.min(timeoutMs, 30000) : timeoutMs);
    let lastDisplay = "";
    let nothingCount = 0;
    const tick = () => {
      if (shouldAbort && shouldAbort()) {
        if (fn.PPAbort) { try { fn.PPAbort(); } catch { /* ignore */ } }
        return resolve(PWRET.CANCEL);
      }
      if (Date.now() > deadline) {
        if (fn.PPAbort) { try { fn.PPAbort(); } catch { /* ignore */ } }
        return resolve(PWRET.TIMEOUT);
      }
      const { ret, msg } = readDisplay(256);
      if (ret === PWRET.OK) return resolve(PWRET.OK);
      if (ret === PWRET.DISPLAY || ret === PWRET.NOTHING) {
        if (ret === PWRET.DISPLAY && msg && msg !== lastDisplay) {
          lastDisplay = msg;
          if (onDisplay) onDisplay(msg);
        }
        nothingCount = ret === PWRET.NOTHING ? nothingCount + 1 : 0;
        return setTimeout(tick, nothingCount > 20 ? 500 : 150);
      }
      return resolve(ret);
    };
    setImmediate(tick);
  });
}

// Extrai opções/máscara para reportar capturas que precisam do operador.
function extractCaptureItem(item) {
  const tipo = item.bTipoDeDado;
  const prompt = (item.szPrompt || "").replace(/\0.*$/, "").trim();
  const identificador = item.wIdentificador;
  const out = { identificador, tipo, prompt };
  if (tipo === PWDAT.MENU) {
    const n = (item.bNumOpcoesMenu | 0);
    const options = [];
    for (let i = 0; i < n && i < 40; i++) {
      try {
        const label = ((item.vszTextoMenu?.[i]?.szTextoMenu) || "").replace(/\0.*$/, "").trim();
        const value = ((item.vszValorMenu?.[i]?.szValorMenu) || "").replace(/\0.*$/, "").trim();
        if (label || value) options.push({ label: label || value, value: value || String(i) });
      } catch { /* ignore */ }
    }
    out.options = options;
  } else if (tipo === PWDAT.TYPED || tipo === PWDAT.BARCODE) {
    out.tamMin = item.bTamanhoMinimo;
    out.tamMax = item.bTamanhoMaximo;
    out.mascara = (item.szMascaraDeCaptura || "").replace(/\0.*$/, "");
    out.ocultar = !!item.bOcultarDadosDigitados;
  }
  return out;
}

// Processa um único slot do MOREDATA, pilotando o pinpad se preciso.
// Retorna { handled: true, ret } se pilotou (com possível erro do pinpad),
// ou { handled: false, capture: {...} } se precisa de input do operador.
function handleDataSlot(item, index, { onDisplay } = {}) {
  const tipo = item.bTipoDeDado;
  if (tipo == null || tipo === 0) return { handled: true, ret: PWRET.OK };

  switch (tipo) {
    case PWDAT.MENU:
    case PWDAT.TYPED:
    case PWDAT.BARCODE:
    case PWDAT.USERAUTH:
      return { handled: false, capture: extractCaptureItem(item) };

    case PWDAT.CARDINF: {
      const mode = item.ulTipoEntradaCartao | 0;
      // mode 1 = digitado (precisa de operador). 2/3 = pinpad.
      if (mode === 1) return { handled: false, capture: extractCaptureItem(item) };
      if (!fn.PPGetCard) return { handled: true, ret: -2499 };
      const r = normalizeRet(fn.PPGetCard(index));
      if (r !== PWRET.OK) return { handled: true, ret: r };
      const r2 = pinpadLoop({ context: "card", onDisplay });
      if (r2 === -2486 /* FALLBACK */ && mode === 3) {
        return { handled: false, capture: extractCaptureItem(item) };
      }
      return { handled: true, ret: r2 };
    }

    case PWDAT.PPENTRY: {
      if (!fn.PPGetData) return { handled: true, ret: -2499 };
      const r = normalizeRet(fn.PPGetData(index));
      return { handled: true, ret: r !== PWRET.OK ? r : pinpadLoop({ context: "entry", onDisplay }) };
    }
    case PWDAT.PPENCPIN: {
      if (!fn.PPGetPIN) return { handled: true, ret: -2499 };
      const r = normalizeRet(fn.PPGetPIN(index));
      return { handled: true, ret: r !== PWRET.OK ? r : pinpadLoop({ context: "pin", onDisplay }) };
    }
    case PWDAT.CARDOFF: {
      if (!fn.PPGoOnChip) return { handled: true, ret: -2499 };
      const r = normalizeRet(fn.PPGoOnChip(index));
      return { handled: true, ret: r !== PWRET.OK ? r : pinpadLoop({ context: "offlineChip", onDisplay }) };
    }
    case PWDAT.CARDONL: {
      if (!fn.PPFinishChip) return { handled: true, ret: -2499 };
      const r = normalizeRet(fn.PPFinishChip(index));
      return { handled: true, ret: r !== PWRET.OK ? r : pinpadLoop({ context: "onlineChip", onDisplay }) };
    }
    case PWDAT.PPCONF: {
      if (!fn.PPConfirmData) return { handled: true, ret: -2499 };
      const r = normalizeRet(fn.PPConfirmData(index));
      return { handled: true, ret: r !== PWRET.OK ? r : pinpadLoop({ context: "confirmData", onDisplay }) };
    }
    case PWDAT.PPREMCRD: {
      if (!fn.PPRemoveCard) return { handled: true, ret: PWRET.OK };
      const r = normalizeRet(fn.PPRemoveCard());
      if (r !== PWRET.OK) return { handled: true, ret: r };
      const r2 = pinpadLoop({ context: "removeCard", onDisplay });
      if (r2 === PWRET.TIMEOUT) {
        const msg = getResult(PWINFO.RESULTMSG, 2048);
        if (isAuthorizedMessage(msg)) {
          if (fn.PPAbort) { try { fn.PPAbort(); } catch { /* ignore */ } }
          return { handled: true, ret: BRIDGE_AUTHORIZED_AFTER_REMOVE_TIMEOUT };
        }
      }
      return { handled: true, ret: r2 };
    }
    case PWDAT.PPGENCMD: {
      if (!fn.PPGenericCMD) return { handled: true, ret: -2499 };
      const r = normalizeRet(fn.PPGenericCMD(index));
      return { handled: true, ret: r !== PWRET.OK ? r : pinpadLoop({ context: "genericCommand", onDisplay }) };
    }
    case PWDAT.PPDATAPOSCNF: {
      if (!fn.PPPositiveConfirmation) return { handled: true, ret: -2499 };
      const r = normalizeRet(fn.PPPositiveConfirmation(index));
      return { handled: true, ret: r !== PWRET.OK ? r : pinpadLoop({ context: "positiveConfirmation", onDisplay }) };
    }
    case PWDAT.TSTKEY: {
      if (!fn.PPTestKey) return { handled: true, ret: -2499 };
      const r = normalizeRet(fn.PPTestKey(index));
      return { handled: true, ret: r !== PWRET.OK ? r : pinpadLoop({ context: "testKey", onDisplay }) };
    }
    case PWDAT.DSPCHECKOUT:
    case PWDAT.DSPQRCODE: {
      const valor = (item.szValorInicial || "").replace(/\0.*$/, "");
      if (onDisplay) onDisplay(valor || (item.szPrompt || "").replace(/\0.*$/, ""));
      try { fn.AddParam(item.wIdentificador, valor); } catch { /* ignore */ }
      return { handled: true, ret: PWRET.OK };
    }
    default:
      console.warn(`[TEF] tipo PWDAT desconhecido=${tipo} ident=0x${(item.wIdentificador||0).toString(16)}`);
      return { handled: true, ret: PWRET.OK };
  }
}

function runExecLoop({ onDisplay, onCapture, timeoutMs = 180000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  const buffer = [{}, {}, {}, {}, {}, {}, {}, {}, {}];

  while (true) {
    if (Date.now() > deadline) {
      if (fn.PPAbort) { try { fn.PPAbort(); } catch { /* ignore */ } }
      throw new Error("Timeout transação TEF");
    }

    const numRef = [9];
    const ret = normalizeRet(fn.ExecTransac(buffer, numRef));

    if (ret === PWRET.OK) return { ret };
    if (ret === BRIDGE_AUTHORIZED_AFTER_REMOVE_TIMEOUT) return { ret: PWRET.OK, authorizedAfterRemove: true };
    if (ret === PWRET.CANCEL) throw new Error("Transação cancelada (operador/pinpad)");
    if (ret === PWRET.TIMEOUT) {
      const msg = getResult(PWINFO.RESULTMSG, 2048);
      if (isAuthorizedMessage(msg)) {
        if (fn.PPAbort) { try { fn.PPAbort(); } catch { /* ignore */ } }
        return { ret: PWRET.OK, authorizedAfterRemove: true };
      }
      throw new Error("Timeout no pinpad");
    }
    if (ret === PWRET.COMMERROR) throw new Error("Erro de comunicação PayGo");

    if (ret === PWRET.MOREDATA || ret === PWRET.NOTHING || ret === PWRET.DISPLAY) {
      const count = ret === PWRET.MOREDATA ? (numRef[0] | 0) : 0;
      let interactivePending = false;
      for (let i = 0; i < count; i++) {
        const slot = handleDataSlot(buffer[i] || {}, i, { onDisplay });
        if (!slot.handled) {
          interactivePending = true;
          if (onCapture) {
            onCapture(slot.capture);
          } else {
            if (fn.PPAbort) { try { fn.PPAbort(); } catch { /* ignore */ } }
            throw new Error(`Captura interativa solicitada tipo=${slot.capture.tipo} sem handler`);
          }
          break;
        }
        if (slot.ret !== PWRET.OK && slot.ret !== BRIDGE_AUTHORIZED_AFTER_REMOVE_TIMEOUT) {
          throw new Error(`Pinpad falhou ret=${slot.ret}${explainRet(slot.ret) ? ` — ${explainRet(slot.ret)}` : ""}`);
        }
        if (slot.ret === BRIDGE_AUTHORIZED_AFTER_REMOVE_TIMEOUT) return { ret: PWRET.OK, authorizedAfterRemove: true };
      }
      if (!interactivePending && count === 0) {
        const { msg } = readDisplay(512);
        if (msg && onDisplay) onDisplay(msg);
      }
      continue;
    }

    throw new Error(`PW_iExecTransac ret=${ret}${explainRet(ret) ? ` — ${explainRet(ret)}` : ""}`);
  }
}

// ============================================================
// Versão ASYNC do loop — pilota o pinpad de forma não-bloqueante.
// Suporta captura interativa via onInteractiveCaptures(captures)
// => Promise<Array<{identificador,value}>>.
// ============================================================
function runExecLoopAsync({ onDisplay, onInteractiveCaptures, timeoutMs = 60000, shouldAbort } = {}) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const buffer = [{}, {}, {}, {}, {}, {}, {}, {}, {}];

    const handleSlotAsync = async (item, index) => {
      const tipo = item.bTipoDeDado;
      if (tipo == null || tipo === 0) return { handled: true, ret: PWRET.OK };

      // Slots que o pinpad pilota — usa pinpadLoopAsync.
      const pinpadDriven = {
        [PWDAT.PPENTRY]: { fn: fn.PPGetData, ctx: "entry" },
        [PWDAT.PPENCPIN]: { fn: fn.PPGetPIN, ctx: "pin" },
        [PWDAT.CARDOFF]: { fn: fn.PPGoOnChip, ctx: "offlineChip" },
        [PWDAT.CARDONL]: { fn: fn.PPFinishChip, ctx: "onlineChip" },
        [PWDAT.PPCONF]: { fn: fn.PPConfirmData, ctx: "confirmData" },
        [PWDAT.PPGENCMD]: { fn: fn.PPGenericCMD, ctx: "genericCommand" },
        [PWDAT.PPDATAPOSCNF]: { fn: fn.PPPositiveConfirmation, ctx: "positiveConfirmation" },
        [PWDAT.TSTKEY]: { fn: fn.PPTestKey, ctx: "testKey" },
      };
      if (pinpadDriven[tipo]) {
        const def = pinpadDriven[tipo];
        if (!def.fn) return { handled: true, ret: -2499 };
        const r = normalizeRet(def.fn(index));
        if (r !== PWRET.OK) return { handled: true, ret: r };
        const r2 = await pinpadLoopAsync({ context: def.ctx, onDisplay, shouldAbort });
        return { handled: true, ret: r2 };
      }

      if (tipo === PWDAT.CARDINF) {
        const mode = item.ulTipoEntradaCartao | 0;
        if (mode === 1) return { handled: false, capture: extractCaptureItem(item) };
        if (!fn.PPGetCard) return { handled: true, ret: -2499 };
        const r = normalizeRet(fn.PPGetCard(index));
        if (r !== PWRET.OK) return { handled: true, ret: r };
        const r2 = await pinpadLoopAsync({ context: "card", onDisplay, shouldAbort });
        if (r2 === -2486 && mode === 3) return { handled: false, capture: extractCaptureItem(item) };
        return { handled: true, ret: r2 };
      }

      if (tipo === PWDAT.PPREMCRD) {
        if (!fn.PPRemoveCard) return { handled: true, ret: PWRET.OK };
        const r = normalizeRet(fn.PPRemoveCard());
        if (r !== PWRET.OK) return { handled: true, ret: r };
        const r2 = await pinpadLoopAsync({ context: "removeCard", onDisplay, shouldAbort });
        if (r2 === PWRET.TIMEOUT) {
          const msg = getResult(PWINFO.RESULTMSG, 2048);
          if (isAuthorizedMessage(msg)) {
            if (fn.PPAbort) { try { fn.PPAbort(); } catch { /* ignore */ } }
            return { handled: true, ret: BRIDGE_AUTHORIZED_AFTER_REMOVE_TIMEOUT };
          }
        }
        return { handled: true, ret: r2 };
      }

      if (tipo === PWDAT.DSPCHECKOUT || tipo === PWDAT.DSPQRCODE) {
        const valor = (item.szValorInicial || "").replace(/\0.*$/, "");
        if (onDisplay) onDisplay(valor || (item.szPrompt || "").replace(/\0.*$/, ""));
        try { fn.AddParam(item.wIdentificador, valor); } catch { /* ignore */ }
        return { handled: true, ret: PWRET.OK };
      }

      // MENU/TYPED/BARCODE/USERAUTH precisam do operador.
      if (tipo === PWDAT.MENU || tipo === PWDAT.TYPED || tipo === PWDAT.BARCODE || tipo === PWDAT.USERAUTH) {
        return { handled: false, capture: extractCaptureItem(item) };
      }

      console.warn(`[TEF async] tipo PWDAT desconhecido=${tipo}`);
      return { handled: true, ret: PWRET.OK };
    };

    const tick = async () => {
      try {
        if (shouldAbort && shouldAbort()) {
          if (fn.PPAbort) { try { fn.PPAbort(); } catch { /* ignore */ } }
          return reject(new Error("Operação abortada"));
        }
        if (Date.now() > deadline) {
          if (fn.PPAbort) { try { fn.PPAbort(); } catch { /* ignore */ } }
          return reject(new Error("Timeout transação TEF"));
        }

        const numRef = [9];
        const ret = normalizeRet(fn.ExecTransac(buffer, numRef));

        if (ret === PWRET.OK) return resolve({ ret });
        if (ret === BRIDGE_AUTHORIZED_AFTER_REMOVE_TIMEOUT) return resolve({ ret: PWRET.OK, authorizedAfterRemove: true });
        if (ret === PWRET.CANCEL) return reject(new Error("Transação cancelada (operador/pinpad)"));
        if (ret === PWRET.TIMEOUT) {
          const msg = getResult(PWINFO.RESULTMSG, 2048);
          if (isAuthorizedMessage(msg)) {
            if (fn.PPAbort) { try { fn.PPAbort(); } catch { /* ignore */ } }
            return resolve({ ret: PWRET.OK, authorizedAfterRemove: true });
          }
          return reject(new Error("Timeout no pinpad"));
        }
        if (ret === PWRET.COMMERROR) return reject(new Error("Erro de comunicação PayGo"));

        if (ret === PWRET.MOREDATA || ret === PWRET.NOTHING || ret === PWRET.DISPLAY) {
          const count = ret === PWRET.MOREDATA ? (numRef[0] | 0) : 0;
          const interactiveCaptures = [];
          for (let i = 0; i < count; i++) {
            const slot = await handleSlotAsync(buffer[i] || {}, i);
            if (!slot.handled) { interactiveCaptures.push(slot.capture); break; }
            if (slot.ret === BRIDGE_AUTHORIZED_AFTER_REMOVE_TIMEOUT) {
              return resolve({ ret: PWRET.OK, authorizedAfterRemove: true });
            }
            if (slot.ret !== PWRET.OK) {
              return reject(new Error(`Pinpad falhou ret=${slot.ret}${explainRet(slot.ret) ? ` — ${explainRet(slot.ret)}` : ""}`));
            }
          }
          if (interactiveCaptures.length > 0) {
            if (!onInteractiveCaptures) {
              if (fn.PPAbort) { try { fn.PPAbort(); } catch { /* ignore */ } }
              return reject(new Error("Captura interativa solicitada e nenhum handler disponível"));
            }
            try {
              const responses = await onInteractiveCaptures(interactiveCaptures);
              if (!responses) {
                if (fn.PPAbort) { try { fn.PPAbort(); } catch { /* ignore */ } }
                return reject(new Error("Captura interativa cancelada"));
              }
              for (const r of responses) {
                if (r && r.identificador != null && r.value != null) {
                  fn.AddParam(r.identificador, String(r.value));
                }
              }
            } catch (e) {
              if (fn.PPAbort) { try { fn.PPAbort(); } catch { /* ignore */ } }
              return reject(e);
            }
          } else if (count === 0) {
            const { msg } = readDisplay(512);
            if (msg && onDisplay) onDisplay(msg);
          }
          return setImmediate(tick);
        }

        return reject(new Error(`PW_iExecTransac ret=${ret}${explainRet(ret) ? ` — ${explainRet(ret)}` : ""}`));
      } catch (e) {
        reject(e);
      }
    };

    setImmediate(() => { tick(); });
  });
}


// Estado da operação ADM em background (para não bloquear o agente)
let adminInFlight = null;
// adminInFlight: { startedAt, status, message, error, receipts,
//                  pendingCaptures: [...] | null,
//                  pendingResolve: (responses) => void | null,
//                  captureSeq: number }
function abortAdm() {
  if (fn && fn.PPAbort) { try { fn.PPAbort(); } catch { /* ignore */ } }
  if (adminInFlight && (adminInFlight.status === "running" || adminInFlight.status === "waiting_input")) {
    adminInFlight.status = "aborted";
    adminInFlight.message = "Abortado pelo usuário";
    if (adminInFlight.pendingResolve) {
      try { adminInFlight.pendingResolve(null); } catch { /* ignore */ }
      adminInFlight.pendingResolve = null;
      adminInFlight.pendingCaptures = null;
    }
  }
}
function getAdmStatus() {
  if (!adminInFlight) return { status: "idle" };
  const { pendingResolve, ...safe } = adminInFlight;
  return safe;
}
function respondAdm(responses) {
  if (!adminInFlight || adminInFlight.status !== "waiting_input" || !adminInFlight.pendingResolve) {
    throw new Error("Nenhuma captura interativa pendente");
  }
  const resolve = adminInFlight.pendingResolve;
  adminInFlight.pendingResolve = null;
  adminInFlight.pendingCaptures = null;
  adminInFlight.status = "running";
  adminInFlight.message = "Processando resposta...";
  resolve(Array.isArray(responses) ? responses : []);
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

function confirmarTransacao(status, receipts) {
  try {
    fn.Confirmation(
      status >>> 0,
      receipts.reqnum || "",
      receipts.locRef || "",
      receipts.extRef || "",
      receipts.virtMerch || "",
      receipts.rede || "",
    );
  } catch { /* ignore */ }
}

/**
 * Iniciar pagamento.
 * @param {object} req { valor (number em reais), tipo, parcelas, financiamento, onDisplay, onCapture }
 *   tipo: 'credito' | 'debito' | 'voucher'
 */
function efetuarPagamento({ valor, tipo = "credito", parcelas = 1, financiamento = 1, fiscalRef, onDisplay, onCapture } = {}) {
  if (!valor || valor <= 0) throw new Error("valor obrigatório");
  startTransaction(PWOPER.SALE, "sale");

  const centavos = Math.round(Number(valor) * 100).toString();
  const cardTypeMap = { credito: "1", debito: "2", voucher: "4" };
  const cardType = cardTypeMap[tipo] || null;
  const saleId = String(fiscalRef || `NEXA${Date.now()}`).slice(0, 12);

  fn.AddParam(PWINFO.TOTAMNT, centavos);
  fn.AddParam(PWINFO.CURRENCY, "986");
  fn.AddParam(PWINFO.CURREXP, "2");
  fn.AddParam(PWINFO.FISCALREF, saleId);
  if (tipo === "credito") {
    if (cardType) fn.AddParam(PWINFO.CARDTYPE, cardType);
    fn.AddParam(PWINFO.FINTYPE, parcelas > 1 ? "4" : "1");
    if (parcelas > 1) fn.AddParam(PWINFO.INSTALLMENTS, String(parcelas));
    fn.AddParam(PWINFO.PAYMNTTYPE, "1");
  } else if (tipo === "debito") {
    if (cardType) fn.AddParam(PWINFO.CARDTYPE, cardType);
    fn.AddParam(PWINFO.FINTYPE, "1");
    fn.AddParam(PWINFO.PAYMNTTYPE, "1");
  } else if (tipo === "voucher" && cardType) {
    fn.AddParam(PWINFO.CARDTYPE, cardType);
  }

  let receipts;
  try {
    runExecLoop({ onDisplay, onCapture });
    receipts = collectReceipts();
    if (receipts.requerConfirmacao) {
      confirmarTransacao(PWCNF.CNF_AUTO, receipts);
    }
    return receipts;
  } catch (err) {
    // Em falha após NewTransac, desfaz pendência conforme demo C#.
    try {
      const partial = collectReceipts();
      if (partial.requerConfirmacao) confirmarTransacao(PWCNF.REV_MANU_AUT, partial);
    } catch { /* ignore */ }
    throw err;
  }
}

function cancelarEmAndamento() {
  if (fn.PPAbort) { try { fn.PPAbort(); } catch { /* ignore */ } }
  initialized = false;
}

/**
 * Cancelamento de venda (PWOPER_SALEVOID).
 */
function cancelarVenda({ valor, nsu, data, onDisplay, onCapture } = {}) {
  startTransaction(PWOPER.SALEVOID, "refund");

  fn.AddParam(PWINFO.CURRENCY, "986");
  fn.AddParam(PWINFO.CURREXP, "2");
  if (valor) fn.AddParam(PWINFO.TRNORIGAMNT, Math.round(Number(valor) * 100).toString());
  if (nsu) fn.AddParam(PWINFO.TRNORIGNSU, String(nsu));
  if (data) fn.AddParam(PWINFO.TRNORIGDATE, String(data).slice(0, 6));

  runExecLoop({ onDisplay, onCapture });
  const receipts = collectReceipts();
  if (receipts.requerConfirmacao) confirmarTransacao(PWCNF.CNF_AUTO, receipts);
  return receipts;
}

/**
 * Menu administrativo do pinpad.
 */
function administrativo({ onDisplay, onCapture } = {}) {
  startTransaction(PWOPER.ADMIN, "admin");
  runExecLoop({ onDisplay, onCapture, timeoutMs: 60000 });
  return collectReceipts();
}

/**
 * Versão ASYNC do menu administrativo — não bloqueia o event loop
 * do Node. Atualiza adminInFlight enquanto o pinpad está aberto.
 */
function administrativoAsync({ timeoutMs = 60000, technicalPassword, pinpadPort, merchantCode, terminalCode, host } = {}) {
  if (adminInFlight && (adminInFlight.status === "running" || adminInFlight.status === "waiting_input")) {
    return Promise.reject(new Error("Já existe uma operação ADM em andamento"));
  }
  adminInFlight = {
    startedAt: Date.now(),
    status: "running",
    message: "Iniciando...",
    pendingCaptures: null,
    pendingResolve: null,
    captureSeq: 0,
  };

  // Helpers — replica AddActivationParams + AmbienteHost/Port do demo PS.
  const onlyDigits = (v) => String(v || "").replace(/\D/g, "");
  const normalizePinpadPort = (v) => {
    const d = onlyDigits(v);
    if (!d) return "";
    const n = parseInt(d, 10);
    return String(n).padStart(2, "0");
  };
  const splitHost = (envStr) => {
    const s = String(envStr || "");
    const i = s.lastIndexOf(":");
    return i > 0 ? [s.slice(0, i), s.slice(i + 1)] : [s, ""];
  };
  const senhaTec = technicalPassword ? String(technicalPassword) : "";
  const pinpadPortStr = normalizePinpadPort(pinpadPort);
  const [autIp, autPort] = splitHost(host);

  try {
    startTransaction(PWOPER.ADMIN, "admin");
    // Demo: AddActivationParams na MESMA ordem.
    if (merchantCode) fn.AddParam(PWINFO.MERCHCNPJCPF, onlyDigits(merchantCode));
    if (terminalCode) fn.AddParam(PWINFO.POSID, String(terminalCode));
    // USINGPINPAD sempre "1" — sem isso o PdC ignora a porta.
    fn.AddParam(PWINFO.USINGPINPAD, "1");
    if (pinpadPortStr) fn.AddParam(PWINFO.PPCOMMPORT, pinpadPortStr);
    if (host) {
      fn.AddParam(PWINFO.DESTTCPIP, String(host));
      if (autIp) fn.AddParam(PWINFO.AUTIP, autIp);
      if (autPort) fn.AddParam(PWINFO.AUTPORT, autPort);
    }
    // NÃO mandar AUTHTECHUSER aqui — demo só responde quando PWDAT_USERAUTH chega.
  } catch (e) {
    adminInFlight = { status: "error", error: e.message, startedAt: Date.now() };
    return Promise.reject(e);
  }
  return runExecLoopAsync({
    timeoutMs,
    onDisplay: (m) => {
      if (adminInFlight && adminInFlight.status === "running") adminInFlight.message = m;
      console.log("[TEF display]", m);
    },
    onInteractiveCaptures: (captures) => new Promise((resolve) => {
      if (!adminInFlight) return resolve(null);

      // Auto-responde USERAUTH (senha técnica/gerencial) sem pedir operador.
      const auto = [];
      const pending = [];
      for (const c of captures) {
        if (c.tipo === PWDAT.USERAUTH &&
            (c.identificador === PWINFO.AUTHTECHUSER || c.identificador === PWINFO.AUTHMNGTUSER) &&
            senhaTec) {
          auto.push({ identificador: c.identificador, value: senhaTec });
        } else {
          pending.push(c);
        }
      }
      if (pending.length === 0 && auto.length > 0) {
        console.log("[TEF auto-USERAUTH] respondendo senha técnica");
        return resolve(auto);
      }
      adminInFlight.captureSeq = (adminInFlight.captureSeq || 0) + 1;
      adminInFlight.pendingCaptures = pending.map((c) => ({ ...c, seq: adminInFlight.captureSeq }));
      adminInFlight.status = "waiting_input";
      adminInFlight.message = pending[0]?.prompt || "Aguardando entrada do operador";
      adminInFlight.pendingResolve = (responses) => {
        if (!responses) return resolve(null);
        resolve([...auto, ...responses]);
      };
      console.log("[TEF capture] aguardando resposta:", JSON.stringify(adminInFlight.pendingCaptures));
    }),
    shouldAbort: () => adminInFlight && adminInFlight.status === "aborted",
  })
    .then(() => {
      const receipts = collectReceipts();
      const hasUsefulReceipt = Object.values(receipts).some((value) => {
        if (value == null) return false;
        if (typeof value === "boolean") return value;
        return String(value).trim().length > 0;
      });

      adminInFlight = {
        status: hasUsefulReceipt ? "done" : "error",
        receipts,
        startedAt: adminInFlight.startedAt,
        message: hasUsefulReceipt
          ? (receipts.resultado || adminInFlight.message || "OK")
          : (adminInFlight.message || "A operação ADM terminou sem retorno útil do pinpad."),
        error: hasUsefulReceipt
          ? undefined
          : "A operação ADM terminou sem retorno útil do pinpad. Verifique se a COM do pinpad está correta e se o PayGo Windows não está segurando a porta.",
      };
      return receipts;
    })
    .catch((e) => {
      adminInFlight = { status: "error", error: e.message, startedAt: adminInFlight && adminInFlight.startedAt };
      throw e;
    });
}


/**
 * Instalação/ativação do PdC via PGWebLib.
 * Recebe params do PayGo (CNPJ, PdC, host:porta, senha técnica, porta do pinpad).
 * O fluxo recomendado continua sendo pela UI do PayGo Windows (modo DEMO),
 * mas algumas instalações exigem PWOPER_INSTALL com estes parâmetros.
 */
function instalarPdc({
  cnpj,
  pdc,
  ambiente,
  senhaTecnica,
  portaPinpad,
  onDisplay,
  onCapture,
} = {}) {
  startTransaction(PWOPER.INSTALL, "install");
  const onlyDigits = (v) => String(v || "").replace(/\D/g, "");
  const padPort = (v) => {
    const d = onlyDigits(v);
    if (!d) return "";
    return String(parseInt(d, 10)).padStart(2, "0");
  };
  if (cnpj) fn.AddParam(PWINFO.MERCHCNPJCPF, onlyDigits(cnpj));
  if (pdc) fn.AddParam(PWINFO.POSID, String(pdc));
  fn.AddParam(PWINFO.USINGPINPAD, "1");
  const pp = padPort(portaPinpad);
  if (pp) fn.AddParam(PWINFO.PPCOMMPORT, pp);
  if (ambiente) {
    fn.AddParam(PWINFO.DESTTCPIP, String(ambiente));
    const s = String(ambiente);
    const i = s.lastIndexOf(":");
    if (i > 0) {
      fn.AddParam(PWINFO.AUTIP, s.slice(0, i));
      fn.AddParam(PWINFO.AUTPORT, s.slice(i + 1));
    }
  }
  // senhaTecnica é respondida via PWDAT_USERAUTH durante o loop (não como param inicial).
  // Se onCapture não tratar, configure o caller pra auto-responder.
  const wrappedCapture = (cap) => {
    if (cap?.tipo === PWDAT.USERAUTH &&
        (cap.identificador === PWINFO.AUTHTECHUSER || cap.identificador === PWINFO.AUTHMNGTUSER) &&
        senhaTecnica) {
      try { fn.AddParam(cap.identificador, String(senhaTecnica)); } catch { /* ignore */ }
      return;
    }
    if (onCapture) onCapture(cap);
  };
  runExecLoop({ onDisplay, onCapture: wrappedCapture, timeoutMs: 180000 });
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
  administrativoAsync,
  abortAdm,
  getAdmStatus,
  respondAdm,

  instalarPdc,
  diagnostics,
  paths: { DLL_PATH, WORK_DIR, PAYGO_BASE },
  // Constantes exportadas pra eventuais consumidores avançados.
  constants: { PWRET, PWINFO, PWOPER, PWDAT, PWCNF, PWINFO_AUTCAP },
};
