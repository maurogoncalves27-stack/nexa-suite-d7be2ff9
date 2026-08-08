// Envia alerta WhatsApp para gestores/admins da loja quando um chamado de
// manutenção é aberto. Usa Z-API via send-whatsapp.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { pushToUsers } from "../_shared/pushFanout.ts";
import { sendAlertEmails } from "../_shared/emailFanout.ts";

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
    const r = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({ phone, message, category: "maintenance_request" }),
    });
    return { ok: r.ok, status: r.status };
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
      return new Response(
        JSON.stringify({ ok: false, error: "request_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: reqRow, error: reqErr } = await admin
      .from("nutri_maintenance_requests")
      .select("id, store_id, equipment_type, description, urgency, user_id")
      .eq("id", requestId)
      .maybeSingle();

    if (reqErr || !reqRow) {
      return new Response(
        JSON.stringify({ ok: false, error: reqErr?.message || "request not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: store } = await admin
      .from("stores")
      .select("id, name")
      .eq("id", reqRow.store_id)
      .maybeSingle();

    const { data: requester } = await admin
      .from("employees")
      .select("full_name")
      .eq("user_id", reqRow.user_id)
      .maybeSingle();

    // Push in-app: mantém para admin/manager (canal interno, sem spam externo)
    const { data: roleRows } = await admin
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "manager"]);
    const pushTargets = Array.from(
      new Set((roleRows || []).map((r: any) => r.user_id).filter(Boolean)),
    );

    const urgencyLabel: Record<string, string> = {
      alta: "🔴 URGENTE",
      media: "🟡 Média",
      baixa: "🟢 Baixa",
    };
    const urg = urgencyLabel[reqRow.urgency] || reqRow.urgency;

    const shortDesc = reqRow.description
      ? String(reqRow.description).replace(/\s+/g, " ").trim().slice(0, 120)
      : "";
    const text =
      `🔧 *Manutenção* · ${store?.name || "Loja"}\n` +
      `${reqRow.equipment_type} · ${urg}` +
      (shortDesc ? `\n${shortDesc}` : "") +
      (requester?.full_name ? `\nSolicitante: ${requester.full_name}` : "");

    // WhatsApp: SOMENTE destinatários extras cadastrados em /configuracoes → Alertas → Manutenção
    const { loadAlertConfig, fanoutExtras } = await import("../_shared/notifyChannels.ts");
    const { enabled: waEnabled, waConfig, extras } = await loadAlertConfig(admin, "maintenance");
    let waSent = 0;
    if (waEnabled && waConfig && extras.length > 0) {
      waSent = await fanoutExtras(waConfig, extras, text);
    }

    // Push (in-app + web push) para os mesmos gestores
    await pushToUsers(pushTargets, {
      title: `🔧 Manutenção · ${store?.name || "Loja"}`,
      message: `${reqRow.equipment_type} · ${urg}${reqRow.description ? ` · ${reqRow.description}` : ""}`,
      url: "/area-gestor",
      tag: `maint-${requestId}`,
      category: "maintenance_request",
    });

    await sendAlertEmails("maintenance", {
      title: `Manutenção · ${store?.name || "Loja"}`,
      message: `Equipamento: ${reqRow.equipment_type}\nUrgência: ${urg}` +
        (reqRow.description ? `\nDescrição: ${reqRow.description}` : "") +
        (requester?.full_name ? `\nSolicitante: ${requester.full_name}` : ""),
      category: "Manutenção",
      severity: reqRow.urgency === "alta" ? "critical" : "warning",
    }, admin);

    return new Response(
      JSON.stringify({ ok: true, whatsapp_sent: waSent, push_targets: pushTargets.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
