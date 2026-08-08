// Notifica gestores/admins da loja quando a loja reabre um chamado que o
// gestor havia marcado como resolvido.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_BASE_URL =
  Deno.env.get("APP_PUBLIC_URL") || "https://nexasuite.aquelaparme.com.br";

function normalizePhone(raw: string | null | undefined): string | null {
  const d = (raw || "").replace(/\D+/g, "");
  if (!d) return null;
  if (d.startsWith("55") && d.length >= 12) return d;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
}

async function sendWhatsapp(phone: string, message: string) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({ phone, message, category: "maintenance_request" }),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const requestId = body?.request_id as string | undefined;
    if (!requestId) {
      return new Response(JSON.stringify({ ok: false, error: "request_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: reqRow } = await admin
      .from("nutri_maintenance_requests")
      .select("id, store_id, equipment_type, user_id, reopen_reason")
      .eq("id", requestId)
      .maybeSingle();
    if (!reqRow) {
      return new Response(JSON.stringify({ ok: false, error: "request not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: store }, { data: reporter }] = await Promise.all([
      admin.from("stores").select("id, name").eq("id", reqRow.store_id).maybeSingle(),
      admin
        .from("employees")
        .select("full_name")
        .eq("user_id", reqRow.user_id)
        .maybeSingle(),
    ]);

    const text =
      `⚠️ *Manutenção reaberta* · ${store?.name || "Loja"}\n` +
      `${reqRow.equipment_type}` +
      (reporter?.full_name ? `\nReaberto por: ${reporter.full_name}` : "") +
      (reqRow.reopen_reason
        ? `\n${String(reqRow.reopen_reason).replace(/\s+/g, " ").trim().slice(0, 120)}`
        : "");

    // WhatsApp: SOMENTE destinatários extras cadastrados em /configuracoes → Alertas → Manutenção
    const { loadAlertConfig, fanoutExtras } = await import("../_shared/notifyChannels.ts");
    const { enabled, waConfig, extras } = await loadAlertConfig(admin, "maintenance");
    let waSent = 0;
    if (enabled && waConfig && extras.length > 0) {
      waSent = await fanoutExtras(waConfig, extras, text);
    }

    return new Response(
      JSON.stringify({ ok: true, whatsapp_sent: waSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
