// Cron: detecta Mikrotiks silenciosos (sem heartbeat dentro da tolerância)
// e marca como offline + dispara alerta.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
function normalizePhone(raw: string): string | null {
  const d = (raw || "").replace(/\D+/g, "");
  if (!d) return null;
  if (d.startsWith("55") && d.length >= 12) return d;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
}

async function sendWhatsapp(phone: string, message: string) {
  const to = normalizePhone(phone);
  if (!to) return;
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({ phone: to, message, category: "network" }),
    });
  } catch (e) { console.error("send-whatsapp", e); }
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const now = new Date();
    const { data: devices } = await admin
      .from("network_devices")
      .select("id, store_id, name, current_status, last_heartbeat_at, heartbeat_tolerance_seconds")
      .eq("is_active", true);

    const results: any[] = [];
    for (const d of devices || []) {
      const tolMs = (d.heartbeat_tolerance_seconds || 360) * 1000;
      const lastHb = d.last_heartbeat_at ? new Date(d.last_heartbeat_at as string).getTime() : 0;
      const silentMs = now.getTime() - lastHb;
      const silent = lastHb > 0 && silentMs > tolMs;

      if (silent && d.current_status !== "offline") {
        // Mark offline + alert
        await admin.from("network_devices").update({ current_status: "offline", last_event_at: now.toISOString() }).eq("id", d.id);
        await admin.from("network_wan_events").insert({
          device_id: d.id, store_id: d.store_id, event_type: "offline",
          payload: { silent_seconds: Math.floor(silentMs / 1000) },
        });

        const { data: store } = await admin.from("stores").select("name").eq("id", d.store_id).maybeSingle();
        const storeName = store?.name || "Loja";
        const title = `🛑 ${storeName}: Mikrotik sem sinal`;
        const message = `Sem heartbeat do Mikrotik "${d.name}" há ${Math.floor(silentMs / 60000)} minutos. Pode ser queda de energia ou ambos os links (fibra + 4G) fora.`;

        const { data: roles } = await admin.from("user_roles").select("user_id, role").in("role", ["admin", "manager"]);
        const userIds = Array.from(new Set((roles || []).map((r: any) => r.user_id)));
        if (userIds.length) {
          await admin.from("user_notifications").insert(userIds.map((uid) => ({
            user_id: uid, title, message, url: "/configuracoes/rede-lojas",
            tag: `net-${d.id}-offline`, category: "network",
          })));
        }
        try {
          const { loadAlertConfig, fanoutExtras } = await import("../_shared/notifyChannels.ts");
          const { enabled, waConfig, extras } = await loadAlertConfig(admin, "network");
          if (enabled && waConfig && extras.length > 0) {
            await fanoutExtras(waConfig, extras, `${title}\n\n${message}`);
          }
        } catch (err) {
          console.error("network wa fanout error", err);
        }
        results.push({ device: d.name, marked: "offline" });
      } else if (!silent && d.current_status === "offline") {
        // Restored via heartbeat elsewhere — the wan-alert handler already flipped it.
        results.push({ device: d.name, note: "recovered elsewhere" });
      }
    }

    return new Response(JSON.stringify({ ok: true, checked: devices?.length ?? 0, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("mikrotik-heartbeat-check error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
