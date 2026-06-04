/**
 * Tipos compartilhados da camada TEF (pinpad).
 * Adapters concretos: SiTef, PayGo, Mock.
 */

export type TefProvider = "sitef" | "paygo" | "mock" | "acbr";

export type TefStatus =
  | "idle"
  | "connecting"
  | "waiting_card"
  | "processing"
  | "approved"
  | "declined"
  | "cancelled"
  | "error"
  | "timeout";

export type TefPaymentMethod = "credit" | "debit" | "pix" | "voucher";

export interface TefPaymentRequest {
  amount: number;            // em reais
  method?: TefPaymentMethod; // se undefined, usuário escolhe no pinpad
  installments?: number;     // crédito parcelado
  orderId?: string;          // para vincular ao pdv_orders
  storeId?: string;          // para selecionar config TEF
}

export interface TefPaymentResult {
  status: Exclude<TefStatus, "idle" | "connecting" | "waiting_card" | "processing">;
  message?: string;
  nsu?: string;
  authorizationCode?: string;
  cardBrand?: string;
  cardLast4?: string;
  installments?: number;
  acquirer?: string;
  raw?: unknown;
}

export interface TefConfig {
  provider: TefProvider;
  agentUrl: string;          // ex: http://localhost:60906
  merchantCode?: string;     // código da loja no provedor
  terminalCode?: string;
  acquirer?: string;
}

export interface TefAdapter {
  readonly provider: TefProvider;
  /** Inicia uma transação. Recebe callback de mudança de estado. */
  processPayment(
    req: TefPaymentRequest,
    onStatus?: (s: TefStatus, msg?: string) => void,
  ): Promise<TefPaymentResult>;
  /** Tenta cancelar a transação em andamento. */
  cancel(): Promise<void>;
}
