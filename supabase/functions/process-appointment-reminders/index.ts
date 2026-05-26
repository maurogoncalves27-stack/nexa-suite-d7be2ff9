import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const now = new Date();
  const horizon = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000); // próximos 8 dias

  const { data: appointments, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("status", "scheduled")
    .gte("start_at", now.toISOString())
    .lte("start_at", horizon.toISOString());

  if (error) {
    console.error("[reminders] fetch error", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let triggered = 0;
  for (const apt of appointments ?? []) {
    const startMs = new Date(apt.start_at).getTime();
    const offsets: number[] = apt.reminder_offsets_min ?? [];

    // Buscar lembretes já enviados deste compromisso
    const { data: sent } = await supabase
      .from("appointment_reminders_sent")
      .select("offset_min")
      .eq("appointment_id", apt.id);
    const sentSet = new Set((sent ?? []).map((s: any) => s.offset_min));

    for (const offset of offsets) {
      if (sentSet.has(offset)) continue;
      const dueAt = startMs - offset * 60 * 1000;
      // Janela: dispara se já passou da hora prevista (tolerância para lembretes atrasados)
      if (dueAt > now.getTime()) continue;

      // Resolver destinatários
      const recipients = await resolveRecipients(supabase, apt);
      let createdCount = 0;
      for (const empId of recipients) {
        const { data: ann, error: annErr } = await supabase
          .from("hr_announcements")
          .insert({
            title: truncate(`🔔 ${apt.title}`, 120),
            message: buildMessage(apt, offset),
            priority: "urgent",
            scope: "employee",
            employee_id: empId,
            send_push: true,
          })
          .select("id")
          .maybeSingle();
        if (annErr) {
          console.error("[reminders] hr_announcements insert failed", annErr, { apt_id: apt.id, offset, empId });
          continue;
        }
        if (ann?.id) {
          createdCount++;
          try {
            await supabase.functions.invoke("send-push-notification", { body: { announcement_id: ann.id } });
          } catch (e) {
            console.warn("[reminders] push invoke failed", e);
          }
        }
      }

      // Só marca como enviado se ao menos um aviso foi criado (evita "queimar" lembrete em falha)
      if (createdCount > 0 || recipients.length === 0) {
        await supabase.from("appointment_reminders_sent").insert({ appointment_id: apt.id, offset_min: offset });
        triggered++;
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, triggered, scanned: appointments?.length ?? 0 }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function resolveRecipients(supabase: any, apt: any): Promise<string[]> {
  if (apt.scope === "employee" && apt.employee_id) return [apt.employee_id];
  if (apt.scope === "store" && apt.store_id) {
    const { data } = await supabase
      .from("employees")
      .select("id")
      .eq("status", "active")
      .or(`store_id.eq.${apt.store_id},allocated_store_id.eq.${apt.store_id}`);
    return (data ?? []).map((e: any) => e.id);
  }
  // all
  const { data } = await supabase.from("employees").select("id").eq("status", "active");
  return (data ?? []).map((e: any) => e.id);
}

function buildMessage(apt: any, offsetMin: number): string {
  const dt = new Date(apt.start_at);
  const when = dt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
  const horizon = offsetLabel(offsetMin);
  // Limite de 100 chars no banco — mensagem curta, detalhes ficam no card de aviso.
  const base = `${horizon} · ${when}`;
  const extra = apt.location ? ` · ${apt.location}` : (apt.meeting_url ? ` · online` : "");
  return truncate(base + extra, 100);
}

function offsetLabel(min: number): string {
  if (min < 60) return `Em ${min} min`;
  if (min < 1440) return `Em ${Math.round(min / 60)}h`;
  const days = Math.round(min / 1440);
  return days === 1 ? "Amanhã" : `Em ${days} dias`;
}

function truncate(s: string, max: number): string {
  if (!s) return s;
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}
