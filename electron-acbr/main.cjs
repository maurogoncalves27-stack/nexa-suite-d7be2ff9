// ============================================================
// NEXA ACBr Agent — processo principal Electron
// ============================================================
// Sobe o servidor HTTP na 3030 dentro do processo principal
// e mantém uma janela mínima (tray-style) com status.
// ============================================================

const path = require("path");
const server = require("./server.cjs");

// Modo "console" (sem Electron) — útil para `npm run start:console`
if (!process.versions.electron) {
  console.log("[NEXA ACBr Agent] Modo console (sem Electron).");
  server.start();
  process.on("SIGINT", () => { server.stop(); process.exit(0); });
  return;
}

const { app, BrowserWindow, Tray, Menu, nativeImage, shell } = require("electron");

let mainWindow = null;
let tray = null;
let httpServer = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 380,
    show: true,
    resizable: false,
    title: "NEXA ACBr Agent",
    icon: path.join(__dirname, "build", "icon.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const html = `
    <!doctype html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <title>NEXA ACBr Agent</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 24px; background:#0f172a; color:#e2e8f0; }
        h1 { margin: 0 0 8px; font-size: 18px; color:#3b82f6; }
        .muted { color:#94a3b8; font-size: 12px; margin-bottom: 16px; }
        .row { display:flex; justify-content:space-between; padding: 8px 0; border-bottom: 1px solid #1e293b; font-size: 13px; }
        .ok { color:#10b981; font-weight:600; }
        .err { color:#ef4444; font-weight:600; }
        button { margin-top: 16px; padding: 8px 16px; background:#3b82f6; color:white; border:none; border-radius:6px; cursor:pointer; }
      </style>
    </head>
    <body>
      <h1>NEXA ACBr Agent</h1>
      <div class="muted">HTTP <b>3030</b> · HTTPS <b>3031</b> (usado pelo app)</div>
      <div id="status">Carregando...</div>
      <button onclick="refresh()">Atualizar status</button>
      <script>
        async function refresh() {
          try {
            const r = await fetch('http://127.0.0.1:3030/health');
            const j = await r.json();
            document.getElementById('status').innerHTML = \`
              <div class="row"><span>Agente</span><span class="ok">\${j.version}</span></div>
              <div class="row"><span>NFC-e</span><span class="\${j.nfceReady?'ok':'err'}">\${j.nfceReady ? j.nfceVersion : (j.nfceError || 'indisponível')}</span></div>
              <div class="row"><span>TEF</span><span class="\${j.tefAvailable?'ok':'err'}">\${j.tefAvailable ? 'disponível' : 'DLL não encontrada'}</span></div>
              <div class="row"><span>ACBR_BASE</span><span style="font-size:11px">\${j.paths.ACBR_BASE}</span></div>
            \`;
          } catch (e) {
            document.getElementById('status').innerHTML = '<div class="err">Falha ao conectar ao agente</div>';
          }
        }
        refresh();
        setInterval(refresh, 5000);
      </script>
    </body>
    </html>
  `;
  mainWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on("close", (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, "build", "icon.ico");
    tray = new Tray(nativeImage.createFromPath(iconPath));
    const contextMenu = Menu.buildFromTemplate([
      { label: "Mostrar status", click: () => mainWindow?.show() },
      { label: "Abrir /health no navegador", click: () => shell.openExternal("http://127.0.0.1:3030/health") },
      { type: "separator" },
      { label: "Sair", click: () => { app.isQuiting = true; app.quit(); } },
    ]);
    tray.setToolTip("NEXA ACBr Agent — porta 3030");
    tray.setContextMenu(contextMenu);
    tray.on("click", () => mainWindow?.show());
  } catch (e) {
    console.warn("Tray indisponível:", e.message);
  }
}

// Single instance
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); }
  });

  app.whenReady().then(() => {
    httpServer = server.start();
    createWindow();
    createTray();
  });

  app.on("window-all-closed", (e) => {
    // mantém vivo em background (tray)
  });

  app.on("before-quit", () => {
    app.isQuiting = true;
    try { httpServer?.httpServer?.close(); } catch { /* ignore */ }
    try { httpServer?.httpsServer?.close(); } catch { /* ignore */ }
    server.stop();
  });
}
