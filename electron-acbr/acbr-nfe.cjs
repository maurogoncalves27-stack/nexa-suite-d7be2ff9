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

let lib = null;
let initialized = false;
let fn = {};

function load() {
  if (lib) return lib;
  if (!fs.existsSync(DLL_PATH)) {
    throw new Error(`ACBrNFe64.dll não encontrada em ${DLL_PATH}. Confira ACBR_BASE.`);
  }
  if (!fs.existsSync(INI_PATH)) {
    throw new Error(`ACBrLib.ini não encontrado em ${INI_PATH}.`);
  }
  lib = koffi.load(DLL_PATH);

  fn.Inicializar = lib.func("__stdcall", "NFE_Inicializar", "int", ["string", "string"]);
  fn.Finalizar = lib.func("__stdcall", "NFE_Finalizar", "int", []);
  fn.UltimoRetorno = lib.func("__stdcall", "NFE_UltimoRetorno", "int", ["_Out_ char*", "_Inout_ int*"]);
  fn.Nome = lib.func("__stdcall", "NFE_Nome", "int", ["_Out_ char*", "_Inout_ int*"]);
  fn.Versao = lib.func("__stdcall", "NFE_Versao", "int", ["_Out_ char*", "_Inout_ int*"]);

  fn.StatusServico = lib.func("__stdcall", "NFE_StatusServico", "int", ["_Out_ char*", "_Inout_ int*"]);
  fn.CarregarINI = lib.func("__stdcall", "NFE_CarregarINI", "int", ["string"]);
  fn.LimparLista = lib.func("__stdcall", "NFE_LimparLista", "int", []);
  fn.Assinar = lib.func("__stdcall", "NFE_Assinar", "int", []);
  fn.Validar = lib.func("__stdcall", "NFE_Validar", "int", []);
  fn.Enviar = lib.func("__stdcall", "NFE_Enviar", "int",
    ["int", "bool", "bool", "bool", "_Out_ char*", "_Inout_ int*"]);
  fn.CancelarNFe = lib.func("__stdcall", "NFE_CancelarNFe", "int",
    ["string", "string", "string", "int", "_Out_ char*", "_Inout_ int*"]);
  fn.Inutilizar = lib.func("__stdcall", "NFE_Inutilizar", "int",
    ["string", "string", "int", "int", "int", "int", "int", "_Out_ char*", "_Inout_ int*"]);
  fn.ImprimirDANFePDF = lib.func("__stdcall", "NFE_ImprimirDANFePDF", "int", []);
  fn.SalvarPDF = lib.func("__stdcall", "NFE_SalvarPDF", "int", ["_Out_ char*", "_Inout_ int*"]);

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
    throw new Error(`NFE_Inicializar falhou (${r}): ${err}`);
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
  nome,
  versao,
  statusServico,
  emitirNFCe,
  cancelarNFe,
  ultimoRetorno,
  paths: { DLL_PATH, INI_PATH, ACBR_BASE },
};
