// Helper compartilhado: dispara alertas por e-mail para os destinatários
// definidos em notification_settings.email_recipients de um alert_key.
// Reutiliza a edge function send-transactional-email com o template
// "alert-generic".

export type AlertEmailPayload = {
  title: string;
  message: string;
  category?: string;
  severity?: "info" | "warning" | "critical";
};

function normalizeEmail(raw: string | null | undefined): string | null {
  const e = (raw || "").trim().toLowerCase();
  if (!e) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

export async function loadEmailRecipients(
  supabase: any,
  alertKey: string,
): Promise<{ enabled: boolean; emails: string[] }> {
  const { data } = await supabase
    .from("notification_settings")
    .select("email_enabled, email_recipients")
    .eq("alert_key", alertKey)
    .maybeSingle();
  const enabled = !!data?.email_enabled;
  const raw = Array.isArray(data?.email_recipients) ? data!.email_recipients as any[] : [];
  const emails = Array.from(new Set(
    raw.map((r) => normalizeEmail(typeof r === "string" ? r : r?.email))
       .filter((e): e is string => !!e),
  ));
  return { enabled, emails };
}

export async function sendAlertEmails(
  alertKey: string,
  payload: AlertEmailPayload,
  supabase: any,
): Promise<number> {
  try {
    const { enabled, emails } = await loadEmailRecipients(supabase, alertKey);
    if (!enabled || emails.length === 0) return 0;

    const url = (globalThis as any).Deno?.env?.get?.("SUPABASE_URL");
    const key = (globalThis as any).Deno?.env?.get?.("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return 0;

    let ok = 0;
    for (const to of emails) {
      try {
        const r = await fetch(`${url}/functions/v1/send-transactional-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            templateName: "alert-generic",
            recipientEmail: to,
            templateData: payload,
          }),
        });
        if (r.ok) ok++;
      } catch (_e) { /* ignore per-recipient */ }
    }
    return ok;
  } catch (_e) {
    return 0;
  }
}
