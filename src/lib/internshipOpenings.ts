import { supabase } from "@/integrations/supabase/client";

export interface InternshipOpeningPayload {
  id?: string;
  title: string;
  store_id: string | null;
  positions_count: number;
  status: string; // 'open' | 'closed'
  job_opening_id?: string | null;
}

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/**
 * Cria/atualiza uma vaga de estágio E sincroniza com a vaga pública (job_openings)
 * usada pela página de Recrutamento e divulgação. Retorna o id da vaga de estágio.
 */
export async function upsertInternshipOpening(payload: InternshipOpeningPayload): Promise<string> {
  const { id, title, store_id, positions_count, status, job_opening_id } = payload;
  const jobStatus = status === "closed" ? "closed" : "open";

  // 1) Upsert da vaga de estágio
  const opData = { title, store_id, positions_count, status };
  let openingId = id;
  let linkedJobId = job_opening_id ?? null;

  if (id) {
    const { error } = await supabase.from("internship_openings" as any).update(opData).eq("id", id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from("internship_openings" as any).insert(opData).select("id").single();
    if (error) throw error;
    openingId = (data as any).id;
  }

  // 2) Sincroniza com job_opening pública
  const jobPayload: any = {
    title: title.toUpperCase(),
    position: "Estagiário",
    store_id,
    positions_count,
    status: jobStatus,
    is_public: true,
  };

  if (linkedJobId) {
    const { error } = await supabase.from("job_openings").update(jobPayload).eq("id", linkedJobId);
    if (error) throw error;
  } else {
    const slugBase = slugify(`${title} ${Date.now().toString(36)}`);
    const { data, error } = await supabase
      .from("job_openings")
      .insert({ ...jobPayload, public_slug: slugBase, opened_at: new Date().toISOString().slice(0, 10) })
      .select("id")
      .single();
    if (error) throw error;
    linkedJobId = (data as any).id;
    // grava o vínculo na vaga de estágio
    await supabase.from("internship_openings" as any).update({ job_opening_id: linkedJobId }).eq("id", openingId!);
  }

  return openingId!;
}

/** Encerra a vaga pública vinculada quando a vaga de estágio é deletada. */
export async function closeLinkedJobOpening(jobOpeningId: string | null) {
  if (!jobOpeningId) return;
  await supabase.from("job_openings").update({ status: "closed", closed_at: new Date().toISOString().slice(0, 10) }).eq("id", jobOpeningId);
}
