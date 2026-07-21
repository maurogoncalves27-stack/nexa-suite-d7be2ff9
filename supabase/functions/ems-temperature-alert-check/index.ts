// ems-temperature-alert-check
// Roda periodicamente (pg_cron, *10 min) e dispara alertas via WhatsApp quando
// um sensor EMS-A está fora da faixa configurada ou offline há mais de 30 min.
// Auditoria + dedup ficam em public.nutri_temperature_alerts.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { requireCronOrRole } from "../_shared/requireRole.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OFFLINE_THRESHOLD_MIN = 30; // sem leitura há mais que isto = offline
const REPEAT_COOLDOWN_MIN = 180; // 3h entre alertas do mesmo tipo (persistência)
const PERSISTENCE_WINDOW_MIN = 30; // janela para considerar temperatura "persistente"
const PERSISTENCE_MIN_READINGS = 3; // nº mínimo de leituras na janela, todas fora da faixa
const MAX_PROBLEM_ALERTS_PER_DAY = 2; // máx de alertas de problema por sensor/dia
const RECOVERED_DEDUP_MIN = 30; // dedup de mensagens de normalização

// Início do dia local (America/Sao_Paulo) em ISO UTC
function dayStartBRTIso(): string {
  const nowBrt = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  nowBrt.setHours(0, 0, 0, 0);
  // nowBrt agora representa 00:00 BRT como se fosse hora local do runtime.
  // Convertemos de volta para UTC subtraindo o offset BRT (-3h => +3h em UTC).
  const utcMs = nowBrt.getTime() + 3 * 60 * 60 * 1000;
  return new Date(utcMs).toISOString();
}

type Kind = "out_of_range" | "offline" | "recovered";

interface Sensor {
  unique_code: string;
  label: string;
  store_id: string | null;
  min_value: number | null;
  max_value: number | null;
  active: boolean;
}

interface Reading {
  measurement: number;
  measured_at: string;
}

function fmtBR(d: Date) {
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour12: false });
}

function buildMessage(
  kind: Kind,
  sensor: Sensor,
  storeName: string | null,
  reading: Reading | null,
): string {
  const where = storeName ? `${sensor.label} · ${storeName}` : sensor.label;
  if (kind === "out_of_range" && reading) {
    const ageMin = Math.round((Date.now() - new Date(reading.measured_at).getTime()) / 60000);
    return [
      `🚨 ${where}`,
      `Temperatura FORA da faixa: ${reading.measurement.toFixed(1)}°C`,
      `(limites: ${sensor.min_value ?? "-"}°C a ${sensor.max_value ?? "-"}°C)`,
      `Há ${ageMin} min · ${fmtBR(new Date(reading.measured_at))}`,
    ].join("\n");
  }
  if (kind === "offline") {
    const last = reading
      ? `Última leitura: ${reading.measurement.toFixed(1)}°C em ${fmtBR(new Date(reading.measured_at))}`
      : "Nenhuma leitura recebida nas últimas horas.";
    return [`⚠️ ${where}`, `Sensor OFFLINE (sem comunicação).`, last].join("\n");
  }
  // recovered
  const tempStr = reading ? `${reading.measurement.toFixed(1)}°C` : "—";
  return [`✅ ${where}`, `Temperatura NORMALIZADA: ${tempStr}`, `(${fmtBR(new Date())})`].join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireCronOrRole(req, ["admin", "manager", "nutritionist"], corsHeaders);
  if (!auth.ok) return auth.response!;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: sensors, error: sErr } = await supabase
      .from("ems_sensors")
      .select("unique_code, label, store_id, min_value, max_value, active")
      .eq("active", true);
    if (sErr) throw sErr;
    if (!sensors?.length) {
      return new Response(JSON.stringify({ ok: true, checked: 0, message: "Nenhum sensor ativo" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cache de nomes de loja
    const storeIds = Array.from(new Set(sensors.map((s) => s.store_id).filter(Boolean))) as string[];
    const storeNames: Record<string, string> = {};
    if (storeIds.length) {
      const { data: storesData } = await supabase
        .from("stores")
        .select("id, name")
        .in("id", storeIds);
      (storesData ?? []).forEach((s: any) => (storeNames[s.id] = s.name));
    }

    // Destinatários ativos (globais + por loja)
    const { data: recipientsAll } = await supabase
      .from("nutri_temperature_alert_recipients")
      .select("phone, name, store_id, active")
      .eq("active", true);

    const results: Array<Record<string, unknown>> = [];

    for (const sensor of sensors as Sensor[]) {
      // Última leitura
      const { data: lastRows } = await supabase
        .from("ems_sensor_readings")
        .select("measurement, measured_at")
        .eq("sensor_code", sensor.unique_code)
        .order("measured_at", { ascending: false })
        .limit(1);
      const last = (lastRows ?? [])[0] as Reading | undefined;

      const hasLimits = sensor.min_value != null && sensor.max_value != null;
      const ageMin = last ? (Date.now() - new Date(last.measured_at).getTime()) / 60000 : Infinity;

      let kind: Kind | "ok" = "ok";
      if (!last || ageMin > OFFLINE_THRESHOLD_MIN) {
        kind = "offline";
      } else if (
        hasLimits &&
        (last.measurement < Number(sensor.min_value) || last.measurement > Number(sensor.max_value))
      ) {
        kind = "out_of_range";
      }

      // Alerta aberto mais recente
      const { data: openRows } = await supabase
        .from("nutri_temperature_alerts")
        .select("id, kind, triggered_at, resolved_at")
        .eq("sensor_code", sensor.unique_code)
        .is("resolved_at", null)
        .order("triggered_at", { ascending: false })
        .limit(1);
      const openAlert = (openRows ?? [])[0];

      if (kind === "ok") {
        if (openAlert) {
          // Resolver e notificar normalização
          await supabase
            .from("nutri_temperature_alerts")
            .update({ resolved_at: new Date().toISOString() })
            .eq("id", openAlert.id);

          const recipients = (recipientsAll ?? []).filter(
            (r) => !r.store_id || r.store_id === sensor.store_id,
          );
          const storeName = sensor.store_id ? storeNames[sensor.store_id] ?? null : null;
          const message = buildMessage("recovered", sensor, storeName, last ?? null);
          const notified: Array<{ phone: string; name: string; ok: boolean; error?: string }> = [];
          for (const r of recipients) {
            const { data: sendData, error: sendErr } = await supabase.functions.invoke("uazapi-send-text", {
              body: { phone: r.phone, message },
            });
            notified.push({
              phone: r.phone,
              name: r.name,
              ok: !sendErr && (sendData as any)?.ok !== false,
              error: sendErr?.message,
            });
          }
          await supabase.from("nutri_temperature_alerts").insert({
            sensor_code: sensor.unique_code,
            store_id: sensor.store_id,
            kind: "recovered",
            last_temperature: last?.measurement ?? null,
            min_value: sensor.min_value,
            max_value: sensor.max_value,
            measured_at: last?.measured_at ?? null,
            notified_phones: notified,
            resolved_at: new Date().toISOString(),
          });
          results.push({ sensor: sensor.unique_code, kind: "recovered", recipients: notified.length });
        } else {
          results.push({ sensor: sensor.unique_code, kind: "ok" });
        }
        continue;
      }

      // kind = out_of_range ou offline
      // Regra de persistência: exige várias leituras na janela, todas fora da faixa.
      // Se oscilar (ex.: porta aberta), não dispara.
      if (kind === "out_of_range") {
        const sinceIso = new Date(Date.now() - PERSISTENCE_WINDOW_MIN * 60_000).toISOString();
        const { data: recentRows } = await supabase
          .from("ems_sensor_readings")
          .select("measurement, measured_at")
          .eq("sensor_code", sensor.unique_code)
          .gte("measured_at", sinceIso)
          .order("measured_at", { ascending: false });
        const recent = (recentRows ?? []) as Reading[];
        const allOut =
          recent.length >= PERSISTENCE_MIN_READINGS &&
          recent.every(
            (r) =>
              (sensor.min_value != null && Number(r.measurement) < Number(sensor.min_value)) ||
              (sensor.max_value != null && Number(r.measurement) > Number(sensor.max_value)),
          );
        if (!allOut) {
          results.push({ sensor: sensor.unique_code, kind, skipped: "not_persistent", readings: recent.length });
          continue;
        }
      }

      // Cooldown de 3h entre alertas do mesmo tipo
      let shouldSend = true;
      if (openAlert && openAlert.kind === kind) {
        const ageMinAlert = (Date.now() - new Date(openAlert.triggered_at).getTime()) / 60000;
        if (ageMinAlert < REPEAT_COOLDOWN_MIN) shouldSend = false;
      }

      // Limite de alertas de problema por dia (por sensor)
      if (shouldSend) {
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        const { count: todayCount } = await supabase
          .from("nutri_temperature_alerts")
          .select("id", { count: "exact", head: true })
          .eq("sensor_code", sensor.unique_code)
          .in("kind", ["out_of_range", "offline"])
          .gte("triggered_at", dayStart.toISOString());
        if ((todayCount ?? 0) >= MAX_PROBLEM_ALERTS_PER_DAY) {
          shouldSend = false;
          results.push({ sensor: sensor.unique_code, kind, skipped: "daily_cap", today: todayCount });
          continue;
        }
      }

      if (!shouldSend) {
        results.push({ sensor: sensor.unique_code, kind, skipped: "cooldown" });
        continue;
      }

      // Se mudou de kind, fecha o anterior
      if (openAlert && openAlert.kind !== kind) {
        await supabase
          .from("nutri_temperature_alerts")
          .update({ resolved_at: new Date().toISOString() })
          .eq("id", openAlert.id);
      }

      const recipients = (recipientsAll ?? []).filter(
        (r) => !r.store_id || r.store_id === sensor.store_id,
      );
      const storeName = sensor.store_id ? storeNames[sensor.store_id] ?? null : null;
      const message = buildMessage(kind, sensor, storeName, last ?? null);
      const notified: Array<{ phone: string; name: string; ok: boolean; error?: string }> = [];
      for (const r of recipients) {
        const { data: sendData, error: sendErr } = await supabase.functions.invoke("uazapi-send-text", {
          body: { phone: r.phone, message },
        });
        notified.push({
          phone: r.phone,
          name: r.name,
          ok: !sendErr && (sendData as any)?.ok !== false,
          error: sendErr?.message,
        });
      }

      await supabase.from("nutri_temperature_alerts").insert({
        sensor_code: sensor.unique_code,
        store_id: sensor.store_id,
        kind,
        last_temperature: last?.measurement ?? null,
        min_value: sensor.min_value,
        max_value: sensor.max_value,
        measured_at: last?.measured_at ?? null,
        notified_phones: notified,
      });

      results.push({ sensor: sensor.unique_code, kind, recipients: notified.length });
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ems-temperature-alert-check error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
