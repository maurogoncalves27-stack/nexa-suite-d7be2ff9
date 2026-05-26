// ============================================================
// Agente SiTef local — wrapper HTTP em torno da CliSiTef.dll
// ============================================================
// Roda dentro do processo principal do Electron e expõe:
//   GET  /sitef/health         -> { ok, mode, version }
//   POST /sitef/iniciar        -> dispara venda
//   POST /sitef/cancelar       -> aborta venda em andamento
//   GET  /sitef/eventos        -> Server-Sent Events com mudanças de estado
//
// Modos:
//   - "stub": SITEF_MOCK=true (default em dev). Simula o fluxo do pinpad.
//   - "real": SITEF_MOCK=false. Carrega CliSiTef.dll via koffi (sitef-real.cjs).
//             Requer: CliSiTef instalado + pinpad PPC930 plugado + SiTef Demo
//             Console rodando (homologação) ou servidor SiTef (produção).
// ============================================================

const http = require("http");
const packageJson = require("./package.json");
let sitefReal = null;
try { sitefReal = require("./sitef-real.cjs"); } catch { /* opcional */ }

const PORT = parseInt(process.env.SITEF_AGENT_PORT || "60906", 10);
const MOCK = process.env.SITEF_MOCK ? process.env.SITEF_MOCK !== "false" : false; // Totem: padrão real
const AGENT_VERSION = MOCK ? `${packageJson.version}-stub` : `${packageJson.version}-real`;

// Defaults SiTef (sobrescritos por env)
const SITEF_SERVER = process.env.SITEF_SERVER || "127.0.0.1";
const SITEF_LOJA = process.env.SITEF_LOJA || "00000000";
const SITEF_TERMINAL = process.env.SITEF_TERMINAL || "REST0001";

// -----------------------------------------------------------
// Estado compartilhado
// -----------------------------------------------------------
let currentTransaction = null;
let server = null;
const sseClients = new Set();

const broadcast = (event) => {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of sseClients) {
    try { res.write(line); } catch { /* ignore */ }
  }
};

const setStatus = (status, message) => {
  if (!currentTransaction) return;
  currentTransaction.status = status;
  broadcast({ type: "status", id: currentTransaction.id, status, message });
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// -----------------------------------------------------------
// Stub (mock)
// -----------------------------------------------------------
async function runStubTransaction(req) {
  const isPix = req.metodo === "pix";
  setStatus("connecting", isPix ? "Gerando QR Code PIX (stub)..." : "Conectando ao pinpad (stub)...");
  await sleep(500);
  if (currentTransaction?.cancelled) return { aprovado: false, cancelado: true };

  setStatus("waiting_card", isPix ? "Escaneie o QR Code no app do banco" : "Aproxime, insira ou passe o cartão");
  await sleep(isPix ? 4000 : 2000);
  if (currentTransaction?.cancelled) return { aprovado: false, cancelado: true };

  setStatus("processing", isPix ? "Confirmando recebimento PIX..." : "Autorizando transação...");
  await sleep(1500);
  if (currentTransaction?.cancelled) return { aprovado: false, cancelado: true };

  const aprovado = Math.random() > 0.1;
  if (aprovado) {
    return {
      aprovado: true,
      mensagem: isPix ? "PIX recebido" : "Transação aprovada",
      nsu: String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0"),
      codigoAutorizacao: isPix ? "PIX-" + String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0") : String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0"),
      bandeira: isPix ? "PIX" : ["VISA", "MASTERCARD", "ELO"][Math.floor(Math.random() * 3)],
      ultimosDigitos: isPix ? "----" : String(Math.floor(Math.random() * 10_000)).padStart(4, "0"),
      parcelas: req.parcelas || 1,
      adquirente: "C6 PAY (stub)",
    };
  }
  return { aprovado: false, mensagem: isPix ? "PIX não confirmado no tempo" : "Cartão negado pela operadora" };
}

// -----------------------------------------------------------
// Real (CliSiTef.dll via koffi)
// -----------------------------------------------------------
async function runRealTransaction(req) {
  if (!sitefReal) {
    throw new Error("Módulo sitef-real.cjs não disponível (koffi não instalado?). Mantenha SITEF_MOCK=true ou rode npm install na pasta electron-totem.");
  }
  if (!sitefReal.isAvailable()) {
    throw new Error("CliSiTef.dll não encontrada. Instale o CliSiTef (Instala_Client.exe) e/ou defina CLISITEF_DLL_PATH.");
  }

  setStatus("connecting", "Conectando à CliSiTef...");

  const cfg = {
    serverIp: SITEF_SERVER,
    merchantCode: SITEF_LOJA,
    terminalCode: SITEF_TERMINAL,
  };

  const result = await sitefReal.runTransaction(req, cfg, {
    cancelled: () => !!currentTransaction?.cancelled,
    onCommand: (cmd, msg, label) => {
      // Mapeia comandos CliSiTef pra estados de UI
      if (msg) setStatus("processing", msg);
      else if (cmd === 15) setStatus("waiting_card", "Remova o cartão");
      else if (cmd === 14 || cmd === 20) setStatus("processing", "Confirmando...");
      else if (cmd === 16 || cmd === 30) setStatus("processing", "Selecionando...");
      else setStatus("processing", label || `cmd ${cmd}`);
    },
  });

  return result;
}

// -----------------------------------------------------------
// HTTP helpers
// -----------------------------------------------------------
const json = (res, status, body) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Private-Network": "true",
  });
  res.end(JSON.stringify(body));
};

const readBody = (req) => new Promise((resolve, reject) => {
  let data = "";
  req.on("data", (chunk) => { data += chunk; });
  req.on("end", () => {
    if (!data) return resolve({});
    try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
  });
  req.on("error", reject);
});

// -----------------------------------------------------------
// Servidor
// -----------------------------------------------------------
function startSitefAgent() {
  if (server) return server;

  server = http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Private-Network": "true",
      });
      return res.end();
    }

    const url = req.url || "/";

    if ((url === "/sitef/health" || url === "/sitef/heaslth") && req.method === "GET") {
      const dllOk = !MOCK && sitefReal ? sitefReal.isAvailable() : null;
      const dllDiagnostics = !MOCK && sitefReal?.getDiagnostics ? sitefReal.getDiagnostics() : null;
      return json(res, 200, {
        ok: true,
        mode: MOCK ? "stub" : "real",
        version: AGENT_VERSION,
        appVersion: packageJson.version,
        busy: !!currentTransaction,
        server: SITEF_SERVER,
        loja: SITEF_LOJA,
        terminal: SITEF_TERMINAL,
        dllAvailable: dllOk,
        dllPath: dllDiagnostics?.found || null,
        dllDiagnostics,
        pid: process.pid,
        executable: process.execPath,
        sitefMockEnv: process.env.SITEF_MOCK ?? null,
      });
    }

    if (url === "/sitef/eventos" && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Private-Network": "true",
      });
      res.write(`data: ${JSON.stringify({ type: "hello", mode: MOCK ? "stub" : "real" })}\n\n`);
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }

    if (url === "/sitef/iniciar" && req.method === "POST") {
      if (currentTransaction) {
        return json(res, 409, { aprovado: false, mensagem: "Já existe transação em andamento" });
      }
      let body;
      try { body = await readBody(req); }
      catch { return json(res, 400, { aprovado: false, mensagem: "JSON inválido" }); }

      currentTransaction = {
        id: `tx_${Date.now()}`,
        status: "idle",
        request: body,
        cancelled: false,
      };

      try {
        const result = MOCK ? await runStubTransaction(body) : await runRealTransaction(body);
        if (currentTransaction.cancelled) {
          setStatus("cancelled", "Cancelado pelo operador");
          json(res, 200, { aprovado: false, cancelado: true, mensagem: "Cancelado" });
        } else {
          setStatus(result.aprovado ? "approved" : "declined", result.mensagem);
          json(res, 200, result);
        }
      } catch (err) {
        setStatus("error", err.message);
        json(res, 500, { aprovado: false, mensagem: err.message });
      } finally {
        currentTransaction = null;
      }
      return;
    }

    if (url === "/sitef/cancelar" && req.method === "POST") {
      if (!currentTransaction) {
        return json(res, 200, { ok: true, message: "Nenhuma transação ativa" });
      }
      currentTransaction.cancelled = true;
      setStatus("cancelling", "Cancelando...");
      return json(res, 200, { ok: true });
    }

    json(res, 404, { error: "Not Found" });
  });

  const onListening = () => {
    const addr = server.address();
    const host = typeof addr === "object" && addr?.address ? addr.address : "127.0.0.1";
    console.log(`[sitef-agent] ouvindo em http://127.0.0.1:${PORT} e http://localhost:${PORT} (${host}, modo ${MOCK ? "stub" : "real"})`);
    if (!MOCK) {
      console.log(`[sitef-agent] SiTef server=${SITEF_SERVER} loja=${SITEF_LOJA} terminal=${SITEF_TERMINAL}`);
      if (sitefReal && !sitefReal.isAvailable()) {
        console.warn("[sitef-agent] AVISO: CliSiTef.dll não encontrada — transações vão falhar até instalar o CliSiTef.");
      }
    }
  };

  server.once("error", (err) => {
    console.error(`[sitef-agent] falha ao abrir porta ${PORT}: ${err.message}`);
  });

  // Windows/Chrome pode resolver "localhost" como ::1. Escutar em "::" com
  // ipv6Only=false aceita ::1 e 127.0.0.1; se IPv6 estiver indisponível,
  // cai para IPv4 explícito.
  try {
    server.listen({ port: PORT, host: "::", ipv6Only: false }, onListening);
  } catch (err) {
    console.warn(`[sitef-agent] IPv6 indisponível, usando 127.0.0.1: ${err.message}`);
    server.listen(PORT, "127.0.0.1", onListening);
  }

  return server;
}

function stopSitefAgent() {
  if (server) {
    for (const res of sseClients) { try { res.end(); } catch { /* ignore */ } }
    sseClients.clear();
    server.close();
    server = null;
  }
}

module.exports = { startSitefAgent, stopSitefAgent };
