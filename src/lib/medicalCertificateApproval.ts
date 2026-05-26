import { supabase } from "@/integrations/supabase/client";
import { eachDayOfInterval, format, parseISO } from "date-fns";

const ATESTADOS_INFRACTION_NAME = "ATESTADOS";

interface ApprovalArgs {
  certificateId: string;
  employeeId: string;
  leaveStart: string; // YYYY-MM-DD
  leaveEnd: string;   // YYYY-MM-DD
  cidCode?: string | null;
  cidDescription?: string | null;
  reviewNotes?: string;
  reviewerId: string | null;
}

/**
 * Approves a medical certificate:
 * 1) Creates an infraction of type "ATESTADOS"
 * 2) Inserts/updates work_schedules entries marking each day in [leaveStart..leaveEnd] as off (afastamento)
 * 3) Updates the certificate status to "approved", linking the infraction
 */
export async function applyMedicalCertificateApproval({
  certificateId,
  employeeId,
  leaveStart,
  leaveEnd,
  cidCode,
  cidDescription,
  reviewNotes,
  reviewerId,
}: ApprovalArgs): Promise<{ infractionId: string | null; daysApplied: number }> {
  // 1) Find ATESTADOS infraction type
  const { data: infType, error: typeErr } = await supabase
    .from("infraction_types")
    .select("id, default_weight")
    .ilike("name", ATESTADOS_INFRACTION_NAME)
    .maybeSingle();
  if (typeErr) throw typeErr;
  if (!infType) throw new Error('Tipo de infração "ATESTADOS" não encontrado.');

  // 2) Find current evaluation cycle covering leaveStart (optional)
  const { data: cycle } = await supabase
    .from("evaluation_cycles")
    .select("id")
    .lte("start_date", leaveStart)
    .gte("end_date", leaveStart)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 3) Get employee's allocated/contracting store for the schedule rows
  const { data: emp } = await supabase
    .from("employees")
    .select("store_id, allocated_store_id")
    .eq("id", employeeId)
    .single();
  const storeId = emp?.allocated_store_id ?? emp?.store_id ?? null;

  // 4) Create infraction
  const cidLabel = [cidCode, cidDescription].filter(Boolean).join(" - ");
  const { data: inf, error: infErr } = await supabase
    .from("employee_infractions")
    .insert({
      employee_id: employeeId,
      infraction_type_id: infType.id,
      cycle_id: cycle?.id ?? null,
      occurred_on: leaveStart,
      applied_weight: infType.default_weight ?? 0,
      notes: `Atestado médico aprovado${cidLabel ? ` (${cidLabel})` : ""}${reviewNotes ? ` — ${reviewNotes}` : ""}`,
      created_by: reviewerId,
    })
    .select("id")
    .single();
  if (infErr) throw infErr;

  // 5) Mark each day of leave as off in work_schedules
  const days = eachDayOfInterval({
    start: parseISO(leaveStart),
    end: parseISO(leaveEnd),
  });
  let daysApplied = 0;

  for (const d of days) {
    const schedule_date = format(d, "yyyy-MM-dd");
    const noteText = `Afastamento médico${cidCode ? ` — CID ${cidCode}` : ""}`;

    // Try to find existing row
    const { data: existing } = await supabase
      .from("work_schedules")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("schedule_date", schedule_date)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("work_schedules")
        .update({
          is_day_off: true,
          is_home_office: false,
          start_time: null,
          end_time: null,
          break_start: null,
          break_end: null,
          break_start_2: null,
          break_end_2: null,
          notes: noteText,
        })
        .eq("id", existing.id);
    } else if (storeId) {
      await supabase.from("work_schedules").insert({
        employee_id: employeeId,
        store_id: storeId,
        schedule_date,
        is_day_off: true,
        notes: noteText,
        created_by: reviewerId,
      });
    }
    daysApplied++;
  }

  // 6) Create/replace employee_leaves entry (so it shows up in "Afastamentos" tab)
  if (reviewerId) {
    await supabase
      .from("employee_leaves")
      .delete()
      .eq("employee_id", employeeId)
      .eq("leave_type", "medical_certificate")
      .eq("start_date", leaveStart)
      .eq("end_date", leaveEnd);

    await supabase.from("employee_leaves").insert({
      employee_id: employeeId,
      leave_type: "medical_certificate",
      start_date: leaveStart,
      end_date: leaveEnd,
      is_paid: true,
      notes: `Atestado médico${cidCode ? ` — CID ${cidCode}` : ""}${cidDescription ? ` (${cidDescription})` : ""}`,
      created_by: reviewerId,
    });
  }

  // 7) Update certificate
  await supabase
    .from("medical_certificates")
    .update({
      status: "approved",
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      review_notes: reviewNotes ?? null,
      infraction_id: inf.id,
      leave_applied: true,
    })
    .eq("id", certificateId);

  return { infractionId: inf.id, daysApplied };
}

export async function rejectMedicalCertificate(
  certificateId: string,
  reviewerId: string | null,
  reason: string
) {
  const { error } = await supabase
    .from("medical_certificates")
    .update({
      status: "rejected",
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      review_notes: reason,
    })
    .eq("id", certificateId);
  if (error) throw error;
}
