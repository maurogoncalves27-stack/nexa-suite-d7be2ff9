// Edge function: calculate-vacation-receipt
// Calcula o recibo de férias (proporcional + 1/3 + abono pecuniário),
// aplica INSS/IRRF sobre a base tributável, gera PDF, arquiva na Pasta
// do Colaborador e cria a conta a pagar com vencimento 2 dias antes do
// início das férias.
//
// Chamada:
//   POST { vacation_schedule_id }
//
// Idempotente: usa upsert por vacation_schedule_id em vacation_receipts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ===== Tabelas oficiais =====
const INSS_BRACKETS = [
  { upTo: 1621.00, rate: 0.075, deduction: 0 },
  { upTo: 2902.84, rate: 0.09, deduction: 24.32 },
  { upTo: 4354.27, rate: 0.12, deduction: 111.40 },
  { upTo: 8475.55, rate: 0.14, deduction: 198.49 },
];
const IRRF_BRACKETS = [
  { upTo: 2428.8, rate: 0, deduction: 0 },
  { upTo: 2826.65, rate: 0.075, deduction: 182.16 },
  { upTo: 3751.05, rate: 0.15, deduction: 394.16 },
  { upTo: 4664.68, rate: 0.225, deduction: 675.49 },
  { upTo: Infinity, rate: 0.275, deduction: 908.73 },
];
const IRRF_DEPENDENT_DEDUCTION = 189.59;
const IRRF_SIMPLIFIED_DEDUCTION = 564.8;

const r2 = (n: number) => Math.round(n * 100) / 100;

function calcINSS(gross: number): number {
  if (gross <= 0) return 0;
  const capped = Math.min(gross, INSS_BRACKETS[INSS_BRACKETS.length - 1].upTo);
  for (const b of INSS_BRACKETS) {
    if (capped <= b.upTo) return r2(capped * b.rate - b.deduction);
  }
  return 0;
}

function calcIRRF(gross: number, inss: number, deps: number): number {
  if (gross <= 0) return 0;
  const traditional = Math.max(0, gross - inss - deps * IRRF_DEPENDENT_DEDUCTION);
  const simplified = Math.max(0, gross - IRRF_SIMPLIFIED_DEDUCTION);
  const base = Math.min(traditional, simplified);
  for (const b of IRRF_BRACKETS) {
    if (base <= b.upTo) {
      const tax = base * b.rate - b.deduction;
      return tax > 0 ? r2(tax) : 0;
    }
  }
  return 0;
}

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const fmtBRL = (n: number) =>
  (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDateBR = (iso: string | null | undefined) => {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

/** Vencimento = start_date - 2 dias (recuando pra sexta se cair fds). */
function computeDueDate(startDateIso: string): string {
  const d = new Date(`${startDateIso}T00:00:00`);
  d.setDate(d.getDate() - 2);
  // Recuar sábado (6) → sexta (-1), domingo (0) → sexta (-2)
  const day = d.getDay();
  if (day === 6) d.setDate(d.getDate() - 1);
  else if (day === 0) d.setDate(d.getDate() - 2);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

async function buildVacationPdf(opts: {
  employee: any;
  store: any;
  schedule: any;
  calc: {
    monthlySalary: number;
    dailyBase: number;
    vacationDays: number;
    sellDays: number;
    vacationBase: number;
    oneThird: number;
    sellAmount: number;
    sellOneThird: number;
    grossTotal: number;
    taxBase: number;
    dependents: number;
    inss: number;
    irrf: number;
    fgts: number;
    netTotal: number;
  };
}): Promise<Uint8Array> {

  const { employee, store, schedule, calc } = opts;
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Recibo de Férias - ${employee.full_name}`);
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
  page.drawText("RECIBO DE PAGAMENTO DE FÉRIAS", {
    x: left, y, size: 12, font: bold, color: black,
  });
  y -= 18;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: line });
  y -= 16;

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
  kv("Período aquisitivo", `${fmtDateBR(schedule.acquisition_start)} a ${fmtDateBR(schedule.acquisition_end)}`, left);
  kv("Parcela", String(schedule.installment_number ?? 1), left + 280);
  y -= 28;
  kv("Gozo", `${fmtDateBR(schedule.start_date)} a ${fmtDateBR(schedule.end_date)}`, left);
  kv("Dias de gozo", String(calc.vacationDays), left + 280);
  y -= 28;
  if (calc.sellDays > 0) {
    kv("Abono pecuniário", `${calc.sellDays} dias`, left);
    y -= 28;
  }

  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: line });
  y -= 16;

  page.drawText("Descrição", { x: left, y, size: 9, font: bold });
  page.drawText("Provento", { x: left + 340, y, size: 9, font: bold });
  page.drawText("Desconto", { x: left + 440, y, size: 9, font: bold });
  y -= 12;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: line });
  y -= 14;

  const row = (label: string, prov?: number, desc?: number) => {
    page.drawText(label, { x: left, y, size: 9, font: helv });
    if (prov !== undefined) page.drawText(fmtBRL(prov), { x: left + 340, y, size: 9, font: helv });
    if (desc !== undefined) page.drawText(fmtBRL(desc), { x: left + 440, y, size: 9, font: helv });
    y -= 14;
  };

  row(`Férias ${calc.vacationDays} dias`, calc.vacationBase);
  row("1/3 constitucional s/ férias", calc.oneThird);
  if (calc.sellDays > 0) {
    row(`Abono pecuniário ${calc.sellDays} dias`, calc.sellAmount);
    row("1/3 s/ abono pecuniário", calc.sellOneThird);
  }
  row("INSS", undefined, calc.inss);
  row("IRRF", undefined, calc.irrf);

  y -= 4;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: line });
  y -= 18;

  page.drawText("Total Proventos", { x: left, y, size: 10, font: bold });
  page.drawText(fmtBRL(calc.grossTotal), { x: left + 340, y, size: 10, font: bold });
  y -= 14;
  page.drawText("Total Descontos", { x: left, y, size: 10, font: bold });
  page.drawText(fmtBRL(calc.inss + calc.irrf), { x: left + 440, y, size: 10, font: bold });
  y -= 18;
  page.drawRectangle({ x: left, y: y - 6, width: right - left, height: 26, color: rgb(0.93, 0.97, 0.93) });
  page.drawText("VALOR LÍQUIDO A RECEBER", { x: left + 10, y: y + 4, size: 11, font: bold });
  page.drawText(fmtBRL(calc.netTotal), { x: right - 120, y: y + 4, size: 12, font: bold });
  y -= 36;

  y -= 8;
  page.drawText(`FGTS do mês (informativo): ${fmtBRL(calc.fgts)}`, { x: left, y, size: 8, font: helv, color: gray });
  y -= 20;

  // ===== Memória de cálculo =====
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: line });
  y -= 14;
  page.drawText("MEMÓRIA DE CÁLCULO", { x: left, y, size: 10, font: bold, color: black });
  y -= 14;

  const memo = (label: string, value: string) => {
    page.drawText(label, { x: left, y, size: 8, font: helv, color: gray });
    page.drawText(value, { x: left + 300, y, size: 8, font: helv, color: black });
    y -= 11;
  };
  memo("Salário mensal base", fmtBRL(calc.monthlySalary));
  memo("Diária (salário ÷ 30)", `${fmtBRL(calc.dailyBase)}/dia`);
  memo(`Férias: ${fmtBRL(calc.dailyBase)} × ${calc.vacationDays} dias`, fmtBRL(calc.vacationBase));
  memo(`1/3 constitucional: ${fmtBRL(calc.vacationBase)} ÷ 3`, fmtBRL(calc.oneThird));
  if (calc.sellDays > 0) {
    memo(`Abono pecuniário: ${fmtBRL(calc.dailyBase)} × ${calc.sellDays} dias`, fmtBRL(calc.sellAmount));
    memo(`1/3 s/ abono: ${fmtBRL(calc.sellAmount)} ÷ 3`, fmtBRL(calc.sellOneThird));
  }
  memo("Total bruto", fmtBRL(calc.grossTotal));
  y -= 4;
  memo("Base tributável (férias + 1/3)", `${fmtBRL(calc.taxBase)} — abono é isento`);
  memo(`INSS s/ ${fmtBRL(calc.taxBase)} (tabela progressiva 2026)`, fmtBRL(calc.inss));
  memo(`IRRF (base − INSS − ${calc.dependents} dep.) — desc. simplif.`, fmtBRL(calc.irrf));
  memo("Líquido = bruto − INSS − IRRF", fmtBRL(calc.netTotal));
  y -= 10;

  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: line });
  y -= 14;
  page.drawText("Assinatura do(a) Colaborador(a)", { x: left, y, size: 8, font: helv, color: gray });
  y -= 10;
  page.drawText(employee.full_name || "", { x: left, y, size: 9, font: bold });


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
      .select("id, full_name, cpf, position, salary, salary_type, monthly_hours, admission_date, hire_date, allocated_store_id, store_id, pix_key, pix_key_type")
      .eq("id", schedule.employee_id)
      .single();
    if (!employee) throw new Error("employee not found");

    const storeId = employee.allocated_store_id || employee.store_id;
    const { data: store } = await admin
      .from("stores")
      .select("id, name, legal_name, cnpj, address, city, state")
      .eq("id", storeId)
      .maybeSingle();

    const { count: depCount } = await admin
      .from("employee_dependents")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", schedule.employee_id);
    const dependents = depCount ?? 0;

    // Base contratual
    const isHourly = String(employee.salary_type ?? "").toLowerCase() === "horario";
    const monthlyHours = Number(employee.monthly_hours ?? 220) || 220;
    const monthlySalary = isHourly
      ? r2(Number(employee.salary ?? 0) * monthlyHours)
      : Number(employee.salary ?? 0);

    // Média das verbas variáveis dos últimos 12 holerites (Súmula 45 TST, CLT art. 142 §§5-6)
    // Produtividade CCT (5%), horas extras, adicional noturno e feriado trabalhado integram a base.
    const { data: payHistory } = await admin
      .from("payroll_calculated")
      .select("reference_year, reference_month, productivity, overtime_amount, calculation_details")
      .eq("employee_id", schedule.employee_id)
      .order("reference_year", { ascending: false })
      .order("reference_month", { ascending: false })
      .limit(12);
    const variablesHistory: Array<{ y: number; m: number; productivity: number; overtime: number; night: number; holiday: number; total: number }> = [];
    let sumVariables = 0;
    for (const p of payHistory ?? []) {
      const cd = (p.calculation_details ?? {}) as any;
      const productivity = Number(p.productivity ?? 0);
      const overtime = Number(p.overtime_amount ?? 0);
      const night = Number(cd.night_addition ?? 0);
      const holiday = Number(cd.holiday_pay ?? 0);
      const total = productivity + overtime + night + holiday;
      variablesHistory.push({ y: p.reference_year, m: p.reference_month, productivity, overtime, night, holiday, total });
      sumVariables += total;
    }
    const variablesMonths = variablesHistory.length;
    const avgVariables = variablesMonths > 0 ? r2(sumVariables / variablesMonths) : 0;
    const composedMonthly = r2(monthlySalary + avgVariables);

    const vacationDays = Number(schedule.days_count ?? 0);
    const sellDays = Number(schedule.sell_days ?? 0);
    const dailyBase = composedMonthly / 30;

    const vacationBase = r2(dailyBase * vacationDays);
    const oneThird = r2(vacationBase / 3);
    const sellAmount = r2(dailyBase * sellDays);
    const sellOneThird = r2(sellAmount / 3);


    // Base tributável = férias + 1/3 (abono é isento de INSS/IRRF até 20 dias)
    const taxBase = r2(vacationBase + oneThird);
    const inss = calcINSS(taxBase);
    const irrf = calcIRRF(taxBase, inss, dependents);
    const fgts = r2(taxBase * 0.08);

    const grossTotal = r2(vacationBase + oneThird + sellAmount + sellOneThird);
    const netTotal = r2(grossTotal - inss - irrf);

    const dueDate = computeDueDate(schedule.start_date);
    const refDate = new Date(`${schedule.start_date}T00:00:00`);
    const refYear = refDate.getFullYear();
    const refMonth = refDate.getMonth() + 1;

    // Upsert do recibo
    const { data: upserted, error: upErr } = await admin
      .from("vacation_receipts")
      .upsert({
        vacation_schedule_id: scheduleId,
        employee_id: schedule.employee_id,
        reference_year: refYear,
        reference_month: refMonth,
        monthly_salary: monthlySalary,
        vacation_days: vacationDays,
        sell_days: sellDays,
        vacation_base: vacationBase,
        one_third: oneThird,
        sell_amount: sellAmount,
        sell_one_third: sellOneThird,
        gross_total: grossTotal,
        inss,
        irrf,
        fgts,
        net_total: netTotal,
        payment_due_date: dueDate,
        calculation_details: {
          dependents,
          daily_base: r2(dailyBase),
          tax_base: taxBase,
          avg_variables: avgVariables,
          variables_months: variablesMonths,
          composed_monthly: composedMonthly,
          variables_history: variablesHistory,
          tables_version: "2026-01",
        },

        calculated_at: new Date().toISOString(),
      }, { onConflict: "vacation_schedule_id" })
      .select("id, accounts_payable_id, payment_status")
      .single();
    if (upErr) throw upErr;
    const receiptId = upserted.id;

    // PDF
    const pdfBytes = await buildVacationPdf({
      employee, store, schedule,
      calc: {
        monthlySalary, avgVariables, variablesMonths, composedMonthly,
        dailyBase: r2(dailyBase), vacationDays, sellDays,
        vacationBase, oneThird, sellAmount, sellOneThird,
        grossTotal, taxBase, dependents, inss, irrf, fgts, netTotal,
      },
    });


    const fileName = `recibo-ferias-${refYear}-${String(refMonth).padStart(2, "0")}-${(employee.full_name || "").replace(/[^A-Za-z0-9]+/g, "_")}.pdf`;
    const path = `${schedule.employee_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
    await admin.storage.from("employee-documents").upload(path, pdfBytes, { contentType: "application/pdf" });
    await admin.from("employee_documents").insert({
      employee_id: schedule.employee_id,
      doc_type: "vacation_receipt",
      file_name: fileName,
      file_path: path,
      mime_type: "application/pdf",
      size_bytes: pdfBytes.byteLength,
    });

    await admin.from("vacation_receipts").update({
      pdf_url: path,
      pdf_generated_at: new Date().toISOString(),
    }).eq("id", receiptId);

    // Conta a pagar (se ainda não existe e recibo pendente)
    let apId = upserted.accounts_payable_id;
    if (!apId && upserted.payment_status === "pending" && netTotal > 0) {
      const { data: ap, error: apErr } = await admin
        .from("accounts_payable")
        .insert({
          store_id: storeId ?? null,
          description: `Férias ${employee.full_name} — ${fmtDateBR(schedule.start_date)} a ${fmtDateBR(schedule.end_date)}`,
          supplier_name: employee.full_name,
          due_date: dueDate,
          amount: netTotal,
          status: "pending",
          competence_date: `${refYear}-${String(refMonth).padStart(2, "0")}-01`,
        })
        .select("id")
        .single();
      if (!apErr && ap) {
        apId = ap.id;
        await admin.from("vacation_receipts").update({ accounts_payable_id: apId }).eq("id", receiptId);
      } else if (apErr) {
        console.warn("accounts_payable insert failed:", apErr);
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      receipt_id: receiptId,
      gross_total: grossTotal,
      net_total: netTotal,
      due_date: dueDate,
      accounts_payable_id: apId,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("calculate-vacation-receipt error", e);
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
