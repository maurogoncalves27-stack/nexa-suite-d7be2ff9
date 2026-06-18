#!/usr/bin/env node
// Painel local isolado para testar/configurar PayGo/PGWebLib em paralelo.

const http = require("http");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const ROOT = path.resolve(HERE, "..");
const BRIDGE = path.join(ROOT, "scripts", "paygo-bridge.ps1");
const CONFIG_FILE = path.join(HERE, "paygo-reference-config.json");
const PORT = Number(process.env.PAYGO_REF_UI_PORT || process.argv.find((a) => a.startsWith("--port="))?.split("=")[1] || 3099);

const DEFAULT_DLL_PATHS = [
  "C:\\Program Files (x86)\\PayGo\\PGWebLib\\x64\\PGWebLib.dll",
  "C:\\Program Files (x86)\\PayGo\\PGWebLib\\PGWebLib.dll",
  "C:\\PayGo\\PGWebLib\\x64\\PGWebLib.dll",
  "C:\\PayGo\\PGWebLib\\PGWebLib.dll",
];

const DEFAULT_CONFIG = {
  dllPath: "",
  workingDir: "",
  cpfCnpj: "44932369000108",
  pontoDeCaptura: "111476",
  ambiente: "DEMO",
  senhaTecnica: "314159",
  usePinpad: true,
  pinpadPort: "5",
  qrDisplayPreference: "2",
  saleAmount: "1.00",
  saleMethod: "DEBITO",
  saleInstallments: "1",
  saleIdPrefix: "TESTE",
  paygoMenuChoice: "",
  captureValues: "",
};

let config = loadConfig();
let host = null;
let hostBuffer = "";
let hostReady = null;
let nextId = 1;
let active = null;
let lastConfirmation = null;
const pending = new Map();
const history = [];

function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(nextConfig) {
  config = { ...DEFAULT_CONFIG, ...config, ...nextConfig };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  return config;
}

function now() {
  return new Date().toLocaleTimeString("pt-BR", { hour12: false });
}

function log(type, message, extra = {}) {
  const item = { at: now(), type, message: String(message || ""), ...extra };
  history.unshift(item);
  if (history.length > 600) history.pop();
  if (active) active.events.push(item);
  return item;
}

function findDllPath() {
  if (config.dllPath && fs.existsSync(config.dllPath)) return config.dllPath;
  if (process.env.PAYGO_DLL_PATH && fs.existsSync(process.env.PAYGO_DLL_PATH)) return process.env.PAYGO_DLL_PATH;
  return DEFAULT_DLL_PATHS.find((p) => fs.existsSync(p)) || "";
}

function resolveWorkingDir(dllPath) {
  if (config.workingDir) {
    try {
      fs.mkdirSync(config.workingDir, { recursive: true });
      return config.workingDir;
    } catch (err) {
      log("CONFIG", `Diretorio de trabalho inacessivel, usando pasta local: ${err.message}`);
      config.workingDir = "";
    }
  }
  if (process.env.PAYGO_WORKING_DIR) return process.env.PAYGO_WORKING_DIR;
  const dir = path.join(HERE, "workdir");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function stopHost(reason = "restart") {
  if (active?.id) {
    try { writeHost({ id: active.id, action: "abort_capture" }); } catch {}
  }
  if (host) {
    try { host.kill(); } catch {}
  }
  host = null;
  hostReady = null;
  hostBuffer = "";
  for (const p of pending.values()) {
    clearTimeout(p.timeout);
    p.reject(new Error(reason));
  }
  pending.clear();
}

function diagnostics() {
  const dllPath = findDllPath();
  const workingDir = dllPath ? resolveWorkingDir(dllPath) : "";
  return {
    bridge: BRIDGE,
    bridgeExists: fs.existsSync(BRIDGE),
    dllPath,
    dllExists: !!dllPath && fs.existsSync(dllPath),
    workingDir,
    workingDirExists: !!workingDir && fs.existsSync(workingDir),
    hostRunning: !!host,
    config,
    lastConfirmation,
  };
}

function startHost() {
  if (hostReady) return hostReady;
  const dllPath = findDllPath();
  if (!dllPath) return Promise.reject(new Error("PGWebLib.dll nao encontrada. Informe o caminho na aba Configuracao."));
  if (!fs.existsSync(BRIDGE)) return Promise.reject(new Error(`Bridge nao encontrado: ${BRIDGE}`));
  const workingDir = resolveWorkingDir(dllPath);

  const powershell = process.env.PAYGO_POWERSHELL_PATH ||
    (process.env.SystemRoot ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe") : "powershell.exe");

  host = spawn(powershell, [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    BRIDGE,
    "-Action",
    "host",
    "-DllPath",
    dllPath,
    "-WorkingDir",
    workingDir,
  ], {
    cwd: ROOT,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  host.stdout.setEncoding("utf8");
  host.stderr.setEncoding("utf8");
  host.stdout.on("data", onHostStdout);
  host.stderr.on("data", (chunk) => {
    const text = String(chunk).trim();
    if (text) log("STDERR", text);
  });
  host.on("exit", (code, signal) => {
    log("HOST", `Host encerrado code=${code ?? ""} signal=${signal ?? ""}`.trim());
    for (const p of pending.values()) {
      clearTimeout(p.timeout);
      p.reject(new Error("Host PayGo encerrado"));
    }
    pending.clear();
    host = null;
    hostReady = null;
  });

  hostReady = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete("__ready");
      reject(new Error("Timeout inicializando host PayGo"));
    }, 60000);
    pending.set("__ready", {
      resolve: (payload) => {
        clearTimeout(timeout);
        log("READY", payload?.message || "PayGo host inicializado", { dllPath, workingDir });
        resolve({ payload, dllPath, workingDir });
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      },
      timeout,
    });
  });

  return hostReady;
}

function onHostStdout(chunk) {
  hostBuffer += chunk;
  const lines = hostBuffer.split(/\r?\n/);
  hostBuffer = lines.pop() || "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      log("RAW", line);
      continue;
    }

    if (msg.id === "__ready") {
      const ready = pending.get("__ready");
      pending.delete("__ready");
      if (msg.error) ready?.reject(new Error(msg.error));
      else ready?.resolve(msg.payload);
      continue;
    }

    if (msg.event) {
      const ev = msg.event;
      log(ev.type || "EVENT", ev.message || ev.prompt || "", ev);
      if (active && ev.type === "CAPTURE") active.capture = ev;
      continue;
    }

    const p = pending.get(msg.id);
    if (!p) {
      log("UNMATCHED", JSON.stringify(msg));
      continue;
    }
    clearTimeout(p.timeout);
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error));
    else p.resolve(msg.payload);
  }
}

function writeHost(payload) {
  if (!host || !host.stdin.writable) throw new Error("Host PayGo indisponivel");
  host.stdin.write(`${JSON.stringify(payload)}\n`);
}

async function runCommand(action, payload = {}) {
  if (active?.running) throw new Error("Ja existe uma operacao em andamento.");
  const ready = await startHost();
  const id = `ui-${nextId++}`;
  active = {
    id,
    action,
    running: true,
    startedAt: now(),
    events: [],
    capture: null,
    result: null,
    error: null,
    ready,
  };
  log("START", `${action} iniciado`);

  const promise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timeout aguardando ${action}`));
    }, Number(payload.timeoutMs || 600000));
    pending.set(id, { resolve, reject, timeout });
    writeHost({ id, action, ...payload });
  });

  promise.then((result) => {
    active.running = false;
    active.result = result;
    active.capture = null;
    const token = extractConfirmation(result);
    if (token) lastConfirmation = token;
    log("DONE", result?.message || result?.status || "Concluido");
  }).catch((err) => {
    active.running = false;
    active.error = err.message;
    active.capture = null;
    log("ERROR", err.message);
  });

  return active;
}

function extractConfirmation(result) {
  const data = result?.data || result?.retorno?.data || result?.payload?.data || result;
  if (!data) return null;
  const token = {
    reqNum: data.reqNum || data.reqnum || "",
    locRef: data.locRef || "",
    extRef: data.extRef || "",
    virtMerch: data.virtMerch || "",
    authSyst: data.authSyst || "",
  };
  return token.reqNum ? token : null;
}

function amountToCents(value) {
  const n = Number(String(value || "1").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) throw new Error("Valor invalido");
  return Math.round(n * 100);
}

function methodToBridge(value) {
  const v = String(value || "DEBITO").toUpperCase();
  if (v.startsWith("CRED")) return "CREDITO";
  if (v === "PIX") return "PIX";
  if (v === "VOUCHER") return "VOUCHER";
  return "DEBITO";
}

function captureValuesBase64(value) {
  if (!value) return "";
  return Buffer.from(String(value).replace(/;/g, "\n"), "utf8").toString("base64");
}

function confirmationBase64(body = {}) {
  const token = body.token || lastConfirmation;
  if (!token?.reqNum) throw new Error("Nenhum token de confirmacao disponivel.");
  return Buffer.from(JSON.stringify(token), "utf8").toString("base64");
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

async function readAnyBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  const contentType = req.headers["content-type"] || "";
  if (!text) return {};
  if (contentType.includes("application/json")) return JSON.parse(text);
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(text));
  }
  return {};
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

const html = String.raw`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PayGo ACBr - Painel</title>
  <style>
    :root { --bg:#f4f6f8; --panel:#fff; --line:#d7dde7; --ink:#182235; --muted:#66758a; --accent:#1455d9; --ok:#087443; --bad:#b42318; --warn:#b45309; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Arial, sans-serif; background:var(--bg); color:var(--ink); }
    header { background:var(--panel); border-bottom:1px solid var(--line); padding:16px 20px; display:flex; justify-content:space-between; align-items:center; gap:14px; }
    h1 { margin:0; font-size:20px; }
    h2 { margin:0 0 12px; font-size:16px; }
    main { max-width:1380px; margin:0 auto; padding:16px; display:grid; grid-template-columns:280px 1fr 390px; gap:14px; }
    nav, section, aside { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:14px; }
    nav button { width:100%; margin-bottom:8px; justify-content:flex-start; }
    button, .btn { min-height:38px; border:1px solid var(--line); border-radius:6px; background:white; color:var(--ink); padding:8px 12px; cursor:pointer; font-weight:600; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; }
    button.primary, .btn.primary { background:var(--accent); border-color:var(--accent); color:white; }
    button.danger, .btn.danger { color:var(--bad); }
    button.ok, .btn.ok { color:var(--ok); }
    button.active, .btn.active { border-color:var(--accent); color:var(--accent); background:#eef4ff; }
    input, select, textarea { width:100%; border:1px solid var(--line); border-radius:6px; min-height:38px; padding:8px 10px; font-size:14px; font-family:Arial, sans-serif; }
    textarea { min-height:86px; resize:vertical; }
    label { display:block; font-size:12px; color:var(--muted); margin:11px 0 5px; }
    .row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }
    .pill { display:inline-flex; align-items:center; gap:7px; color:var(--muted); font-size:13px; }
    .dot { width:10px; height:10px; border-radius:50%; background:#98a2b3; }
    .dot.running { background:var(--warn); }
    .dot.ok { background:var(--ok); }
    .dot.error { background:var(--bad); }
    .tab { display:none; }
    .tab.visible { display:block; }
    pre { white-space:pre-wrap; word-break:break-word; background:#0f172a; color:#e2e8f0; border-radius:8px; padding:12px; min-height:160px; max-height:390px; overflow:auto; }
    .events { display:flex; flex-direction:column; gap:8px; max-height:540px; overflow:auto; }
    .event { border:1px solid var(--line); border-radius:6px; padding:9px; font-size:13px; }
    .event strong { display:inline-block; min-width:74px; }
    .muted { color:var(--muted); }
    .capture { border-color:#f59e0b; background:#fffbeb; }
    .optionGrid { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:8px; margin:8px 0; }
    .qr { font-family:Consolas, monospace; font-size:12px; border:1px dashed var(--line); border-radius:6px; padding:10px; background:#f8fafc; max-height:140px; overflow:auto; }
    .kv { display:grid; grid-template-columns:130px 1fr; gap:6px; font-size:13px; }
    .kv div:nth-child(odd) { color:var(--muted); }
    @media (max-width:1050px) { main { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <header>
    <h1>PayGo ACBr - Painel de Configuracao</h1>
    <div class="pill"><span id="dot" class="dot"></span><span id="statusText">Aguardando</span></div>
  </header>
  <main>
    <nav>
      <button class="active" data-tab-btn="status">Status</button>
      <button data-tab-btn="maintenance">1. Manutencao / limpeza</button>
      <button data-tab-btn="config">2. Configuracao</button>
      <button data-tab-btn="setup">3. Instalacao</button>
      <button data-tab-btn="sale">Venda de teste</button>
      <button data-tab-btn="logs">Logs</button>
    </nav>

    <section>
      <div id="tab-status" class="tab visible">
        <h2>Status do PayGo</h2>
        <div class="kv" id="diag"></div>
        <div class="actions">
          <a class="btn primary" href="/do/commtest">Testar comunicacao</a>
          <a class="btn" href="/do/restart">Reiniciar host</a>
          <a class="btn" href="/">Atualizar</a>
        </div>
      </div>

      <div id="tab-maintenance" class="tab">
        <h2>1. Manutencao / limpeza</h2>
        <pre id="token">{}</pre>
        <div class="actions">
          <a class="btn primary" href="/do/maintenance">Executar manutencao PayGo</a>
          <a class="btn" href="/do/cleanup">Limpar pendencia DLL</a>
          <a class="btn" href="/do/admin">Abrir administrativo geral</a>
          <a class="btn ok" href="/do/confirm">Confirmar ultima transacao</a>
          <a class="btn danger" href="/do/undo">Desfazer ultima transacao</a>
          <a class="btn danger" href="/do/abort">Abortar operacao</a>
        </div>
      </div>

      <form id="tab-config" class="tab" method="post" action="/do/save-config">
        <h2>2. Configuracao</h2>
        <label>Caminho da PGWebLib.dll</label>
        <input id="dllPath" name="dllPath" placeholder="C:\\Program Files (x86)\\PayGo\\PGWebLib\\x64\\PGWebLib.dll" />
        <label>Diretorio de trabalho</label>
        <input id="workingDir" name="workingDir" placeholder="Opcional" />
        <div class="row">
          <div><label>CNPJ/CPF</label><input id="cpfCnpj" name="cpfCnpj" /></div>
          <div><label>Ponto de captura</label><input id="pontoDeCaptura" name="pontoDeCaptura" /></div>
        </div>
        <div class="row">
          <div><label>Ambiente</label><input id="ambiente" name="ambiente" /></div>
          <div><label>Senha tecnica</label><input id="senhaTecnica" name="senhaTecnica" /></div>
        </div>
        <div class="row">
          <div><label>Usar pinpad</label><select id="usePinpad" name="usePinpad"><option value="true">Sim</option><option value="false">Nao</option></select></div>
          <div><label>Porta pinpad</label><input id="pinpadPort" name="pinpadPort" /></div>
        </div>
        <label>Preferencia QR</label>
        <select id="qrDisplayPreference" name="qrDisplayPreference"><option value="2">Checkout/PC</option><option value="1">Pinpad</option></select>
        <label>Capturas adicionais</label>
        <textarea id="captureValues" name="captureValues" placeholder="USERAUTH=314159&#10;TYPED=123"></textarea>
        <div class="actions">
          <button class="primary" type="submit">Salvar configuracao</button>
          <a class="btn primary" href="/do/config-paygo">Abrir configuracao PayGo no pinpad</a>
          <button data-action="restart">Salvar e reiniciar host</button>
        </div>
      </form>

      <div id="tab-setup" class="tab">
        <h2>3. Instalacao / ativacao</h2>
        <div class="actions">
          <a class="btn primary" href="/do/install">Executar instalacao PayGo/pinpad</a>
          <a class="btn" href="/do/commtest">Validar comunicacao depois da instalacao</a>
        </div>
      </div>

      <div id="tab-sale" class="tab">
        <h2>Venda de teste</h2>
        <form method="post" action="/do/save-sale">
        <div class="row">
          <div><label>Valor</label><input id="saleAmount" name="saleAmount" inputmode="decimal" /></div>
          <div><label>Metodo</label><select id="saleMethod" name="saleMethod"><option>DEBITO</option><option>CREDITO</option><option>PIX</option><option>VOUCHER</option></select></div>
        </div>
        <div class="row">
          <div><label>Parcelas</label><input id="saleInstallments" name="saleInstallments" inputmode="numeric" /></div>
          <div><label>Prefixo/id</label><input id="saleIdPrefix" name="saleIdPrefix" /></div>
        </div>
        <label>Opcao de menu/acquirer</label>
        <input id="paygoMenuChoice" name="paygoMenuChoice" placeholder="Opcional" />
        <div class="actions">
          <button type="submit">Salvar venda</button>
          <a class="btn primary" href="/do/sale">Executar venda</a>
          <a class="btn primary" href="/do/pix">Executar Pix</a>
        </div>
        </form>
      </div>

      <div id="tab-logs" class="tab">
        <h2>Logs</h2>
        <div class="actions"><a class="btn" href="/do/clear-logs">Limpar logs da tela</a></div>
      </div>

      <div id="captureBox" class="event capture" style="display:none;margin-top:14px">
        <strong>Entrada PayGo</strong>
        <div id="capturePrompt" style="margin:8px 0"></div>
        <div id="captureOptions" class="optionGrid"></div>
        <input id="captureValue" placeholder="Digite a resposta" />
        <div class="actions">
          <button class="primary" data-action="send-capture">Enviar</button>
          <button class="danger" data-action="abort-capture">Cancelar captura</button>
        </div>
      </div>
    </section>

    <aside>
      <h2>Resultado</h2>
      <pre id="result">{}</pre>
      <div id="qrBox" style="display:none">
        <h2>QR Code</h2>
        <div id="qr" class="qr"></div>
      </div>
      <h2 style="margin-top:14px">Eventos</h2>
      <div id="events" class="events"></div>
    </aside>
  </main>
<script>
let current = {};
let lastCaptureSeq = null;

const fields = [
  'dllPath','workingDir','cpfCnpj','pontoDeCaptura','ambiente','senhaTecnica','usePinpad','pinpadPort','qrDisplayPreference',
  'saleAmount','saleMethod','saleInstallments','saleIdPrefix','paygoMenuChoice','captureValues'
];

function showTab(name) {
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('visible'));
  document.getElementById('tab-' + name).classList.add('visible');
  document.querySelectorAll('[data-tab-btn]').forEach(el => el.classList.toggle('active', el.dataset.tabBtn === name));
}

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, path, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4) return;
      let data = {};
      try { data = xhr.responseText ? JSON.parse(xhr.responseText) : {}; } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || 'Falha HTTP ' + xhr.status));
    };
    xhr.onerror = () => reject(new Error('Falha de comunicacao com painel local'));
    xhr.send(body ? JSON.stringify(body) : undefined);
  });
}

async function api(path, body) {
  return request('POST', path, body || {});
}

function readConfigFromForm() {
  const out = {};
  for (const id of fields) out[id] = document.getElementById(id).value;
  out.usePinpad = out.usePinpad === 'true';
  return out;
}

function fillConfig(cfg) {
  for (const id of fields) {
    const el = document.getElementById(id);
    if (el && cfg[id] !== undefined) el.value = String(cfg[id]);
  }
}

async function saveConfig() {
  try {
    await api('/api/config', readConfigFromForm());
    await refresh();
    setStatus('ok', 'Configuracao salva');
  } catch (e) {
    setStatus('error', e.message);
  }
}

async function restartHost() {
  await saveConfig();
  await api('/api/restart', {});
  await refresh();
}

async function start(command) {
  try {
    if (command !== 'commtest' && command !== 'abort') await saveConfig();
    setStatus('running', command + ' em andamento');
    await api('/api/start', { command, ...readConfigFromForm() });
    await refresh();
  } catch (e) {
    setStatus('error', e.message);
  }
}

async function sendCapture(valueOverride) {
  const value = valueOverride !== undefined ? valueOverride : document.getElementById('captureValue').value;
  await api('/api/capture', { value });
  document.getElementById('captureBox').style.display = 'none';
}

async function abortCapture() {
  await api('/api/capture', { abort: true });
  document.getElementById('captureBox').style.display = 'none';
}

async function clearLogs() {
  await api('/api/clear-logs', {});
  await refresh();
}

async function refresh() {
  current = await request('GET', '/api/status');
  render(current);
}

function render(data) {
  fillConfig(data.config || {});
  renderDiag(data.diagnostics || {});
  const active = data.active || {};
  if (active.running) setStatus('running', active.action + ' em andamento');
  else if (active.error) setStatus('error', active.error);
  else if (active.result) setStatus('ok', 'Concluido');
  else setStatus('', 'Aguardando');

  document.getElementById('result').textContent = JSON.stringify(active.result || active.error || {}, null, 2);
  document.getElementById('token').textContent = JSON.stringify(data.lastConfirmation || {}, null, 2);
  const events = data.history || [];
  document.getElementById('events').innerHTML = events.map(ev => '<div class="event"><strong>' + esc(ev.type) + '</strong><span class="muted">' + esc(ev.at) + '</span><div>' + esc(ev.message || ev.prompt || '') + '</div></div>').join('');
  const qrEvent = events.find(ev => ev.type === 'QRCODE');
  document.getElementById('qrBox').style.display = qrEvent ? 'block' : 'none';
  document.getElementById('qr').textContent = qrEvent?.message || '';

  const cap = active.capture;
  if (cap && cap.seq !== lastCaptureSeq) {
    lastCaptureSeq = cap.seq;
    document.getElementById('captureBox').style.display = 'block';
    document.getElementById('capturePrompt').textContent = cap.prompt || 'Entrada solicitada';
    document.getElementById('captureValue').value = '';
    const optionsEl = document.getElementById('captureOptions');
    optionsEl.innerHTML = '';
    if (Array.isArray(cap.options) && cap.options.length) {
      for (const option of cap.options) {
        const btn = document.createElement('button');
        const value = option.value || option.label || option.text || '';
        btn.textContent = ((option.value || '') + ' ' + (option.label || option.text || '')).trim();
        btn.addEventListener('click', () => sendCapture(value));
        optionsEl.appendChild(btn);
      }
    }
  }
}

function renderDiag(diag) {
  const rows = [
    ['Bridge', diag.bridgeExists ? 'OK' : 'Nao encontrado'],
    ['DLL', diag.dllExists ? diag.dllPath : 'Nao encontrada'],
    ['Working dir', diag.workingDir || ''],
    ['Host', diag.hostRunning ? 'Rodando' : 'Parado'],
    ['CNPJ/CPF', diag.config?.cpfCnpj || ''],
    ['Ponto captura', diag.config?.pontoDeCaptura || ''],
    ['Ambiente', diag.config?.ambiente || ''],
    ['Pinpad', (diag.config?.usePinpad ? 'Sim' : 'Nao') + ' COM' + (diag.config?.pinpadPort || '')],
  ];
  document.getElementById('diag').innerHTML = rows.map(([k,v]) => '<div>' + esc(k) + '</div><div>' + esc(v) + '</div>').join('');
}

function setStatus(kind, text) {
  const dot = document.getElementById('dot');
  dot.className = 'dot ' + (kind || '');
  document.getElementById('statusText').textContent = text;
}

function esc(value) {
  return String(value || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function bindEvents() {
  if (window.__paygoBound) return;
  window.__paygoBound = true;
  document.addEventListener('click', (event) => {
    const tabBtn = event.target.closest('[data-tab-btn]');
    if (tabBtn) {
      event.preventDefault();
      showTab(tabBtn.dataset.tabBtn);
      return;
    }
    const actionBtn = event.target.closest('[data-action]');
    if (actionBtn) {
      event.preventDefault();
      handleAction(actionBtn.dataset.action);
    }
  });
  document.querySelectorAll('[data-tab-btn]').forEach(btn => {
    btn.addEventListener('click', () => showTab(btn.dataset.tabBtn));
  });
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleAction(btn.dataset.action));
  });
}

function handleAction(action) {
  window.__paygoLastAction = action;
  if (action === 'save-config') return saveConfig();
  if (action === 'restart') return restartHost();
  if (action === 'refresh') return refresh();
  if (action === 'clear-logs') return clearLogs();
  if (action === 'send-capture') return sendCapture();
  if (action === 'abort-capture') return abortCapture();
  return start(action);
}

function boot() {
  bindEvents();
  refresh();
  setInterval(refresh, 1000);
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
</script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET" && url.pathname.startsWith("/do/")) {
      const command = decodeURIComponent(url.pathname.slice("/do/".length));
      try {
        if (command === "restart") {
          stopHost("restart");
          log("HOST", "Host reiniciado manualmente");
        } else if (command === "clear-logs") {
          history.length = 0;
        } else if (command === "abort") {
          stopHost("abort");
          active = null;
        } else if (command === "commtest" || command === "cleanup" || command === "admin" || command === "maintenance") {
          await runCommand(command);
        } else if (command === "config-paygo") {
          await runCommand("config");
        } else if (command === "install") {
          await runCommand("install", {
            cpfCnpj: config.cpfCnpj,
            pontoDeCaptura: config.pontoDeCaptura,
            ambiente: config.ambiente,
            senhaTecnica: config.senhaTecnica,
            usePinpad: config.usePinpad ? "1" : "0",
            pinpadPort: config.usePinpad ? String(config.pinpadPort || "") : "",
            paygoMenuChoice: config.paygoMenuChoice || "",
          });
        } else if (command === "confirm" || command === "undo") {
          await runCommand(command, { confirmationJsonBase64: confirmationBase64({}) });
        } else if (command === "sale" || command === "pix") {
          await runCommand("sale", {
            saleId: `${config.saleIdPrefix || "TESTE"}-${Date.now()}`,
            amountInCents: amountToCents(config.saleAmount),
            method: command === "pix" ? "PIX" : methodToBridge(config.saleMethod),
            installments: Number(config.saleInstallments || 1),
            paygoMenuChoice: config.paygoMenuChoice || "",
            captureValuesBase64: captureValuesBase64(config.captureValues),
            qrDisplayPreference: config.qrDisplayPreference || "2",
          });
        } else {
          throw new Error(`Comando invalido: ${command}`);
        }
      } catch (err) {
        log("ERROR", err.message || String(err));
      }
      res.writeHead(303, { Location: "/" });
      res.end();
      return;
    }
    if (req.method === "POST" && (url.pathname === "/do/save-config" || url.pathname === "/do/save-sale")) {
      const body = await readAnyBody(req);
      if (body.usePinpad !== undefined) body.usePinpad = body.usePinpad === "true";
      saveConfig(body);
      log("CONFIG", "Configuracao salva");
      res.writeHead(303, { Location: "/" });
      res.end();
      return;
    }
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/status") {
      sendJson(res, 200, { active, history, config, diagnostics: diagnostics(), lastConfirmation });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/config") {
      const body = await readBody(req);
      sendJson(res, 200, { ok: true, config: saveConfig(body) });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/restart") {
      stopHost("restart");
      log("HOST", "Host reiniciado manualmente");
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/clear-logs") {
      history.length = 0;
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/start") {
      const body = await readBody(req);
      saveConfig(body);
      const command = body.command;
      if (command === "abort") {
        stopHost("abort");
        active = null;
        sendJson(res, 200, { ok: true });
        return;
      }
      if (command === "commtest" || command === "cleanup" || command === "admin" || command === "maintenance" || command === "config") {
        await runCommand(command);
        sendJson(res, 200, { ok: true });
        return;
      }
      if (command === "install") {
        await runCommand("install", {
          cpfCnpj: config.cpfCnpj,
          pontoDeCaptura: config.pontoDeCaptura,
          ambiente: config.ambiente,
          senhaTecnica: config.senhaTecnica,
          usePinpad: config.usePinpad ? "1" : "0",
          pinpadPort: config.usePinpad ? String(config.pinpadPort || "") : "",
          paygoMenuChoice: config.paygoMenuChoice || "",
        });
        sendJson(res, 200, { ok: true });
        return;
      }
      if (command === "confirm" || command === "undo") {
        await runCommand(command, { confirmationJsonBase64: confirmationBase64(body) });
        sendJson(res, 200, { ok: true });
        return;
      }
      if (command === "sale" || command === "pix") {
        await runCommand("sale", {
          saleId: `${config.saleIdPrefix || "TESTE"}-${Date.now()}`,
          amountInCents: amountToCents(config.saleAmount),
          method: command === "pix" ? "PIX" : methodToBridge(config.saleMethod),
          installments: Number(config.saleInstallments || 1),
          paygoMenuChoice: config.paygoMenuChoice || "",
          captureValuesBase64: captureValuesBase64(config.captureValues),
          qrDisplayPreference: config.qrDisplayPreference || "2",
        });
        sendJson(res, 200, { ok: true });
        return;
      }
      throw new Error(`Comando invalido: ${command}`);
    }
    if (req.method === "POST" && url.pathname === "/api/capture") {
      const body = await readBody(req);
      if (!active?.id) throw new Error("Nenhuma captura em andamento");
      if (body.abort) writeHost({ id: active.id, action: "abort_capture" });
      else writeHost({
        id: active.id,
        action: "capture_response",
        identificador: Number(active.capture?.identificador || 0),
        value: String(body.value ?? ""),
      });
      active.capture = null;
      sendJson(res, 200, { ok: true });
      return;
    }
    sendJson(res, 404, { error: "Nao encontrado" });
  } catch (err) {
    sendJson(res, 500, { error: err.message || String(err) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`PayGo ACBr Reference UI: http://127.0.0.1:${PORT}`);
});
