// Helper compartilhado: carrega config de WhatsApp (whatsapp_senders) e
// destinatários extras (notification_settings.extra_recipients) para um
// alert_key, e envia mensagens via Z-API.

export type WaConfig = {
  provider: "zapi";
  zapi_instance_id?: string | null;
  zapi_token?: string | null;
  zapi_client_token?: string | null;
} | null;

export function normalizePhone(raw: string | null | undefined): string | null {
  const d = (raw || "").replace(/\D+/g, "");
  if (!d) return null;
  if (d.startsWith("55") && d.length >= 12) return d;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
}

export async function loadWaConfig(
  supabase: any,
  senderId: string | null,
): Promise<WaConfig> {
  const cols =
    "provider, zapi_instance_id, zapi_token, zapi_client_token, active";
  if (senderId) {
    const { data } = await supabase
      .from("whatsapp_senders")
      .select(cols)
      .eq("id", senderId)
      .maybeSingle();
    if (data?.active) return data as WaConfig;
  }
  const { data: def } = await supabase
    .from("whatsapp_senders")
    .select(cols)
    .eq("is_default", true)
    .eq("active", true)
    .maybeSingle();
  if (def) return def as WaConfig;
  const instanceId = (globalThis as any).Deno?.env?.get?.("ZAPI_INSTANCE_ID");
  const token = (globalThis as any).Deno?.env?.get?.("ZAPI_TOKEN");
  const clientToken = (globalThis as any).Deno?.env?.get?.("ZAPI_CLIENT_TOKEN");
  if (instanceId && token) {
    return {
      provider: "zapi",
      zapi_instance_id: instanceId,
      zapi_token: token,
      zapi_client_token: clientToken ?? null,
    };
  }
  return null;
}

export async function loadAlertConfig(supabase: any, alertKey: string) {
  const { data } = await supabase
    .from("notification_settings")
    .select("whatsapp_enabled, whatsapp_sender_id, extra_recipients")
    .eq("alert_key", alertKey)
    .maybeSingle();
  const enabled = !!data?.whatsapp_enabled;
  const waConfig = enabled
    ? await loadWaConfig(supabase, data?.whatsapp_sender_id ?? null)
    : null;
  const rawList: any[] = Array.isArray(data?.extra_recipients) ? data!.extra_recipients : [];
  const extras: string[] = [];
  for (const r of rawList) {
    if (typeof r === "string") {
      const p = normalizePhone(r);
      if (p) extras.push(p);
    } else if (r && typeof r === "object") {
      if (r.group_id) {
        // Z-API aceita groupId no campo `phone` — envia direto sem normalizar.
        extras.push(String(r.group_id));
      } else if (r.phone) {
        const p = normalizePhone(r.phone);
        if (p) extras.push(p);
      }
    }
  }
  return { enabled, waConfig, extras };
}

export async function sendWhatsapp(
  cfg: WaConfig,
  phone: string,
  text: string,
) {
  if (!cfg) return { ok: false, error: "no_config" };
  try {
    if (!cfg.zapi_instance_id || !cfg.zapi_token) return { ok: false, error: "zapi_missing" };
    const url = `https://api.z-api.io/instances/${cfg.zapi_instance_id}/token/${cfg.zapi_token}/send-text`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cfg.zapi_client_token) headers["Client-Token"] = cfg.zapi_client_token;
    const r = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ phone, message: text }),
    });
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function fanoutExtras(
  cfg: WaConfig,
  extras: string[],
  text: string,
  alreadySent?: Set<string>,
) {
  if (!cfg || extras.length === 0) return 0;
  let ok = 0;
  for (const p of extras) {
    if (alreadySent?.has(p)) continue;
    const r = await sendWhatsapp(cfg, p, text);
    if (r.ok) ok++;
    alreadySent?.add(p);
  }
  return ok;
}
