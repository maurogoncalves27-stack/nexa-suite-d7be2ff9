// Processo principal do Nexa Totem (autoatendimento).
// Diferenças em relação ao Nexa Balcão:
//  - Abre em modo kiosk fullscreen (sem barras, sem fechar com Alt+F4)
//  - Carrega /totem ao invés de /balcao
//  - Mesmos IPCs (impressão ESC/POS Gertec G250 + agente SiTef pinpad PPC930)

const { app, BrowserWindow, ipcMain, globalShortcut } = require("electron");
const path = require("path");
const { execFile } = require("child_process");
const packageJson = require("./package.json");
const { startSitefAgent, stopSitefAgent } = require("./sitef-agent.cjs");
const { startPayerAgent, stopPayerAgent, PAYER_AGENT_PORT } = require("./payer/agent.cjs");

// Escolhe a impressora de recibo: prioriza Epson TM-T20X (padrão em produção),
// depois Epson genérica, depois Gertec/POS, por fim a padrão do Windows.
function pickReceiptPrinter(printers = []) {
  const label = (p) => `${p.name} ${p.displayName || ""}`;
  return (
    printers.find((p) => /TM[-\s]?T20/i.test(label(p)))?.name ||
    printers.find((p) => /EPSON/i.test(label(p)))?.name ||
    printers.find((p) => /G250|Gertec|POS/i.test(label(p)))?.name ||
    printers.find((p) => p.isDefault)?.name
  );
}


let ThermalPrinter, PrinterTypes;
try {
  const tp = require("node-thermal-printer");
  ThermalPrinter = tp.printer;
  PrinterTypes = tp.types;
} catch (e) {
  console.warn("[totem] node-thermal-printer ausente; impressão real desabilitada.");
}

const APP_URL =
  process.env.NEXA_URL ||
  (app.isPackaged
    ? "https://nexasuite.aquelaparme.com.br/totem"
    : "http://localhost:8080/totem");

const KIOSK = process.env.NEXA_KIOSK !== "false"; // padrão: kiosk
const SITEF_AGENT_PORT = parseInt(process.env.SITEF_AGENT_PORT || "60906", 10);
let mainWindow;
let kioskWatchdog = null;

// Esconde/mostra a barra de tarefas do Windows no nível do SO.
// Necessário porque o Checkout Payer/PayGo rouba o foco e o Windows
// re-exibe a taskbar por cima do totem mesmo em kiosk/topmost.
let taskbarHidden = false;
let lastTaskbarCall = 0;
function setWindowsTaskbarVisible(visible) {
  if (process.platform !== "win32") return;
  if (visible === !taskbarHidden) return;
  const now = Date.now();
  if (!visible && now - lastTaskbarCall < 3000) return; // throttle
  lastTaskbarCall = now;
  taskbarHidden = !visible;
  const nCmdShow = visible ? 5 : 0; // SW_SHOW / SW_HIDE
  const ps = `
$sig = '[DllImport("user32.dll")] public static extern IntPtr FindWindow(string c, string w);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);';
$u = Add-Type -MemberDefinition $sig -Name NexaTb -Namespace Win32 -PassThru;
foreach ($cls in @('Shell_TrayWnd','Shell_SecondaryTrayWnd')) {
  $h = $u::FindWindow($cls, $null);
  if ($h -ne [IntPtr]::Zero) { [void]$u::ShowWindow($h, ${nCmdShow}) }
}`;
  execFile(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", ps],
    { windowsHide: true },
    (err) => { if (err) console.warn("[totem] taskbar toggle falhou", err.message); },
  );
}

// Reafirma o modo kiosk (fullscreen + sempre à frente + foco).
// Necessário porque apps externos de TEF (Payer/PayGo) roubam o foco e
// fazem a barra de tarefas do Windows reaparecer sobre o totem.
function reassertKiosk() {
  if (!KIOSK || !mainWindow || mainWindow.isDestroyed()) return;
  try {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isFullScreen()) mainWindow.setFullScreen(true);
    if (!mainWindow.isKiosk?.()) mainWindow.setKiosk?.(true);
    // Alterna o topmost para forçar o Windows a re-elevar a janela acima da
    // barra de tarefas (só chamar setAlwaysOnTop(true) não re-eleva se já estiver true).
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setAlwaysOnTop(true, "screen-saver");
    mainWindow.setSkipTaskbar?.(true);
    mainWindow.moveTop?.();
    mainWindow.show();
    mainWindow.focus();
    setWindowsTaskbarVisible(false);
  } catch (e) {
    console.warn("[totem] reassertKiosk falhou", e?.message || e);
  }
}


// Modo agressivo: usado enquanto o modal de pagamento (TEF/PIX) está aberto,
// quando apps externos roubam foco com frequência e revelam a barra de tarefas.
let aggressiveTimer = null;
let aggressiveUntil = 0;
function startAggressiveKiosk(durationMs = 20000) {
  if (!KIOSK) return;
  aggressiveUntil = Date.now() + durationMs;
  if (aggressiveTimer) return;
  aggressiveTimer = setInterval(() => {
    if (Date.now() > aggressiveUntil || !mainWindow || mainWindow.isDestroyed()) {
      clearInterval(aggressiveTimer);
      aggressiveTimer = null;
      return;
    }
    reassertKiosk();
  }, 300);
  reassertKiosk();
}



// Garante que qualquer window.print() disparado pela página remota não abra diálogo do Windows.
app.commandLine.appendSwitch("kiosk-printing");

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 1920,
    fullscreen: KIOSK,
    kiosk: KIOSK,
    autoHideMenuBar: true,
    alwaysOnTop: KIOSK,
    frame: !KIOSK,
    title: "Nexa Totem",
    icon: path.join(__dirname, "build", "icon.ico"),
    backgroundColor: "#000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // desabilita zoom acidental por gestos
      zoomFactor: 1.0,
    },
  });

  if (KIOSK) {
    // Mantém o totem sempre à frente: o Checkout Payer roda oculto atrás
    // (a interação do cliente é no pinpad + na nossa tela).
    reassertKiosk();
    mainWindow.setVisibleOnAllWorkspaces?.(true);
    mainWindow.on("blur", () => {
      // Alguns apps de TEF (Payer/PayGo) roubam o foco e revelam a barra de tarefas.
      // Reafirma o kiosk algumas vezes até a janela voltar à frente.
      [0, 80, 250, 600, 1200].forEach((ms) => setTimeout(reassertKiosk, ms));
    });
    mainWindow.on("leave-full-screen", () => reassertKiosk());
    mainWindow.on("minimize", () => reassertKiosk());
    // Watchdog: garante fullscreen/topmost mesmo se algo externo alterar o estado.
    kioskWatchdog = setInterval(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (!mainWindow.isFullScreen() || !mainWindow.isAlwaysOnTop()) reassertKiosk();
    }, 1000);

    mainWindow.on("closed", () => {
      if (kioskWatchdog) clearInterval(kioskWatchdog);
      kioskWatchdog = null;
    });
  }


  // Sempre buscar a versão publicada mais recente do app web:
  // limpa o cache HTTP antes de carregar e ignora cache na navegação inicial.
  mainWindow.webContents.session
    .clearCache()
    .catch((e) => console.warn("[totem] falha ao limpar cache", e))
    .finally(() => {
      mainWindow.loadURL(APP_URL, { extraHeaders: "pragma: no-cache\ncache-control: no-cache\n" });
    });





  mainWindow.webContents.on("dom-ready", () => {
    mainWindow.webContents.executeJavaScript(`
      (() => {
        window.print = () => console.warn('[totem] window.print bloqueado; use impressão silenciosa via Electron');
      })();
    `).catch(() => {});
  });

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  // Bloqueia menu de contexto / teclas de fechamento no modo kiosk
  if (KIOSK) {
    mainWindow.webContents.on("before-input-event", (event, input) => {
      const blocked =
        (input.alt && input.key === "F4") ||
        (input.control && input.key.toLowerCase() === "w") ||
        input.key === "F11";
      if (blocked) event.preventDefault();
    });
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const execFileSafe = (file, args, timeout = 5000) =>
  new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout }, (error, stdout, stderr) => {
      resolve({ ok: !error, error, stdout, stderr });
    });
  });

async function readExistingSitefHealth() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1200);
  try {
    const r = await fetch(`http://127.0.0.1:${SITEF_AGENT_PORT}/sitef/health`, { signal: ctrl.signal });
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function killWindowsPid(pid) {
  if (process.platform !== "win32" || !pid || Number(pid) === process.pid) return;
  await execFileSafe("taskkill.exe", ["/F", "/T", "/PID", String(pid)]);
}

async function freeStaleSitefPort() {
  if (process.platform !== "win32") return;
  const ps = [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-Command",
    `$port=${SITEF_AGENT_PORT}; $self=${process.pid}; ` +
      "$lines = netstat -ano | Select-String (':' + $port + '\\s+.*LISTENING'); " +
      "foreach ($line in $lines) { " +
      "$procId = [int](($line.ToString() -split '\\s+')[-1]); " +
      "if ($procId -and $procId -ne $self) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue } " +
      "}",
  ];
  await execFileSafe("powershell.exe", ps, 7000);
}

async function ensureFreshSitefAgentPort() {
  const wantsRealSitef = process.env.SITEF_MOCK ? process.env.SITEF_MOCK === "false" : true;
  if (!wantsRealSitef) return;

  const current = await readExistingSitefHealth();
  if (!current?.ok) return;

  const staleStub = current.version === "0.1.0-stub" || current.mode !== "real";
  if (!staleStub) return;

  console.warn(`[totem] agente SiTef antigo/stub ocupando a porta; encerrando antes de iniciar o ${packageJson.version}`, current);
  await killWindowsPid(current.pid);
  await freeStaleSitefPort();
  await sleep(700);
}

app.whenReady().then(async () => {
  // Aceita o certificado auto-assinado do agente Payer local (apenas loopback).
  app.on("certificate-error", (event, _webContents, url, _error, _cert, callback) => {
    try {
      const u = new URL(url);
      const isLocalAgent =
        (u.hostname === "127.0.0.1" || u.hostname === "localhost") &&
        String(u.port) === String(PAYER_AGENT_PORT);
      if (isLocalAgent) {
        event.preventDefault();
        return callback(true);
      }
    } catch { /* ignora */ }
    callback(false);
  });

  // Auto-start com o Windows: registra o app pra abrir junto com o login do usuário
  if (process.platform === "win32" && app.isPackaged) {
    try {
      app.setLoginItemSettings({
        openAtLogin: true,
        path: process.execPath,
        args: ["--auto-launch"],
      });
    } catch (e) { console.warn("[totem] não foi possível registrar auto-start", e); }
  }

  try { await ensureFreshSitefAgentPort(); }
  catch (e) { console.warn("[totem] não foi possível limpar agente SiTef antigo", e); }

  try { startSitefAgent(); }
  catch (e) { console.error("[totem] falha ao iniciar agente SiTef", e); }

  try {
    const payerStart = await startPayerAgent();
    if (!payerStart?.ok) {
      console.error(`[totem] agente TEF local indisponível: ${payerStart?.error || "erro desconhecido"}`);
    } else if (payerStart.external) {
      console.log(`[totem] usando agente TEF externo "${payerStart.agent}" na porta ${PAYER_AGENT_PORT}`);
    }
  } catch (e) { console.error("[totem] falha ao iniciar agente Payer", e); }


  createWindow();

  // Atalho secreto para sair do kiosk: Ctrl+Shift+Alt+Q
  globalShortcut.register("Control+Shift+Alt+Q", () => {
    stopSitefAgent();
    stopPayerAgent();
    app.quit();
  });
});

app.on("window-all-closed", () => {
  stopSitefAgent();
  stopPayerAgent();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopSitefAgent();
  stopPayerAgent();
  globalShortcut.unregisterAll();
});


app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ============================================================
// IPC: SiTef — proxy local pelo processo Electron
// Evita bloqueio do navegador remoto tentando acessar localhost do Totem.
// ============================================================
const sitefAgentUrl = (pathName) => {
  const port = parseInt(process.env.SITEF_AGENT_PORT || "60906", 10);
  return `http://127.0.0.1:${port}${pathName}`;
};

// Permite que o frontend reafirme o kiosk (ex.: ao abrir/fechar o modal de PIX/TEF)
ipcMain.handle("kiosk:reassert", async (_e, opts) => {
  const durationMs = Number(opts?.durationMs) || 0;
  if (durationMs > 0) startAggressiveKiosk(durationMs);
  else reassertKiosk();
  return { ok: true };
});


ipcMain.handle("sitef:health", async () => {
  try {
    const r = await fetch(sitefAgentUrl("/sitef/health"));
    return await r.json();
  } catch (e) {
    return { ok: false, error: e?.message ?? String(e) };
  }
});

ipcMain.handle("sitef:iniciar", async (_evt, payload = {}) => {
  try {
    const r = await fetch(sitefAgentUrl("/sitef/iniciar"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(async () => ({ mensagem: await r.text().catch(() => "") }));
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 0, error: e?.message ?? String(e) };
  }
});

ipcMain.handle("sitef:cancelar", async () => {
  try {
    const r = await fetch(sitefAgentUrl("/sitef/cancelar"), { method: "POST" });
    const data = await r.json().catch(async () => ({ message: await r.text().catch(() => "") }));
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 0, error: e?.message ?? String(e) };
  }
});

// ============================================================
// IPC: listar impressoras instaladas
// ============================================================
ipcMain.handle("printers:list", async () => {
  if (!mainWindow) return [];
  try {
    const list = await mainWindow.webContents.getPrintersAsync();
    return list.map((p) => ({
      name: p.name,
      displayName: p.displayName,
      description: p.description,
      isDefault: p.isDefault,
      status: p.status,
    }));
  } catch (e) {
    console.error("[totem] printers:list erro", e);
    return [];
  }
});

// ============================================================
// IPC: impressão silenciosa via HTML (sem diálogo do Windows)
// Usa a impressora padrão do sistema. Útil como fallback quando
// não há ESC/POS configurada para a loja.
// ============================================================
ipcMain.handle("printer:silentPrint", async (_evt, { html, deviceName } = {}) => {
  try {
    const printers = mainWindow ? await mainWindow.webContents.getPrintersAsync() : [];
    const targetDevice = deviceName || pickReceiptPrinter(printers);


    if (!targetDevice) {
      console.warn("[totem] nenhuma impressora instalada encontrada; diálogo do Windows suprimido");
      return { ok: true, warning: "Nenhuma impressora instalada encontrada" };
    }

    const win = new BrowserWindow({
      show: false,
      webPreferences: { offscreen: false, sandbox: true },
    });
    await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html || ""));
    await new Promise((resolve, reject) => {
      win.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: targetDevice,
          margins: { marginType: "none" },
        },
        (success, failureReason) => {
          try { win.close(); } catch {}
          if (success) resolve();
          else reject(new Error(failureReason || "print failed"));
        }
      );
    });
    return { ok: true };
  } catch (e) {
    console.error("[totem] printer:silentPrint erro", e);
    return { ok: true, warning: e?.message ?? String(e) };
  }
});

ipcMain.handle("printer:printUrl", async (_evt, { url, deviceName } = {}) => {
  try {
    const printers = mainWindow ? await mainWindow.webContents.getPrintersAsync() : [];
    const targetDevice = deviceName || pickReceiptPrinter(printers);


    if (!targetDevice) return { ok: false, error: "Nenhuma impressora instalada encontrada" };
    if (!url) return { ok: false, error: "URL fiscal ausente" };

    const win = new BrowserWindow({ show: false, webPreferences: { offscreen: false, sandbox: true } });
    await win.loadURL(url);
    // Injeta CSS para forçar largura de bobina 80mm (DANFE NFC-e)
    try {
      await win.webContents.insertCSS(`
        @page { size: 80mm auto; margin: 0; }
        html, body { width: 72mm !important; margin: 0 !important;
          padding: 2mm 8mm 2mm 0 !important;
          font-family: 'Arial', 'Helvetica', sans-serif !important;
          font-size: 10px !important; line-height: 1.3 !important;
          color: #000 !important; font-weight: 600 !important;
          -webkit-print-color-adjust: exact !important; }
        * { max-width: 72mm !important; box-sizing: border-box !important; color: #000 !important; }
        table { width: 100% !important; border-collapse: collapse !important; font-size: 10px !important; }
        td, th { font-size: 10px !important; font-weight: 600 !important; }
        h1, h2, h3, .title, strong, b { font-weight: 800 !important; }
        img, svg, canvas { max-width: 28mm !important; height: auto !important; image-rendering: pixelated !important; }
        .qrcode, [class*="qr"], [id*="qr"] { max-width: 24mm !important; width: 24mm !important; height: auto !important; }
      `);
    } catch {}
    const pageHeightMicrons = await win.webContents.executeJavaScript(`
      (() => {
        const heightPx = Math.max(
          document.body?.scrollHeight || 0,
          document.documentElement?.scrollHeight || 0,
          document.body?.offsetHeight || 0,
          document.documentElement?.offsetHeight || 0
        );
        return Math.ceil((heightPx * 25400) / 96);
      })();
    `).catch(() => undefined);

    await new Promise((resolve, reject) => {
      win.webContents.print({
        silent: true,
        printBackground: true,
        deviceName: targetDevice,
        margins: { marginType: "none" },
        pageSize: pageHeightMicrons ? { width: 80000, height: Math.max(pageHeightMicrons, 30000) } : undefined,
        scaleFactor: 100,
        dpi: { horizontal: 203, vertical: 203 },
      }, (success, failureReason) => {
        try { win.close(); } catch {}
        if (success) resolve();
        else reject(new Error(failureReason || "print failed"));
      });
    });
    return { ok: true };
  } catch (e) {
    console.error("[totem] printer:printUrl erro", e);
    return { ok: false, error: e?.message ?? String(e) };
  }
});

// ============================================================
// IPC: imprimir ESC/POS (Gertec G250 USB)
// ============================================================
ipcMain.handle("printer:print", async (_evt, payload) => {
  if (!ThermalPrinter) {
    return { ok: false, error: "node-thermal-printer não instalado" };
  }
  try {
    const interfaceStr =
      payload.connection_type === "network"
        ? `tcp://${payload.host}:${payload.port ?? 9100}`
        : `printer:${payload.usb_device_name}`;

    const printer = new ThermalPrinter({
      type: PrinterTypes.EPSON, // Gertec G250 fala ESC/POS Epson-compatível
      interface: interfaceStr,
      width: 48,
      removeSpecialCharacters: false,
      options: { timeout: 5000 },
    });

    const isConnected = await printer.isPrinterConnected();
    if (!isConnected) {
      return { ok: false, error: `Impressora não respondeu em ${interfaceStr}` };
    }

    renderContent(printer, payload.content);
    printer.cut();
    printer.beep();
    await printer.execute();
    return { ok: true };
  } catch (e) {
    console.error("[totem] printer:print erro", e);
    return { ok: false, error: e?.message ?? String(e) };
  }
});

function renderContent(printer, content) {
  const { type, data } = content || {};

  if (type === "test") {
    printer.alignCenter();
    printer.bold(true); printer.setTextSize(1, 1);
    printer.println("TESTE DE IMPRESSAO");
    printer.bold(false); printer.setTextNormal();
    printer.drawLine();
    printer.alignLeft();
    printer.println(`Loja:        ${data?.storeName ?? "-"}`);
    printer.println(`Impressora:  ${data?.printerName ?? "-"}`);
    printer.println(`Conexao:     ${data?.connection ?? "-"}`);
    printer.println(`Funcao:      ${data?.role ?? "-"}`);
    printer.drawLine();
    printer.alignCenter();
    printer.println(new Date().toLocaleString("pt-BR"));
    return;
  }

  if (type === "totem") {
    printer.alignCenter();
    printer.bold(true); printer.setTextSize(1, 1);
    printer.println(data?.storeName ?? "Nexa");
    printer.bold(false); printer.setTextNormal();
    printer.println("AUTOATENDIMENTO");
    printer.drawLine();
    printer.println("SUA SENHA");
    printer.bold(true); printer.setTextSize(3, 3);
    printer.println(String(data?.orderNumber ?? "-"));
    printer.bold(false); printer.setTextNormal();
    printer.drawLine();
    printer.alignLeft();
    if (data?.customerName) printer.println(`Cliente: ${data.customerName}`);
    printer.println(`Data: ${new Date().toLocaleString("pt-BR")}`);
    printer.drawLine();
    (data?.items ?? []).forEach((it) => {
      printer.println(`${it.qty}x ${it.name}`);
      if (it.note) printer.println(`   obs: ${it.note}`);
    });
    printer.drawLine();
    printer.alignRight();
    printer.bold(true);
    printer.println(`TOTAL: R$ ${(data?.total ?? 0).toFixed(2)}`);
    printer.bold(false);
    printer.alignLeft();
    if (data?.paymentMethod) printer.println(`Pagamento: ${data.paymentMethod}`);
    printer.newLine();
    printer.alignCenter();
    printer.bold(true);
    printer.println(data?.message ?? "Aguarde sua senha ser chamada");
    printer.bold(false);
    return;
  }

  printer.println(JSON.stringify(content));
}
