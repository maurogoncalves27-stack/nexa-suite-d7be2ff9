import { supabase } from "@/integrations/supabase/client";

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
}

async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunk)) as any);
  }
  return btoa(binary);
}

export async function classifySstDocument(file: File): Promise<SmartClassifyResult> {
  const file_base64 = await fileToBase64(file);
  const { data, error } = await supabase.functions.invoke<SmartClassifyResult>("sst-doc-classify", {
    body: { file_base64, mime_type: file.type || "application/pdf" },
  });
  if (error) throw error;
  if (!data || !data.kind) throw new Error("IA não retornou classificação");
  return data;
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
  // 1) CPF
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
  // 2) Nome
  if (result.employee_name) {
    const target = normalizeName(result.employee_name);
    const { data } = await supabase.from("employees").select("id, full_name").limit(1000);
    const hit = (data ?? []).find((e: any) => normalizeName(e.full_name) === target);
    if (hit) return { id: hit.id, full_name: hit.full_name };
    // fallback: contém primeiro e último nome
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
