// Transfere documentos do candidato (bucket candidate-documents + tabela
// candidate_document_uploads) para a pasta do colaborador
// (bucket employee-documents + tabela employee_documents).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { candidate_id, employee_id } = await req.json();
    if (!candidate_id || !employee_id) {
      return new Response(
        JSON.stringify({ error: "candidate_id e employee_id são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Identifica quem chamou (para uploaded_by)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const uploadedBy = userData?.user?.id ?? null;

    const admin = createClient(supabaseUrl, serviceKey);

    // Lista uploads do candidato
    const { data: uploads, error: upErr } = await admin
      .from("candidate_document_uploads")
      .select("id, doc_type, file_name, file_path, mime_type, size_bytes")
      .eq("candidate_id", candidate_id);
    if (upErr) throw upErr;

    let copied = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const u of uploads ?? []) {
      try {
        // Já existe na pasta do colaborador? (mesmo doc_type + file_name)
        const { data: existing } = await admin
          .from("employee_documents")
          .select("id")
          .eq("employee_id", employee_id)
          .eq("doc_type", u.doc_type)
          .eq("file_name", u.file_name)
          .maybeSingle();
        if (existing) { skipped++; continue; }

        // Baixa do bucket candidate-documents
        const { data: blob, error: dlErr } = await admin.storage
          .from("candidate-documents")
          .download(u.file_path);
        if (dlErr || !blob) throw dlErr ?? new Error("download falhou");

        // Caminho no bucket employee-documents: {employee_id}/recruitment/{file_name}
        const destPath = `${employee_id}/recruitment/${Date.now()}-${u.file_name}`;
        const { error: upErr2 } = await admin.storage
          .from("employee-documents")
          .upload(destPath, blob, {
            contentType: u.mime_type ?? "application/octet-stream",
            upsert: false,
          });
        if (upErr2) throw upErr2;

        const { error: insErr } = await admin
          .from("employee_documents")
          .insert({
            employee_id,
            doc_type: u.doc_type,
            file_name: u.file_name,
            file_path: destPath,
            mime_type: u.mime_type,
            size_bytes: u.size_bytes,
            uploaded_by: uploadedBy,
          });
        if (insErr) throw insErr;

        copied++;
      } catch (e) {
        errors.push(`${u.file_name}: ${(e as Error).message}`);
      }
    }

    return new Response(
      JSON.stringify({ copied, skipped, total: uploads?.length ?? 0, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
