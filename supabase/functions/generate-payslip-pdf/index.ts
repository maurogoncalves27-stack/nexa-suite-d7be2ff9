// Edge function: gera PDF do holerite já carimbado pela empresa
// e cria/atualiza o registro em payroll_receipts. Em lote (por período)
// ou para um único colaborador.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const fmtBRL = (n: number) =>
  (n ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface Earning {
  label: string;
  ref?: string;
  amount: number;
}
interface Discount {
  label: string;
  ref?: string;
  amount: number;
}

function buildEarningsAndDiscounts(p: any): {
  earnings: Earning[];
  discounts: Discount[];
} {
  const earnings: Earning[] = [];
  const discounts: Discount[] = [];

  if (Number(p.proportional_salary) > 0)
    earnings.push({
      label: "Salário",
      ref: `${p.worked_days} dias`,
      amount: Number(p.proportional_salary),
    });
  if (Number(p.overtime_amount) > 0)
    earnings.push({
      label: "Horas Extras",
      ref: `${Number(p.overtime_hours).toFixed(2)} h`,
      amount: Number(p.overtime_amount),
    });
  if (Number(p.productivity) > 0)
    earnings.push({ label: "Produtividade", amount: Number(p.productivity) });
  if (Number(p.family_allowance) > 0)
    earnings.push({
      label: "Salário Família",
      amount: Number(p.family_allowance),
    });
  if (Number(p.transport_voucher) > 0)
    earnings.push({
      label: "Vale Transporte",
      amount: Number(p.transport_voucher),
    });
  if (Number(p.food_voucher) > 0)
    earnings.push({
      label: "Vale Alimentação",
      amount: Number(p.food_voucher),
    });
  if (Number(p.other_earnings) > 0)
    earnings.push({ label: "Outros Proventos", amount: Number(p.other_earnings) });

  if (Number(p.inss) > 0)
    discounts.push({ label: "INSS", amount: Number(p.inss) });
  if (Number(p.irrf) > 0)
    discounts.push({ label: "IRRF", amount: Number(p.irrf) });
  if (Number(p.transport_discount) > 0)
    discounts.push({
      label: "Desc. Vale Transporte",
      amount: Number(p.transport_discount),
    });
  if (Number(p.health_plan) > 0)
    discounts.push({ label: "Plano de Saúde", amount: Number(p.health_plan) });
  if (Number(p.advance) > 0)
    discounts.push({ label: "Adiantamento", amount: Number(p.advance) });
  if (Number(p.absence_discount) > 0)
    discounts.push({
      label: "Faltas",
      ref: `${p.absent_days} dias`,
      amount: Number(p.absence_discount),
    });
  if (Number(p.dsr_loss_discount) > 0)
    discounts.push({ label: "DSR (perdido)", amount: Number(p.dsr_loss_discount) });
  if (Number(p.infraction_discount) > 0)
    discounts.push({
      label: "Desc. Infrações",
      amount: Number(p.infraction_discount),
    });
  if (Number(p.other_discounts) > 0)
    discounts.push({
      label: "Outros Descontos",
      amount: Number(p.other_discounts),
    });

  return { earnings, discounts };
}

async function buildPayslipPdf(opts: {
  employee: any;
  store: any;
  payroll: any;
  year: number;
  month: number;
  stampHash: string;
  stampAt: Date;
}): Promise<Uint8Array> {
  const { employee, store, payroll, year, month, stampHash, stampAt } = opts;

  const pdf = await PDFDocument.create();
  pdf.setTitle(
    `Holerite ${MONTHS_PT[month - 1]}/${year} - ${employee.full_name}`,
  );
  pdf.setCreator("RH+ - Lovable Cloud");

  const page = pdf.addPage([595, 842]); // A4
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const black = rgb(0, 0, 0);
  const gray = rgb(0.45, 0.45, 0.45);
  const lineCol = rgb(0.85, 0.85, 0.85);

  let y = 800;
  const left = 40;
  const right = 555;

  // Cabeçalho empresa
  page.drawText(store?.legal_name || store?.name || "Empresa", {
    x: left, y, size: 13, font: helvBold, color: black,
  });
  y -= 16;
  if (store?.cnpj) {
    page.drawText(`CNPJ: ${store.cnpj}`, {
      x: left, y, size: 9, font: helv, color: gray,
    });
    y -= 12;
  }
  const addrLine = [store?.address, store?.city, store?.state]
    .filter(Boolean).join(" - ");
  if (addrLine) {
    page.drawText(addrLine, { x: left, y, size: 9, font: helv, color: gray });
    y -= 12;
  }

  // Título
  y -= 10;
  page.drawText("RECIBO DE PAGAMENTO DE SALÁRIO", {
    x: left, y, size: 12, font: helvBold, color: black,
  });
  page.drawText(`Referência: ${MONTHS_PT[month - 1]}/${year}`, {
    x: right - 160, y, size: 10, font: helv, color: black,
  });
  y -= 18;
  page.drawLine({
    start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: lineCol,
  });
  y -= 18;

  // Dados colaborador
  const drawKV = (label: string, value: string, x: number) => {
    page.drawText(label, { x, y, size: 8, font: helv, color: gray });
    page.drawText(value || "-", { x, y: y - 11, size: 10, font: helvBold, color: black });
  };
  drawKV("Colaborador", employee.full_name || "-", left);
  drawKV("CPF", employee.cpf || "-", left + 280);
  y -= 28;
  drawKV("Cargo", employee.position || "-", left);
  drawKV(
    "Admissão",
    employee.admission_date
      ? new Date(employee.admission_date).toLocaleDateString("pt-BR")
      : "-",
    left + 280,
  );
  y -= 28;
  drawKV("Loja", store?.name || "-", left);
  drawKV("Salário Base", fmtBRL(Number(payroll.base_salary)), left + 280);
  y -= 28;

  page.drawLine({
    start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: lineCol,
  });
  y -= 18;

  // Tabela proventos/descontos
  const { earnings, discounts } = buildEarningsAndDiscounts(payroll);

  page.drawText("Descrição", { x: left, y, size: 9, font: helvBold, color: black });
  page.drawText("Ref.", { x: left + 270, y, size: 9, font: helvBold, color: black });
  page.drawText("Provento", { x: left + 340, y, size: 9, font: helvBold, color: black });
  page.drawText("Desconto", { x: left + 440, y, size: 9, font: helvBold, color: black });
  y -= 10;
  page.drawLine({
    start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: lineCol,
  });
  y -= 14;

  const drawRow = (
    label: string, ref: string, prov: string, desc: string,
  ) => {
    page.drawText(label, { x: left, y, size: 9, font: helv, color: black });
    if (ref) page.drawText(ref, { x: left + 270, y, size: 9, font: helv, color: gray });
    if (prov) page.drawText(prov, { x: left + 340, y, size: 9, font: helv, color: black });
    if (desc) page.drawText(desc, { x: left + 440, y, size: 9, font: helv, color: black });
    y -= 14;
  };

  for (const e of earnings) {
    drawRow(e.label, e.ref || "", fmtBRL(e.amount), "");
  }
  for (const d of discounts) {
    drawRow(d.label, d.ref || "", "", fmtBRL(d.amount));
  }

  y -= 4;
  page.drawLine({
    start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: lineCol,
  });
  y -= 18;

  // Totais
  page.drawText("Total Proventos", { x: left, y, size: 10, font: helvBold });
  page.drawText(fmtBRL(Number(payroll.total_earnings)), {
    x: left + 340, y, size: 10, font: helvBold,
  });
  y -= 14;
  page.drawText("Total Descontos", { x: left, y, size: 10, font: helvBold });
  page.drawText(fmtBRL(Number(payroll.total_discounts)), {
    x: left + 440, y, size: 10, font: helvBold,
  });
  y -= 18;

  page.drawRectangle({
    x: left, y: y - 6, width: right - left, height: 26,
    color: rgb(0.93, 0.97, 0.93),
  });
  page.drawText("VALOR LÍQUIDO A RECEBER", {
    x: left + 10, y: y + 4, size: 11, font: helvBold,
  });
  page.drawText(fmtBRL(Number(payroll.net_pay)), {
    x: right - 110, y: y + 4, size: 12, font: helvBold,
  });
  y -= 36;

  // Bases (informativo)
  y -= 10;
  page.drawText("Bases:", { x: left, y, size: 8, font: helvBold, color: gray });
  y -= 11;
  page.drawText(
    `FGTS do mês: ${fmtBRL(Number(payroll.fgts))}`,
    { x: left, y, size: 8, font: helv, color: gray },
  );
  y -= 24;

  // Bloco assinatura empresa (carimbo eletrônico)
  page.drawLine({
    start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: lineCol,
  });
  y -= 14;
  page.drawText("Assinatura da Empresa (eletrônica)", {
    x: left, y, size: 9, font: helvBold, color: black,
  });
  y -= 12;
  page.drawText(
    `Documento emitido e assinado eletronicamente por ${
      store?.legal_name || store?.name || "Empresa"
    }`,
    { x: left, y, size: 8, font: helv, color: black },
  );
  y -= 10;
  page.drawText(
    `em ${stampAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` +
      ` (horário de Brasília). Hash: ${stampHash.slice(0, 32)}…`,
    { x: left, y, size: 8, font: helv, color: gray },
  );
  y -= 10;
  page.drawText(
    "Validade jurídica: assinatura eletrônica simples (MP 2.200-2/2001, art. 10, §2º).",
    { x: left, y, size: 7.5, font: helv, color: gray },
  );

  // Bloco assinatura colaborador (placeholder)
  y -= 36;
  page.drawLine({
    start: { x: left, y: y + 6 }, end: { x: left + 240, y: y + 6 },
    thickness: 0.5, color: black,
  });
  page.drawText("Assinatura do(a) Colaborador(a)", {
    x: left, y: y - 4, size: 8, font: helv, color: gray,
  });
  page.drawText(employee.full_name || "", {
    x: left, y: y - 14, size: 9, font: helvBold, color: black,
  });
  page.drawText(`CPF: ${employee.cpf || "-"}`, {
    x: left, y: y - 24, size: 8, font: helv, color: gray,
  });

  return await pdf.save();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cliente para validar usuário
    const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cliente admin para escrever
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Checa role admin/manager
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const isStaff = (roles || []).some(
      (r: any) => r.role === "admin" || r.role === "manager",
    );
    if (!isStaff) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const year = Number(body.year);
    const month = Number(body.month);
    const employeeIds: string[] | undefined = body.employee_ids;
    if (!year || !month || month < 1 || month > 12) {
      return new Response(JSON.stringify({ error: "invalid period" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Busca folhas calculadas do período
    let q = admin
      .from("payroll_calculated")
      .select("*")
      .eq("reference_year", year)
      .eq("reference_month", month);
    if (employeeIds && employeeIds.length > 0) q = q.in("employee_id", employeeIds);
    const { data: payrolls, error: pErr } = await q;
    if (pErr) throw pErr;
    if (!payrolls || payrolls.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, generated: 0, message: "Nenhuma folha calculada para o período." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Busca colaboradores
    const empIds = payrolls.map((p: any) => p.employee_id);
    const { data: employees } = await admin
      .from("employees")
      .select("id, full_name, cpf, position, admission_date, store_id")
      .in("id", empIds);
    const empMap = new Map((employees || []).map((e: any) => [e.id, e]));

    // Busca lojas
    const storeIds = Array.from(
      new Set((employees || []).map((e: any) => e.store_id).filter(Boolean)),
    );
    const { data: stores } = await admin
      .from("stores")
      .select("id, name, legal_name, cnpj, address, city, state")
      .in("id", storeIds);
    const storeMap = new Map((stores || []).map((s: any) => [s.id, s]));

    let generated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const p of payrolls) {
      try {
        const employee = empMap.get(p.employee_id);
        if (!employee) {
          skipped++;
          continue;
        }
        const store = employee.store_id ? storeMap.get(employee.store_id) : null;

        // Não regenera se já assinado
        const { data: existing } = await admin
          .from("payroll_receipts")
          .select("id, status")
          .eq("employee_id", p.employee_id)
          .eq("reference_year", year)
          .eq("reference_month", month)
          .maybeSingle();

        if (existing && existing.status === "signed") {
          skipped++;
          continue;
        }

        const stampAt = new Date();
        const stampHash = await sha256Hex(
          [
            p.employee_id, year, month,
            p.net_pay, p.total_earnings, p.total_discounts,
            stampAt.toISOString(),
          ].join("|"),
        );

        const pdfBytes = await buildPayslipPdf({
          employee, store, payroll: p, year, month, stampHash, stampAt,
        });

        const path = `${p.employee_id}/${year}-${String(month).padStart(2, "0")}-unsigned.pdf`;
        const up = await admin.storage
          .from("payroll-receipts")
          .upload(path, pdfBytes, {
            contentType: "application/pdf",
            upsert: true,
          });
        if (up.error) throw up.error;

        const upsertPayload = {
          employee_id: p.employee_id,
          reference_year: year,
          reference_month: month,
          payroll_calculated_id: p.id,
          status: "pending",
          unsigned_file_path: path,
          signed_file_path: null,
          company_stamp_at: stampAt.toISOString(),
          company_stamp_hash: stampHash,
          net_pay: Number(p.net_pay),
          sent_by: userData.user.id,
          sent_at: stampAt.toISOString(),
        };

        const { error: upErr } = await admin
          .from("payroll_receipts")
          .upsert(upsertPayload, { onConflict: "employee_id,reference_year,reference_month" });
        if (upErr) throw upErr;

        // Cria aviso direcionado ao colaborador + dispara push
        try {
          const empName = (employee as any).full_name as string;
          const firstName = (empName || "").split(" ")[0] || "";
          const monthLabel = `${MONTHS_PT[month - 1]}/${year}`;
          const msg = `${firstName}, seu holerite de ${monthLabel} está em "Meus holerites" para assinatura.`.slice(0, 100);
          const { data: ann, error: annErr } = await admin
            .from("hr_announcements")
            .insert({
              title: `Holerite de ${monthLabel} disponível para assinatura`,
              message: msg,
              priority: "urgent",
              scope: "employee",
              employee_id: p.employee_id,
              is_active: true,
              send_push: true,
              created_by: userData.user.id,
            })
            .select("id")
            .maybeSingle();
          if (annErr) console.error("announcement insert fail:", annErr);
          if (ann?.id) {
            admin.functions
              .invoke("send-push-notification", { body: { announcement_id: ann.id } })
              .catch((e) => console.error("push payslip fail:", e));
          }
        } catch (e) {
          console.error("notify payslip fail:", e);
        }

        generated++;
      } catch (err: any) {
        errors.push(`${p.employee_id}: ${err.message || err}`);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, generated, skipped, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("generate-payslip-pdf error", err);
    return new Response(
      JSON.stringify({ error: err.message || String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
