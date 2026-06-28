/**
 * Tipos do orquestrador de fechamento de venda (closeOrder).
 */

export type ClosureStatus =
  | "pending_payment"
  | "paid"
  | "fiscal_pending"
  | "fiscal_ok"
  | "print_pending"
  | "closed"
  | "failed_at_step";

export type ClosureChannel = "totem" | "pdv" | "whatsapp" | "ifood" | "delivery";

export type PrintClosureTarget = "kitchen" | "customer" | "nfce";

export interface CloseOrderParams {
  orderId: string;
  storeId: string;
  channel: ClosureChannel;
  storeName?: string;
  printTargets?: PrintClosureTarget[];
}

export interface CloseOrderResult {
  closureId: string;
  orderId: string;
  status: ClosureStatus;
  danfeUrl?: string | null;
  invoiceId?: string | null;
  error?: string;
}

export interface EmitNfceResult {
  ok: boolean;
  danfeUrl?: string | null;
  invoiceId?: string | null;
  status?: string;
  error?: string;
}
