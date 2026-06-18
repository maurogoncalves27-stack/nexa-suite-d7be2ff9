// Ponte entre o app web e o processo Electron.
// Quando rodando no app desktop Nexa Balcão, window.electron existe (via preload.cjs).
// No navegador comum, todas as funções caem em fallback (window.print() / toasts).

export interface ElectronPrinterInfo {
  name: string;
  displayName?: string;
  description?: string;
  isDefault?: boolean;
  status?: number;
}

export interface PrintPayload {
  connection_type: "usb" | "network";
  host?: string | null;
  port?: number | null;
  usb_device_name?: string | null;
  printer_model: string;
  content:
    | { type: "test"; data: { storeName: string; printerName: string; connection: string; role: string } }
    | { type: "customer"; data: CustomerReceiptData }
    | { type: "kitchen"; data: KitchenTicketData }
    | { type: "totem"; data: TotemReceiptData };
}

export interface ReceiptItem {
  qty: number;
  name: string;
  unitPrice?: number;
  note?: string;
}

export interface CustomerReceiptData {
  storeName: string;
  address?: string;
  orderNumber: string | number;
  customerName?: string;
  items: ReceiptItem[];
  total: number;
  paymentMethod?: string;
}

export interface KitchenTicketData {
  orderNumber: string | number;
  tableOrChannel?: string;
  items: ReceiptItem[];
}

export interface TotemReceiptData {
  storeName: string;
  orderNumber: string | number;     // será exibido GIGANTE como senha
  customerName?: string;
  items: ReceiptItem[];
  total: number;
  paymentMethod?: string;           // "Pago no totem" / "Pague no caixa"
  message?: string;                 // ex: "Aguarde sua senha ser chamada"
}

declare global {
  interface Window {
    electron?: {
      isElectron: true;
      isTotem?: boolean;
      platform: string;
      listPrinters: () => Promise<ElectronPrinterInfo[]>;
      print: (payload: PrintPayload) => Promise<{ ok: boolean; error?: string }>;
      silentPrint?: (payload: { html: string; deviceName?: string }) => Promise<{ ok: boolean; error?: string }>;
      printUrl?: (payload: { url: string; deviceName?: string }) => Promise<{ ok: boolean; error?: string }>;
      sitef?: {
        health: () => Promise<{ ok: boolean; mode?: string; version?: string; busy?: boolean; error?: string }>;
      };
      remote?: {
        getRustDeskId: () => Promise<{ id: string | null; hostname?: string; installed?: boolean; configPath?: string }>;
        machineName: string;
        appVersion: string;
      };
    };
  }
}

export const isElectron = (): boolean => typeof window !== "undefined" && !!window.electron?.isElectron;

export async function listSystemPrinters(): Promise<ElectronPrinterInfo[]> {
  if (!isElectron()) return [];
  return window.electron!.listPrinters();
}

export async function printViaElectron(payload: PrintPayload): Promise<{ ok: boolean; error?: string }> {
  if (!isElectron()) {
    return { ok: false, error: "App desktop Nexa Balcão não detectado (rodando no navegador)" };
  }
  return window.electron!.print(payload);
}
