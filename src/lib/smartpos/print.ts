/**
 * Impressão do comprovante TEF na bobina da SmartPOS (Gertec GPOS780).
 *
 * Ordem de tentativa:
 * 1. Bridge nativa Android exposta pelo app container (window.NexaPrinter / window.Android)
 * 2. Serviço de impressão HTTP local do aparelho (configurável por terminal)
 * 3. Fallback: janela de impressão do navegador (útil em teste/desktop)
 */

const PRINTER_URL_KEY = "smartpos.printerUrl";

export const getSmartPosPrinterUrl = (): string => {
  try {
    return localStorage.getItem(PRINTER_URL_KEY) ?? "";
  } catch {
    return "";
  }
};

export const setSmartPosPrinterUrl = (url: string) => {
  try {
    if (url) localStorage.setItem(PRINTER_URL_KEY, url);
    else localStorage.removeItem(PRINTER_URL_KEY);
  } catch {
    /* ignore */
  }
};

type NativeBridge = {
  printText?: (text: string) => void;
  print?: (text: string) => void;
};

const getNativeBridge = (): NativeBridge | null => {
  const w = window as unknown as Record<string, NativeBridge | undefined>;
  return w.NexaPrinter ?? w.Android ?? w.AndroidPrinter ?? null;
};

export const isNativePrinterAvailable = (): boolean => {
  const b = getNativeBridge();
  return !!(b && (b.printText || b.print));
};

const printViaBrowser = (text: string) => {
  const win = window.open("", "_blank", "width=380,height=640");
  if (!win) return false;
  win.document.write(
    `<pre style="font-family:monospace;font-size:12px;white-space:pre-wrap;">${text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")}</pre>`,
  );
  win.document.close();
  win.focus();
  win.print();
  return true;
};

/** Imprime texto puro (ESC/POS simples, 32-48 colunas). */
export const printSmartPosText = async (text: string): Promise<{ ok: boolean; via: string; error?: string }> => {
  const bridge = getNativeBridge();
  if (bridge?.printText || bridge?.print) {
    try {
      (bridge.printText ?? bridge.print)!(text);
      return { ok: true, via: "native" };
    } catch (e) {
      return { ok: false, via: "native", error: e instanceof Error ? e.message : "Falha na impressora" };
    }
  }

  const url = getSmartPosPrinterUrl();
  if (url) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) return { ok: true, via: "http" };
      return { ok: false, via: "http", error: `HTTP ${r.status}` };
    } catch (e) {
      return { ok: false, via: "http", error: e instanceof Error ? e.message : "Serviço de impressão indisponível" };
    }
  }

  const ok = printViaBrowser(text);
  return { ok, via: "browser", error: ok ? undefined : "Popup bloqueado" };
};

const line = (char = "-") => char.repeat(38);
const money = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

export interface ReceiptItem {
  name: string;
  quantity: number;
  unit_price: number;
  complements?: { option_name: string; extra_price?: number }[];
}

export interface ReceiptData {
  storeName: string;
  orderNumber?: string | null;
  items?: ReceiptItem[];
  total: number;
  method: string;
  nsu?: string;
  authorizationCode?: string;
  cardBrand?: string;
  cardLast4?: string;
  installments?: number;
  operator?: string;
  tableLabel?: string;
  /** Comprovante devolvido pelo TEF (via cliente / via loja). */
  tefReceipt?: string;
  copy: "cliente" | "estabelecimento";
}


export const buildTefReceiptText = (d: ReceiptData): string => {
  const rows: string[] = [];
  rows.push(d.storeName.toUpperCase());
  rows.push(new Date().toLocaleString("pt-BR"));
  if (d.orderNumber) rows.push(`Pedido: ${d.orderNumber}`);
  if (d.tableLabel) rows.push(`Mesa: ${d.tableLabel}`);
  if (d.operator) rows.push(`Operador: ${d.operator}`);
  rows.push(line());

  if (d.items?.length) {
    for (const it of d.items) {
      rows.push(`${it.quantity}x ${it.name}`.slice(0, 38));
      if (it.complements?.length) {
        for (const c of it.complements) {
          const lineText = c.extra_price && c.extra_price > 0
            ? `  + ${c.option_name} (${money(c.extra_price)})`
            : `  + ${c.option_name}`;
          rows.push(lineText.slice(0, 38));
        }
      }
      rows.push(`${" ".repeat(20)}${money(it.quantity * it.unit_price).padStart(18)}`);
    }
    rows.push(line());
  }


  rows.push(`TOTAL${money(d.total).padStart(33)}`);
  rows.push(`Forma: ${d.method.toUpperCase()}`);
  if (d.installments && d.installments > 1) rows.push(`Parcelas: ${d.installments}x`);
  if (d.cardBrand) rows.push(`Cartao: ${d.cardBrand} ****${d.cardLast4 ?? ""}`);
  if (d.nsu) rows.push(`NSU: ${d.nsu}`);
  if (d.authorizationCode) rows.push(`Autorizacao: ${d.authorizationCode}`);
  rows.push(line());

  if (d.tefReceipt) {
    rows.push(d.tefReceipt.trim());
    rows.push(line());
  }

  rows.push(d.copy === "cliente" ? "VIA DO CLIENTE" : "VIA DO ESTABELECIMENTO");
  rows.push("Nao e documento fiscal");
  rows.push("");
  rows.push("");
  return rows.join("\n");
};

/** Imprime as duas vias (cliente + estabelecimento). */
export const printTefReceipts = async (
  data: Omit<ReceiptData, "copy">,
  opts?: { merchantCopy?: boolean },
) => {
  const customer = await printSmartPosText(
    buildTefReceiptText({ ...data, copy: "cliente", tefReceipt: data.tefReceipt }),
  );
  if (opts?.merchantCopy !== false) {
    await printSmartPosText(buildTefReceiptText({ ...data, copy: "estabelecimento" }));
  }
  return customer;
};
