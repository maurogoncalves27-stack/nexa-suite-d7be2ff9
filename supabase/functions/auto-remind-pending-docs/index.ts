// Cron semanal de cobrança automática: candidatos com docs solicitados há
// mais de 3 dias e ainda incompletos recebem e-mail listando o que falta.
// Limita a 1 cobrança automática por semana por candidato (via metadata.last_auto_reminder).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireCronOrRole } from "../_shared/requireRole.ts";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUBLIC_BASE = Deno.env.get("PUBLIC_BASE_URL") ?? "https://nexa.aquelaparme.com.br";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireCronOrRole(req, ["admin", "manager", "hr"], corsHeaders);
  if (!auth.ok) return auth.response!;


  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: candidates, error } = await supabase
    .from("job_candidates")
    .select("id, full_name, email, requested_documents, documents_requested_at, document_upload_token, job_opening_id, documents_requested_notes")
    .not("documents_requested_at", "is", null)
    .lt("documents_requested_at", threeDaysAgo)
    .in("current_stage", ["aguardando_inicio", "entrevista_agendada"])
    .not("email", "is", null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const c of (candidates ?? [])) {
    const docs = Array.isArray(c.requested_documents) ? c.requested_documents : [];
    const requested = docs.filter((d: any) => d.requested);
    const pending = requested.filter((d: any) => !d.ok);
    if (requested.length === 0 || pending.length === 0) { skipped++; continue; }

    // Verifica último lembrete automático
    const lastReminder = await supabase
      .from("email_send_log")
      .select("created_at")
      .eq("recipient_email", c.email)
      .like("message_id", `auto-docs-reminder-${c.id}-%`)
      .gte("created_at", sevenDaysAgo)
      .limit(1)
      .maybeSingle();

    if (lastReminder.data) { skipped++; continue; }

    // Busca título da vaga
    const { data: opening } = await supabase
      .from("job_openings")
      .select("title")
      .eq("id", c.job_opening_id)
      .maybeSingle();

    const uploadUrl = `${PUBLIC_BASE}/enviar-documentos/${c.document_upload_token}`;
    const reminderNotes = `Notamos que ainda faltam alguns documentos para darmos sequência ao seu processo. Por favor, acesse o link e envie o que falta.${c.documents_requested_notes ? `\n\nObservações originais: ${c.documents_requested_notes}` : ""}`;

    try {
      const { error: mailErr } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "documents-request",
          recipientEmail: c.email,
          idempotencyKey: `auto-docs-reminder-${c.id}-${new Date().toISOString().slice(0, 10)}`,
          templateData: {
            name: c.full_name,
            jobTitle: opening?.title,
            uploadUrl,
            documents: pending.map((d: any) => d.label),
            notes: reminderNotes,
          },
        },
      });
      if (mailErr) {
        errors.push(`${c.full_name}: ${mailErr.message}`);
      } else {
        sent++;
      }
    } catch (e) {
      errors.push(`${c.full_name}: ${(e as Error).message}`);
    }
  }

  return new Response(
    JSON.stringify({ checked: candidates?.length ?? 0, sent, skipped, errors }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
