// Webhook chamado pelo Netwatch/Scheduler do Mikrotik quando a WAN principal
// cai/volta, ou como heartbeat periódico. Grava evento, atualiza status do
// device e dispara notificação in-app + WhatsApp para responsáveis.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const UAZAPI_BASE_URL = (Deno.env.get("UAZAPI_BASE_URL") || "").replace(/\/+$/, "");
const UAZAPI_TOKEN = Deno.env.get("UAZAPI_INSTANCE_TOKEN") || "";

function normalizePhone(raw: string): string | null {
  const d = (raw || "").replace(/\D+/g, "");
  if (!d) return null;
  if (d.startsWith("55") && d.length >= 12) return d;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
}

async function sendWhatsapp(phone: string, message: string) {
  if (!UAZAPI_BASE_URL || !UAZAPI_TOKEN) return { ok: false, reason: "uazapi-missing" };
  const to = normalizePhone(phone);
  if (!to) return { ok: false, reason: "invalid-phone" };
  try {
    const res = await fetch(`${UAZAPI_BASE_URL}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: UAZAPI_TOKEN },
      body: JSON.stringify({ number: to, text: message }),
    });
    await res.text();
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Aceita token via body OR query OR header
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({} as any));
    const token = (body?.token || url.searchParams.get("token") || req.headers.get("x-device-token") || "").toString().trim();
    const eventRaw = (body?.event || url.searchParams.get("event") || "info").toString().trim().toLowerCase();
    const publicIp = (body?.public_ip || body?.ip || url.searchParams.get("ip") || null) as string | null;
    const wanActive = (body?.wan || body?.wan_active || null) as string | null;

    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: "token ausente" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: device, error: devErr } = await admin
      .from("network_devices")
      .select("id, store_id, name, current_status, last_event_at, flap_debounce_seconds, wan_primary_label, wan_secondary_label, is_active")
      .eq("webhook_token", token)
      .maybeSingle();

    if (devErr || !device) {
      return new Response(JSON.stringify({ ok: false, error: "device not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!device.is_active) {
      return new Response(JSON.stringify({ ok: true, ignored: "device inactive" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch store name
    const { data: store } = await admin.from("stores").select("name").eq("id", device.store_id).maybeSingle();
    const storeName = store?.name || "Loja";

    // Normalize event
    let normalized: string = eventRaw;
    if (["down", "wan-down", "wan_down", "wan1_down", "primary_down"].includes(eventRaw)) normalized = "wan_down";
    else if (["up", "wan-up", "wan_up", "wan1_up", "primary_up", "recovery"].includes(eventRaw)) normalized = "wan_up";
    else if (["heartbeat", "ping", "hb"].includes(eventRaw)) normalized = "heartbeat_ok";

    const now = new Date();

    // Debounce for down/up: ignore if last event was of same nature very recently
    let suppressed = false;
    let suppressReason: string | null = null;
    if ((normalized === "wan_down" || normalized === "wan_up") && device.last_event_at) {
      const last = new Date(device.last_event_at as string).getTime();
      const debounceMs = (device.flap_debounce_seconds || 60) * 1000;
      // ignora se veio um evento do MESMO tipo antes do debounce
      const { data: recent } = await admin
        .from("network_wan_events")
        .select("event_type, created_at")
        .eq("device_id", device.id)
        .order("created_at", { ascending: false })
        .limit(1);
      const lastType = recent?.[0]?.event_type;
      if (lastType === normalized && now.getTime() - last < debounceMs) {
        suppressed = true;
        suppressReason = "debounce";
      }
    }

    // Compute duration for wan_up (time since last wan_down)
    let durationSeconds: number | null = null;
    if (normalized === "wan_up") {
      const { data: lastDown } = await admin
        .from("network_wan_events")
        .select("created_at")
        .eq("device_id", device.id)
        .eq("event_type", "wan_down")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastDown?.created_at) {
        durationSeconds = Math.floor((now.getTime() - new Date(lastDown.created_at as string).getTime()) / 1000);
      }
    }

    // Insert event
    await admin.from("network_wan_events").insert({
      device_id: device.id,
      store_id: device.store_id,
      event_type: normalized,
      wan_active: wanActive,
      public_ip: publicIp,
      duration_seconds: durationSeconds,
      payload: body,
      suppressed,
      suppress_reason: suppressReason,
    });

    // Update device status
    const updates: Record<string, unknown> = { last_event_at: now.toISOString() };
    if (publicIp) updates.last_public_ip = publicIp;
    if (normalized === "wan_down") updates.current_status = "online_secondary";
    else if (normalized === "wan_up") updates.current_status = "online_primary";
    else if (normalized === "heartbeat_ok") {
      updates.last_heartbeat_at = now.toISOString();
      if (device.current_status === "offline" || device.current_status === "unknown") {
        updates.current_status = "online_primary";
      }
    }
    await admin.from("network_devices").update(updates).eq("id", device.id);

    // Fire alerts (skip if suppressed)
    if (!suppressed && (normalized === "wan_down" || normalized === "wan_up")) {
      const isDown = normalized === "wan_down";
      const title = isDown
        ? `⚠️ ${storeName}: internet principal caiu`
        : `✅ ${storeName}: internet principal voltou`;
      const dur = durationSeconds
        ? ` (duração: ${Math.floor(durationSeconds / 60)}min${durationSeconds % 60 ? ` ${durationSeconds % 60}s` : ""})`
        : "";
      const message = isDown
        ? `A WAN principal (${device.wan_primary_label}) do Mikrotik "${device.name}" caiu. Roteador operando via ${device.wan_secondary_label}.`
        : `A WAN principal (${device.wan_primary_label}) do Mikrotik "${device.name}" voltou${dur}. Operação normalizada.`;

      // 1) in-app notifications: admins + managers
      const { data: roles } = await admin
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["admin", "manager"]);
      const userIds = Array.from(new Set((roles || []).map((r: any) => r.user_id)));
      if (userIds.length) {
        const rows = userIds.map((uid) => ({
          user_id: uid,
          title,
          message,
          url: "/configuracoes/rede-lojas",
          tag: `net-${device.id}-${normalized}`,
          category: "network",
        }));
        await admin.from("user_notifications").insert(rows);
      }

      // 2) WhatsApp para destinatários (globais + da loja)
      const { data: recips } = await admin
        .from("network_alert_recipients")
        .select("name, phone, store_id, is_active")
        .eq("is_active", true);
      const targets = (recips || []).filter(
        (r: any) => !r.store_id || r.store_id === device.store_id,
      );
      const waMessage = `${title}\n\n${message}`;
      await Promise.all(targets.map((t: any) => sendWhatsapp(t.phone, waMessage)));
    }

    return new Response(
      JSON.stringify({ ok: true, event: normalized, suppressed }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("mikrotik-wan-alert error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
