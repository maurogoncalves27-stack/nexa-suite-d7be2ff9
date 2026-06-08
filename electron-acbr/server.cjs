// ============================================================
// Servidor HTTP local — porta 3030
// ============================================================
// Endpoints:
//   GET  /health            -> { ok, version, nfceReady, tefAvailable }
//   GET  /nfce/status       -> StatusServico SEFAZ
//   POST /nfce/emitir       -> { iniContent, imprimir? } -> XML/retorno bruto
//   POST /nfce/cancelar     -> { chave, justificativa, cnpj, seqEvento? }
//   POST /tef/iniciar       -> { valor, tipo, parcelas?, financiamento? }
//   POST /tef/cancelar      -> aborta transação em andamento
// ============================================================

const http = require("http");
const nfe = require("./acbr-nfe.cjs");
const tef = require("./acbr-tefd.cjs");
const pkg = require("./package.json");

const PORT = parseInt(process.env.ACBR_AGENT_PORT || "3030", 10);

function send(res, status, body, headers = {}) {
  const json = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    ...headers,
  });
  res.end(json);
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(new Error("JSON inválido")); }
    });
    req.on("error", reject);
  });
}

async function handle(req, res) {
  if (req.method === "OPTIONS") return send(res, 204, "");

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  try {
    // -------- health --------
    if (req.method === "GET" && path === "/health") {
      let nfceReady = false, nfceVersion = null, nfceError = null;
      try { nfceVersion = nfe.versao(); nfceReady = true; }
      catch (e) { nfceError = e.message; }
      const nfceDiagnostics = nfe.diagnostics();

      let tefReady = false, tefVersion = null, tefError = null;
      const tefAvailable = tef.isAvailable();
      if (tefAvailable) {
        try { tefVersion = tef.versao(); tefReady = true; }
        catch (e) { tefError = e.message; }
      } else {
        tefError = "PGWebLib.dll não disponível";
      }
      const tefDiagnostics = tef.diagnostics();

      return send(res, 200, {
        ok: true,
        agent: pkg.name,
        version: pkg.version,
        nfceReady,
        nfceVersion,
        nfceError,
        nfceDiagnostics,
        tefAvailable,
        tefReady,
        tefVersion,
        tefError,
        tefDiagnostics,
        paths: nfe.paths,
      });
    }

    // -------- NFC-e --------
    if (req.method === "GET" && path === "/nfce/status") {
      const xml = nfe.statusServico();
      return send(res, 200, { ok: true, retorno: xml });
    }

    if (req.method === "POST" && path === "/nfce/emitir") {
      const body = await readBody(req);
      if (!body.iniContent) return send(res, 400, { ok: false, error: "iniContent obrigatório" });
      const retorno = nfe.emitirNFCe(body.iniContent, { imprimir: !!body.imprimir, sincrono: body.sincrono !== false });
      return send(res, 200, { ok: true, retorno });
    }

    if (req.method === "POST" && path === "/nfce/cancelar") {
      const body = await readBody(req);
      const retorno = nfe.cancelarNFe(body);
      return send(res, 200, { ok: true, retorno });
    }

    // -------- TEF (PayGo Integrado / PGWebLib.dll) --------
    if (req.method === "POST" && path === "/tef/iniciar") {
      if (!tef.isAvailable()) return send(res, 503, { ok: false, error: "PGWebLib.dll não disponível" });
      const body = await readBody(req);
      if (!body.valor || body.valor <= 0) return send(res, 400, { ok: false, error: "valor obrigatório" });
      const retorno = tef.efetuarPagamento({ ...body, onDisplay: (m) => console.log("[TEF display]", m) });
      return send(res, 200, { ok: true, retorno });
    }

    if (req.method === "POST" && path === "/tef/cancelar") {
      tef.cancelarEmAndamento();
      return send(res, 200, { ok: true });
    }

    if (req.method === "POST" && path === "/tef/cancelar-venda") {
      if (!tef.isAvailable()) return send(res, 503, { ok: false, error: "PGWebLib.dll não disponível" });
      const body = await readBody(req);
      const retorno = tef.cancelarVenda({ ...body, onDisplay: (m) => console.log("[TEF display]", m) });
      return send(res, 200, { ok: true, retorno });
    }

    if (req.method === "POST" && path === "/tef/admin") {
      if (!tef.isAvailable()) return send(res, 503, { ok: false, error: "PGWebLib.dll não disponível" });
      const retorno = tef.administrativo({ onDisplay: (m) => console.log("[TEF display]", m) });
      return send(res, 200, { ok: true, retorno });
    }

    return send(res, 404, { ok: false, error: "Rota não encontrada", path });
  } catch (e) {
    console.error("[ACBr Agent] erro:", e);
    return send(res, 500, { ok: false, error: e.message });
  }
}

function start() {
  const server = http.createServer(handle);
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`[NEXA ACBr Agent] v${pkg.version} ouvindo em http://127.0.0.1:${PORT}`);
    console.log(`[NEXA ACBr Agent] ACBR_BASE = ${nfe.paths.ACBR_BASE}`);
  });
  server.on("error", (e) => {
    console.error("[NEXA ACBr Agent] erro no servidor:", e);
    if (e.code === "EADDRINUSE") {
      console.error(`Porta ${PORT} já em uso. Outro processo está rodando o agente?`);
    }
  });
  return server;
}

function stop() {
  try { nfe.finalizar(); } catch { /* ignore */ }
  try { tef.finalizar(); } catch { /* ignore */ }
}

if (require.main === module) {
  const server = start();

  const shutdown = () => {
    stop();
    try {
      server.close(() => process.exit(0));
    } catch {
      process.exit(0);
    }
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

module.exports = { start, stop, PORT };
