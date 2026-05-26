// Preload do Electron - expõe API segura no window do app web.
// Acessível como window.electron no frontend (ver src/lib/electronBridge.ts).
const { contextBridge, ipcRenderer } = require("electron");

// Bloqueia qualquer impressão manual disparada pela página/iframes.
window.print = () => console.warn("[electron] window.print bloqueado; use window.electron.silentPrint");

contextBridge.exposeInMainWorld("electron", {
  isElectron: true,
  platform: process.platform,
  // Lista impressoras USB instaladas no Windows
  listPrinters: () => ipcRenderer.invoke("printers:list"),
  // Imprime um conteúdo (test/customer/kitchen) via ESC/POS
  print: (payload) => ipcRenderer.invoke("printer:print", payload),
  // Impressão silenciosa via HTML (sem diálogo do Windows)
  silentPrint: (payload) => ipcRenderer.invoke("printer:silentPrint", payload),
  // SiTef: agente HTTP local (CliSiTef wrapper). Ver electron/sitef-agent.cjs
  sitef: {
    health: () => ipcRenderer.invoke("sitef:health"),
  },
});
