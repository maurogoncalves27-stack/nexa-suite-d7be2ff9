import { supabase } from "@/integrations/supabase/client";

export interface ExtractedRisk {
  category: string;
  description: string;
  severity: "low" | "medium" | "high";
  probability: "low" | "medium" | "high";
  action_plan: string | null;
  deadline: string | null;
}

export interface SmartClassifyResult {
  kind:
    | "aso"
    | "pcmso"
    | "pgr"
    | "ltcat"
    | "ltip"
    | "psicossocial_nr1"
    | "relatorio_psicossocial"
    | "outros";
  confidence: number;
  employee_name: string | null;
  employee_cpf: string | null;
  aso_result: "apto" | "inapto" | "apto_com_restricoes" | null;
  aso_type: string | null;
  doctor_name: string | null;
  doctor_crm: string | null;
  cnpj: string | null;
  company_name: string | null;
  emitted_at: string | null;
  valid_from: string | null;
  valid_until: string | null;
  notes: string | null;
  risks: ExtractedRisk[] | null;
}

export async function classifySstDocument(file: File): Promise<SmartClassifyResult> {
  // Upload to storage first to avoid the ~6MB edge request body limit
  const tempPath = `_smart-upload/${crypto.randomUUID()}.pdf`;
  const { error: upErr } = await supabase.storage
    .from("sst-documents")
    .upload(tempPath, file, { contentType: file.type || "application/pdf", upsert: true });
  if (upErr) throw new Error(`Falha ao subir arquivo: ${upErr.message}`);

  try {
    const { data, error } = await supabase.functions.invoke<SmartClassifyResult>("sst-doc-classify", {
      body: { storage_path: tempPath, mime_type: file.type || "application/pdf" },
    });
    if (error) throw error;
    if (!data || !data.kind) throw new Error("IA não retornou classificação");
    return data;
  } finally {
    // best-effort cleanup
    supabase.storage.from("sst-documents").remove([tempPath]).catch(() => {});
  }
}

function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

export async function matchEmployeeFromClassification(
  result: SmartClassifyResult,
): Promise<{ id: string; full_name: string } | null> {
  if (!result.employee_name && !result.employee_cpf) return null;
  if (result.employee_cpf) {
    const cpf = result.employee_cpf.replace(/\D/g, "");
    if (cpf.length === 11) {
      const { data } = await supabase
        .from("employees")
        .select("id, full_name, cpf")
        .limit(200);
      const hit = (data ?? []).find(
        (e: any) => (e.cpf ?? "").replace(/\D/g, "") === cpf,
      );
      if (hit) return { id: hit.id, full_name: hit.full_name };
    }
  }
  if (result.employee_name) {
    const target = normalizeName(result.employee_name);
    const { data } = await supabase.from("employees").select("id, full_name").limit(1000);
    const hit = (data ?? []).find((e: any) => normalizeName(e.full_name) === target);
    if (hit) return { id: hit.id, full_name: hit.full_name };
    const parts = target.split(" ").filter(Boolean);
    if (parts.length >= 2) {
      const first = parts[0];
      const last = parts[parts.length - 1];
      const loose = (data ?? []).find((e: any) => {
        const n = normalizeName(e.full_name);
        return n.startsWith(first + " ") && n.endsWith(" " + last);
      });
      if (loose) return { id: loose.id, full_name: loose.full_name };
    }
  }
  return null;
}
