// Sync state for non-temperature Smart Life devices (doors, switches, plugs, exhaust fans).
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
  if (!j.success) throw new Error(`token@${host}: ${JSON.stringify(j)}`);
  return j.result.access_token as string;
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

async function fetchDevice(deviceId: string) {
  const order = [DC, 'us', 'us-e', 'eu', 'eu-w', 'cn', 'in'];
  const seen = new Set<string>();
  let lastErr: any = null;
  for (const dc of order) {
    const host = HOST_MAP[dc];
    if (!host || seen.has(host)) continue;
    seen.add(host);
    try {
      const token = await getToken(host);
      const [info, status] = await Promise.all([
        tuyaGet(host, `/v1.0/devices/${deviceId}`, token),
        tuyaGet(host, `/v1.0/devices/${deviceId}/status`, token),
      ]);
      if (status.success) return { ok: true as const, info: info.result, status: status.result, host, dc };
      lastErr = { host, dc, status };
      if (status.code !== 28841107 && status.code !== 1106 && status.code !== 2007) {
        return { ok: false as const, err: lastErr };
      }
    } catch (e) { lastErr = { dc, err: String(e) }; }
  }
  return { ok: false as const, err: lastErr };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const report: any = { synced: 0, errors: [] as string[] };

  try {
    if (!ACCESS_ID || !ACCESS_SECRET) throw new Error('TUYA secrets ausentes');

    const { data: list, error } = await admin
      .from('smart_devices')
      .select('id, name, tuya_device_id')
      .eq('active', true);
    if (error) throw error;

    for (const d of list ?? []) {
      try {
        const r = await fetchDevice(d.tuya_device_id);
        if (!r.ok) {
          await admin.from('smart_devices').update({ last_online: false }).eq('id', d.id);
          report.errors.push(`${d.name}: ${JSON.stringify(r.err)?.slice(0, 200)}`);
          continue;
        }
        const online = !!r.info?.online;
        const stateObj: Record<string, unknown> = {};
        for (const s of (r.status ?? [])) stateObj[s.code] = s.value;
        await admin.from('smart_devices').update({
          last_online: online,
          last_state: stateObj,
          last_seen_at: new Date().toISOString(),
        }).eq('id', d.id);
        report.synced++;
      } catch (e) {
        report.errors.push(`${d.name}: ${String(e)}`);
      }
    }

    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    report.errors.push(String(e.message ?? e));
    return new Response(JSON.stringify(report), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
