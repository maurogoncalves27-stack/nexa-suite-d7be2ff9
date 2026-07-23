// Send a switch/plug on/off command to a Tuya device.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createHmac } from 'node:crypto';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ACCESS_ID = Deno.env.get('TUYA_ACCESS_ID') ?? '';
const ACCESS_SECRET = Deno.env.get('TUYA_ACCESS_SECRET') ?? '';
const DC = (Deno.env.get('TUYA_DATA_CENTER') ?? 'us').toLowerCase();

const HOST_MAP: Record<string, string> = {
  us: 'https://openapi.tuyaus.com',
  'us-e': 'https://openapi-ueaz.tuyaus.com',
  eu: 'https://openapi.tuyaeu.com',
  'eu-w': 'https://openapi-weaz.tuyaeu.com',
  cn: 'https://openapi.tuyacn.com',
  in: 'https://openapi.tuyain.com',
  sg: 'https://openapi.tuyaus.com',
};

const sha256 = (s: string) => createHmac('sha256', ACCESS_SECRET).update(s).digest('hex').toUpperCase();
const sha256hex = async (s: string) => {
  const buf = new TextEncoder().encode(s);
  const h = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

async function getToken(host: string): Promise<string> {
  const t = Date.now().toString();
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const path = '/v1.0/token?grant_type=1';
  const contentHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const stringToSign = `GET\n${contentHash}\n\n${path}`;
  const res = await fetch(host + path, {
    headers: {
      client_id: ACCESS_ID,
      sign: sha256(ACCESS_ID + t + nonce + stringToSign),
      t, sign_method: 'HMAC-SHA256', nonce,
    },
  });
  const j = await res.json();
  if (!j.success) throw new Error(`token: ${JSON.stringify(j)}`);
  return j.result.access_token as string;
}

async function tuyaPost(host: string, path: string, token: string, body: unknown) {
  const t = Date.now().toString();
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const bodyStr = JSON.stringify(body);
  const contentHash = await sha256hex(bodyStr);
  const stringToSign = `POST\n${contentHash}\n\n${path}`;
  const res = await fetch(host + path, {
    method: 'POST',
    headers: {
      client_id: ACCESS_ID, access_token: token,
      sign: sha256(ACCESS_ID + token + t + nonce + stringToSign),
      t, sign_method: 'HMAC-SHA256', nonce,
      'Content-Type': 'application/json',
    },
    body: bodyStr,
  });
  return res.json();
}

async function tuyaGet(host: string, path: string, token: string) {
  const t = Date.now().toString();
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const contentHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const stringToSign = `GET\n${contentHash}\n\n${path}`;
  const res = await fetch(host + path, {
    headers: {
      client_id: ACCESS_ID, access_token: token,
      sign: sha256(ACCESS_ID + token + t + nonce + stringToSign),
      t, sign_method: 'HMAC-SHA256', nonce,
    },
  });
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!ACCESS_ID || !ACCESS_SECRET) throw new Error('TUYA secrets ausentes');
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Não autenticado');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) throw new Error('Sessão inválida');

    const { device_id, value, code } = await req.json();
    if (!device_id || typeof value !== 'boolean') throw new Error('device_id e value (bool) obrigatórios');

    const order = [DC, 'us', 'us-e', 'eu', 'eu-w', 'cn', 'in'];
    const seen = new Set<string>();
    let lastErr: any = null;
    for (const dc of order) {
      const host = HOST_MAP[dc];
      if (!host || seen.has(host)) continue;
      seen.add(host);
      try {
        const token = await getToken(host);
        // Discover switch code if not provided
        let switchCode = code as string | undefined;
        if (!switchCode) {
          const status = await tuyaGet(host, `/v1.0/devices/${device_id}/status`, token);
          if (status.success) {
            const first = (status.result ?? []).find((s: any) => /^switch/i.test(s.code));
            switchCode = first?.code ?? 'switch_1';
          }
        }
        const body = { commands: [{ code: switchCode ?? 'switch_1', value }] };
        const r = await tuyaPost(host, `/v1.0/devices/${device_id}/commands`, token, body);
        if (r.success) {
          return new Response(JSON.stringify({ ok: true, host, dc, code: switchCode, value }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        lastErr = { host, dc, r };
        if (r.code !== 28841107 && r.code !== 1106 && r.code !== 2007) break;
      } catch (e) { lastErr = { dc, err: String(e) }; }
    }

    return new Response(JSON.stringify({ ok: false, err: lastErr }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e.message ?? e) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
