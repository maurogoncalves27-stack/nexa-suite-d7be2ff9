// Edge function: generate-vacation-notice
// Gera o "Aviso Prévio de Férias" (CLT art. 135) em PDF, arquiva na Pasta
// do Colaborador e cria notificação no sino para ele dar ciência.
//
// Chamada:
//   POST { vacation_schedule_id }
//
// Idempotente: se o schedule já tem notice_pdf_url, apenas retorna.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const fmtDateBR = (iso: string | null | undefined) => {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00`).getTime();
  const b = new Date(`${toIso}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

async function buildNoticePdf(opts: {
  employee: any;
  store: any;
  schedule: any;
  daysNotice: number;
}): Promise<Uint8Array> {
  const { employee, store, schedule, daysNotice } = opts;
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Aviso Prévio de Férias - ${employee.full_name}`);
  pdf.setCreator("NEXA Suite");

  const page = pdf.addPage([595, 842]);
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);
  const gray = rgb(0.45, 0.45, 0.45);
  const line = rgb(0.85, 0.85, 0.85);

  let y = 800;
  const left = 40;
  const right = 555;

  page.drawText(store?.legal_name || store?.name || "Empresa", {
    x: left, y, size: 13, font: bold, color: black,
  });
  y -= 16;
  if (store?.cnpj) {
    page.drawText(`CNPJ: ${store.cnpj}`, { x: left, y, size: 9, font: helv, color: gray });
    y -= 12;
  }
  y -= 8;
  page.drawText("AVISO PRÉVIO DE FÉRIAS", {
    x: left, y, size: 13, font: bold, color: black,
  });
  y -= 8;
  page.drawText("Conforme art. 135 da CLT", {
    x: left, y, size: 8, font: helv, color: gray,
  });
  y -= 14;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: line });
  y -= 20;

  const kv = (label: string, value: string, x: number) => {
    page.drawText(label, { x, y, size: 8, font: helv, color: gray });
    page.drawText(value || "-", { x, y: y - 11, size: 10, font: bold, color: black });
  };

  kv("Colaborador", employee.full_name || "-", left);
  kv("CPF", employee.cpf || "-", left + 280);
  y -= 28;
  kv("Cargo", employee.position || "-", left);
  kv("Admissão", employee.admission_date ? fmtDateBR(employee.admission_date) : "-", left + 280);
  y -= 28;

  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: line });
  y -= 20;

  const vacDays = Number(schedule.days_count ?? 0);
  const sellDays = Number(schedule.sell_days ?? 0);

  const paragraphs: string[] = [
    `Comunicamos que, de acordo com a legislação trabalhista vigente, ficam concedidas as férias regulamentares abaixo, referentes ao período aquisitivo de ${fmtDateBR(schedule.acquisition_start)} a ${fmtDateBR(schedule.acquisition_end)}.`,
    "",
    `Período aquisitivo: ${fmtDateBR(schedule.acquisition_start)} a ${fmtDateBR(schedule.acquisition_end)}`,
    `Período de gozo: ${fmtDateBR(schedule.start_date)} a ${fmtDateBR(schedule.end_date)} (${vacDays} dias)`,
    sellDays > 0 ? `Abono pecuniário: ${sellDays} dias (venda de férias)` : "",
    `Parcela: ${schedule.installment_number ?? 1}`,
    `Data de retorno ao trabalho: ${fmtDateBR(schedule.end_date)} + 1 dia`,
    "",
    `Este aviso é entregue com ${daysNotice} dia(s) de antecedência em relação ao início das férias.`,
    "",
    "O pagamento correspondente será efetuado até 2 (dois) dias antes do início do período de gozo, conforme art. 145 da CLT.",
    "",
    "Solicitamos o de acordo do(a) colaborador(a) através da confirmação de ciência no Portal do Colaborador ou pela assinatura abaixo.",
  ];

  const drawWrapped = (text: string, size = 10, fnt = helv) => {
    if (!text) { y -= 6; return; }
    const maxWidth = right - left;
    const words = text.split(" ");
    let cur = "";
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      const width = fnt.widthOfTextAtSize(test, size);
      if (width > maxWidth) {
        page.drawText(cur, { x: left, y, size, font: fnt, color: black });
        y -= 14;
        cur = w;
      } else {
        cur = test;
      }
    }
    if (cur) {
      page.drawText(cur, { x: left, y, size, font: fnt, color: black });
      y -= 14;
    }
  };

  for (const p of paragraphs) drawWrapped(p);

  y -= 20;
  page.drawText(`Local e data: ${store?.city || ""}${store?.city ? ", " : ""}${fmtDateBR(new Date().toISOString().slice(0, 10))}`, {
    x: left, y, size: 9, font: helv, color: black,
  });
  y -= 40;

  page.drawLine({ start: { x: left, y }, end: { x: left + 240, y }, thickness: 0.5, color: line });
  page.drawLine({ start: { x: right - 240, y }, end: { x: right, y }, thickness: 0.5, color: line });
  y -= 12;
  page.drawText("Empregador", { x: left, y, size: 8, font: helv, color: gray });
  page.drawText("Ciente — Colaborador(a)", { x: right - 240, y, size: 8, font: helv, color: gray });
  y -= 12;
  page.drawText(store?.legal_name || store?.name || "", { x: left, y, size: 9, font: bold, color: black });
  page.drawText(employee.full_name || "", { x: right - 240, y, size: 9, font: bold, color: black });

  return await pdf.save();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const scheduleId = body?.vacation_schedule_id;
    if (!scheduleId) {
      return new Response(JSON.stringify({ error: "vacation_schedule_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: schedule, error: schedErr } = await admin
      .from("vacation_schedules")
      .select("*")
      .eq("id", scheduleId)
      .single();
    if (schedErr || !schedule) throw new Error("vacation_schedule not found");

    const { data: employee } = await admin
      .from("employees")
      .select("id, full_name, cpf, position, admission_date, hire_date, allocated_store_id, store_id, user_id")
      .eq("id", schedule.employee_id)
      .single();
    if (!employee) throw new Error("employee not found");

    const storeId = employee.allocated_store_id || employee.store_id;
    const { data: store } = await admin
      .from("stores")
      .select("id, name, legal_name, cnpj, city, state")
      .eq("id", storeId)
      .maybeSingle();

    const today = new Date().toISOString().slice(0, 10);
    const daysNotice = daysBetween(today, schedule.start_date);

    const pdfBytes = await buildNoticePdf({ employee, store, schedule, daysNotice });
    const fileName = `aviso-previo-ferias-${fmtDateBR(schedule.start_date).replace(/\//g, "-")}-${(employee.full_name || "").replace(/[^A-Za-z0-9]+/g, "_")}.pdf`;
    const path = `${schedule.employee_id}/${Date.now()}-notice-${Math.random().toString(36).slice(2)}.pdf`;

    const { error: upErr } = await admin.storage
      .from("employee-documents")
      .upload(path, pdfBytes, { contentType: "application/pdf" });
    if (upErr) throw upErr;

    await admin.from("employee_documents").insert({
      employee_id: schedule.employee_id,
      doc_type: "vacation_notice",
      file_name: fileName,
      file_path: path,
      mime_type: "application/pdf",
      size_bytes: pdfBytes.byteLength,
    });

    await admin.from("vacation_schedules").update({
      notice_pdf_url: path,
      notice_generated_at: new Date().toISOString(),
    }).eq("id", scheduleId);

    // Notificação no sino para o colaborador dar ciência
    if (employee.user_id) {
      await admin.from("user_notifications").insert({
        user_id: employee.user_id,
        title: "Aviso prévio de férias",
        message: `Suas férias de ${fmtDateBR(schedule.start_date)} a ${fmtDateBR(schedule.end_date)} foram aprovadas. Confirme a ciência do aviso prévio.`,
        category: "hr",
        tag: `vacation-notice:${scheduleId}`,
        url: "/area-colaborador?tab=vacation",
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      pdf_path: path,
      days_notice: daysNotice,
      warning: daysNotice < 30 ? "Aviso emitido com menos de 30 dias de antecedência (art. 135 CLT)" : null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("generate-vacation-notice error", e);
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
