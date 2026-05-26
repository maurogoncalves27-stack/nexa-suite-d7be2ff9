// ============================================================
// CliSiTef - integração real via FFI (koffi)
// ============================================================
// Carrega CliSiTef.dll instalada pelo Instala_Client.exe da Software Express
// e expõe um runner interativo compatível com o agente HTTP.
//
// Funções da DLL utilizadas (assinaturas oficiais — Especificacao do ClientSitef.pdf):
//   int ConfiguraIntSiTefInterativo(char* ip, char* loja, char* terminal, char* reservado)
//   int IniciaFuncaoSiTefInterativo(int funcao, char* valor, char* cupom,
//                                    char* data, char* hora, char* operador, char* params)
//   int ContinuaFuncaoSiTefInterativo(int* comando, int* tipoCampo,
//                                      int* tamMin, int* tamMax,
//                                      char* buffer, int tamBuffer, int continua)
//   void FinalizaFuncaoSiTefInterativo(short confirma, char* cupom, char* data, char* hora, char* params)
//
// Códigos de comando relevantes (durante o loop Continua...):
//    0/2/3/4 → mensagem de display (apenas reportar via SSE)
//    5      → remove mensagem
//   14      → resposta Sim/Não  (auto-responder "1" = Sim)
//   15      → "remova o cartão" (apenas avisar e continuar)
//   16/30   → menu (auto-selecionar primeira opção "1")
//   11/12/21/22/23 → campos texto/numero (responder vazio = aborta)
//
// Campos de resultado (LeCampoSiTef após continua=0):
//   132 = código de autorização     135 = código bandeira
//   133 = NSU SiTef                  138 = nome bandeira
//   134 = NSU host                   175 = últimos 4 dígitos
// ============================================================

const path = require("path");
const fs = require("fs");

const DLL_DEFAULT_PATHS = [
  "C:\\PDVCliSiTef\\CliSiTef32I.dll",
  "C:\\PDVCliSiTef\\CliSiTef.dll",
  "C:\\PDVCliSiTef\\CliSiTef64I.dll",
  "C:\\Program Files (x86)\\SiTef\\CliSiTef.dll",
  "C:\\Program Files\\SiTef\\CliSiTef.dll",
  "C:\\SiTef\\CliSiTef.dll",
];

const getDllCandidates = () => {
  const explicit = process.env.CLISITEF_DLL_PATH || process.env.SITEF_DLL;
  return explicit ? [explicit, ...DLL_DEFAULT_PATHS] : DLL_DEFAULT_PATHS;
};

let koffi = null;
let lib = null;
let fns = null;
let configured = false;
let lastLoadError = null;

const tryLoad = () => {
  if (lib) return lib;
  try {
    koffi = require("koffi");
  } catch (e) {
    throw new Error(
      "Pacote 'koffi' não encontrado. Adicione 'koffi' às dependencies do electron-totem e rode npm install."
    );
  }

  const candidates = getDllCandidates();
  const found = candidates.find((p) => {
    try { return fs.existsSync(p); } catch { return false; }
  });
  if (!found) {
    throw new Error(
      "CliSiTef.dll não encontrada. Esperado em: " + candidates.join(" | ") +
      ". Defina CLISITEF_DLL_PATH para apontar pro arquivo correto."
    );
  }

  lib = koffi.load(found);
  lastLoadError = null;

  // CliSiTef32I.dll (Windows 32-bit) usa __stdcall e pode exportar símbolos
  // decorados no formato _Nome@bytes. Também existem nomes legados/documentais
  // diferentes entre pacotes; por isso cada rotina aceita aliases.
  const isIa32 = process.arch === "ia32";
  const bindFunc = (names, ret, params, stackBytes, optional = false) => {
    const aliases = Array.isArray(names) ? names : [names];
    const attempts = [];
    for (const name of aliases) {
      if (isIa32) {
        attempts.push([`${name} (__stdcall)`, () => lib.func("__stdcall", name, ret, params)]);
        attempts.push([`_${name}@${stackBytes} (__stdcall)`, () => lib.func("__stdcall", `_${name}@${stackBytes}`, ret, params)]);
      } else {
        attempts.push([name, () => lib.func(name, ret, params)]);
      }
      attempts.push([`${name} (cdecl fallback)`, () => lib.func(name, ret, params)]);
    }

    const errors = [];
    for (const [label, factory] of attempts) {
      try { return factory(); } catch (err) { errors.push(`${label}: ${err?.message || err}`); }
    }
    if (optional) return null;
    throw new Error(`Não foi possível carregar a função '${aliases[0]}'. Tentativas: ${errors.join(" | ")}`);
  };

  fns = {
    Configura: bindFunc(["ConfiguraIntSiTefInterativo", "ConfiguraIntSiTefIII"], "int", ["str", "str", "str", "str"], 16),
    Inicia: bindFunc("IniciaFuncaoSiTefInterativo", "int", ["int", "str", "str", "str", "str", "str", "str"], 28),
    Continua: bindFunc("ContinuaFuncaoSiTefInterativo", "int", ["_Inout_ int*", "_Inout_ int*", "_Inout_ int*", "_Inout_ int*", "_Inout_ char*", "int", "int"], 28),
    Finaliza: bindFunc("FinalizaFuncaoSiTefInterativo", "void", ["short", "str", "str", "str", "str"], 20),
  };

  return lib;
};

const configure = (cfg) => {
  tryLoad();
  if (configured && cfg.__noReconfig) return;
  const ip = String(cfg.serverIp || "127.0.0.1");
  const loja = String(cfg.merchantCode || "00000000");
  const terminal = String(cfg.terminalCode || "REST0001");
  const ret = fns.Configura(ip, loja, terminal, "");
  if (ret !== 10000 && ret !== 0) {
    throw new Error(`ConfiguraIntSiTefInterativo falhou (retorno ${ret})`);
  }
  configured = true;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtDate = (d = new Date()) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const fmtTime = (d = new Date()) =>
  `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;

const COMANDO_LABEL = {
  0: "ok",
  2: "msg_operador",
  3: "msg_cliente",
  4: "msg_dual",
  5: "limpar",
  11: "input_numerico",
  12: "input_alfa",
  14: "sim_nao",
  15: "remover_cartao",
  16: "menu",
  21: "input_senha",
  22: "input_alfa",
  23: "input_generico",
  30: "menu_numerado",
};

/**
 * Executa uma transação CliSiTef de forma totalmente assíncrona.
 *
 * @param {object} req
 * @param {number} req.funcao              ex.: 3 = crédito, 2 = débito, 122 = PIX
 * @param {string} req.valor               ex.: "10.50"
 * @param {string} req.numeroCupom
 * @param {number} [req.parcelas]
 * @param {string} [req.metodo]            "credit" | "debit" | "pix" | "voucher"
 * @param {object} cfg                     { serverIp, merchantCode, terminalCode }
 * @param {object} hooks
 * @param {(c:number,buf:string)=>void} [hooks.onCommand]
 * @param {()=>boolean} [hooks.cancelled]
 * @returns {Promise<object>} resultado padronizado pro agente
 */
const runTransaction = async (req, cfg, hooks = {}) => {
  configure(cfg);

  const valor = String(req.valor);
  const cupom = String(req.numeroCupom || Date.now()).slice(0, 12);
  const data = fmtDate();
  const hora = fmtTime();
  const operador = "TOTEM";
  const params = req.parcelas && req.parcelas > 1
    ? `[CodigoEsquemaPagamento=4;NumeroParcelas=${req.parcelas};]`
    : "";

  const inicio = fns.Inicia(req.funcao | 0, valor, cupom, data, hora, operador, params);
  if (inicio !== 10000 && inicio !== 0) {
    return {
      aprovado: false,
      mensagem: `IniciaFuncaoSiTefInterativo retornou ${inicio}`,
      retCode: inicio,
    };
  }

  // Loop interativo
  const BUF_SIZE = 32768;
  let lastMessage = "";
  let lastResponse = "";
  let safety = 0;
  let continua = 0;
  let comando = 0;
  let tipoCampo = 0;
  let tamMin = 0;
  let tamMax = 0;
  const fields = {};

  while (true) {
    if (++safety > 5000) throw new Error("Loop interativo CliSiTef excedeu 5000 iterações");
    if (hooks.cancelled?.()) {
      // Software Express recomenda enviar ESC (cmd 0 não cancela) — finaliza forçando
      try { fns.Finaliza(0, cupom, data, hora, ""); } catch { /* ignore */ }
      return { aprovado: false, cancelado: true, mensagem: "Cancelado pelo operador" };
    }

    const comandoBox = [comando];
    const tipoBox = [tipoCampo];
    const minBox = [tamMin];
    const maxBox = [tamMax];
    const buffer = Buffer.alloc(BUF_SIZE);
    if (continua === 0 && lastResponse) buffer.write(lastResponse, 0, "latin1");

    const ret = fns.Continua(comandoBox, tipoBox, minBox, maxBox, buffer, BUF_SIZE, continua);
    comando = comandoBox[0];
    tipoCampo = tipoBox[0];
    tamMin = minBox[0];
    tamMax = maxBox[0];
    const bufStr = buffer.toString("latin1").replace(/\0.*$/s, "").trim();
    continua = 0;
    lastResponse = "";

    if (bufStr) lastMessage = bufStr;
    if (comando === 0 && tipoCampo) fields[tipoCampo] = bufStr;
    hooks.onCommand?.(comando, bufStr, COMANDO_LABEL[comando]);

    if (ret === 0) break;
    if (ret !== 10000) {
      // Erro durante a transação
      return {
        aprovado: false,
        mensagem: bufStr || `ContinuaFuncaoSiTefInterativo retornou ${ret}`,
        retCode: ret,
      };
    }

    switch (comando) {
      case 20: // Sim/Não → confirma (0)
        lastResponse = "0";
        break;
      case 21: // menu opção
      case 30:
      case 42:
        lastResponse = "1";
        break;
      case 22: // mensagem com qualquer tecla
        lastResponse = "";
        break;
      // 29/30 e coletas sensíveis: NÃO responder; pinpad captura direto no device.
      default:
        break;
    }

    // Yield pro event loop não travar (e dar chance pro cancel chegar)
    await sleep(20);
  }

  const readField = (campo) => fields[campo] || null;
  const codigoAutorizacao = readField(132);
  const nsuSitef = readField(133);
  const nsuHost = readField(134);
  const codBandeira = readField(135);
  const nomeBandeira = readField(138);
  const ultimos = readField(175);

  const aprovado = !!(codigoAutorizacao || nsuHost || nsuSitef);

  // Confirma a transação com a SiTef (commit) — necessário em todas vendas.
  try { fns.Finaliza(aprovado ? 1 : 0, cupom, data, hora, ""); } catch { /* ignore */ }

  return {
    aprovado,
    mensagem: aprovado ? (lastMessage || "Transação aprovada") : (lastMessage || "Transação não aprovada"),
    nsu: nsuHost || nsuSitef || undefined,
    codigoAutorizacao: codigoAutorizacao || undefined,
    bandeira: nomeBandeira || codBandeira || undefined,
    ultimosDigitos: ultimos || undefined,
    parcelas: req.parcelas || 1,
    adquirente: undefined, // CliSiTef não retorna nome do adquirente diretamente
  };
};

const isAvailable = () => {
  try { tryLoad(); return true; } catch (err) { lastLoadError = err?.message || String(err); return false; }
};

const getDiagnostics = () => {
  const candidates = getDllCandidates();
  let found = null;
  for (const p of candidates) {
    try { if (fs.existsSync(p)) { found = p; break; } } catch { /* ignore */ }
  }
  return {
    dllPathEnv: process.env.CLISITEF_DLL_PATH || null,
    sitefDllEnv: process.env.SITEF_DLL || null,
    arch: process.arch,
    ffiAbi: process.arch === "ia32" ? "__stdcall + decorated-symbol fallback" : "default",
    candidates,
    found,
    loadError: lastLoadError,
  };
};

module.exports = { runTransaction, configure, isAvailable, getDiagnostics };
