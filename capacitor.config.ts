import type { CapacitorConfig } from "@capacitor/cli";

// Wrapper Android (WebView) do NEXA Garçom / SmartPOS para a Gertec GPOS780.
// O terminal de pagamento não permite instalar navegador, então distribuímos
// um APK que carrega o app publicado dentro de um WebView em tela cheia.
const config: CapacitorConfig = {
  appId: "com.aquelaparme.nexa",
  appName: "NEXA Garçom",
  webDir: "dist",
  server: {
    // Produção: app publicado. Para hot-reload em desenvolvimento troque por:
    // "https://b68f3ba2-e21a-49ee-b084-80c47f8ad72b.lovableproject.com?forceHideBadge=true"
    url: "https://nexasuite.aquelaparme.com.br/garcom",
    cleartext: true,
    androidScheme: "https",
    // Se o WebView não conseguir carregar a URL (sem internet/DNS), mostra uma
    // tela explicativa em vez de ficar branca.
    errorPath: "apk-error.html",

    // Checkout Payer roda em http://127.0.0.1:6060 no próprio terminal.
    allowNavigation: [
      "nexasuite.aquelaparme.com.br",
      "aquelaparme.com.br",
      "*.aquelaparme.com.br",
      "127.0.0.1",
      "localhost",
    ],
  },
  android: {
    allowMixedContent: true,
    // Deixa o logcat/chrome://inspect enxergar erros de JS no terminal.
    webContentsDebuggingEnabled: true,
  },
};

export default config;
