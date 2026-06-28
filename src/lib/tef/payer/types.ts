export type PayerDiagnostics = {
  ok?: boolean;
  baseUrl?: string;
  hasCredentials?: boolean;
  loggedIn?: boolean;
  checkoutReachable?: boolean;
  lastError?: string | null;
};

export type PayerPaymentPayload = {
  value?: number;
  command?: string;
  idPayer?: string;
  paymentMethod?: string;
  paymentType?: string;
  paymentMethodSubType?: string;
  installments?: number;
  paymentDate?: string;
  wait?: boolean;
  email?: string;
  password?: string;
};

export type PayerAgentStatus = {
  ok: boolean;
  online?: boolean;
  checkoutReachable?: boolean;
  loggedIn?: boolean;
  hasCredentials?: boolean;
  baseUrl?: string;
  version?: string;
  error?: string;
};
