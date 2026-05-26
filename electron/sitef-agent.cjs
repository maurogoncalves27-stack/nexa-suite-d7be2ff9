// ============================================================
// Agente SiTef local — wrapper HTTP em torno da CliSiTef.dll
// ============================================================
// Roda dentro do processo principal do Electron e expõe:
//   GET  /sitef/health         -> { ok, mode, version }
//   POST /sitef/iniciar        -> dispara venda (body: { funcao, valor, numeroCupom, ... })
//   POST /sitef/cancelar       -> aborta venda em andamento
//   GET  /sitef/eventos        -> Server-Sent Events com mudanças de estado
//
// Modo "stub" (padrão, SITEF_MOCK=true): simula o fluxo completo do pinpad
// sem precisar de hardware nem da DLL — útil para QA e desenvolvimento.
//
// Modo "real": carrega CliSiTef.dll via FFI (koffi) — habilitar em produção
// quando o credenciamento C6 Pay + SiTef estiver concluído. Ver README.md.
// ============================================================

const http = require("http");

const PORT = parseInt(process.env.SITEF_AGENT_PORT || "60906", 10);
const MOCK = process.env.SITEF_MOCK !== "false"; // padrão: stub
const VERSION = "0.1.0-stub";

// -----------------------------------------------------------
// Estado compartilhado
// -----------------------------------------------------------
let currentTransaction = null; // { id, status, request, cancelled }
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
// Stub: simula o fluxo CliSiTef
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

  // 90% aprovado
  const aprovado = Math.random() > 0.1;
  if (aprovado) {
    if (isPix) {
      return {
        aprovado: true,
        mensagem: "PIX recebido",
        nsu: String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0"),
        codigoAutorizacao: "PIX-" + String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0"),
        bandeira: "PIX",
        ultimosDigitos: "----",
        parcelas: 1,
        adquirente: "C6 PAY (stub)",
      };
    }
    return {
      aprovado: true,
      mensagem: "Transação aprovada",
      nsu: String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0"),
      codigoAutorizacao: String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0"),
      bandeira: ["VISA", "MASTERCARD", "ELO"][Math.floor(Math.random() * 3)],
      ultimosDigitos: String(Math.floor(Math.random() * 10_000)).padStart(4, "0"),
      parcelas: req.parcelas || 1,
      adquirente: "C6 PAY (stub)",
    };
  }
  return { aprovado: false, mensagem: isPix ? "PIX não confirmado no tempo" : "Cartão negado pela operadora" };
}

// -----------------------------------------------------------
// Real: placeholder para CliSiTef via FFI
// -----------------------------------------------------------
async function runRealTransaction(_req) {
  // TODO: carregar CliSiTef.dll com koffi e implementar o handshake
  // (IniciaFuncaoSiTefInterativo + ContinuaFuncaoSiTefInterativo).
  // Enquanto não estiver pronto, devolve erro instrutivo.
  throw new Error(
    "Modo real ainda não implementado. Defina SITEF_MOCK=true ou conclua a integração CliSiTef.dll."
  );
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
    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      });
      return res.end();
    }

    const url = req.url || "/";

    if (url === "/sitef/health" && req.method === "GET") {
      return json(res, 200, {
        ok: true,
        mode: MOCK ? "stub" : "real",
        version: VERSION,
        busy: !!currentTransaction,
      });
    }

    if (url === "/sitef/eventos" && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
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

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`[sitef-agent] ouvindo em http://127.0.0.1:${PORT} (modo ${MOCK ? "stub" : "real"})`);
  });

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
