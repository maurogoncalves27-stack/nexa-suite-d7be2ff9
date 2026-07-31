// ============================================================
// Agente Payer local do Nexa Totem
// ------------------------------------------------------------
// Sobe um servidor HTTPS em 127.0.0.1:3031 (loopback apenas) e
// expõe o contrato consumido por src/lib/tef/payer/client.ts:
//   GET  /health
//   GET  /payer/diagnostics
//   POST /payer/login
//   POST /payer/logoff
//   POST /payer/payment
//   GET  /payer/response
//   POST /payer/abort
//
// Faz proxy para o Checkout Payer instalado na máquina (:6060).
// Isolado do electron-acbr (PayGo/ACBr) de propósito.
// ============================================================

const https = require("https");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const payer = require("./localhost.cjs");
const packageJson = require("../package.json");

const PORT = parseInt(process.env.NEXA_PAYER_PORT || "3031", 10);
const HOST = "127.0.0.1";

let server = null;

// ---------- certificado auto-assinado ----------
function certDir() {
  const base = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const dir = path.join(base, "nexa-totem", "certs");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function loadOrCreateCert() {
  const dir = certDir();
  const certPath = path.join(dir, "payer-agent.pem");
  const keyPath = path.join(dir, "payer-agent.key");

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath), certPath };
  }

  let selfsigned;
  try {
    selfsigned = require("selfsigned");
  } catch {
    console.error("[totem/payer] pacote 'selfsigned' ausente — HTTPS desabilitado.");
    return null;
  }

  const pems = selfsigned.generate([{ name: "commonName", value: "localhost" }], {
    algorithm: "sha256",
    days: 3650,
    keySize: 2048,
    extensions: [
      {
        name: "subjectAltName",
        altNames: [
          { type: 2, value: "localhost" },
          { type: 7, ip: "127.0.0.1" },
        ],
      },
      { name: "basicConstraints", cA: true },
      { name: "keyUsage", digitalSignature: true, keyEncipherment: true, keyCertSign: true },
      { name: "extKeyUsage", serverAuth: true, clientAuth: true },
    ],
  });

  fs.writeFileSync(certPath, pems.cert);
  fs.writeFileSync(keyPath, pems.private);

  try {
    spawnSync("certutil", ["-user", "-addstore", "-f", "Root", certPath], { windowsHide: true });
  } catch {
    /* opcional */
  }

  return { cert: pems.cert, key: pems.private, certPath };
}

// ---------- helpers HTTP ----------
function send(res, status, body) {
  const json = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Cache-Control": "no-store",
  });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 1_000_000) reject(new Error("body muito grande"));
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { resolve({ raw }); }
    });
    req.on("error", reject);
  });
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const pathName = url.pathname.replace(/\/+$/, "") || "/";

  if (req.method === "OPTIONS") return send(res, 204, {});

  if (req.method === "GET" && (pathName === "/health" || pathName === "/")) {
    return send(res, 200, {
      ok: true,
      agent: "nexa-totem-payer",
      version: packageJson.version,
      port: PORT,
    });
  }

  try {
    if (req.method === "GET" && pathName === "/payer/diagnostics") {
      const d = await payer.diagnostics();
      return send(res, 200, { ok: true, ...d });
    }

    if (req.method === "POST" && pathName === "/payer/login") {
      const body = await readBody(req).catch(() => ({}));
      const retorno = await payer.login(body);
      return send(res, 200, { ok: true, retorno });
    }

    if (req.method === "POST" && pathName === "/payer/logoff") {
      const retorno = await payer.logoff();
      return send(res, 200, { ok: true, retorno });
    }

    if (req.method === "POST" && pathName === "/payer/payment") {
      const body = await readBody(req);
      const retorno = body?.wait
        ? await payer.requestPaymentAndWait(body)
        : await payer.requestPayment(body);
      return send(res, 200, { ok: true, retorno });
    }

    if (req.method === "GET" && pathName === "/payer/response") {
      const retorno = await payer.getResponse();
      return send(res, 200, { ok: true, retorno });
    }

    if (req.method === "POST" && pathName === "/payer/abort") {
      const retorno = await payer.abort();
      return send(res, 200, { ok: true, retorno });
    }
  } catch (e) {
    return send(res, 500, { ok: false, error: e?.message || String(e) });
  }

  return send(res, 404, { ok: false, error: "rota não encontrada" });
}

// Detecta se já existe algum agente respondendo na porta (ex.: agente ACBr instalado).
function portInUse() {
  return new Promise((resolve) => {
    const req = http.request(
      { host: HOST, port: PORT, path: "/health", method: "GET", timeout: 1200 },
      () => resolve(true),
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(true); });
    req.end();
  });
}

async function startPayerAgent() {
  if (server) return { ok: true, alreadyRunning: true, port: PORT };

  const busy = await portInUse();
  if (busy) {
    console.log(`[totem/payer] porta ${PORT} já ocupada por outro agente — reutilizando.`);
    return { ok: true, external: true, port: PORT };
  }

  const certInfo = loadOrCreateCert();
  if (!certInfo) return { ok: false, error: "sem certificado — HTTPS indisponível" };

  await new Promise((resolve, reject) => {
    server = https.createServer({ cert: certInfo.cert, key: certInfo.key }, (req, res) => {
      handle(req, res).catch((e) => {
        try { send(res, 500, { ok: false, error: e?.message || String(e) }); } catch {}
      });
    });
    server.on("error", (e) => {
      console.error("[totem/payer] erro no servidor", e);
      server = null;
      reject(e);
    });
    server.listen(PORT, HOST, () => {
      console.log(`[totem/payer] agente Payer em https://${HOST}:${PORT} → ${payer.baseUrl()}`);
      resolve();
    });
  });

  return { ok: true, port: PORT };
}

function stopPayerAgent() {
  if (!server) return;
  try { server.close(); } catch {}
  server = null;
}

module.exports = { startPayerAgent, stopPayerAgent, PAYER_AGENT_PORT: PORT };
