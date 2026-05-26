// Imprime o cupom/senha do totem.
// - Em Electron: ESC/POS direto na impressora marcada como print_role='totem' da loja.
// - Fora do Electron: não imprime automaticamente para evitar abrir diálogo do navegador/Windows.
import { supabase } from "@/integrations/supabase/client";
import { isElectron, printViaElectron, type TotemReceiptData } from "@/lib/electronBridge";

interface PrinterRow {
  id: string;
  connection_type: "usb" | "network";
  host: string | null;
  port: number | null;
  usb_device_name: string | null;
  printer_model: string;
  print_role: string;
  is_default: boolean;
}

const escapeHtml = (s: string) =>
  String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c] as string));

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n ?? 0);

/** Busca a impressora dedicada do totem da loja (ou a primeira ativa). */
async function pickTotemPrinter(storeId: string): Promise<PrinterRow | null> {
  const { data } = await supabase
    .from("pdv_printers")
    .select("*")
    .eq("store_id", storeId)
    .eq("is_active", true);
  const list = (data ?? []) as PrinterRow[];
  if (list.length === 0) return null;
  return (
    list.find((p) => p.print_role === "totem") ??
    list.find((p) => p.is_default) ??
    list[0]
  );
}

function buildReceiptHtml(data: TotemReceiptData): string {
  const itemsHtml = data.items.map((it) => `
    <tr><td><strong>${it.qty}×</strong> ${escapeHtml(it.name)}${
      it.note ? `<div style="font-size:10px;font-style:italic;">${escapeHtml(it.note)}</div>` : ""
    }</td></tr>
  `).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Senha #${data.orderNumber}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: 72mm; margin: 0; text-align:center; }
  h1 { font-size: 64px; margin: 4px 0; }
  hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; text-align:left; }
  .total { font-size: 14px; font-weight: bold; }
</style></head><body>
  <div><strong>${escapeHtml(data.storeName)}</strong></div>
  <div>AUTOATENDIMENTO</div>
  <hr>
  <div>SUA SENHA</div>
  <h1>${escapeHtml(String(data.orderNumber))}</h1>
  <hr>
  ${data.customerName ? `<div>Cliente: ${escapeHtml(data.customerName)}</div>` : ""}
  <div>${new Date().toLocaleString("pt-BR")}</div>
  <hr>
  <table>${itemsHtml}</table>
  <hr>
  <div class="total">TOTAL ${fmt(data.total)}</div>
  ${data.paymentMethod ? `<div>${escapeHtml(data.paymentMethod)}</div>` : ""}
  <p><strong>${escapeHtml(data.message ?? "Aguarde sua senha ser chamada")}</strong></p>
</body></html>`;
}

async function fallbackHtmlPrint(data: TotemReceiptData, deviceName?: string | null) {
  // Em Electron, dispara silentPrint (kiosk-printing impede o diálogo).
  if (isElectron() && window.electron?.silentPrint) {
    try {
      const html = buildReceiptHtml(data);
      const res = await window.electron.silentPrint({ html, deviceName: deviceName ?? undefined });
      if (!res.ok) {
        console.warn("[totem-print] silentPrint falhou", res.error);
      }
      return;
    } catch (e) {
      console.warn("[totem-print] silentPrint erro", e);
      return;
    }
  }
  console.warn("[totem-print] sem impressora disponível", { orderNumber: data.orderNumber });
}

/** Imprime o cupom de totem. Não lança — registra no console em caso de falha. */
export async function printTotemReceipt(storeId: string | null | undefined, data: TotemReceiptData): Promise<void> {
  try {
    if (isElectron() && storeId) {
      const printer = await pickTotemPrinter(storeId);
      if (printer) {
        const res = await printViaElectron({
          connection_type: printer.connection_type,
          host: printer.host,
          port: printer.port,
          usb_device_name: printer.usb_device_name,
          printer_model: printer.printer_model,
          content: { type: "totem", data },
        });
        if (!res.ok) {
          console.warn("[totem-print] ESC/POS falhou; tentando silentPrint:", res.error);
          await fallbackHtmlPrint(data, printer.usb_device_name);
        }
        return;
      }
      console.warn("[totem-print] nenhuma impressora cadastrada para a loja, usando silentPrint");
    }
    await fallbackHtmlPrint(data);
  } catch (e) {
    console.error("[totem-print] erro inesperado", e);
    try { await fallbackHtmlPrint(data); } catch { /* ignore */ }
  }
}
