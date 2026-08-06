// geocode-address — resolve CEP/endereço brasileiro em coordenadas.
// Público (anon): usado pelo checkout do site /pedir para montar o dropoff da
// cotação de frete. Lalamove v3 exige lat/lng em todos os stops.
//
// Body: { postal_code?, street?, number?, complement?, neighborhood?, city?, state? }
// Resp: { ok, address: DeliveryAddress, precision, sources }
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const USER_AGENT = 'NexaSuite/1.0 (+https://nexasuite.aquelaparme.com.br)';
const GMAPS_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? '';

type AddressInput = {
  postal_code?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
};

type Resolved = {
  street: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  latitude?: number;
  longitude?: number;
  geo_precision?: Precision;
};

// 'rooftop' = número casado; 'street' = via sem número; 'postal_code' =
// centróide do CEP; 'city' = só cidade — impreciso demais para uma entrega.
type Precision = 'rooftop' | 'street' | 'postal_code' | 'city';

function onlyDigits(v: string | undefined) {
  return (v ?? '').replace(/\D/g, '');
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
}

async function fetchJson(url: string, timeoutMs = 6000): Promise<any | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: ctl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// BrasilAPI v2 devolve endereço + coordenadas do CEP numa chamada só.
async function lookupBrasilApi(cep: string) {
  const j = await fetchJson(`https://brasilapi.com.br/api/cep/v2/${cep}`);
  if (!j?.city) return null;
  return {
    street: String(j.street ?? ''),
    neighborhood: String(j.neighborhood ?? ''),
    city: String(j.city ?? ''),
    state: String(j.state ?? ''),
    latitude: num(j?.location?.coordinates?.latitude),
    longitude: num(j?.location?.coordinates?.longitude),
  };
}

async function lookupViaCep(cep: string) {
  const j = await fetchJson(`https://viacep.com.br/ws/${cep}/json/`);
  if (!j || j.erro) return null;
  return {
    street: String(j.logradouro ?? ''),
    neighborhood: String(j.bairro ?? ''),
    city: String(j.localidade ?? ''),
    state: String(j.uf ?? ''),
    latitude: undefined as number | undefined,
    longitude: undefined as number | undefined,
  };
}

// Nominatim (OSM) como alternativa gratuita. Cobre mal endereço brasileiro
// (sobretudo o padrão de quadras de Brasília), então serve só de reserva.
async function geocodeNominatim(q: Record<string, string>) {
  const params = new URLSearchParams({ format: 'jsonv2', limit: '1', countrycodes: 'br', ...q });
  const j = await fetchJson(`https://nominatim.openstreetmap.org/search?${params}`, 8000);
  if (!Array.isArray(j) || j.length === 0) return null;
  const lat = num(j[0]?.lat);
  const lon = num(j[0]?.lon);
  if (lat == null || lon == null) return null;
  return { latitude: lat, longitude: lon };
}

/**
 * Google Geocoding — melhor cobertura de endereço brasileiro. É a fonte
 * primária quando GOOGLE_MAPS_API_KEY está configurada.
 */
async function geocodeGoogle(address: string, cep: string) {
  if (!GMAPS_KEY) return null;
  const params = new URLSearchParams({
    address,
    key: GMAPS_KEY,
    region: 'br',
    language: 'pt-BR',
    components: cep ? `country:BR|postal_code:${cep}` : 'country:BR',
  });
  const j = await fetchJson(`https://maps.googleapis.com/maps/api/geocode/json?${params}`, 8000);
  if (j?.status !== 'OK' || !Array.isArray(j.results) || j.results.length === 0) {
    if (j?.status && j.status !== 'ZERO_RESULTS') {
      console.warn('[geocode-address] google status', j.status, j.error_message ?? '');
    }
    return null;
  }
  const top = j.results[0];
  const lat = num(top?.geometry?.location?.lat);
  const lng = num(top?.geometry?.location?.lng);
  if (lat == null || lng == null) return null;

  const locType = String(top?.geometry?.location_type ?? '');
  const types: string[] = Array.isArray(top?.types) ? top.types : [];
  let precision: Precision;
  if (locType === 'ROOFTOP' || locType === 'RANGE_INTERPOLATED') precision = 'rooftop';
  else if (locType === 'GEOMETRIC_CENTER') precision = 'street';
  else if (types.includes('postal_code')) precision = 'postal_code';
  else precision = 'city';

  return { latitude: lat, longitude: lng, precision };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as AddressInput;
    const cep = onlyDigits(body.postal_code);
    const sources: string[] = [];

    let base = {
      street: String(body.street ?? '').trim(),
      neighborhood: String(body.neighborhood ?? '').trim(),
      city: String(body.city ?? '').trim(),
      state: String(body.state ?? '').trim().toUpperCase(),
      latitude: undefined as number | undefined,
      longitude: undefined as number | undefined,
    };

    if (cep.length === 8) {
      const viaBrasil = await lookupBrasilApi(cep);
      const cepData = viaBrasil ?? (await lookupViaCep(cep));
      if (viaBrasil) sources.push('brasilapi');
      else if (cepData) sources.push('viacep');

      if (cepData) {
        // Dados do CEP são a fonte de verdade para cidade/UF; o que o cliente
        // digitou só preenche o que o CEP não trouxe (ex: rua sem logradouro).
        base = {
          street: cepData.street || base.street,
          neighborhood: cepData.neighborhood || base.neighborhood,
          city: cepData.city || base.city,
          state: cepData.state || base.state,
          latitude: cepData.latitude,
          longitude: cepData.longitude,
        };
      }
    }

    if (!base.city || !base.state) {
      return json({ error: 'address_not_resolved', detail: 'CEP inválido ou cidade/UF ausentes' }, 422);
    }

    // Coordenada que veio junto do CEP: ponto de partida, nunca o ideal.
    let precision: Precision = base.latitude != null ? 'postal_code' : 'city';
    const houseNumber = String(body.number ?? '').trim();

    const fullAddress = [
      [base.street, houseNumber].filter(Boolean).join(', '),
      base.neighborhood,
      `${base.city} - ${base.state}`,
      cep.length === 8 ? cep : '',
      'Brasil',
    ]
      .filter(Boolean)
      .join(', ');

    const google = await geocodeGoogle(fullAddress, cep);
    if (google) {
      base.latitude = google.latitude;
      base.longitude = google.longitude;
      precision = google.precision;
      sources.push('google');
    } else if (base.street) {
      const refined = await geocodeNominatim({
        street: houseNumber ? `${houseNumber} ${base.street}` : base.street,
        city: base.city,
        state: base.state,
        ...(cep.length === 8 ? { postalcode: cep } : {}),
      });
      if (refined) {
        base.latitude = refined.latitude;
        base.longitude = refined.longitude;
        precision = houseNumber ? 'rooftop' : 'street';
        sources.push('nominatim');
      }
    }

    // Último recurso: centróide da cidade. Serve para exibir algo, mas é
    // marcado como impreciso e o checkout recusa entregar nele.
    if (base.latitude == null || base.longitude == null) {
      const city = await geocodeNominatim({ city: base.city, state: base.state });
      if (city) {
        base.latitude = city.latitude;
        base.longitude = city.longitude;
        precision = 'city';
        sources.push('nominatim');
      }
    }

    if (base.latitude == null || base.longitude == null) {
      return json({ error: 'geocode_failed', detail: 'Não foi possível obter coordenadas do endereço' }, 422);
    }

    const address: Resolved = {
      street: base.street,
      number: houseNumber || undefined,
      complement: String(body.complement ?? '').trim() || undefined,
      neighborhood: base.neighborhood || undefined,
      city: base.city,
      state: base.state,
      postal_code: cep,
      country: 'BR',
      latitude: base.latitude,
      longitude: base.longitude,
      geo_precision: precision,
    };

    // Coordenada de cidade colocaria o entregador a quilômetros do destino.
    return json({ ok: true, address, precision, precise: precision !== 'city', sources });
  } catch (e) {
    console.error('[geocode-address] error', e);
    return json({ error: String(e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
