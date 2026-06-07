// ============================================================
// Wrapper koffi em torno da ACBrLibTEFD (ACBrTEFD64.dll)
// ============================================================
// Modo síncrono simples — para fluxo TEF assíncrono real,
// será necessário polling de eventos. Por enquanto: iniciar
// venda → coletar resposta → finalizar.
// ============================================================

const path = require("path");
const fs = require("fs");
const koffi = require("koffi");

const ACBR_BASE = process.env.ACBR_BASE || "C:\\NexaACBr\\bin";
const DLL_PATH = path.join(ACBR_BASE, "ACBrTEFD64.dll");
// INI dedicado do TEF para não conflitar com o ACBrLib.ini da NFC-e.
// Pode ser sobrescrito com a env ACBR_TEFD_INI.
const INI_PATH = process.env.ACBR_TEFD_INI || path.join(ACBR_BASE, "ACBrLibTEFD.ini");

let lib = null;
let initialized = false;
let fn = {};
let available = null; // true/false após primeira tentativa

function load() {
  if (lib) return lib;
  if (!fs.existsSync(DLL_PATH)) {
    available = false;
    throw new Error(`ACBrTEFD64.dll não encontrada em ${DLL_PATH}. TEF indisponível.`);
  }
  lib = koffi.load(DLL_PATH);

  fn.Inicializar = lib.func("__stdcall", "TEFD_Inicializar", "int", ["string", "string"]);
  fn.Finalizar = lib.func("__stdcall", "TEFD_Finalizar", "int", []);
  fn.UltimoRetorno = lib.func("__stdcall", "TEFD_UltimoRetorno", "int", ["_Out_ char*", "_Inout_ int*"]);
  fn.Nome = lib.func("__stdcall", "TEFD_Nome", "int", ["_Out_ char*", "_Inout_ int*"]);
  fn.Versao = lib.func("__stdcall", "TEFD_Versao", "int", ["_Out_ char*", "_Inout_ int*"]);

  // Operações principais
  fn.IniciarTransacao = lib.func("__stdcall", "TEFD_IniciarTransacao", "int", ["string"]);
  fn.EfetuarPagamento = lib.func("__stdcall", "TEFD_EfetuarPagamento", "int",
    ["double", "int", "int", "int", "_Out_ char*", "_Inout_ int*"]);
  fn.CancelarTransacaoEmAndamento = lib.func("__stdcall", "TEFD_CancelarTransacaoEmAndamento", "int", []);
  fn.FinalizarTransacao = lib.func("__stdcall", "TEFD_FinalizarTransacao", "int", []);
  // Cancelamento de venda já aprovada (rede, NSU, data DDMMAAAA, valor)
  fn.CancelarTransacao = lib.func("__stdcall", "TEFD_CancelarTransacao", "int",
    ["string", "string", "string", "double", "_Out_ char*", "_Inout_ int*"]);
  // Menu administrativo. operacao: 0 = abre menu / outras = códigos específicos
  // 1 = teste comunicação, 4 = relatório sintético, 5 = detalhado, 6 = resumido (varia por adquirente)
  fn.Administrativo = lib.func("__stdcall", "TEFD_Administrativo", "int",
    ["int", "_Out_ char*", "_Inout_ int*"]);

  available = true;
  return lib;
}

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

function isAvailable() {
  if (available !== null) return available;
  try { load(); return true; } catch { return false; }
}

function ensureInit() {
  if (initialized) return;
  load();
  const r = fn.Inicializar(INI_PATH, "");
  if (r !== 0) {
    const err = ultimoRetorno();
    throw new Error(`TEFD_Inicializar falhou (${r}): ${err}`);
  }
  initialized = true;
}

function finalizar() {
  if (!initialized) return;
  try { fn.Finalizar(); } catch { /* ignore */ }
  initialized = false;
}

function versao() {
  ensureInit();
  return callStr(fn.Versao).msg;
}

/**
 * Iniciar pagamento TEF (débito/crédito/pix).
 * @param {object} req { valor, tipo: 'credito'|'debito'|'pix', parcelas, financiamento }
 * Tipos numéricos ACBr:
 *   0 = TodosOsTipos, 1 = Crédito à vista, 2 = Crédito parcelado,
 *   3 = Débito, 4 = Voucher/Alimentação, 5 = Frota, 6 = PIX
 */
function efetuarPagamento({ valor, tipo = "credito", parcelas = 1, financiamento = 1 }) {
  ensureInit();
  const tiposMap = { credito: parcelas > 1 ? 2 : 1, debito: 3, voucher: 4, pix: 6 };
  const codTipo = tiposMap[tipo] ?? 1;
  // financiamento: 1 = à vista, 2 = parcelado pelo emissor, 3 = parcelado pelo estabelecimento
  const { ret, msg } = callStr(fn.EfetuarPagamento, valor, codTipo, parcelas, financiamento);
  if (ret !== 0) throw new Error(`TEFD_EfetuarPagamento (${ret}): ${ultimoRetorno()}\n${msg}`);
  try { fn.FinalizarTransacao(); } catch { /* ignore */ }
  return msg;
}

function cancelarEmAndamento() {
  if (!initialized) return;
  try { fn.CancelarTransacaoEmAndamento(); } catch { /* ignore */ }
}

/**
 * Cancelamento de uma venda já aprovada.
 * @param {object} req { rede, nsu, data (DDMMAAAA), valor }
 */
function cancelarVenda({ rede = "", nsu, data, valor }) {
  ensureInit();
  if (!nsu) throw new Error("nsu obrigatório");
  if (!data) throw new Error("data obrigatória (DDMMAAAA)");
  if (!valor || valor <= 0) throw new Error("valor obrigatório");
  const { ret, msg } = callStr(fn.CancelarTransacao, String(rede), String(nsu), String(data), Number(valor));
  if (ret !== 0) throw new Error(`TEFD_CancelarTransacao (${ret}): ${ultimoRetorno()}\n${msg}`);
  try { fn.FinalizarTransacao(); } catch { /* ignore */ }
  return msg;
}

/**
 * Operação administrativa.
 * @param {number} operacao 0 = abre menu; 1 = teste comunicação; 4/5/6 = relatórios
 */
function administrativo(operacao = 0) {
  ensureInit();
  const { ret, msg } = callStr(fn.Administrativo, Number(operacao) || 0);
  if (ret !== 0) throw new Error(`TEFD_Administrativo (${ret}): ${ultimoRetorno()}\n${msg}`);
  try { fn.FinalizarTransacao(); } catch { /* ignore */ }
  return msg;
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
  ultimoRetorno,
  paths: { DLL_PATH, INI_PATH, ACBR_BASE },
};
