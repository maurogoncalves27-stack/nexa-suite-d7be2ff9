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

// ---------- estado do provider ativo (exclusividade do pinpad) ----------
// O pinpad é um recurso exclusivo: PayGo e Payer podem estar instalados juntos,
// mas apenas UM pode manter a sessão aberta por vez. Guardamos qual está ativo
// em disco para sobreviver a reinícios do agente.
const VALID_PROVIDERS = ["payer", "paygo", "mock"];

function stateFilePath() {
  const base = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const dir = path.join(base, "nexa-totem");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "tef-active-provider.json");
}

function readActiveProvider() {
  try {
    const raw = JSON.parse(fs.readFileSync(stateFilePath(), "utf8"));
    return VALID_PROVIDERS.includes(raw?.provider) ? raw.provider : null;
  } catch {
    return null;
  }
}

function writeActiveProvider(provider) {
  try {
    fs.writeFileSync(
      stateFilePath(),
      JSON.stringify({ provider, updatedAt: new Date().toISOString() }, null, 2),
    );
  } catch (e) {
    console.warn("[totem/payer] não foi possível persistir provider ativo:", e?.message || e);
  }
}

let activeProvider = readActiveProvider();
let switching = false;

/** Encerra a sessão do provider anterior antes de liberar o pinpad. */
async function releaseProvider(provider) {
  if (provider === "payer") {
    try { await payer.logoff(); }
    catch (e) { console.warn("[totem/payer] logoff Payer falhou:", e?.message || e); }
  }
  // PayGo é servido pelo agente electron-acbr; a finalização ocorre lá.
}

/**
 * Garante que o provider pedido é o dono do pinpad.
 * Retorna { ok } ou { ok:false, busy:true } quando há troca em andamento.
 */
async function acquireProvider(provider) {
  if (!VALID_PROVIDERS.includes(provider)) {
    return { ok: false, error: `provider inválido: ${provider}` };
  }
  if (activeProvider === provider) return { ok: true, provider, changed: false };
  if (switching) {
    return { ok: false, busy: true, error: `pinpad em uso por ${activeProvider || "outro provider"} — troca em andamento` };
  }
  switching = true;
  try {
    if (activeProvider && activeProvider !== provider) {
      await releaseProvider(activeProvider);
    }
    activeProvider = provider;
    writeActiveProvider(provider);
    return { ok: true, provider, changed: true };
  } finally {
    switching = false;
  }
}

function paygoInstalled() {
  const candidates = [
    "C:\\Program Files (x86)\\PayGo\\PGWebLib\\x64\\PGWebLib.dll",
    "C:\\Program Files (x86)\\PayGo\\PGWebLib\\PGWebLib.dll",
  ];
  const found = candidates.find((p) => { try { return fs.existsSync(p); } catch { return false; } });
  return { installed: !!found, dllPath: found || null };
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const pathName = url.pathname.replace(/\/+$/, "") || "/";

  if (req.method === "OPTIONS") return send(res, 204, {});

  if (req.method === "GET" && (pathName === "/health" || pathName === "/")) {
    const paygo = paygoInstalled();
    return send(res, 200, {
      ok: true,
      agent: "nexa-totem-payer",
      version: packageJson.version,
      port: PORT,
      activeProvider,
      switching,
      providers: {
        payer: { installed: true, baseUrl: payer.baseUrl() },
        paygo: { installed: paygo.installed, dllPath: paygo.dllPath },
      },
    });
  }

  try {
    // --- chaveamento de provider ---
    if (req.method === "GET" && pathName === "/tef/active-provider") {
      return send(res, 200, { ok: true, provider: activeProvider, switching });
    }

    if (req.method === "POST" && pathName === "/tef/active-provider") {
      const body = await readBody(req).catch(() => ({}));
      const result = await acquireProvider(String(body?.provider || ""));
      return send(res, result.ok ? 200 : (result.busy ? 409 : 400), result);
    }

    if (req.method === "POST" && pathName === "/tef/release") {
      if (activeProvider) await releaseProvider(activeProvider);
      activeProvider = null;
      writeActiveProvider(null);
      return send(res, 200, { ok: true });
    }

    if (req.method === "GET" && pathName === "/payer/diagnostics") {
      const d = await payer.diagnostics();
      const paygo = paygoInstalled();
      return send(res, 200, { ok: true, ...d, activeProvider, paygo });
    }

    if (req.method === "POST" && pathName === "/payer/login") {
      const acquired = await acquireProvider("payer");
      if (!acquired.ok) return send(res, acquired.busy ? 409 : 400, acquired);
      const body = await readBody(req).catch(() => ({}));
      const retorno = await payer.login(body);
      return send(res, 200, { ok: true, retorno });
    }

    if (req.method === "POST" && pathName === "/payer/logoff") {
      const retorno = await payer.logoff();
      if (activeProvider === "payer") { activeProvider = null; writeActiveProvider(null); }
      return send(res, 200, { ok: true, retorno });
    }

    if (req.method === "POST" && pathName === "/payer/payment") {
      const acquired = await acquireProvider("payer");
      if (!acquired.ok) return send(res, acquired.busy ? 409 : 400, acquired);
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

// Detecta se já existe algum agente respondendo na porta e QUEM é.
// Um agente NEXA (ACBr ou Totem) já serve /payer/* — nesse caso cedemos.
// Qualquer outra coisa na porta é conflito e precisa aparecer no diagnóstico.
function probePort() {
  return new Promise((resolve) => {
    const req = http.request(
      { host: HOST, port: PORT, path: "/health", method: "GET", timeout: 1500 },
      (res) => {
        let raw = "";
        res.on("data", (c) => { raw += c; });
        res.on("end", () => {
          try {
            const body = JSON.parse(raw);
            const agent = String(body?.agent || "");
            resolve({ busy: true, nexa: /^nexa[-/]/i.test(agent) || /nexa/i.test(agent), agent, body });
          } catch {
            resolve({ busy: true, nexa: false, agent: null, body: null });
          }
        });
      },
    );
    req.on("error", () => resolve({ busy: false, nexa: false, agent: null, body: null }));
    req.on("timeout", () => { req.destroy(); resolve({ busy: true, nexa: false, agent: null, body: null }); });
    req.end();
  });
}

let portOwner = null;
function getPortOwner() { return portOwner; }

async function startPayerAgent() {
  if (server) return { ok: true, alreadyRunning: true, port: PORT };

  const probe = await probePort();
  if (probe.busy) {
    if (probe.nexa) {
      portOwner = { external: true, agent: probe.agent, nexa: true };
      console.log(`[totem/payer] porta ${PORT} servida pelo agente NEXA "${probe.agent}" — reutilizando.`);
      return { ok: true, external: true, port: PORT, agent: probe.agent };
    }
    portOwner = { external: true, agent: probe.agent, nexa: false };
    const error = `porta ${PORT} ocupada por um processo que não é um agente NEXA — libere a porta antes de usar o TEF.`;
    console.error(`[totem/payer] ${error}`);
    return { ok: false, error, port: PORT, conflict: true };
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
      portOwner = { external: false, agent: "nexa-totem-payer", nexa: true };
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
  portOwner = null;
}

module.exports = {
  startPayerAgent,
  stopPayerAgent,
  getPortOwner,
  PAYER_AGENT_PORT: PORT,
};

