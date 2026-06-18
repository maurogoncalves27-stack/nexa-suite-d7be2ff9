/**
 * Tipos compartilhados da camada TEF (pinpad).
 * Adapters concretos: SiTef, PayGo, Mock.
 */

export type TefProvider = "sitef" | "paygo" | "mock" | "acbr" | "payer";

export type TefStatus =
  | "idle"
  | "connecting"
  | "waiting_card"
  | "processing"
  | "approved"
  | "declined"
  | "cancelled"
  | "error"
  | "timeout"
  | "pending_confirmation";

export interface PaygoPendingInfo {
  reqNum: string;
  locRef?: string;
  extRef?: string;
  virtMerch?: string;
  authSyst?: string;
}

export type TefPaymentMethod = "credit" | "debit" | "pix" | "voucher";

export interface TefPaymentRequest {
  amount: number;            // em reais
  method?: TefPaymentMethod; // se undefined, usuário escolhe no pinpad
  installments?: number;     // crédito parcelado
  orderId?: string;          // para vincular ao pdv_orders
  storeId?: string;          // para selecionar config TEF
  acquirer?: string;          // rede/adquirente preferida (ex.: DEMO, REDE)
  paygoQrDisplayPreference?: "1" | "2"; // 1=pinpad, 2=checkout/PC
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
  customerReceipt?: string;
  merchantReceipt?: string;
  paygoReqnum?: string;
  paygoPending?: PaygoPendingInfo;
  raw?: unknown;
}

export type TefEnvironment = "demo" | "producao";

export interface TefConfig {
  provider: TefProvider;
  agentUrl: string;          // ex: http://127.0.0.1:3030
  merchantCode?: string;     // código da loja no provedor
  terminalCode?: string;
  acquirer?: string;
  environment?: TefEnvironment; // demo (sandbox PayGo roxo) ou produção
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
