import { supabase } from "@/integrations/supabase/client";

interface SendApplicationDecisionEmailParams {
  applicationId: string;
  status: "approved" | "rejected";
  recipientEmail: string | null;
  recipientName: string;
  jobOpeningId: string;
  selectedSlotId?: string | null;
  slotsTable?: "job_interview_slots" | "interview_slots";
}

/**
 * Envia email cordial ao candidato após decisão (rejeitar / aprovar entrevista).
 * Falhas no envio NÃO bloqueiam o fluxo da decisão.
 */
export async function sendApplicationDecisionEmail({
  applicationId,
  status,
  recipientEmail,
  recipientName,
  jobOpeningId,
  selectedSlotId,
  slotsTable = "interview_slots",
}: SendApplicationDecisionEmailParams) {
  if (!recipientEmail) return;

  try {
    // Busca dados da vaga + loja
    const { data: opening } = await supabase
      .from("job_openings")
      .select("title, position, store_id")
      .eq("id", jobOpeningId)
      .maybeSingle();

    const jobTitle = opening?.title || opening?.position || undefined;

    if (status === "rejected") {
      await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "application-rejected",
          recipientEmail,
          idempotencyKey: `app-rejected-${applicationId}`,
          templateData: { name: recipientName, jobTitle },
        },
      });
      return;
    }

    // approved → busca slot + loja para montar email rico
    let interviewDate: string | undefined;
    let slotLocation: string | null = null;

    if (selectedSlotId) {
      const { data: slotRaw } = await (supabase as any)
        .from(slotsTable)
        .select("start_at, location")
        .eq("id", selectedSlotId)
        .maybeSingle();
      const slot = slotRaw as { start_at?: string; location?: string | null } | null;
      if (slot?.start_at) {
        interviewDate = new Date(slot.start_at).toLocaleString("pt-BR", {
          weekday: "long",
          day: "2-digit",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
      slotLocation = slot?.location ?? null;
    }

    let locationName: string | undefined;
    let locationAddress: string | undefined;
    let mapsUrl: string | undefined;

    if (opening?.store_id) {
      const { data: store } = await supabase
        .from("stores")
        .select("name, address, city")
        .eq("id", opening.store_id)
        .maybeSingle();
      if (store) {
        locationName = store.name || undefined;
        locationAddress = [store.address, store.city].filter(Boolean).join(" — ") || undefined;
        const q = [store.name, store.address, store.city].filter(Boolean).join(", ");
        if (q) mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
      }
    }

    // Slot location pode sobrescrever / complementar
    if (slotLocation && !locationAddress) {
      locationAddress = slotLocation;
      if (!mapsUrl) {
        mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(slotLocation)}`;
      }
    }

    await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: "interview-approved",
        recipientEmail,
        idempotencyKey: `interview-approved-${applicationId}`,
        templateData: {
          name: recipientName,
          jobTitle,
          interviewDate,
          locationName,
          locationAddress,
          mapsUrl,
        },
      },
    });
  } catch (e) {
    console.error("[sendApplicationDecisionEmail] failed:", e);
  }
}
