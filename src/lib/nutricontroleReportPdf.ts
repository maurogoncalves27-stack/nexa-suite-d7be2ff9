import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface NutriReportData {
  storeName: string;
  periodFrom: string; // yyyy-MM-dd
  periodTo: string; // yyyy-MM-dd
  companyName?: string;
  companyCnpj?: string;
  dailyChecklist: Array<{ date: string; item: string; sim_nao: boolean; note: string; user: string }>;
  temperatures: Array<{ recorded_at: string; equipment: string; temperature: number; humidity: number | null; note: string }>;
  temperatureAlerts: Array<{ started_at: string; equipment: string; kind: string; value: number | null; resolved_at: string | null }>;
  merchandise: Array<{ received_at: string; supplier: string; product_name: string; batch: string; temperature: number; storage_type: string; has_irregularity: boolean; is_return: boolean; note: string }>;
  oilQuality: Array<{ recorded_at: string; quality: string; changed: boolean; note: string }>;
  oilDisposal: Array<{ pickup_date: string; collector_name: string | null; liters: number | null; amount_received: number; notes: string | null }>;
  pestControl: Array<{ service_date: string; company_name: string; note: string; has_certificate: boolean }>;
  pestOccurrences: Array<{ recorded_at: string; pest_type: string; location: string; note: string }>;
  maintenance: Array<{ date: string; equipment_type: string; maintenance_type: string; note: string }>;
  maintenanceRequests: Array<{ requested_at: string; equipment_type: string; description: string; urgency: string; status: string }>;
  waterTank: Array<{ cleaning_date: string; responsible: string; note: string; has_report: boolean }>;
  employeeAsos?: Array<{
    employee_name: string;
    position: string;
    aso_type: string;
    certificate_date: string | null;
    valid_until: string | null;
    status: "vigente" | "vence_em_30d" | "vencido" | "sem_aso";
  }>;
}

const ASO_TYPE_LABEL: Record<string, string> = {
  aso_admissional: "Admissional",
  aso_periodico: "Periódico",
  aso_retorno: "Retorno ao trabalho",
  aso_mudanca_funcao: "Mudança de função",
  aso_demissional: "Demissional",
};

const ASO_STATUS_LABEL: Record<string, string> = {
  vigente: "Vigente",
  vence_em_30d: "Vence em 30 dias",
  vencido: "Vencido",
  sem_aso: "Sem ASO",
};

const STORAGE: Record<string, string> = { refrigerado: "Refrigerado", congelado: "Congelado", seco: "Seco" };
const URGENCY: Record<string, string> = { baixa: "Baixa", media: "Média", alta: "Alta", critica: "Crítica" };
const REQ_STATUS: Record<string, string> = {
  pending: "Pendente", approved: "Aprovado", rejected: "Rejeitado", in_progress: "Em andamento", completed: "Concluído",
};
const ALERT_KIND: Record<string, string> = {
  out_of_range: "Fora da faixa", offline: "Sensor offline", recovered: "Normalizada",
};

const fmtDate = (s: string) => format(new Date(s), "dd/MM/yyyy", { locale: ptBR });
const fmtDT = (s: string) => format(new Date(s), "dd/MM/yyyy HH:mm", { locale: ptBR });

// Cor primária NEXA
const PRIMARY: [number, number, number] = [37, 99, 235];
const MUTED: [number, number, number] = [107, 114, 128];
const DANGER: [number, number, number] = [220, 38, 38];
const SUCCESS: [number, number, number] = [22, 163, 74];

export function generateNutricontroleReportPdf(d: NutriReportData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;

  // ============= CAPA =============
  const drawCover = () => {
    // faixa superior
    doc.setFillColor(...PRIMARY);
    doc.rect(0, 0, pageW, 140, "F");
    doc.setTextColor(255);
    doc.setFont("helvetica", "bold").setFontSize(11);
    doc.text("NEXA SUITE · NUTRICONTROLE", margin, 50);
    doc.setFont("helvetica", "bold").setFontSize(26);
    doc.text("Relatório de Boas Práticas", margin, 90);
    doc.setFont("helvetica", "normal").setFontSize(11);
    doc.text("Controle de manipulação de alimentos — RDC 216/ANVISA", margin, 112);

    // caixa de identificação
    doc.setTextColor(0);
    const boxY = 180;
    doc.setDrawColor(...PRIMARY).setLineWidth(0.8);
    doc.roundedRect(margin, boxY, pageW - margin * 2, 200, 6, 6, "S");

    const rows: Array<[string, string]> = [
      ["Loja", d.storeName || "—"],
      ["Empresa", d.companyName || "NEXA Gestão Inteligente"],
      ...(d.companyCnpj ? [["CNPJ", d.companyCnpj]] as Array<[string, string]> : []),
      ["Período do relatório", `${fmtDate(d.periodFrom)}  a  ${fmtDate(d.periodTo)}`],
      ["Emitido em", format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })],
    ];
    let ry = boxY + 30;
    rows.forEach(([k, v]) => {
      doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...MUTED);
      doc.text(k.toUpperCase(), margin + 20, ry);
      doc.setFont("helvetica", "normal").setFontSize(13).setTextColor(0);
      doc.text(v, margin + 20, ry + 16);
      ry += 36;
    });

    // sumário
    const sumY = 420;
    doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(...PRIMARY);
    doc.text("Conteúdo do relatório", margin, sumY);
    doc.setDrawColor(...PRIMARY).setLineWidth(0.4);
    doc.line(margin, sumY + 6, margin + 180, sumY + 6);

    const sections = [
      "1.  Resumo executivo do período",
      "2.  Check-list diário de higiene",
      "3.  Controle de temperatura por equipamento",
      "4.  Alertas de temperatura",
      "5.  Recebimento de mercadoria",
      "6.  Qualidade e descarte de óleo",
      "7.  Controle de pragas",
      "8.  Manutenção de equipamentos",
      "9.  Higienização de caixa d'água",
    ];
    doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(0);
    sections.forEach((s, i) => doc.text(s, margin, sumY + 30 + i * 20));

    // rodapé capa
    doc.setFont("helvetica", "italic").setFontSize(9).setTextColor(...MUTED);
    doc.text(
      "Documento gerado automaticamente pelo NEXA Suite para fins de fiscalização sanitária.",
      pageW / 2, pageH - 40, { align: "center" }
    );
    doc.setTextColor(0);
  };

  drawCover();

  // ============= HELPERS DE SEÇÃO =============
  let y = margin;

  const newSection = (num: number, title: string, subtitle?: string) => {
    doc.addPage();
    y = margin;
    // barra do título
    doc.setFillColor(...PRIMARY);
    doc.rect(margin, y, 4, 30, "F");
    doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(0);
    doc.text(`${num}.  ${title}`, margin + 14, y + 20);
    y += 34;
    if (subtitle) {
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
      doc.text(subtitle, margin, y);
      y += 14;
      doc.setTextColor(0);
    }
    y += 6;
  };

  const subTitle = (t: string) => {
    if (y > pageH - 100) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...PRIMARY);
    doc.text(t, margin, y);
    y += 14;
    doc.setTextColor(0);
  };

  const empty = (msg: string) => {
    doc.setFont("helvetica", "italic").setFontSize(10).setTextColor(...MUTED);
    doc.text(msg, margin, y);
    y += 18;
    doc.setTextColor(0);
  };

  const runTable = (head: string[], body: (string | { content: string; styles?: any })[][], columnStyles?: any) => {
    if (!body.length) return;
    autoTable(doc, {
      startY: y,
      head: [head],
      body: body as any,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8.5, cellPadding: 4, overflow: "linebreak", valign: "middle" },
      headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: "bold", fontSize: 9 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles,
      didDrawPage: () => { /* footer drawn at end */ },
    });
    // @ts-expect-error autotable adds lastAutoTable
    y = doc.lastAutoTable.finalY + 16;
  };

  // ============= 1. RESUMO =============
  newSection(1, "Resumo executivo do período");

  const irreg = d.merchandise.filter((m) => m.has_irregularity || m.is_return).length;
  const trocasOleo = d.oilQuality.filter((o) => o.changed).length;
  const alertasAbertos = d.temperatureAlerts.filter((a) => !a.resolved_at && a.kind !== "recovered").length;

  // KPIs em cards 3x4
  const kpis: Array<{ label: string; value: string | number; danger?: boolean }> = [
    { label: "Registros de higiene", value: d.dailyChecklist.length },
    { label: "Leituras de temperatura", value: d.temperatures.length },
    { label: "Alertas de temperatura", value: d.temperatureAlerts.length, danger: d.temperatureAlerts.length > 0 },
    { label: "Alertas em aberto", value: alertasAbertos, danger: alertasAbertos > 0 },
    { label: "Recebimentos", value: d.merchandise.length },
    { label: "Irregularidades no recebim.", value: irreg, danger: irreg > 0 },
    { label: "Registros de óleo", value: d.oilQuality.length },
    { label: "Trocas de óleo", value: trocasOleo },
    { label: "Coletas de óleo usado", value: d.oilDisposal.length },
    { label: "Dedetizações", value: d.pestControl.length },
    { label: "Ocorrências de pragas", value: d.pestOccurrences.length, danger: d.pestOccurrences.length > 0 },
    { label: "Manutenções realizadas", value: d.maintenance.length },
    { label: "Solicit. de manutenção", value: d.maintenanceRequests.length },
    { label: "Limpezas caixa d'água", value: d.waterTank.length },
  ];

  const cardsPerRow = 3;
  const gap = 10;
  const cardW = (pageW - margin * 2 - gap * (cardsPerRow - 1)) / cardsPerRow;
  const cardH = 56;
  kpis.forEach((k, i) => {
    const col = i % cardsPerRow;
    const row = Math.floor(i / cardsPerRow);
    if (col === 0 && y + cardH > pageH - margin) { doc.addPage(); y = margin; }
    const x = margin + col * (cardW + gap);
    const cy = y + row * (cardH + gap);
    doc.setDrawColor(220).setLineWidth(0.5);
    doc.setFillColor(250, 251, 253);
    doc.roundedRect(x, cy, cardW, cardH, 4, 4, "FD");
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED);
    doc.text(k.label, x + 10, cy + 16);
    doc.setFont("helvetica", "bold").setFontSize(20);
    doc.setTextColor(...(k.danger ? DANGER : PRIMARY));
    doc.text(String(k.value), x + 10, cy + 44);
    doc.setTextColor(0);
  });
  const rows = Math.ceil(kpis.length / cardsPerRow);
  y += rows * (cardH + gap);

  // ============= 2. HIGIENE =============
  newSection(2, "Check-list diário de higiene", "Registros de conformidade das rotinas diárias de higiene pessoal e do ambiente.");
  if (!d.dailyChecklist.length) empty("Sem registros no período.");
  else {
    const body = d.dailyChecklist.slice(0, 500).map((r) => [
      fmtDate(r.date),
      r.item,
      { content: r.sim_nao ? "SIM" : "NÃO", styles: { textColor: r.sim_nao ? SUCCESS : DANGER, fontStyle: "bold", halign: "center" } },
      r.note || "—",
    ]);
    runTable(["Data", "Item", "OK?", "Observação"], body, {
      0: { cellWidth: 65 }, 2: { cellWidth: 45, halign: "center" }, 3: { cellWidth: 200 },
    });
    if (d.dailyChecklist.length > 500) empty(`... e mais ${d.dailyChecklist.length - 500} registros omitidos.`);
  }

  // ============= 3. TEMPERATURA POR EQUIPAMENTO =============
  newSection(3, "Controle de temperatura por equipamento", "Leituras agrupadas por equipamento, com estatísticas do período (mínima, máxima e média).");
  if (!d.temperatures.length) empty("Sem leituras no período.");
  else {
    // Agrupar por equipamento
    const grouped = new Map<string, typeof d.temperatures>();
    d.temperatures.forEach((r) => {
      const arr = grouped.get(r.equipment) ?? [];
      arr.push(r);
      grouped.set(r.equipment, arr);
    });
    const equipments = Array.from(grouped.keys()).sort();

    // Tabela de resumo por equipamento
    subTitle("Resumo por equipamento");
    const resumo = equipments.map((eq) => {
      const arr = grouped.get(eq)!;
      const temps = arr.map((r) => Number(r.temperature)).filter((n) => !isNaN(n));
      const min = temps.length ? Math.min(...temps) : 0;
      const max = temps.length ? Math.max(...temps) : 0;
      const avg = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : 0;
      return [eq, String(arr.length), `${min.toFixed(1)}°C`, `${max.toFixed(1)}°C`, `${avg.toFixed(1)}°C`];
    });
    runTable(["Equipamento", "Leituras", "Mínima", "Máxima", "Média"], resumo, {
      0: { cellWidth: "auto", fontStyle: "bold" },
      1: { cellWidth: 60, halign: "center" },
      2: { cellWidth: 70, halign: "center" },
      3: { cellWidth: 70, halign: "center" },
      4: { cellWidth: 70, halign: "center" },
    });

    // Detalhamento por equipamento
    equipments.forEach((eq) => {
      const arr = grouped.get(eq)!.slice(0, 200);
      subTitle(`Detalhamento — ${eq}`);
      const body = arr.map((r) => [
        fmtDT(r.recorded_at),
        `${Number(r.temperature).toFixed(1)}°C`,
        r.humidity != null ? `${r.humidity}%` : "—",
        r.note || "—",
      ]);
      runTable(["Data/Hora", "Temperatura", "Umidade", "Observação"], body, {
        0: { cellWidth: 110 },
        1: { cellWidth: 80, halign: "center", fontStyle: "bold" },
        2: { cellWidth: 60, halign: "center" },
      });
      const total = grouped.get(eq)!.length;
      if (total > 200) empty(`... e mais ${total - 200} leituras omitidas para este equipamento.`);
    });
  }

  // ============= 4. ALERTAS =============
  newSection(4, "Alertas de temperatura", "Ocorrências detectadas pelo monitoramento automático (EMS-A) e alertas manuais.");
  if (!d.temperatureAlerts.length) empty("Nenhum alerta registrado no período.");
  else {
    const body = d.temperatureAlerts.map((a) => [
      fmtDT(a.started_at),
      a.equipment,
      { content: ALERT_KIND[a.kind] ?? a.kind, styles: { fontStyle: "bold", textColor: a.kind === "recovered" ? SUCCESS : DANGER } },
      a.value != null ? `${Number(a.value).toFixed(1)}°C` : "—",
      a.resolved_at ? fmtDT(a.resolved_at) : "Em aberto",
    ]);
    runTable(["Início", "Sensor / Equipamento", "Tipo", "Valor", "Resolvido em"], body, {
      0: { cellWidth: 110 }, 3: { cellWidth: 60, halign: "center" }, 4: { cellWidth: 110 },
    });
  }

  // ============= 5. RECEBIMENTO =============
  newSection(5, "Recebimento de mercadoria", "Registro de entrada de insumos com verificação de temperatura, lote e irregularidades.");
  if (!d.merchandise.length) empty("Sem recebimentos no período.");
  else {
    const body = d.merchandise.map((m) => {
      const flags: string[] = [];
      if (m.has_irregularity) flags.push("IRREGULAR");
      if (m.is_return) flags.push("DEVOLUÇÃO");
      return [
        fmtDT(m.received_at),
        m.supplier || "—",
        m.product_name || "—",
        m.batch || "—",
        STORAGE[m.storage_type] ?? m.storage_type ?? "—",
        `${Number(m.temperature).toFixed(1)}°C`,
        { content: flags.length ? flags.join(" · ") : "OK", styles: { fontStyle: "bold", textColor: flags.length ? DANGER : SUCCESS, halign: "center" } },
      ];
    });
    runTable(["Data/Hora", "Fornecedor", "Produto", "Lote", "Armaz.", "Temp.", "Status"], body, {
      0: { cellWidth: 90 }, 3: { cellWidth: 55 }, 4: { cellWidth: 60 }, 5: { cellWidth: 50, halign: "center" }, 6: { cellWidth: 75 },
    });
  }

  // ============= 6. ÓLEO =============
  newSection(6, "Qualidade e descarte de óleo", "Monitoramento da qualidade do óleo de fritura e coletas por empresa autorizada.");

  subTitle("Qualidade do óleo");
  if (!d.oilQuality.length) empty("Sem registros no período.");
  else {
    const body = d.oilQuality.map((o) => [
      fmtDT(o.recorded_at),
      { content: (o.quality || "—").toUpperCase(), styles: { fontStyle: "bold" } },
      { content: o.changed ? "SIM" : "NÃO", styles: { halign: "center", textColor: o.changed ? SUCCESS : MUTED, fontStyle: "bold" } },
      o.note || "—",
    ]);
    runTable(["Data/Hora", "Qualidade", "Trocado?", "Observação"], body, {
      0: { cellWidth: 110 }, 2: { cellWidth: 70 },
    });
  }

  subTitle("Coletas de óleo usado");
  if (!d.oilDisposal.length) empty("Sem coletas registradas.");
  else {
    const body = d.oilDisposal.map((o) => [
      fmtDate(o.pickup_date),
      o.collector_name ?? "—",
      o.liters != null ? `${o.liters} L` : "—",
      `R$ ${Number(o.amount_received).toFixed(2)}`,
      o.notes ?? "—",
    ]);
    runTable(["Data", "Coletor", "Volume", "Valor recebido", "Observação"], body, {
      0: { cellWidth: 75 }, 2: { cellWidth: 60, halign: "center" }, 3: { cellWidth: 90, halign: "right" },
    });
  }

  // ============= 7. PRAGAS =============
  newSection(7, "Controle de pragas", "Dedetizações periódicas e ocorrências avistadas nas dependências.");

  subTitle("Dedetizações");
  if (!d.pestControl.length) empty("Nenhuma dedetização registrada.");
  else {
    const body = d.pestControl.map((c) => [
      fmtDate(c.service_date),
      c.company_name || "—",
      { content: c.has_certificate ? "SIM" : "NÃO", styles: { halign: "center", textColor: c.has_certificate ? SUCCESS : DANGER, fontStyle: "bold" } },
      c.note || "—",
    ]);
    runTable(["Data", "Empresa responsável", "Certificado", "Observação"], body, {
      0: { cellWidth: 75 }, 2: { cellWidth: 80 },
    });
  }

  subTitle("Ocorrências de pragas avistadas");
  if (!d.pestOccurrences.length) empty("Nenhuma ocorrência registrada.");
  else {
    const body = d.pestOccurrences.map((o) => [
      fmtDT(o.recorded_at),
      o.pest_type || "—",
      o.location || "—",
      o.note || "—",
    ]);
    runTable(["Data/Hora", "Tipo", "Local", "Observação"], body, { 0: { cellWidth: 110 } });
  }

  // ============= 8. MANUTENÇÃO =============
  newSection(8, "Manutenção de equipamentos", "Manutenções preventivas e corretivas realizadas, mais solicitações abertas.");

  subTitle("Manutenções realizadas");
  if (!d.maintenance.length) empty("Nenhuma manutenção registrada.");
  else {
    const body = d.maintenance.map((m) => [
      fmtDate(m.date),
      m.equipment_type || "—",
      m.maintenance_type || "—",
      m.note || "—",
    ]);
    runTable(["Data", "Equipamento", "Tipo", "Observação"], body, { 0: { cellWidth: 75 } });
  }

  subTitle("Solicitações de manutenção");
  if (!d.maintenanceRequests.length) empty("Nenhuma solicitação registrada.");
  else {
    const body = d.maintenanceRequests.map((r) => [
      fmtDT(r.requested_at),
      r.equipment_type || "—",
      URGENCY[r.urgency] ?? r.urgency ?? "—",
      REQ_STATUS[r.status] ?? r.status ?? "—",
      r.description || "—",
    ]);
    runTable(["Solicitado em", "Equipamento", "Urgência", "Status", "Descrição"], body, {
      0: { cellWidth: 100 }, 2: { cellWidth: 60, halign: "center" }, 3: { cellWidth: 75, halign: "center" },
    });
  }

  // ============= 9. CAIXA D'ÁGUA =============
  newSection(9, "Higienização de caixa d'água", "Registros de limpeza e desinfecção dos reservatórios.");
  if (!d.waterTank.length) empty("Nenhuma limpeza registrada no período.");
  else {
    const body = d.waterTank.map((w) => [
      fmtDate(w.cleaning_date),
      w.responsible || "—",
      { content: w.has_report ? "SIM" : "NÃO", styles: { halign: "center", textColor: w.has_report ? SUCCESS : DANGER, fontStyle: "bold" } },
      w.note || "—",
    ]);
    runTable(["Data", "Responsável", "Laudo anexado", "Observação"], body, {
      0: { cellWidth: 75 }, 2: { cellWidth: 90 },
    });
  }

  // ============= FOOTER + PAGE NUMBERS =============
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    if (i > 1) {
      // header discreto nas páginas internas
      doc.setDrawColor(...PRIMARY).setLineWidth(0.5);
      doc.line(margin, 24, pageW - margin, 24);
      doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...PRIMARY);
      doc.text("NUTRICONTROLE", margin, 18);
      doc.setFont("helvetica", "normal").setTextColor(...MUTED);
      doc.text(`${d.storeName} · ${fmtDate(d.periodFrom)}–${fmtDate(d.periodTo)}`, pageW - margin, 18, { align: "right" });
    }
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
    doc.text(
      `NEXA Suite · Relatório NutriControle gerado em ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}`,
      margin, pageH - 20
    );
    doc.text(`Página ${i} de ${total}`, pageW - margin, pageH - 20, { align: "right" });
    doc.setTextColor(0);
  }

  return doc;
}
