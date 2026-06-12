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

const PWINFO = {
  PPPPWD: 0x03,
  POSID: 0x11,
  AUTNAME: 21,
  AUTVER: 22,
  AUTDEV: 23,
  MERCHCNPJCPF: 0x1C,
  AUTCAP: 36,
  TOTAMNT: 37,
  CURRENCY: 38,
  CURREXP: 39,
  CARDTYPE: 41,
  DATETIME: 49,
  REQNUM: 50,
  AUTHSYST: 53,
  VIRTMERCH: 54,
  FINTYPE: 59,
  INSTALLMENTS: 60,
  RESULTMSG: 66,
  CNFREQ: 67,
  AUTLOCREF: 68,
  AUTEXTREF: 69,
  AUTHCODE: 70,
  RCPTMERCH: 83,
  RCPTCHOLDER: 84,
  TRNORIGDATE: 87,
  TRNORIGNSU: 88,
  TRNORIGAMNT: 96,
  TRNORIGAUTH: 98,
  TRNORIGTIME: 115,
  AUTHTECHUSER: 0xF6,
  DSPQRPREF: 152,
  PPCOMMPORT: 0x7F02,
  AUTADDRESS: 0x7F1F,
};

const PWOPER = {
  INSTALL: 0x01,
  ADMIN: 0x20,
  SALE: 0x21,
  SALEVOID: 0x22,
};

// PWINFO_AUTCAP bitmask (demo C# usa DSP_CHECKOUT + DSP_QRCODE = 384)
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

// PWDAT — tipos de captura solicitados pelo MOREDATA
const PWDAT = {
  MENU: 1,
  TYPED: 2,
  BARCODE: 3,
  CARDINF: 4,
  USERAUTH: 5,
  PPENTRY: 6,
  PPENCPIN: 7,
  CARDOFF: 8,
  CARDONL: 9,
  PPCONF: 10,
  PPREMCRD: 11,
  DSPCHECKOUT: 12,
  DSPQRCODE: 13,
  PPGENCMD: 14,
  PPDATAPOSCNF: 15,
  TSTKEY: 16,
};

// PWCNF — confirmação (valores oficiais do demo)
const PWCNF = {
  CNF_AUTO: 0x121,
  CNF_MANU_AUT: 0x3221,
  REV_MANU_AUT: 0x3231,
  REV_ABORT: 0x43131,
};

// Params iniciais (idêntico ao MainWindow.xaml.cs do demo)
const AUTOMATION_INFO = {
  name: "PDV",
  version: "1.0.0.0",
  developer: "PayGo",
  capabilities: String(PWINFO_AUTCAP.DSP_CHECKOUT + PWINFO_AUTCAP.DSP_QRCODE), // 384
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

  // Assinaturas alinhadas ao PGWebLib.cs (Muxx.Lib/Services).
  // __stdcall em Windows (WINAPI).
  fn.Init = lib.func("__stdcall", "PW_iInit", "short", ["string"]);
  fn.NewTransac = lib.func("__stdcall", "PW_iNewTransac", "short", ["uint8"]);
  fn.AddParam = lib.func("__stdcall", "PW_iAddParam", "short", ["uint16", "string"]);
  fn.ExecTransac = lib.func(
    "__stdcall",
    "PW_iExecTransac",
    "short",
    [koffi.out(koffi.pointer(PW_GetDataArray9)), koffi.inout(koffi.pointer("int16"))],
  );
  // ulDataSize é UINT por VALOR (não ponteiro!) — divergência crítica vs versão antiga.
  fn.GetResult = lib.func(
    "__stdcall",
    "PW_iGetResult",
    "short",
    ["int16", koffi.out("char*"), "uint32"],
  );
  // (uint, 5×string) — ulStatus é UINT por valor (PWCNF_xxx).
  fn.Confirmation = lib.func(
    "__stdcall",
    "PW_iConfirmation",
    "short",
    ["uint32", "string", "string", "string", "string", "string"],
  );
  // ulDisplaySize também UINT por valor.
  fn.PPEventLoop = lib.func(
    "__stdcall",
    "PW_iPPEventLoop",
    "short",
    [koffi.out("char*"), "uint32"],
  );
  try {
    fn.PPAbort = lib.func("__stdcall", "PW_iPPAbort", "short", []);
  } catch { fn.PPAbort = null; }

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
// Loop principal — replica Fluxos.FluxoExecTransac do C#.
// Aloca PW_GetData[9], chama PW_iExecTransac em loop, trata
// MOREDATA/NOTHING continuando. Capturas interativas (MENU,
// TYPED, USERAUTH, etc.) são reportadas via onCapture callback
// — sem callback, aborta com erro (cenário headless/sandbox
// automatizado roda 100% no pinpad).
// ============================================================
function runExecLoop({ onDisplay, onCapture, timeoutMs = 180000 } = {}) {
  const start = Date.now();
  const buffer = [{}, {}, {}, {}, {}, {}, {}, {}, {}]; // 9 structs vazias

  while (true) {
    if (Date.now() - start > timeoutMs) {
      if (fn.PPAbort) { try { fn.PPAbort(); } catch { /* ignore */ } }
      throw new Error("Timeout transação TEF");
    }

    const numRef = [9];
    const ret = normalizeRet(fn.ExecTransac(buffer, numRef));

    if (ret === PWRET.OK) return { ret };

    if (ret === PWRET.CANCEL) throw new Error("Transação cancelada (operador/pinpad)");
    if (ret === PWRET.TIMEOUT) throw new Error("Timeout no pinpad");
    if (ret === PWRET.COMMERROR) throw new Error("Erro de comunicação PayGo");

    if (ret === PWRET.MOREDATA) {
      const count = numRef[0] | 0;
      let interactiveCaptures = 0;
      for (let i = 0; i < count; i++) {
        const item = buffer[i] || {};
        const tipo = item.bTipoDeDado;
        const prompt = (item.szPrompt || "").replace(/\0.*$/, "");

        if (tipo === undefined || tipo === 0 || tipo === null) {
          console.log(`[TEF MOREDATA] slot ${i} sem tipo definido — ignorando`);
          continue;
        }

        if (tipo === PWDAT.DSPCHECKOUT || tipo === PWDAT.DSPQRCODE) {
          if (onDisplay) onDisplay(prompt);
          continue;
        }

        interactiveCaptures++;
        if (onCapture) {
          onCapture({ index: i, tipo, prompt, identificador: item.wIdentificador });
        } else {
          console.warn(
            `[TEF MOREDATA] captura interativa solicitada tipo=${tipo} prompt="${prompt}" — ignorada (agente headless)`,
          );
        }
      }

      if (interactiveCaptures === 0) {
        const dbuf = Buffer.alloc(512);
        try {
          const r2 = normalizeRet(fn.PPEventLoop(dbuf, 512));
          if (r2 === PWRET.OK && onDisplay) {
            const end = dbuf.indexOf(0);
            const msg = dbuf.slice(0, end >= 0 ? end : 512).toString("latin1");
            if (msg) onDisplay(msg);
          }
        } catch { /* ignore */ }
      }
      continue;
    }

    if (ret === PWRET.NOTHING || ret === PWRET.DISPLAY) {
      const dbuf = Buffer.alloc(512);
      try {
        const r2 = normalizeRet(fn.PPEventLoop(dbuf, 512));
        if (r2 === PWRET.OK && onDisplay) {
          const end = dbuf.indexOf(0);
          const msg = dbuf.slice(0, end >= 0 ? end : 512).toString("latin1");
          if (msg) onDisplay(msg);
        }
      } catch { /* ignore */ }
      continue;
    }

    throw new Error(
      `PW_iExecTransac ret=${ret}${explainRet(ret) ? ` — ${explainRet(ret)}` : ""}`,
    );
  }
}

// ============================================================
// Versão ASYNC do loop — usa setImmediate entre iterações para
// não travar o event loop do Node. Suporta captura interativa
// (PWDAT.MENU/TYPED/BARCODE) via callback `onInteractiveCaptures`
// que retorna Promise<Array<{identificador,value}>>. Quando o
// callback resolve, faz PW_iAddParam de cada resposta e segue o
// loop conforme spec PayGo.
// ============================================================
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

function runExecLoopAsync({ onDisplay, onInteractiveCaptures, timeoutMs = 60000, shouldAbort } = {}) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const buffer = [{}, {}, {}, {}, {}, {}, {}, {}, {}];

    const tick = async () => {
      try {
        if (shouldAbort && shouldAbort()) {
          if (fn.PPAbort) { try { fn.PPAbort(); } catch { /* ignore */ } }
          return reject(new Error("Operação abortada"));
        }
        if (Date.now() - start > timeoutMs) {
          if (fn.PPAbort) { try { fn.PPAbort(); } catch { /* ignore */ } }
          return reject(new Error("Timeout transação TEF"));
        }

        const numRef = [9];
        const ret = normalizeRet(fn.ExecTransac(buffer, numRef));

        if (ret === PWRET.OK) return resolve({ ret });
        if (ret === PWRET.CANCEL) return reject(new Error("Transação cancelada (operador/pinpad)"));
        if (ret === PWRET.TIMEOUT) return reject(new Error("Timeout no pinpad"));
        if (ret === PWRET.COMMERROR) return reject(new Error("Erro de comunicação PayGo"));

        if (ret === PWRET.MOREDATA) {
          const count = numRef[0] | 0;
          const captures = [];
          for (let i = 0; i < count; i++) {
            const item = buffer[i] || {};
            const tipo = item.bTipoDeDado;
            const prompt = (item.szPrompt || "").replace(/\0.*$/, "");
            if (tipo === undefined || tipo === 0 || tipo === null) continue;
            if (tipo === PWDAT.DSPCHECKOUT || tipo === PWDAT.DSPQRCODE) {
              if (onDisplay) onDisplay(prompt);
              continue;
            }
            captures.push(extractCaptureItem(item));
          }
          if (captures.length > 0) {
            if (!onInteractiveCaptures) {
              if (fn.PPAbort) { try { fn.PPAbort(); } catch { /* ignore */ } }
              return reject(new Error("Captura interativa solicitada e nenhum handler disponível"));
            }
            try {
              const responses = await onInteractiveCaptures(captures);
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
          } else {
            const dbuf = Buffer.alloc(512);
            try {
              const r2 = normalizeRet(fn.PPEventLoop(dbuf, 512));
              if (r2 === PWRET.OK && onDisplay) {
                const end = dbuf.indexOf(0);
                const msg = dbuf.slice(0, end >= 0 ? end : 512).toString("latin1");
                if (msg) onDisplay(msg);
              }
            } catch { /* ignore */ }
          }
          return setImmediate(tick);
        }

        if (ret === PWRET.NOTHING || ret === PWRET.DISPLAY) {
          const dbuf = Buffer.alloc(512);
          try {
            const r2 = normalizeRet(fn.PPEventLoop(dbuf, 512));
            if (r2 === PWRET.OK && onDisplay) {
              const end = dbuf.indexOf(0);
              const msg = dbuf.slice(0, end >= 0 ? end : 512).toString("latin1");
              if (msg) onDisplay(msg);
            }
          } catch { /* ignore */ }
          return setImmediate(tick);
        }

        return reject(new Error(
          `PW_iExecTransac ret=${ret}${explainRet(ret) ? ` — ${explainRet(ret)}` : ""}`,
        ));
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
function efetuarPagamento({ valor, tipo = "credito", parcelas = 1, financiamento = 1, onDisplay, onCapture } = {}) {
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
  try {
    startTransaction(PWOPER.ADMIN, "admin");
    if (merchantCode) fn.AddParam(PWINFO.MERCHCNPJCPF, String(merchantCode).replace(/\D/g, ""));
    if (terminalCode) fn.AddParam(PWINFO.POSID, String(terminalCode));
    if (host) fn.AddParam(PWINFO.AUTADDRESS, String(host));
    if (technicalPassword) fn.AddParam(PWINFO.AUTHTECHUSER, String(technicalPassword));
    if (pinpadPort) {
      fn.AddParam(PWINFO.USINGPINPAD, "1");
      fn.AddParam(PWINFO.PPCOMMPORT, String(pinpadPort));
    }
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
      adminInFlight.captureSeq = (adminInFlight.captureSeq || 0) + 1;
      adminInFlight.pendingCaptures = captures.map((c) => ({ ...c, seq: adminInFlight.captureSeq }));
      adminInFlight.status = "waiting_input";
      adminInFlight.message = captures[0]?.prompt || "Aguardando entrada do operador";
      adminInFlight.pendingResolve = resolve;
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
  if (cnpj) fn.AddParam(PWINFO.MERCHCNPJCPF, String(cnpj).replace(/\D/g, ""));
  if (pdc) fn.AddParam(PWINFO.POSID, String(pdc));
  if (ambiente) fn.AddParam(PWINFO.AUTADDRESS, String(ambiente));
  if (senhaTecnica) fn.AddParam(PWINFO.AUTHTECHUSER, String(senhaTecnica));
  if (portaPinpad) fn.AddParam(PWINFO.PPCOMMPORT, String(portaPinpad));
  runExecLoop({ onDisplay, onCapture, timeoutMs: 180000 });
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
