import { supabase } from "@/integrations/supabase/client";

/**
 * Faz upload de um PDF gerado para a Pasta do Colaborador (employee_documents).
 * - Substitui versão anterior do mesmo doc_type (apaga registros + storage) quando replaceExisting=true.
 * - Não bloqueia o fluxo: erros são logados mas não relançados por padrão (opt-in com throwOnError).
 */
export async function uploadEmployeePdfBlob(params: {
  employeeId: string;
  docType: string;
  fileName: string;
  blob: Blob;
  uploadedBy?: string | null;
  replaceExisting?: boolean;
  throwOnError?: boolean;
}): Promise<void> {
  const {
    employeeId,
    docType,
    fileName,
    blob,
    uploadedBy = null,
    replaceExisting = false,
    throwOnError = false,
  } = params;
  try {
    if (replaceExisting) {
      const { data: prev } = await supabase
        .from("employee_documents")
        .select("id, file_path")
        .eq("employee_id", employeeId)
        .eq("doc_type", docType);
      const paths = (prev ?? []).map((p: any) => p.file_path).filter(Boolean);
      if (paths.length > 0) {
        await supabase.storage.from("employee-documents").remove(paths);
        await supabase.from("employee_documents").delete().in("id", (prev ?? []).map((p: any) => p.id));
      }
    }

    const path = `${employeeId}/${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
    const { error: upErr } = await supabase.storage
      .from("employee-documents")
      .upload(path, blob, { contentType: "application/pdf" });
    if (upErr) throw upErr;

    const { error: insErr } = await supabase.from("employee_documents").insert({
      employee_id: employeeId,
      doc_type: docType,
      file_name: fileName,
      file_path: path,
      mime_type: "application/pdf",
      size_bytes: blob.size,
      uploaded_by: uploadedBy,
    });
    if (insErr) throw insErr;
  } catch (err) {
    console.error("[uploadEmployeePdfBlob] falhou", { docType, err });
    if (throwOnError) throw err;
  }
}
