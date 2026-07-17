// Backfill ASOs da pasta do colaborador (employee_documents) para a aba ASO (medical_certificates).
// Copia o arquivo do bucket employee-documents para medical-certificates e insere o registro se ainda não existir.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: docs, error } = await supabase
    .from("employee_documents")
    .select("id, employee_id, doc_type, file_name, file_path, uploaded_at, uploaded_by")
    .or("doc_type.ilike.%aso%,doc_type.eq.admission_exam,doc_type.eq.Exame Admissional,file_name.ilike.%ASO%")
    .order("uploaded_at", { ascending: false });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, "content-type": "application/json" } });

  const results: any[] = [];
  const seen = new Set<string>(); // employee_id|file_name — evita reprocessar o mesmo ASO em duplicidade dentro do loop

  for (const d of docs ?? []) {
    const key = `${d.employee_id}|${d.file_name}`;
    if (seen.has(key)) { results.push({ file: d.file_name, skipped: "duplicate_in_folder" }); continue; }
    seen.add(key);

    // Já existe em medical_certificates?
    const { data: existing } = await supabase
      .from("medical_certificates")
      .select("id")
      .eq("employee_id", d.employee_id)
      .eq("file_name", d.file_name)
      .eq("is_pcmso", true)
      .maybeSingle();
    if (existing) { results.push({ file: d.file_name, employee: d.employee_id, skipped: "already_in_aso" }); continue; }

    // Baixa do bucket de origem
    const { data: blob, error: dlErr } = await supabase.storage.from("employee-documents").download(d.file_path);
    if (dlErr || !blob) { results.push({ file: d.file_name, error: `download: ${dlErr?.message}` }); continue; }

    // Faz upload no bucket medical-certificates
    const newPath = `${d.employee_id}/aso-backfill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`;
    const { error: upErr } = await supabase.storage.from("medical-certificates").upload(newPath, blob, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (upErr) { results.push({ file: d.file_name, error: `upload: ${upErr.message}` }); continue; }

    // Escolhe subtipo: admissional se doc_type indicar; caso contrário periódico
    const dt = (d.doc_type || "").toLowerCase();
    const documentType = dt.includes("admiss") || dt === "admission_exam" ? "aso_admissional"
      : dt.includes("demiss") ? "aso_demissional"
      : dt.includes("retorno") ? "aso_retorno"
      : dt.includes("mudanca") || dt.includes("mudança") ? "aso_mudanca_funcao"
      : "aso_periodico";

    const certDate = (d.uploaded_at as string)?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);

    const { error: insErr } = await supabase.from("medical_certificates").insert({
      employee_id: d.employee_id,
      certificate_date: certDate,
      days_off: 0,
      document_type: documentType,
      is_pcmso: true,
      file_path: newPath,
      file_name: d.file_name,
      mime_type: "application/pdf",
      status: "approved",
      created_by: d.uploaded_by ?? null,
      notes: "Backfill automático a partir da pasta do colaborador.",
    });
    if (insErr) { results.push({ file: d.file_name, error: `insert: ${insErr.message}` }); continue; }

    results.push({ file: d.file_name, employee: d.employee_id, ok: true, document_type: documentType });
  }

  return new Response(JSON.stringify({ processed: results.length, results }, null, 2), {
    headers: { ...cors, "content-type": "application/json" },
  });
});
