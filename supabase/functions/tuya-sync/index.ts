// Runs every 5 min via pg_cron. Pulls latest status from Tuya for all mapped equipment,
// writes to nutri_temperature_readings, updates last_* on nutri_equipment,
// creates nutri_temperature_alerts when out of range for > alert_delay_minutes.
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

// Try all data centers to find where the device lives. Fetches both /status and
// shadow properties (which include per-DP timestamps used to detect stale sensors).
async function fetchDeviceStatus(deviceId: string) {
  const dcOrder = [DC, 'us', 'us-e', 'eu', 'eu-w', 'cn', 'in'];
  const seen = new Set<string>();
  let lastErr: any = null;
  for (const dcKey of dcOrder) {
    const host = HOST_MAP[dcKey];
    if (!host || seen.has(host)) continue;
    seen.add(host);
    try {
      const token = await getToken(host);
      const res = await tuyaGet(host, `/v1.0/devices/${deviceId}/status`, token);
      if (res.success) {
        // Best-effort: also grab per-DP timestamps from shadow properties.
        let properties: Array<{ code: string; value: unknown; time?: number }> = [];
        try {
          const shadow = await tuyaGet(host, `/v2.0/cloud/thing/${deviceId}/shadow/properties`, token);
          if (shadow?.success && Array.isArray(shadow.result?.properties)) {
            properties = shadow.result.properties;
          }
        } catch (_) { /* ignore */ }
        return { ok: true as const, result: res.result, properties, host, dc: dcKey };
      }
      lastErr = { host, dc: dcKey, res };
      // If it's not a DC-permission error, don't keep trying
      if (res.code !== 28841107 && res.code !== 1106 && res.code !== 2007) {
        return { ok: false as const, err: lastErr };
      }
    } catch (e) {
      lastErr = { host, dc: dcKey, err: String(e) };
    }
  }
  return { ok: false as const, err: lastErr };
}


const TEMP_CODES = new Set(['va_temperature', 'temp_current', 'temperature', 'cur_temperature']);
const HUM_CODES = new Set(['va_humidity', 'humidity_value', 'humidity', 'cur_humidity']);
const BATT_CODES = new Set(['battery_percentage', 'battery_value', 'battery', 'residual_electricity', 'va_battery']);

function extractTempHumidity(
  status: Array<{ code: string; value: unknown }>,
  properties: Array<{ code: string; value: unknown; time?: number }> = [],
) {
  let temp: number | null = null;
  let hum: number | null = null;
  let batt: number | null = null;
  for (const s of status) {
    const code = s.code.toLowerCase();
    if (temp === null && TEMP_CODES.has(code)) {
      temp = Number(s.value) / 10; // Tuya returns °C * 10 for most sensors
    }
    if (hum === null && HUM_CODES.has(code)) {
      hum = Number(s.value);
    }
    if (batt === null && BATT_CODES.has(code)) {
      const n = Number(s.value);
      if (!Number.isNaN(n)) batt = n > 100 ? Math.round(n / 10) : Math.round(n);
    }
    if (batt === null && code === 'battery_state') {
      const v = String(s.value).toLowerCase();
      batt = v === 'high' ? 90 : v === 'middle' ? 50 : v === 'low' ? 15 : null;
    }
  }
  // Timestamp of the last real temperature update (ms). null if unknown.
  let tempTime: number | null = null;
  for (const p of properties) {
    const code = String(p.code ?? '').toLowerCase();
    if (TEMP_CODES.has(code) && typeof p.time === 'number') {
      tempTime = p.time;
      break;
    }
  }
  return { temp, hum, batt, tempTime };
}

// Consider a Tuya sensor offline when the temperature DP hasn't been updated
// for this many minutes (Smart Life keeps showing cached values even when the
// device is powered off, so we must derive freshness from the DP timestamp).
const STALE_MINUTES = 30;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const report: any = { synced: 0, alerts: 0, offline: 0, errors: [] as string[] };

  try {
    if (!ACCESS_ID || !ACCESS_SECRET) throw new Error('TUYA secrets ausentes');

    const { data: equipList, error } = await admin
      .from('nutri_equipment')
      .select('id, name, store_id, tuya_device_id, min_temp_c, max_temp_c, max_humidity_pct, alert_delay_minutes, out_of_range_since, tuya_active, last_online')
      .not('tuya_device_id', 'is', null)
      .eq('tuya_active', true);
    if (error) throw error;
    if (!equipList?.length) {
      return new Response(JSON.stringify({ ...report, note: 'nenhum sensor Tuya cadastrado' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    for (const eq of equipList) {
      try {
        const statusRes = await fetchDeviceStatus(eq.tuya_device_id);
        if (!statusRes.ok) {
          report.errors.push(`${eq.name}: ${JSON.stringify(statusRes.err)}`);
          continue;
        }
        const { temp, hum, batt, tempTime } = extractTempHumidity(statusRes.result ?? [], statusRes.properties ?? []);
        if (temp === null) {
          report.errors.push(`${eq.name}: leitura sem temperatura (dc=${statusRes.dc})`);
          continue;
        }

        const now = new Date().toISOString();
        const nowMs = Date.now();
        const staleMs = STALE_MINUTES * 60 * 1000;
        const isStale = tempTime !== null && (nowMs - tempTime) > staleMs;

        if (isStale) {
          // Device is reporting cached values (typical when batteries are pulled
          // but the gateway still lists it as online). Mark offline and do not
          // record a fake reading nor trigger out-of-range alerts.
          const staleMins = Math.round((nowMs - (tempTime as number)) / 60000);
          await admin.from('nutri_equipment').update({
            last_online: false,
            out_of_range_since: null,
          }).eq('id', eq.id);
          report.offline++;
          report.errors.push(`${eq.name}: sem atualização Tuya há ${staleMins} min → offline`);
          continue;
        }

        // Insert reading
        await admin.from('nutri_temperature_readings').insert({
          equipment_id: eq.id,
          store_id: eq.store_id,
          temperature: temp,
          humidity: hum,
          recorded_at: now,
          date: now.slice(0, 10),
          note: 'Leitura automática Tuya',
          source: 'tuya',
        });

        const outOfRange =
          (eq.min_temp_c !== null && temp < Number(eq.min_temp_c)) ||
          (eq.max_temp_c !== null && temp > Number(eq.max_temp_c)) ||
          (eq.max_humidity_pct !== null && hum !== null && hum > Number(eq.max_humidity_pct));

        const patch: any = {
          last_reading_at: now,
          last_temp_c: temp,
          last_humidity_pct: hum,
          last_online: true,
        };
        if (batt !== null) patch.last_battery_pct = batt;

        if (outOfRange) {
          if (!eq.out_of_range_since) {
            patch.out_of_range_since = now;
          } else {
            const minsOut = (Date.now() - new Date(eq.out_of_range_since).getTime()) / 60000;
            if (minsOut >= (eq.alert_delay_minutes ?? 15)) {
              // Dedup: don't create if there's an unresolved alert today
              const today = now.slice(0, 10);
              const { data: existing } = await admin
                .from('nutri_temperature_alerts')
                .select('id')
                .eq('sensor_code', eq.tuya_device_id)
                .is('resolved_at', null)
                .gte('triggered_at', `${today}T00:00:00Z`)
                .maybeSingle();
              if (!existing) {
                // Fetch recipients for this store
                const { data: recs } = await admin
                  .from('nutri_temperature_alert_recipients')
                  .select('phone, name')
                  .eq('store_id', eq.store_id)
                  .eq('active', true);
                const phones = (recs ?? []).map((r) => r.phone);

                await admin.from('nutri_temperature_alerts').insert({
                  sensor_code: eq.tuya_device_id,
                  store_id: eq.store_id,
                  kind: 'out_of_range',
                  last_temperature: temp,
                  min_value: eq.min_temp_c,
                  max_value: eq.max_temp_c,
                  measured_at: now,
                  notified_phones: phones,
                  notes: `${eq.name}: ${temp}°C fora da faixa (${eq.min_temp_c}~${eq.max_temp_c}°C) há ${Math.round(minsOut)} min`,
                });
                report.alerts++;

                // Fire WhatsApp
                for (const r of recs ?? []) {
                  try {
                    await admin.functions.invoke('uazapi-send-text', {
                      body: {
                        phone: r.phone,
                        text: `🚨 *Alerta de temperatura*\n\n${eq.name}\nTemperatura: *${temp}°C* (faixa ${eq.min_temp_c}~${eq.max_temp_c}°C)\nFora da faixa há ${Math.round(minsOut)} min.`,
                      },
                    });
                  } catch (e) { report.errors.push(`whatsapp ${r.phone}: ${e}`); }
                }
              }
            }
          }
        } else {
          patch.out_of_range_since = null;
        }

        await admin.from('nutri_equipment').update(patch).eq('id', eq.id);
        report.synced++;
      } catch (e) {
        report.errors.push(`${eq.name}: ${String(e)}`);
      }
    }

    // Offline check: any Tuya equipment without reading in 30 min
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: stale } = await admin
      .from('nutri_equipment')
      .select('id, name, store_id, last_online')
      .not('tuya_device_id', 'is', null)
      .eq('tuya_active', true)
      .lt('last_reading_at', cutoff)
      .eq('last_online', true);
    for (const s of stale ?? []) {
      await admin.from('nutri_equipment').update({ last_online: false }).eq('id', s.id);
      report.offline++;
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
