// Geração silenciosa de fichas cadastrais (sem assinatura) para colaboradores
// que ainda não possuem o documento "ficha_cadastral" arquivado em employee_documents.
// Roda em background, em lotes pequenos, sem alertar o usuário.

import { supabase } from "@/integrations/supabase/client";
import { generateEmployeePdf } from "@/lib/employeePdf";
import { uploadEmployeePdfBlob } from "@/lib/employeeDocUpload";

const BACKFILL_FLAG_KEY = "rh:fichaBackfillDone:v1";
const BATCH_SIZE = 5;

export async function backfillMissingEmployeeFichas(currentUserId?: string | null) {
  if (typeof window === "undefined") return;
  if (sessionStorage.getItem(BACKFILL_FLAG_KEY)) return;
  sessionStorage.setItem(BACKFILL_FLAG_KEY, "1");

  try {
    const { data: employees } = await supabase
      .from("employees")
      .select("id, full_name, store_id")
      .neq("status", "terminated" as any);
    if (!employees || employees.length === 0) return;

    const ids = employees.map((e) => e.id);
    const { data: existingDocs } = await supabase
      .from("employee_documents")
      .select("employee_id")
      .eq("doc_type", "ficha_cadastral")
      .in("employee_id", ids);
    const haveFicha = new Set((existingDocs ?? []).map((d) => d.employee_id));
    const missing = employees.filter((e) => !haveFicha.has(e.id));
    if (missing.length === 0) return;

    // Cache de lojas
    const storeIds = Array.from(new Set(missing.map((e) => e.store_id).filter(Boolean) as string[]));
    const { data: storesData } = storeIds.length
      ? await supabase
          .from("stores")
          .select("id, name, legal_name, cnpj, parent_store_id")
          .in("id", storeIds)
      : { data: [] as any[] };
    const storesById = new Map<string, any>((storesData ?? []).map((s: any) => [s.id, s]));

    // Carrega ficha completa em lotes
    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const chunk = missing.slice(i, i + BATCH_SIZE);
      await Promise.all(
        chunk.map(async (m) => {
          try {
            const { data: full } = await supabase
              .from("employees")
              .select("*")
              .eq("id", m.id)
              .maybeSingle();
            if (!full) return;
            const store = full.store_id ? storesById.get(full.store_id) : null;
            const matriz = store?.parent_store_id ? storesById.get(store.parent_store_id) ?? store : store;
            const blob = (await generateEmployeePdf(
              {
                ...(full as any),
                store_name: store?.name ?? null,
                company_legal_name: matriz?.legal_name ?? store?.legal_name ?? null,
                company_cnpj: matriz?.cnpj ?? store?.cnpj ?? null,
              },
              [],
              { returnBlob: true },
            )) as Blob;
            if (!blob) return;
            const safe = (full.full_name || "colaborador").replace(/[^\w\-]+/g, "_");
            await uploadEmployeePdfBlob({
              employeeId: full.id,
              docType: "ficha_cadastral",
              fileName: `ficha_${safe}.pdf`,
              blob,
              uploadedBy: currentUserId ?? null,
              replaceExisting: false,
            });
          } catch (err) {
            console.warn("[backfillFichas] falhou para", m.id, err);
          }
        }),
      );
    }
  } catch (err) {
    console.warn("[backfillFichas] erro geral", err);
  }
}
