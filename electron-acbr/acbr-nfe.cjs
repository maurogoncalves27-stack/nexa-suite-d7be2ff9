// ============================================================
// Wrapper koffi em torno da ACBrLibNFe (ACBrNFe64.dll)
// ============================================================
// Doc oficial: https://acbr.sourceforge.io/ACBrLib/UnitACBrLibNFe.html
//
// Convenção da ACBrLib:
//   - Toda função retorna int (0 = OK, < 0 = erro)
//   - Strings de saída: (char* sMensagem, int* esTamanho)
//     Chama-se 1ª vez com buffer pequeno para descobrir tamanho real,
//     se retornar -3 (buffer insuficiente) realoca e tenta de novo.
//   - Codificação: UTF-8.
// ============================================================

const path = require("path");
const fs = require("fs");
const koffi = require("koffi");

const ACBR_BASE = process.env.ACBR_BASE || "C:\\NexaACBr\\bin";
const DLL_PATH = path.join(ACBR_BASE, "ACBrNFe64.dll");
const INI_PATH = path.join(ACBR_BASE, "ACBrLib.ini");
const LOG_PATH = path.join(path.dirname(ACBR_BASE), "logs");
const SCHEMAS_PATH = path.join(ACBR_BASE, "Schemas");

let lib = null;
let initialized = false;
let fn = {};

function readIniSections() {
  if (!fs.existsSync(INI_PATH)) return [];
  const content = fs.readFileSync(INI_PATH, "utf-8");
  return [...content.matchAll(/^\s*\[([^\]]+)\]\s*$/gm)].map((match) => match[1]);
}

function diagnostics() {
  const iniSections = readIniSections();
  const missing = [];

  if (!fs.existsSync(DLL_PATH)) missing.push(DLL_PATH);
  if (!fs.existsSync(INI_PATH)) missing.push(INI_PATH);
  if (!fs.existsSync(SCHEMAS_PATH)) missing.push(SCHEMAS_PATH);
  if (!fs.existsSync(LOG_PATH)) missing.push(LOG_PATH);

  return {
    dllExists: fs.existsSync(DLL_PATH),
    iniExists: fs.existsSync(INI_PATH),
    schemasExists: fs.existsSync(SCHEMAS_PATH),
    logsExists: fs.existsSync(LOG_PATH),
    iniSections,
    iniLooksMinimal: iniSections.length <= 1,
    missing,
    missingExports: (lib && lib.__missingExports) || [],
    expected: {
      DLL_PATH,
      INI_PATH,
      SCHEMAS_PATH,
      LOG_PATH,
    },
  };
}

function explainInitFailure(retCode, acbrMessage = "") {
  const info = diagnostics();
  const hints = [];

  if (info.missing.length) {
    hints.push(`itens ausentes: ${info.missing.join(", ")}`);
  }
  if (info.iniLooksMinimal) {
    hints.push(`ACBrLib.ini parece mínimo demais (seções encontradas: ${info.iniSections.join(", ") || "nenhuma"})`);
  }

  const suffix = hints.length ? ` Diagnóstico: ${hints.join("; ")}.` : "";
  return `NFE_Inicializar falhou (${retCode})${acbrMessage ? `: ${acbrMessage}` : ""}.${suffix}`;
}

function load() {
  if (lib) return lib;
  if (!fs.existsSync(DLL_PATH)) {
    throw new Error(`ACBrNFe64.dll não encontrada em ${DLL_PATH}. Confira ACBR_BASE.`);
  }
  if (!fs.existsSync(INI_PATH)) {
    throw new Error(`ACBrLib.ini não encontrado em ${INI_PATH}.`);
  }
  // Garante que as DLLs dependentes (libxml2, libxslt, libxmlsec, openssl etc.)
  // sejam encontradas pelo loader do Windows: precisamos do ACBR_BASE no PATH
  // E como cwd do processo (LoadLibrary busca primeiro no diretório atual).
  try {
    if (process.platform === "win32") {
      process.env.PATH = `${ACBR_BASE};${process.env.PATH || ""}`;
      try { process.chdir(ACBR_BASE); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  lib = koffi.load(DLL_PATH);

  const missingExports = [];
  const bind = (key, name, ret, args, required = false) => {
    try {
      fn[key] = lib.func("__stdcall", name, ret, args);
    } catch (e) {
      missingExports.push(name);
      fn[key] = () => {
        throw new Error(`Função '${name}' não existe na DLL ACBrNFe64.dll carregada (${DLL_PATH}). Atualize a ACBrLibNFe para uma versão que exporte este símbolo.`);
      };
      if (required) {
        throw new Error(`DLL ACBrNFe64 incompatível: símbolo obrigatório '${name}' não encontrado em ${DLL_PATH}.`);
      }
    }
  };

  bind("Inicializar", "NFE_Inicializar", "int", ["string", "string"], true);
  bind("Finalizar", "NFE_Finalizar", "int", [], true);
  bind("UltimoRetorno", "NFE_UltimoRetorno", "int", ["_Out_ char*", "_Inout_ int*"], true);
  bind("Nome", "NFE_Nome", "int", ["_Out_ char*", "_Inout_ int*"]);
  bind("Versao", "NFE_Versao", "int", ["_Out_ char*", "_Inout_ int*"]);

  bind("StatusServico", "NFE_StatusServico", "int", ["_Out_ char*", "_Inout_ int*"]);
  bind("CarregarINI", "NFE_CarregarINI", "int", ["string"], true);
  bind("LimparLista", "NFE_LimparLista", "int", [], true);
  bind("Assinar", "NFE_Assinar", "int", []);
  bind("Validar", "NFE_Validar", "int", []);
  bind("Enviar", "NFE_Enviar", "int",
    ["int", "bool", "bool", "bool", "_Out_ char*", "_Inout_ int*"], true);
  bind("CancelarNFe", "NFE_CancelarNFe", "int",
    ["string", "string", "string", "int", "_Out_ char*", "_Inout_ int*"]);
  bind("Inutilizar", "NFE_Inutilizar", "int",
    ["string", "string", "int", "int", "int", "int", "int", "_Out_ char*", "_Inout_ int*"]);
  bind("ImprimirDANFePDF", "NFE_ImprimirDANFePDF", "int", []);
  bind("SalvarPDF", "NFE_SalvarPDF", "int", ["_Out_ char*", "_Inout_ int*"]);

  lib.__missingExports = missingExports;
  return lib;
}


// Helper: chama função (out char*, inout int*) com auto-resize
function callStr(fnRef, ...args) {
  let bufSize = 4096;
  let buf = Buffer.alloc(bufSize);
  let sizeRef = [bufSize];
  let ret = fnRef(...args, buf, sizeRef);
  if (ret === -3 || (sizeRef[0] > bufSize)) {
    bufSize = sizeRef[0] + 16;
    buf = Buffer.alloc(bufSize);
    sizeRef = [bufSize];
    ret = fnRef(...args, buf, sizeRef);
  }
  const msg = buf.slice(0, sizeRef[0]).toString("utf-8").replace(/\0+$/, "");
  return { ret, msg };
}

function ultimoRetorno() {
  const { msg } = callStr(fn.UltimoRetorno);
  return msg;
}

function ensureInit() {
  if (initialized) return;
  load();
  const r = fn.Inicializar(INI_PATH, "");
  if (r !== 0) {
    const err = ultimoRetorno();
    throw new Error(explainInitFailure(r, err));
  }
  initialized = true;
}

function finalizar() {
  if (!initialized) return;
  try { fn.Finalizar(); } catch { /* ignore */ }
  initialized = false;
}

// ----------------------------------------------------------------
// API pública
// ----------------------------------------------------------------

function nome() {
  ensureInit();
  return callStr(fn.Nome).msg;
}

function versao() {
  ensureInit();
  return callStr(fn.Versao).msg;
}

function statusServico() {
  ensureInit();
  const { ret, msg } = callStr(fn.StatusServico);
  if (ret !== 0) throw new Error(`NFE_StatusServico (${ret}): ${ultimoRetorno()}`);
  return msg;
}

/**
 * Emite NFC-e a partir de um INI no formato ACBrNFeMonitor.
 * @param {string} iniContent  Conteúdo do INI (UTF-8)
 * @param {object} opts        { imprimir=false, sincrono=true }
 */
function emitirNFCe(iniContent, opts = {}) {
  ensureInit();
  fn.LimparLista();

  const tmpFile = path.join(require("os").tmpdir(), `nfce-${Date.now()}-${Math.random().toString(36).slice(2)}.ini`);
  fs.writeFileSync(tmpFile, iniContent, "utf-8");
  try {
    let r = fn.CarregarINI(tmpFile);
    if (r !== 0) throw new Error(`NFE_CarregarINI (${r}): ${ultimoRetorno()}`);

    const { ret, msg } = callStr(fn.Enviar, 1, !!opts.imprimir, opts.sincrono !== false, false);
    if (ret !== 0) throw new Error(`NFE_Enviar (${ret}): ${ultimoRetorno()}\n${msg}`);
    return msg;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

function cancelarNFe({ chave, justificativa, cnpj, seqEvento = 1 }) {
  ensureInit();
  if (!chave || chave.length !== 44) throw new Error("Chave NFe inválida (44 dígitos)");
  if (!justificativa || justificativa.length < 15) throw new Error("Justificativa precisa ter no mínimo 15 caracteres");
  if (!cnpj) throw new Error("CNPJ do emitente obrigatório");

  const { ret, msg } = callStr(fn.CancelarNFe, chave, justificativa, cnpj, seqEvento);
  if (ret !== 0) throw new Error(`NFE_CancelarNFe (${ret}): ${ultimoRetorno()}\n${msg}`);
  return msg;
}

module.exports = {
  ensureInit,
  finalizar,
  diagnostics,
  nome,
  versao,
  statusServico,
  emitirNFCe,
  cancelarNFe,
  ultimoRetorno,
  paths: { DLL_PATH, INI_PATH, ACBR_BASE, SCHEMAS_PATH, LOG_PATH },
};
