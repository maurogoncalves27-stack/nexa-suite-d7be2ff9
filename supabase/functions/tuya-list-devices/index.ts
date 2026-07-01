// Lists Tuya devices from the linked Cloud Project so the UI can bind each to an equipment/store.
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
const HOST = HOST_MAP[DC] ?? HOST_MAP.us;

function sign(str: string) {
  return createHmac('sha256', ACCESS_SECRET).update(str).digest('hex').toUpperCase();
}

async function getToken(): Promise<string> {
  const t = Date.now().toString();
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const method = 'GET';
  const path = '/v1.0/token?grant_type=1';
  const contentHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const stringToSign = `${method}\n${contentHash}\n\n${path}`;
  const signStr = ACCESS_ID + t + nonce + stringToSign;
  const res = await fetch(HOST + path, {
    headers: {
      client_id: ACCESS_ID,
      sign: sign(signStr),
      t,
      sign_method: 'HMAC-SHA256',
      nonce,
      'Content-Type': 'application/json',
    },
  });
  const j = await res.json();
  if (!j.success) throw new Error(`Tuya token error: ${JSON.stringify(j)}`);
  return j.result.access_token as string;
}

async function tuyaGet(path: string, token: string) {
  const t = Date.now().toString();
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const contentHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const stringToSign = `GET\n${contentHash}\n\n${path}`;
  const signStr = ACCESS_ID + token + t + nonce + stringToSign;
  const res = await fetch(HOST + path, {
    headers: {
      client_id: ACCESS_ID,
      access_token: token,
      sign: sign(signStr),
      t,
      sign_method: 'HMAC-SHA256',
      nonce,
    },
  });
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!ACCESS_ID || !ACCESS_SECRET) {
      throw new Error('TUYA_ACCESS_ID / TUYA_ACCESS_SECRET não configurados');
    }

    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Não autenticado');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) throw new Error('Sessão inválida');

    const token = await getToken();

    // Get UID linked to this cloud project
    const projRes = await tuyaGet(`/v1.3/iot-03/users?page_no=1&page_size=100`, token);
    if (!projRes.success) throw new Error(`users list error: ${JSON.stringify(projRes)}`);
    const users = projRes.result?.list ?? [];

    // Collect devices for each app-linked user
    const all: any[] = [];
    for (const u of users) {
      const uid = u.uid;
      const dRes = await tuyaGet(`/v1.0/users/${uid}/devices`, token);
      if (dRes.success && Array.isArray(dRes.result)) {
        for (const d of dRes.result) {
          all.push({
            device_id: d.id,
            name: d.name,
            category: d.category,
            product_name: d.product_name,
            online: d.online,
            uid,
          });
        }
      }
    }

    return new Response(JSON.stringify({ devices: all, host: HOST, dc: DC }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message ?? e) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
