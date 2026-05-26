import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface TimesheetClosureEntry {
  entry_type: string;
  entry_at: string; // ISO
  reference_date: string; // YYYY-MM-DD
  is_manual?: boolean | null;
  is_outside_geofence?: boolean | null;
}

export interface TimesheetClosureLeave {
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  leave_type: string;
  notes?: string | null;
}

export interface TimesheetClosureRow {
  employee_name: string;
  employee_cpf?: string | null;
  employee_admission?: string | null;
  store_name: string | null;
  store_address?: string | null;
  company_name?: string | null;
  company_cnpj?: string | null;
  position: string | null;
  worked_days: number | null;
  scheduled_work_days: number | null;
  worked_minutes: number | null;
  scheduled_minutes?: number | null;
  absences: number | null;
  leaves_count: number | null;
  status: string;
  accepted_at: string | null;
  accepted_ip: string | null;
  entries?: TimesheetClosureEntry[];
  leaves?: TimesheetClosureLeave[];
}

const LEAVE_LABEL: Record<string, string> = {
  medical_certificate: "ATESTADO MÉDICO",
  vacation: "FÉRIAS",
  maternity: "LIC. MATERNIDADE",
  paternity: "LIC. PATERNIDADE",
  unpaid: "AFASTAMENTO",
  inss: "AFASTAMENTO INSS",
  suspension: "SUSPENSÃO",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Aberto",
  awaiting_acceptance: "Aguardando aceite",
  accepted: "Aceito pelo colaborador",
  sent_to_accounting: "Enviado contabilidade",
};

const ENTRY_TYPE_ORDER = ["clock_in", "break_start", "break_end", "clock_out"] as const;

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function fmtHours(min: number | null) {
  if (min === null || min === undefined) return "—";
  const sign = min < 0 ? "-" : "";
  const a = Math.abs(min);
  return `${sign}${Math.floor(a / 60)}:${pad(a % 60)}`;
}

function computeDayWorkedMinutes(items: TimesheetClosureEntry[]) {
  const ci = items.find((x) => x.entry_type === "clock_in");
  const co = [...items].reverse().find((x) => x.entry_type === "clock_out");
  const bs = items.find((x) => x.entry_type === "break_start");
  const be = items.find((x) => x.entry_type === "break_end");
  if (!ci || !co) return 0;
  const total = (new Date(co.entry_at).getTime() - new Date(ci.entry_at).getTime()) / 60000;
  const brk = bs && be ? (new Date(be.entry_at).getTime() - new Date(bs.entry_at).getTime()) / 60000 : 0;
  return Math.max(0, total - Math.max(0, brk));
}

/**
 * Renderiza uma única página de espelho de ponto (estilo folha de ponto tradicional)
 * para um colaborador com cabeçalho, tabela de batidas dia-a-dia e totalizadores.
 */
function renderEmployeeSheet(
  doc: jsPDF,
  r: TimesheetClosureRow,
  opts: { year: number; month: number; companyName?: string; generatedBy?: string },
) {
  const { year, month, companyName, generatedBy } = opts;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 10;
  const periodStart = `01/${pad(month)}/${year}`;
  const lastDay = new Date(year, month, 0).getDate();
  const periodEnd = `${pad(lastDay)}/${pad(month)}/${year}`;

  // ===== Cabeçalho =====
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Folha de Ponto", pageW / 2, 14, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`${periodStart} a ${periodEnd}`, pageW / 2, 20, { align: "center" });

  // ===== Bloco empregador / colaborador =====
  let y = 28;
  const colW = (pageW - marginX * 2) / 2;
  doc.setDrawColor(180);
  doc.setLineWidth(0.2);

  // Empregador
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("DADOS DO EMPREGADOR", marginX + 1, y);
  doc.setFont("helvetica", "normal");
  doc.text(`Nome: ${r.company_name ?? companyName ?? "—"}`, marginX + 1, y + 4);
  doc.text(`CNPJ: ${r.company_cnpj ?? "—"}`, marginX + 1, y + 8);
  doc.text(`Endereço: ${r.store_address ?? "—"}`, marginX + 1, y + 12, { maxWidth: colW - 2 });
  doc.text(`Local: ${r.store_name ?? "—"}`, marginX + 1, y + 16);

  // Colaborador
  const x2 = marginX + colW;
  doc.setFont("helvetica", "bold");
  doc.text("DADOS DO COLABORADOR", x2 + 1, y);
  doc.setFont("helvetica", "normal");
  doc.text(`Nome: ${r.employee_name}`, x2 + 1, y + 4);
  doc.text(`CPF: ${r.employee_cpf ?? "—"}`, x2 + 1, y + 8);
  doc.text(
    `Admissão: ${r.employee_admission ? format(new Date(r.employee_admission), "dd/MM/yyyy") : "—"}`,
    x2 + 1,
    y + 12,
  );
  doc.text(`Função: ${r.position ?? "—"}`, x2 + 1, y + 16);

  doc.rect(marginX, y - 4, colW, 22);
  doc.rect(marginX + colW, y - 4, colW, 22);

  y += 22;

  // ===== Tabela diária =====
  // Colunas: Dia | Entrada | Saída pausa | Retorno | Saída | Trab. | Prev. | Saldo | Obs.
  const headers = ["DIA / MÊS", "ENTRADA", "SAÍDA INT.", "RETORNO", "SAÍDA", "TRABALHADAS", "PREVISTAS", "SALDO", "OBS."];
  const widths = [32, 18, 22, 20, 18, 24, 22, 18, 16];
  const tableW = widths.reduce((s, v) => s + v, 0);
  // Centraliza tabela
  const tableX = (pageW - tableW) / 2;

  const drawTableHeader = () => {
    doc.setFillColor(230, 230, 230);
    doc.rect(tableX, y, tableW, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    let x = tableX;
    headers.forEach((h, i) => {
      doc.text(h, x + widths[i] / 2, y + 4, { align: "center" });
      doc.rect(x, y, widths[i], 6);
      x += widths[i];
    });
    doc.setFont("helvetica", "normal");
    y += 6;
  };

  drawTableHeader();

  // Agrupa entries por data
  const byDate = new Map<string, TimesheetClosureEntry[]>();
  for (const e of r.entries ?? []) {
    if (!byDate.has(e.reference_date)) byDate.set(e.reference_date, []);
    byDate.get(e.reference_date)!.push(e);
  }

  // Define jornada diária prevista (em minutos): scheduled_minutes / scheduled_work_days
  const dailyScheduledMin =
    r.scheduled_minutes && r.scheduled_work_days
      ? Math.round(r.scheduled_minutes / r.scheduled_work_days)
      : 0;

  // Lista todos os dias do mês
  let totalWorked = 0;
  let totalScheduled = 0;
  let totalBalance = 0;

  doc.setFontSize(7);
  const leavesArr = r.leaves ?? [];
  const findLeaveOnDate = (ds: string) =>
    leavesArr.find((l) => l.start_date <= ds && l.end_date >= ds);

  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${year}-${pad(month)}-${pad(d)}`;
    const items = (byDate.get(dateStr) ?? []).slice().sort((a, b) => a.entry_at.localeCompare(b.entry_at));
    const byType: Record<string, TimesheetClosureEntry | undefined> = {};
    for (const t of ENTRY_TYPE_ORDER) {
      byType[t] = items.find((i) => i.entry_type === t);
    }
    const hasAny = items.length > 0;
    const leaveOnDay = !hasAny ? findLeaveOnDate(dateStr) : undefined;
    const dayMin = hasAny ? Math.round(computeDayWorkedMinutes(items)) : 0;
    const dayScheduled = dailyScheduledMin;
    const balance = hasAny ? dayMin - dayScheduled : 0;

    if (hasAny) {
      totalWorked += dayMin;
      totalScheduled += dayScheduled;
      totalBalance += balance;
    }

    const dateLabel = format(new Date(dateStr + "T00:00:00"), "dd/MM EEEEEE", { locale: ptBR });
    const obsArr: string[] = [];
    if (items.some((i) => i.is_manual)) obsArr.push("m");
    if (items.some((i) => i.is_outside_geofence)) obsArr.push("fora");

    // Zebra
    if (d % 2 === 0) {
      doc.setFillColor(248, 248, 248);
      doc.rect(tableX, y, tableW, 5, "F");
    }

    if (leaveOnDay) {
      // Mescla as colunas centrais para mostrar o motivo do afastamento
      const label = LEAVE_LABEL[leaveOnDay.leave_type] ?? "AFASTAMENTO";
      // Coluna data
      doc.rect(tableX, y, widths[0], 5);
      doc.text(dateLabel, tableX + widths[0] / 2, y + 3.5, { align: "center" });
      // Faixa única para colunas 1..7 (Entrada → Saldo)
      const mergedW = widths.slice(1, 8).reduce((s, v) => s + v, 0);
      const mergedX = tableX + widths[0];
      doc.setFillColor(255, 244, 214);
      doc.rect(mergedX, y, mergedW, 5, "F");
      doc.rect(mergedX, y, mergedW, 5);
      doc.setFont("helvetica", "bold");
      doc.text(label, mergedX + mergedW / 2, y + 3.5, { align: "center" });
      doc.setFont("helvetica", "normal");
      // Coluna OBS
      doc.rect(tableX + widths[0] + mergedW, y, widths[8], 5);
      y += 5;
      continue;
    }

    const cells = hasAny
      ? [
          dateLabel,
          byType.clock_in ? format(new Date(byType.clock_in.entry_at), "HH:mm") : "—",
          byType.break_start ? format(new Date(byType.break_start.entry_at), "HH:mm") : "—",
          byType.break_end ? format(new Date(byType.break_end.entry_at), "HH:mm") : "—",
          byType.clock_out ? format(new Date(byType.clock_out.entry_at), "HH:mm") : "—",
          fmtHours(dayMin),
          dayScheduled ? fmtHours(dayScheduled) : "—",
          balance !== 0 ? fmtHours(balance) : "—",
          obsArr.join(","),
        ]
      : [dateLabel, "—", "", "", "", "", "", "", ""];

    let x = tableX;
    cells.forEach((c, i) => {
      doc.rect(x, y, widths[i], 5);
      doc.text(String(c), x + widths[i] / 2, y + 3.5, { align: "center" });
      x += widths[i];
    });
    y += 5;
  }

  // ===== Linha de totais =====
  doc.setFillColor(220, 220, 220);
  doc.rect(tableX, y, tableW, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  // Texto "Total:" abrangendo até a coluna trabalhadas
  let x = tableX;
  doc.rect(x, y, widths[0] + widths[1] + widths[2] + widths[3] + widths[4], 6);
  doc.text("TOTAL", x + 2, y + 4);
  x += widths[0] + widths[1] + widths[2] + widths[3] + widths[4];

  doc.rect(x, y, widths[5], 6);
  doc.text(fmtHours(totalWorked), x + widths[5] / 2, y + 4, { align: "center" });
  x += widths[5];

  doc.rect(x, y, widths[6], 6);
  doc.text(fmtHours(totalScheduled), x + widths[6] / 2, y + 4, { align: "center" });
  x += widths[6];

  doc.rect(x, y, widths[7], 6);
  doc.text(fmtHours(totalBalance), x + widths[7] / 2, y + 4, { align: "center" });
  x += widths[7];

  doc.rect(x, y, widths[8], 6);
  y += 6;

  // ===== Rodapé com resumo =====
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  y += 3;
  const resumo = [
    `Dias trabalhados: ${r.worked_days ?? "—"}`,
    `Faltas: ${r.absences ?? 0}`,
    `Afastamentos: ${r.leaves_count ?? 0}`,
    `Status: ${STATUS_LABEL[r.status] ?? r.status}`,
  ].join("    ·    ");
  doc.text(resumo, marginX, y);
  y += 4;

  if (r.accepted_at) {
    doc.setFontSize(7);
    doc.setTextColor(80, 80, 80);
    doc.text(
      `Aceite eletrônico em ${format(new Date(r.accepted_at), "dd/MM/yyyy HH:mm:ss")}${
        r.accepted_ip ? `  ·  IP ${r.accepted_ip}` : ""
      } — equivalente à assinatura nos termos da Lei 14.063/2020.`,
      marginX,
      y,
    );
    doc.setTextColor(0);
    y += 4;
  }

  // Legenda
  doc.setFontSize(6.5);
  doc.setTextColor(110, 110, 110);
  doc.text(
    "Obs.: (m) batida lançada manualmente · (fora) batida fora da área permitida.",
    marginX,
    y,
  );

  // Geração
  doc.text(
    `Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}${generatedBy ? ` por ${generatedBy}` : ""}`,
    pageW - marginX,
    y,
    { align: "right" },
  );
  doc.setTextColor(0);
}

export function buildTimesheetClosureDoc(opts: {
  year: number;
  month: number;
  rows: TimesheetClosureRow[];
  companyName?: string;
  generatedBy?: string;
}) {
  const { year, month, rows, companyName, generatedBy } = opts;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  rows.forEach((r, idx) => {
    if (idx > 0) doc.addPage();
    renderEmployeeSheet(doc, r, { year, month, companyName, generatedBy });
  });
  return doc;
}

export function generateTimesheetClosurePdf(opts: {
  year: number;
  month: number;
  rows: TimesheetClosureRow[];
  companyName?: string;
  generatedBy?: string;
  fileName?: string;
}) {
  const { fileName, year, month } = opts;
  const doc = buildTimesheetClosureDoc(opts);
  doc.save(fileName ?? `folha-ponto-${year}-${pad(month)}.pdf`);
}
