/**
 * Factory da camada TEF. Resolve config por loja e devolve o adapter correto.
 */
import { supabase } from "@/integrations/supabase/client";
import type { TefAdapter, TefConfig } from "./types";
import { createMockAdapter } from "./mockAdapter";
import { createSitefAdapter } from "./sitefAdapter";
import { createAcbrAdapter } from "./acbrAdapter";
import { createPaygoAdapter } from "./paygoAdapter";

export * from "./types";

const DEFAULT_CONFIG: TefConfig = {
  provider: "mock",
  agentUrl: "https://127.0.0.1:3031",
};

export const loadTefConfig = async (storeId?: string | null): Promise<TefConfig> => {
  if (!storeId) return DEFAULT_CONFIG;
  const { data } = await supabase
    .from("pdv_tef_config")
    .select("provider, agent_url, merchant_code, terminal_code, acquirer, environment")
    .eq("store_id", storeId)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return DEFAULT_CONFIG;
  return {
    provider: (data.provider as TefConfig["provider"]) ?? "mock",
    agentUrl: data.agent_url ?? DEFAULT_CONFIG.agentUrl,
    merchantCode: data.merchant_code ?? undefined,
    terminalCode: data.terminal_code ?? undefined,
    acquirer: data.acquirer ?? undefined,
    environment: ((data as { environment?: string }).environment as TefConfig["environment"]) ?? "demo",
  };
};

export const createTefAdapter = (config: TefConfig): TefAdapter => {
  switch (config.provider) {
    case "sitef":
      return createSitefAdapter(config);
    case "acbr":
      return createAcbrAdapter(config);
    case "paygo":
      return createPaygoAdapter(config);
    case "mock":
    default:
      return createMockAdapter(config);
  }
};

/** Registra a transação no banco para auditoria. */
export const logTefTransaction = async (params: {
  orderId?: string;
  storeId?: string;
  provider: string;
  amount: number;
  status: string;
  message?: string;
  nsu?: string;
  authorizationCode?: string;
  cardBrand?: string;
  cardLast4?: string;
  installments?: number;
  acquirer?: string;
  raw?: unknown;
}) => {
  await supabase.from("pdv_tef_transactions").insert({
    order_id: params.orderId ?? null,
    store_id: params.storeId ?? null,
    provider: params.provider,
    amount: params.amount,
    status: params.status,
    message: params.message ?? null,
    nsu: params.nsu ?? null,
    authorization_code: params.authorizationCode ?? null,
    card_brand: params.cardBrand ?? null,
    card_last4: params.cardLast4 ?? null,
    installments: params.installments ?? null,
    acquirer: params.acquirer ?? null,
    raw_response: (params.raw ?? null) as never,
    finished_at: new Date().toISOString(),
  });
};
