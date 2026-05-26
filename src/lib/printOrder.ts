// Imprime cupom simples do pedido em uma janela oculta.
// Chama window.print() automaticamente; o navegador respeita a impressora padrão.
// Observação: alguns navegadores podem bloquear popup sem interação do usuário.

interface PrintItem {
  name: string;
  quantity: number;
  unit_price?: number;
  total: number;
  notes?: string | null;
}

interface PrintOrder {
  order_number: string | null;
  id: string;
  channel_name?: string;
  order_type?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  delivery_address?: any;
  notes?: string | null;
  total: number;
  opened_at: string;
  items: PrintItem[];
}

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n ?? 0);

export function printOrderReceipt(o: PrintOrder) {
  const number = o.order_number ?? o.id.slice(0, 6);
  const when = new Date(o.opened_at).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const typeLabel =
    o.order_type === "delivery" ? "DELIVERY" :
    o.order_type === "pickup"   ? "RETIRADA" :
    o.order_type === "counter"  ? "BALCÃO"   : (o.order_type ?? "—").toUpperCase();
  const addr = o.delivery_address;
  const addrLine = addr && typeof addr === "object"
    ? [addr.street ?? addr.address, addr.number, addr.complement, addr.neighborhood, addr.city]
        .filter(Boolean).join(", ")
    : "";

  const itemsHtml = o.items.map((it) => `
    <tr>
      <td style="padding:2px 0;"><strong>${it.quantity}×</strong> ${escapeHtml(it.name)}${
        it.notes ? `<div style="font-size:10px;font-style:italic;">${escapeHtml(it.notes)}</div>` : ""
      }</td>
      <td style="padding:2px 0;text-align:right;white-space:nowrap;">${fmt(it.total)}</td>
    </tr>
  `).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Pedido #${number}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: 72mm; margin: 0; }
  h1, h2, h3 { margin: 4px 0; }
  hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  .center { text-align: center; }
  .total { font-size: 14px; font-weight: bold; }
</style></head><body>
  <div class="center">
    <h2>PEDIDO #${number}</h2>
    <div>${escapeHtml(o.channel_name ?? "")} · ${typeLabel}</div>
    <div>${when}</div>
  </div>
  <hr>
  ${o.customer_name ? `<div><strong>${escapeHtml(o.customer_name)}</strong></div>` : ""}
  ${o.customer_phone ? `<div>Tel: ${escapeHtml(o.customer_phone)}</div>` : ""}
  ${addrLine ? `<div>End: ${escapeHtml(addrLine)}</div>` : ""}
  ${(o.customer_name || o.customer_phone || addrLine) ? "<hr>" : ""}
  <table>${itemsHtml}</table>
  <hr>
  ${o.notes ? `<div><strong>Obs:</strong> ${escapeHtml(o.notes)}</div><hr>` : ""}
  <table><tr><td class="total">TOTAL</td><td class="total" style="text-align:right;">${fmt(o.total)}</td></tr></table>
</body></html>`;

  // Usa iframe oculto para evitar bloqueio de popup.
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) return;
  doc.open(); doc.write(html); doc.close();
  const trigger = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {}
    setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 2000);
  };
  if (iframe.contentWindow?.document.readyState === "complete") {
    setTimeout(trigger, 100);
  } else {
    iframe.onload = () => setTimeout(trigger, 100);
  }
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c] as string));
}
