// MockAdapter — usado em desenvolvimento / Fase 0 enquanto credenciais reais
// (Lalamove / Uber Direct) não chegam. Retorna cotações e corridas simuladas.
import type {
  DeliveryAdapter,
  QuoteRequest,
  QuoteResult,
  CreateOrderRequest,
  CreateOrderResult,
} from './types.ts';

function rndId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function haversineKm(a?: { latitude?: number; longitude?: number }, b?: { latitude?: number; longitude?: number }) {
  if (!a?.latitude || !a?.longitude || !b?.latitude || !b?.longitude) return 5; // fallback 5km
  const R = 6371;
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const s = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(s));
}

export const mockAdapter: DeliveryAdapter = {
  provider: 'mock',

  async quote(req: QuoteRequest): Promise<QuoteResult> {
    const km = haversineKm(req.pickup, req.dropoff);
    const fee_cents = Math.round((600 + km * 180) * 100) / 100 | 0; // R$6 base + R$1,80/km
    const eta_minutes = Math.round(15 + km * 2);
    return {
      provider: 'mock',
      quote_id: rndId('mq'),
      fee_cents,
      eta_minutes,
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      raw: { km, simulated: true },
    };
  },

  async createOrder(req: CreateOrderRequest): Promise<CreateOrderResult> {
    const q = await this.quote(req);
    return {
      provider: 'mock',
      order_id: rndId('mo'),
      status: 'requested',
      tracking_url: `https://example.com/track/${rndId('tr')}`,
      driver_name: 'Motoboy Simulado',
      driver_phone: '+556199999999',
      fee_cents: q.fee_cents,
      eta_minutes: q.eta_minutes,
      raw: { simulated: true, external_reference: req.external_reference },
    };
  },

  async cancel(_providerOrderId: string) {
    return { ok: true, message: 'cancelado (mock)' };
  },
};
