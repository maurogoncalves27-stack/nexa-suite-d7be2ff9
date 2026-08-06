// LalamoveAdapter — implementação v3 (sandbox/produção).
// Docs: https://developers.lalamove.com/
// Auth: HMAC-SHA256 → Header `Authorization: hmac <API_KEY>:<TIMESTAMP>:<SIGNATURE>`
// SIGNATURE = HMAC_SHA256(secret, `${timestamp}\r\n${method}\r\n${path}\r\n\r\n${body}`)
import type {
  DeliveryAdapter,
  QuoteRequest,
  QuoteResult,
  CreateOrderRequest,
  CreateOrderResult,
  DeliveryAddress,
} from './types.ts';

const API_KEY = Deno.env.get('LALAMOVE_API_KEY') || '';
const API_SECRET = Deno.env.get('LALAMOVE_API_SECRET') || '';
const MARKET = Deno.env.get('LALAMOVE_MARKET') || 'BR'; // BR (Brasil)
// `MOTORCYCLE` não existe no mercado brasileiro — a API recusa. LALAGO é o
// serviço mais barato e o único presente em todas as cidades BR do sandbox.
// Use GET /v3/cities (delivery-service-types) para conferir por cidade.
const DEFAULT_SERVICE_TYPE = Deno.env.get('LALAMOVE_SERVICE_TYPE') || 'LALAGO';
const ENV = (Deno.env.get('LALAMOVE_ENV') || 'sandbox').toLowerCase();
const BASE_URL = ENV === 'production'
  ? 'https://rest.lalamove.com'
  : 'https://rest.sandbox.lalamove.com';

function ensureCreds() {
  if (!API_KEY || !API_SECRET) {
    throw new Error('Lalamove credentials not configured (LALAMOVE_API_KEY / LALAMOVE_API_SECRET)');
  }
}

async function hmacSign(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function call(method: 'GET' | 'POST' | 'DELETE' | 'PATCH', path: string, body?: unknown) {
  ensureCreds();
  const timestamp = Date.now().toString();
  const bodyStr = body ? JSON.stringify(body) : '';
  const rawSig = `${timestamp}\r\n${method}\r\n${path}\r\n\r\n${bodyStr}`;
  const signature = await hmacSign(API_SECRET, rawSig);
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `hmac ${API_KEY}:${timestamp}:${signature}`,
      'Market': MARKET,
      'Request-ID': crypto.randomUUID(),
    },
    body: bodyStr || undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (!res.ok) {
    const msg = json?.errors?.[0]?.message || json?.message || text || `HTTP ${res.status}`;
    throw new Error(`Lalamove ${method} ${path} failed: ${msg}`);
  }
  return json;
}

function addrToStop(a: DeliveryAddress) {
  const line = [a.street, a.number, a.complement, a.neighborhood, a.city, a.state, a.postal_code]
    .filter(Boolean).join(', ');
  // Lalamove v3 exige coordenadas. Se não houver, lança erro claro.
  if (a.latitude == null || a.longitude == null) {
    throw new Error(`Endereço sem coordenadas (lat/lng): ${line}`);
  }
  return {
    coordinates: { lat: String(a.latitude), lng: String(a.longitude) },
    address: line,
  };
}

// A cotação da Lalamove devolve distância, não duração. Estimamos o tempo de
// rota por uma média de trânsito urbano, mais uma folga de coleta/entrega.
const URBAN_KMH = 22;
const HANDOVER_MINUTES = 8;

function etaFromDistance(meters?: number): number {
  if (!meters || !Number.isFinite(meters) || meters <= 0) return 0;
  return Math.round((meters / 1000 / URBAN_KMH) * 60) + HANDOVER_MINUTES;
}

function contact(a: DeliveryAddress) {
  return {
    name: a.contact_name || 'Cliente',
    phone: a.contact_phone || '+5561000000000',
  };
}

export const lalamoveAdapter: DeliveryAdapter = {
  provider: 'lalamove',

  async quote(req: QuoteRequest): Promise<QuoteResult> {
    const serviceType = req.service_type || DEFAULT_SERVICE_TYPE;
    const body = {
      data: {
        serviceType,
        language: 'pt_BR',
        ...(req.schedule_at ? { scheduleAt: req.schedule_at } : {}),
        stops: [addrToStop(req.pickup), addrToStop(req.dropoff)],
        item: {
          quantity: '1',
          weight: 'LESS_THAN_3_KG',
          categories: ['FOOD_DELIVERY'],
          handlingInstructions: ['KEEP_UPRIGHT'],
        },
      },
    };
    const res = await call('POST', '/v3/quotations', body);
    const d = res?.data ?? {};
    const totalCents = Math.round(parseFloat(d.priceBreakdown?.total ?? '0') * 100);
    const expiresAt = d.expiresAt as string | undefined;
    const distanceMeters = d.distance?.unit === 'm' ? Number(d.distance.value) : undefined;
    return {
      provider: 'lalamove',
      quote_id: d.quotationId,
      fee_cents: totalCents,
      eta_minutes: etaFromDistance(distanceMeters),
      expires_at: expiresAt,
      distance_meters: Number.isFinite(distanceMeters) ? distanceMeters : undefined,
      raw: res,
    };
  },

  async createOrder(req: CreateOrderRequest): Promise<CreateOrderResult> {
    // Uma cotação só vale ~5min e o scheduleAt precisa estar nela desde a
    // cotação — então pedido agendado sempre recota.
    let quotationId = req.schedule_at ? undefined : req.quote_id;
    let stopIds: string[] = [];
    let fee = 0;

    if (!quotationId) {
      const q = await this.quote(req);
      quotationId = q.quote_id;
      fee = q.fee_cents;
      const stops = (q.raw as any)?.data?.stops ?? [];
      stopIds = stops.map((s: any) => s.stopId);
    } else {
      // Recupera stops da cotação existente
      const qRes = await call('GET', `/v3/quotations/${quotationId}`);
      const stops = qRes?.data?.stops ?? [];
      stopIds = stops.map((s: any) => s.stopId);
      fee = Math.round(parseFloat(qRes?.data?.priceBreakdown?.total ?? '0') * 100);
    }

    const body = {
      data: {
        quotationId,
        sender: { stopId: stopIds[0], ...contact(req.pickup) },
        recipients: [
          { stopId: stopIds[1], ...contact(req.dropoff), remarks: req.dropoff.notes || '' },
        ],
        metadata: { externalRef: req.external_reference },
      },
    };
    const res = await call('POST', '/v3/orders', body);
    const d = res?.data ?? {};
    const distanceMeters = d.distance?.unit === 'm' ? Number(d.distance.value) : undefined;
    return {
      provider: 'lalamove',
      order_id: d.orderId,
      status: d.driverId ? 'assigned' : 'requested',
      tracking_url: d.shareLink,
      driver_name: undefined,
      driver_phone: undefined,
      fee_cents: fee,
      eta_minutes: etaFromDistance(distanceMeters),
      raw: res,
    };
  },

  async cancel(providerOrderId: string) {
    try {
      await call('DELETE', `/v3/orders/${providerOrderId}`);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: String((e as Error).message ?? e) };
    }
  },
};

/**
 * Cidades e serviços habilitados no mercado configurado. Os valores de
 * `serviceType` variam por cidade — não assuma MOTORCYCLE no Brasil.
 */
export async function lalamoveCities() {
  const res = await call('GET', '/v3/cities');
  return (res?.data ?? []) as {
    locode: string;
    name: string;
    services: { key: string; description?: string }[];
  }[];
}

export const lalamoveMeta = {
  configured: !!(API_KEY && API_SECRET),
  market: MARKET,
  env: ENV,
  base_url: BASE_URL,
};
