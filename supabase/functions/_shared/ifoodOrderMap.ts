// Helpers para mapear dados do pedido iFood (Merchant API) para o schema local pdv_orders.
//
// Ajuste SINIEF nº 9/26 (vigência 03/08/2026): para NFC-e (modelo 65) em operações
// NÃO PRESENCIAIS — incluindo TAKEOUT (retirada) — é obrigatório o endereço do cliente.
// A iFood passou a preencher `customer.billingAddress` nos pedidos TAKEOUT. Este helper
// extrai o endereço do pedido priorizando billingAddress (novo) e caindo para
// delivery.deliveryAddress (DELIVERY) quando não houver.

export interface IfoodAddressRaw {
  streetName?: string;
  streetNumber?: string | number;
  complement?: string;
  district?: string; // bairro
  city?: string;
  state?: string;
  country?: string;
  zipCode?: string | number;
  latitude?: number;
  longitude?: number;
  postalCode?: string; // fallback usado em algumas versões
  formattedAddress?: string;
  reference?: string;
}

export interface NormalizedAddress {
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  zip_code: string | null;
  latitude: number | null;
  longitude: number | null;
  source: "billingAddress" | "deliveryAddress" | null;
}

function onlyDigits(v: unknown): string {
  return String(v ?? "").replace(/\D+/g, "");
}

export function normalizeIfoodAddress(raw: IfoodAddressRaw | null | undefined, source: NormalizedAddress["source"]): NormalizedAddress | null {
  if (!raw || typeof raw !== "object") return null;
  const street = raw.streetName ?? null;
  const city = raw.city ?? null;
  if (!street && !city) return null; // endereço inútil
  return {
    street,
    number: raw.streetNumber != null ? String(raw.streetNumber) : null,
    complement: raw.complement ?? null,
    neighborhood: raw.district ?? null,
    city,
    state: raw.state ?? null,
    country: raw.country ?? null,
    zip_code: onlyDigits(raw.zipCode ?? raw.postalCode ?? "") || null,
    latitude: typeof raw.latitude === "number" ? raw.latitude : null,
    longitude: typeof raw.longitude === "number" ? raw.longitude : null,
    source,
  };
}

/**
 * Extrai o endereço do cliente a partir do payload de detalhe do pedido iFood.
 *
 * Regra:
 * 1. `customer.billingAddress` (preferencial — obrigatório para TAKEOUT desde SINIEF 9/26)
 * 2. `delivery.deliveryAddress` (fallback — usado nos pedidos DELIVERY)
 */
export function extractIfoodCustomerAddress(orderDetails: any): NormalizedAddress | null {
  const billing = orderDetails?.customer?.billingAddress;
  const fromBilling = normalizeIfoodAddress(billing, "billingAddress");
  if (fromBilling) return fromBilling;
  const delivery = orderDetails?.delivery?.deliveryAddress;
  return normalizeIfoodAddress(delivery, "deliveryAddress");
}

/**
 * CPF/CNPJ do cliente iFood, quando fornecido para fins fiscais.
 */
export function extractIfoodCustomerDocument(orderDetails: any): string | null {
  const cust = orderDetails?.customer ?? {};
  const doc =
    cust?.taxPayerIdentification ??
    cust?.documentNumber ??
    cust?.document ??
    null;
  const digits = onlyDigits(doc);
  if (digits.length === 11 || digits.length === 14) return digits;
  return null;
}
