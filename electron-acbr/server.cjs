// ============================================================
// Servidor local — HTTP (3030) + HTTPS (3031)
// ============================================================
// HTTPS é OBRIGATÓRIO para chamadas vindas do app em produção
// (a UI roda em https://*.lovable.app e o Chrome bloqueia
// mixed-content para http://localhost).
//
// Na primeira execução o agente:
//   1) gera um certificado auto-assinado (CN=localhost, SAN=127.0.0.1)
//   2) salva em %APPDATA%\nexa-acbr-agent\certs\
//   3) tenta importar para o "Trusted Root" do usuário atual via
//      `certutil -user -addstore -f Root <cert.pem>` (silencioso)
//
// Endpoints idênticos nos dois transportes.
// ============================================================

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

const nfe = require("./acbr-nfe.cjs");
const tef = require("./acbr-tefd.cjs");
const pkg = require("./package.json");

const HTTP_PORT = parseInt(process.env.ACBR_AGENT_PORT || "3030", 10);
const HTTPS_PORT = parseInt(process.env.ACBR_AGENT_HTTPS_PORT || "3031", 10);

// ---------- certificado auto-assinado ----------
function certDir() {
  const base = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const dir = path.join(base, "nexa-acbr-agent", "certs");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function loadOrCreateCert() {
  const dir = certDir();
  const certPath = path.join(dir, "agent.pem");
  const keyPath = path.join(dir, "agent.key");

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
      certPath,
      keyPath,
      generated: false,
    };
  }

  console.log("[NEXA ACBr Agent] Gerando certificado auto-assinado em", dir);
  let selfsigned;
  try {
    selfsigned = require("selfsigned");
  } catch (e) {
    console.error("[NEXA ACBr Agent] Pacote 'selfsigned' não instalado. HTTPS desabilitado.");
    return null;
  }

  const attrs = [{ name: "commonName", value: "localhost" }];
  const extensions = [
    {
      name: "subjectAltName",
      altNames: [
        { type: 2, value: "localhost" },
        { type: 7, ip: "127.0.0.1" },
      ],
    },
    { name: "basicConstraints", cA: true },
    {
      name: "keyUsage",
      digitalSignature: true,
      keyEncipherment: true,
      keyCertSign: true,
    },
    {
      name: "extKeyUsage",
      serverAuth: true,
      clientAuth: true,
    },
  ];
  const pems = selfsigned.generate(attrs, {
    algorithm: "sha256",
    days: 3650,
    keySize: 2048,
    extensions,
  });

  fs.writeFileSync(certPath, pems.cert);
  fs.writeFileSync(keyPath, pems.private);

  // Tenta importar para o Trusted Root do usuário (não exige admin).
  try {
    const r = spawnSync("certutil", ["-user", "-addstore", "-f", "Root", certPath], {
      windowsHide: true,
    });
    if (r.status === 0) {
      console.log("[NEXA ACBr Agent] Certificado importado no Trusted Root do usuário.");
    } else {
      console.warn(
        "[NEXA ACBr Agent] Não foi possível importar o certificado automaticamente. " +
          "Importe manualmente: " + certPath
      );
    }
  } catch (e) {
    console.warn("[NEXA ACBr Agent] certutil indisponível:", e.message);
  }

  return {
    cert: pems.cert,
    key: pems.private,
    certPath,
    keyPath,
    generated: true,
  };
}

// ---------- helpers ----------
function send(res, status, body, headers = {}) {
  const json = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Private-Network": "true",
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

  const url = new URL(req.url, `http://localhost`);
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
        // Auto-inicializa a PGWebLib na primeira chamada de /health para que
        // a checagem de saúde reflita tefReady=true sem exigir clique manual.
        try { tef.ensureInit(); }
        catch (e) { tefError = e.message; }
        const d = tef.diagnostics();
        tefReady = !!d.initialized;
        tefVersion = tefReady ? "PGWebLib inicializada" : "PGWebLib carregada";
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
    if (req.method === "POST" && path === "/tef/init") {
      if (!tef.isAvailable()) return send(res, 503, { ok: false, error: "PGWebLib.dll não disponível" });
      const body = await readBody(req).catch(() => ({}));
      try {
        tef.ensureInit({ environment: body?.environment });
        const version = tef.versao();
        return send(res, 200, { ok: true, retorno: { initialized: true, version } });
      } catch (e) {
        return send(res, 500, { ok: false, error: e.message });
      }
    }

    if (req.method === "POST" && path === "/tef/iniciar") {
      if (!tef.isAvailable()) return send(res, 503, { ok: false, error: "PGWebLib.dll não disponível" });
      const body = await readBody(req);
      if (!body.valor || body.valor <= 0) return send(res, 400, { ok: false, error: "valor obrigatório" });
      try {
        const retorno = await tef.efetuarPagamento({ ...body, onDisplay: (m) => console.log("[TEF display]", m) });
        return send(res, 200, { ok: true, retorno });
      } catch (e) {
        return send(res, 500, { ok: false, error: e.message });
      }
    }

    if (req.method === "POST" && path === "/tef/cancelar") {
      tef.cancelarEmAndamento();
      return send(res, 200, { ok: true });
    }

    if (req.method === "POST" && path === "/tef/cancelar-venda") {
      if (!tef.isAvailable()) return send(res, 503, { ok: false, error: "PGWebLib.dll não disponível" });
      const body = await readBody(req);
      try {
        const retorno = await tef.cancelarVenda({ ...body, onDisplay: (m) => console.log("[TEF display]", m) });
        return send(res, 200, { ok: true, retorno });
      } catch (e) {
        return send(res, 500, { ok: false, error: e.message });
      }
    }

    if (req.method === "POST" && path === "/tef/admin") {
      if (!tef.isAvailable()) return send(res, 503, { ok: false, error: "PGWebLib.dll não disponível" });
      const body = await readBody(req).catch(() => ({}));
      // Fire-and-forget — pinpad é interativo; não bloqueia HTTP.
      tef.administrativoAsync({
        timeoutMs: 600000, // 10 min — alinhado com a demo Setis (PAYGO_TRANSACTION_TIMEOUT_MS)
        technicalPassword: body?.technicalPassword,
        pinpadPort: body?.pinpadPort,
        merchantCode: body?.merchantCode,
        terminalCode: body?.terminalCode,
        host: body?.host,
      })
        .then((r) => console.log("[TEF admin] concluído:", r?.resultado))
        .catch((e) => console.warn("[TEF admin] erro:", e.message));
      return send(res, 202, { ok: true, started: true, message: "Menu aberto no pinpad. Finalize na tela do dispositivo." });
    }

    if (req.method === "GET" && path === "/tef/admin/status") {
      return send(res, 200, { ok: true, ...tef.getAdmStatus() });
    }

    if (req.method === "POST" && path === "/tef/admin/abort") {
      tef.abortAdm();
      return send(res, 200, { ok: true, aborted: true });
    }

    if (req.method === "POST" && path === "/tef/admin/respond") {
      const body = await readBody(req).catch(() => ({}));
      try {
        tef.respondAdm(body?.responses || []);
        return send(res, 200, { ok: true });
      } catch (e) {
        return send(res, 400, { ok: false, error: e.message });
      }
    }


    if (req.method === "POST" && (path === "/tef/install" || path === "/tef/instalar")) {
      if (!tef.isAvailable()) return send(res, 503, { ok: false, error: "PGWebLib.dll não disponível" });
      const body = await readBody(req);
      const retorno = tef.instalarPdc({ ...body, environment: body.environment, onDisplay: (m) => console.log("[TEF display]", m) });
      return send(res, 200, { ok: true, retorno });
    }

    // -------- Teste isolado de porta COM do pinpad --------
    // Não depende de PGWebLib/PdC/host. Tenta abrir \\.\COMn diretamente.
    // Útil pra confirmar se a porta existe, se o pinpad está conectado e se
    // outro processo (PayGo Windows) está segurando o handle.
    if (req.method === "POST" && path === "/tef/pinpad/test") {
      const body = await readBody(req).catch(() => ({}));
      const portNum = String(body?.port ?? body?.com ?? "5").replace(/\D/g, "") || "5";
      const devicePath = `\\\\.\\COM${portNum}`;
      const fs = require("fs");
      let fd = null;
      try {
        // 'r+' = leitura+escrita exclusiva; no Windows abre o device serial.
        fd = fs.openSync(devicePath, "r+");
        return send(res, 200, {
          ok: true,
          port: `COM${portNum}`,
          devicePath,
          accessible: true,
          locked: false,
          message: `COM${portNum} aberta com sucesso — pinpad acessível e porta livre.`,
        });
      } catch (e) {
        const code = e && e.code;
        const errno = e && e.errno;
        let diagnosis;
        if (code === "ENOENT") {
          diagnosis = `COM${portNum} NÃO existe no Windows. Confirme no Gerenciador de Dispositivos qual porta o pinpad recebeu.`;
        } else if (code === "EBUSY" || code === "EACCES" || code === "EPERM") {
          diagnosis = `COM${portNum} existe mas está EM USO por outro processo (provavelmente o PayGo Windows com o serviço segurando o pinpad). Feche o PayGo Windows e tente de novo.`;
        } else {
          diagnosis = `Falha ao abrir COM${portNum}: ${e.message}`;
        }
        return send(res, 200, {
          ok: false,
          port: `COM${portNum}`,
          devicePath,
          accessible: code !== "ENOENT",
          locked: code === "EBUSY" || code === "EACCES" || code === "EPERM",
          error: { code, errno, message: e.message },
          message: diagnosis,
        });
      } finally {
        if (fd != null) {
          try { fs.closeSync(fd); } catch { /* ignore */ }
        }
      }
    }


    return send(res, 404, { ok: false, error: "Rota não encontrada", path });
  } catch (e) {
    console.error("[ACBr Agent] erro:", e);
    return send(res, 500, { ok: false, error: e.message });
  }
}

function start() {
  // HTTP (compatibilidade com Electron local)
  const httpServer = http.createServer(handle);
  httpServer.listen(HTTP_PORT, "127.0.0.1", () => {
    console.log(`[NEXA ACBr Agent] v${pkg.version} HTTP  em http://127.0.0.1:${HTTP_PORT}`);
    console.log(`[NEXA ACBr Agent] ACBR_BASE = ${nfe.paths.ACBR_BASE}`);
  });
  httpServer.on("error", (e) => {
    console.error("[NEXA ACBr Agent] erro HTTP:", e);
    if (e.code === "EADDRINUSE") console.error(`Porta ${HTTP_PORT} já em uso.`);
  });

  // HTTPS (para chamadas vindas de páginas https://*)
  let httpsServer = null;
  const certInfo = loadOrCreateCert();
  if (certInfo) {
    try {
      httpsServer = https.createServer({ cert: certInfo.cert, key: certInfo.key }, handle);
      httpsServer.listen(HTTPS_PORT, "127.0.0.1", () => {
        console.log(`[NEXA ACBr Agent] v${pkg.version} HTTPS em https://127.0.0.1:${HTTPS_PORT}`);
        console.log(`[NEXA ACBr Agent] cert: ${certInfo.certPath}`);
      });
      httpsServer.on("error", (e) => {
        console.error("[NEXA ACBr Agent] erro HTTPS:", e);
        if (e.code === "EADDRINUSE") console.error(`Porta ${HTTPS_PORT} já em uso.`);
      });
    } catch (e) {
      console.error("[NEXA ACBr Agent] falha ao iniciar HTTPS:", e.message);
    }
  } else {
    console.warn("[NEXA ACBr Agent] HTTPS desabilitado (sem certificado).");
  }

  return { httpServer, httpsServer };
}

function stop() {
  try { nfe.finalizar(); } catch { /* ignore */ }
  try { tef.finalizar(); } catch { /* ignore */ }
}

if (require.main === module) {
  const servers = start();

  const shutdown = () => {
    stop();
    try { servers.httpServer?.close(); } catch { /* ignore */ }
    try { servers.httpsServer?.close(); } catch { /* ignore */ }
    setTimeout(() => process.exit(0), 200);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

module.exports = { start, stop, HTTP_PORT, HTTPS_PORT };
