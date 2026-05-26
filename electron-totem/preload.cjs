// Preload do Electron - expõe API segura no window do app web.
// Acessível como window.electron no frontend (ver src/lib/electronBridge.ts).
const { contextBridge, ipcRenderer } = require("electron");

// Bloqueia qualquer impressão manual disparada pela página/iframes.
window.print = () => console.warn("[totem] window.print bloqueado; use window.electron.silentPrint");

contextBridge.exposeInMainWorld("electron", {
  isElectron: true,
  isTotem: true,
  platform: process.platform,
  // Lista impressoras USB instaladas no Windows
  listPrinters: () => ipcRenderer.invoke("printers:list"),
  // Imprime um conteúdo (test/customer/kitchen) via ESC/POS
  print: (payload) => ipcRenderer.invoke("printer:print", payload),
  // Impressão silenciosa via HTML (sem diálogo) — usa impressora padrão do Windows
  silentPrint: (payload) => ipcRenderer.invoke("printer:silentPrint", payload),
  // Impressão silenciosa direta de URL/PDF/DANFE fiscal
  printUrl: (payload) => ipcRenderer.invoke("printer:printUrl", payload),
  // SiTef: agente HTTP local (CliSiTef wrapper). Ver electron/sitef-agent.cjs
  sitef: {
    health: () => ipcRenderer.invoke("sitef:health"),
    iniciar: (payload) => ipcRenderer.invoke("sitef:iniciar", payload),
    cancelar: () => ipcRenderer.invoke("sitef:cancelar"),
  },
});
