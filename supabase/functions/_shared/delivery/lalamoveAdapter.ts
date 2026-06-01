// LalamoveAdapter — STUB. Requer LALAMOVE_API_KEY / LALAMOVE_API_SECRET.
// Endpoints v3: https://developers.lalamove.com/
// Implementação real será concluída na Fase 1, quando credenciais estiverem disponíveis.
import type {
  DeliveryAdapter,
  QuoteRequest,
  QuoteResult,
  CreateOrderRequest,
  CreateOrderResult,
} from './types.ts';

const API_KEY = Deno.env.get('LALAMOVE_API_KEY') || '';
const API_SECRET = Deno.env.get('LALAMOVE_API_SECRET') || '';
const MARKET = Deno.env.get('LALAMOVE_MARKET') || 'BR';

function ensureCreds() {
  if (!API_KEY || !API_SECRET) {
    throw new Error('Lalamove credentials not configured (LALAMOVE_API_KEY / LALAMOVE_API_SECRET)');
  }
}

export const lalamoveAdapter: DeliveryAdapter = {
  provider: 'lalamove',

  async quote(_req: QuoteRequest): Promise<QuoteResult> {
    ensureCreds();
    // TODO Fase 1: implementar POST /v3/quotations com HMAC-SHA256
    throw new Error('Lalamove adapter not yet implemented (Fase 1)');
  },

  async createOrder(_req: CreateOrderRequest): Promise<CreateOrderResult> {
    ensureCreds();
    // TODO Fase 1: POST /v3/orders
    throw new Error('Lalamove adapter not yet implemented (Fase 1)');
  },

  async cancel(_providerOrderId: string) {
    ensureCreds();
    // TODO Fase 1: DELETE /v3/orders/{id}
    throw new Error('Lalamove adapter not yet implemented (Fase 1)');
  },
};

export const lalamoveMeta = { configured: !!(API_KEY && API_SECRET), market: MARKET };
