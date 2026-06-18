// Envia WhatsApp para os destinatários de um aviso (hr_announcements)
// Mesmo padrão de resolução do send-push-notification.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { requireCronOrRole } from "../_shared/requireRole.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Body {
  announcement_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await requireCronOrRole(req, ["admin", "manager", "hr"], corsHeaders);
  if (!auth.ok) return auth.response!;

  try {
    const body = (await req.json()) as Body;
    if (!body?.announcement_id) {
      return new Response(JSON.stringify({ error: "announcement_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: ann, error: annErr } = await admin
      .from("hr_announcements")
      .select("id,title,message,priority,scope,store_id,employee_id,is_active,send_whatsapp")
      .eq("id", body.announcement_id)
      .maybeSingle();

    if (annErr || !ann) {
      return new Response(JSON.stringify({ error: "announcement not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!ann.is_active || !ann.send_whatsapp) {
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve employee_ids destinatários (precisamos do telefone do colaborador)
    let employeeIds: string[] = [];

    if (ann.scope === "global") {
      const { data: emps } = await admin
        .from("employees")
        .select("id")
        .eq("status", "active");
      employeeIds = (emps ?? []).map((e: any) => e.id);
    } else if (ann.scope === "store" && ann.store_id) {
      const { data: emps } = await admin
        .from("employees")
        .select("id")
        .eq("status", "active")
        .or(`store_id.eq.${ann.store_id},allocated_store_id.eq.${ann.store_id}`);
      employeeIds = (emps ?? []).map((e: any) => e.id);
    } else if (ann.scope === "employee" && ann.employee_id) {
      employeeIds = [ann.employee_id];
    }

    employeeIds = Array.from(new Set(employeeIds));
    if (employeeIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no recipients" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const message = `*${ann.title}*\n${ann.message}`;
    let sent = 0;
    let failed = 0;

    // Dispara em paralelo (limite suave de 10 por vez)
    const chunkSize = 10;
    for (let i = 0; i < employeeIds.length; i += chunkSize) {
      const chunk = employeeIds.slice(i, i + chunkSize);
      const results = await Promise.all(chunk.map(async (empId) => {
        try {
          const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SERVICE_ROLE}`,
            },
            body: JSON.stringify({
              employee_id: empId,
              message,
              category: "announcement",
              tag: `ann-${ann.id}`,
            }),
          });
          const json = await res.json().catch(() => ({}));
          return res.ok && json?.status === "sent";
        } catch (e) {
          console.error("send-whatsapp-announcement dispatch error", e);
          return false;
        }
      }));
      for (const ok of results) ok ? sent++ : failed++;
    }

    return new Response(JSON.stringify({ ok: true, sent, failed, total: employeeIds.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("send-whatsapp-announcement error", e);
    return new Response(JSON.stringify({ error: e?.message ?? "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
