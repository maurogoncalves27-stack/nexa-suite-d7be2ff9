// Tipos comuns para adapters de entrega (Lalamove, Uber Direct, Mock).
export interface DeliveryAddress {
  street: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city: string;
  state: string;
  postal_code: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  contact_name?: string;
  contact_phone?: string;
  notes?: string;
}

export interface QuoteRequest {
  pickup: DeliveryAddress;
  dropoff: DeliveryAddress;
  service_type?: string; // MOTORCYCLE
  order_value_cents?: number;
}

export interface QuoteResult {
  provider: 'lalamove' | 'uber_direct' | 'mock';
  quote_id: string;
  fee_cents: number;
  eta_minutes: number;
  expires_at?: string;
  raw: unknown;
}

export interface CreateOrderRequest extends QuoteRequest {
  quote_id?: string;
  external_reference: string; // pdv_orders.id
}

export interface CreateOrderResult {
  provider: 'lalamove' | 'uber_direct' | 'mock';
  order_id: string;
  status: 'requested' | 'assigned' | 'failed';
  tracking_url?: string;
  driver_name?: string;
  driver_phone?: string;
  fee_cents: number;
  eta_minutes?: number;
  raw: unknown;
}

export interface DeliveryAdapter {
  provider: 'lalamove' | 'uber_direct' | 'mock';
  quote(req: QuoteRequest): Promise<QuoteResult>;
  createOrder(req: CreateOrderRequest): Promise<CreateOrderResult>;
  cancel(providerOrderId: string): Promise<{ ok: boolean; message?: string }>;
}
