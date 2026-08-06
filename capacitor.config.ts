import type { CapacitorConfig } from "@capacitor/cli";

// Wrapper Android (WebView) do NEXA SmartPOS / Garçom para a Gertec GPOS780.
// O terminal de pagamento não permite instalar navegador, então distribuímos
// um APK que carrega o app publicado dentro de um WebView em tela cheia.
const config: CapacitorConfig = {
  appId: "app.lovable.b68f3ba2e21a49eeb08480c47f8ad72b",
  appName: "NEXA SmartPOS",
  webDir: "dist",
  server: {
    // Produção: app publicado. Para hot-reload em desenvolvimento troque por:
    // "https://b68f3ba2-e21a-49ee-b084-80c47f8ad72b.lovableproject.com?forceHideBadge=true"
    url: "https://nexasuite.aquelaparme.com.br/smartpos/login",
    cleartext: true,
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
    webContentsDebuggingEnabled: false,
  },
};

export default config;
