import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Nr1Metrics } from "@/components/occupational-health/useNr1Metrics";

export interface OhReportExtras {
  psychoRisks: Array<{
    category: string;
    severity: string;
    status: string;
    description: string;
    action_plan: string | null;
    resolution_notes: string | null;
    deadline: string | null;
    auto_generated: boolean;
  }>;
  sstDocs: Array<{ title: string; document_type: string | null; valid_until: string | null; is_active: boolean }>;
  companyName?: string;
  companyCnpj?: string;
}

const SEV: Record<string, string> = { low: "Baixa", medium: "Média", high: "Alta", critical: "Crítica" };
const ST: Record<string, string> = {
  open: "Aberto", in_progress: "Em andamento", mitigated: "Mitigado", accepted: "Aceito",
};
const CAT: Record<string, string> = {
  carga_de_trabalho: "Carga de trabalho / jornada",
  assedio: "Assédio moral ou sexual",
  relacionamento: "Relacionamento / gestão",
  reconhecimento: "Reconhecimento e recompensa",
  autonomia: "Autonomia e controle",
  violencia_externa: "Violência externa",
  saude_mental: "Sinais coletivos de saúde mental",
  outros: "Outros",
};

const PRIMARY: [number, number, number] = [37, 99, 235];
const MUTED: [number, number, number] = [107, 114, 128];
const DANGER: [number, number, number] = [220, 38, 38];
const SUCCESS: [number, number, number] = [22, 163, 74];
const WARNING: [number, number, number] = [217, 119, 6];

const fmtDate = (s: string) => format(new Date(s), "dd/MM/yyyy", { locale: ptBR });

function classify(score: number): { label: string; color: [number, number, number] } {
  if (score >= 80) return { label: "ADEQUADO", color: SUCCESS };
  if (score >= 60) return { label: "ATENÇÃO", color: WARNING };
  return { label: "CRÍTICO", color: DANGER };
}

export function generateOccupationalHealthReportPdf(m: Nr1Metrics, extras: OhReportExtras): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const todayStr = format(new Date(), "yyyy-MM-dd");

  // ============= CAPA =============
  const drawCover = () => {
    doc.setFillColor(...PRIMARY);
    doc.rect(0, 0, pageW, 140, "F");
    doc.setTextColor(255);
    doc.setFont("helvetica", "bold").setFontSize(11);
    doc.text("NEXA SUITE · SAÚDE OCUPACIONAL", margin, 50);
    doc.setFont("helvetica", "bold").setFontSize(26);
    doc.text("Relatório de Conformidade NR-1", margin, 90);
    doc.setFont("helvetica", "normal").setFontSize(11);
    doc.text("Gerenciamento de Riscos Ocupacionais e Riscos Psicossociais", margin, 112);

    // caixa identificação
    doc.setTextColor(0);
    const boxY = 180;
    doc.setDrawColor(...PRIMARY).setLineWidth(0.8);
    doc.roundedRect(margin, boxY, pageW - margin * 2, 200, 6, 6, "S");

    const rows: Array<[string, string]> = [
      ["Empresa", extras.companyName || "NEXA Gestão Inteligente"],
      ...(extras.companyCnpj ? [["CNPJ", extras.companyCnpj]] as Array<[string, string]> : []),
      ["Colaboradores ativos (CLT)", String(m.activeEmployees)],
      ["Score geral NR-1", `${m.scoreOverall}/100 — ${classify(m.scoreOverall).label}`],
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

    const sumY = 420;
    doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(...PRIMARY);
    doc.text("Conteúdo do relatório", margin, sumY);
    doc.setDrawColor(...PRIMARY).setLineWidth(0.4);
    doc.line(margin, sumY + 6, margin + 180, sumY + 6);

    const sections = [
      "1.  Índice geral de conformidade NR-1",
      "2.  Riscos psicossociais (indicadores)",
      "3.  Detalhamento dos riscos registrados",
      "4.  PCMSO — Atestados de Saúde Ocupacional (ASO)",
      "5.  Atestados e absenteísmo",
      "6.  Saúde mental — CID F e alertas",
      "7.  Clima organizacional",
      "8.  Documentos SST (PGR, LTCAT, PPRA, etc.)",
    ];
    doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(0);
    sections.forEach((s, i) => doc.text(s, margin, sumY + 30 + i * 20));

    doc.setFont("helvetica", "italic").setFontSize(9).setTextColor(...MUTED);
    doc.text(
      "Documento gerado automaticamente pelo NEXA Suite para fins de apresentação ao Ministério do Trabalho.",
      pageW / 2, pageH - 40, { align: "center" }
    );
    doc.setTextColor(0);
  };

  drawCover();

  let y = margin;

  const newSection = (num: number, title: string, subtitle?: string) => {
    doc.addPage();
    y = margin;
    doc.setFillColor(...PRIMARY);
    doc.rect(margin, y, 4, 30, "F");
    doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(0);
    doc.text(`${num}.  ${title}`, margin + 14, y + 20);
    y += 34;
    if (subtitle) {
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
      const lines = doc.splitTextToSize(subtitle, pageW - margin * 2);
      lines.forEach((ln: string) => { doc.text(ln, margin, y); y += 12; });
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

  const paragraph = (text: string) => {
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(0);
    const lines = doc.splitTextToSize(text, pageW - margin * 2);
    lines.forEach((ln: string) => {
      if (y > pageH - margin) { doc.addPage(); y = margin; }
      doc.text(ln, margin, y);
      y += 13;
    });
  };

  const runTable = (head: string[], body: any[][], columnStyles?: any) => {
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
    });
    // @ts-expect-error autotable lastAutoTable
    y = doc.lastAutoTable.finalY + 16;
  };

  const drawKpiGrid = (
    kpis: Array<{ label: string; value: string | number; color?: [number, number, number] }>,
    cardsPerRow = 3
  ) => {
    const gap = 10;
    const cardW = (pageW - margin * 2 - gap * (cardsPerRow - 1)) / cardsPerRow;
    const cardH = 56;
    let startY = y;
    kpis.forEach((k, i) => {
      const col = i % cardsPerRow;
      const row = Math.floor(i / cardsPerRow);
      const x = margin + col * (cardW + gap);
      const cy = startY + row * (cardH + gap);
      if (cy + cardH > pageH - margin) {
        // simple new page and reset
        doc.addPage();
        y = margin;
        startY = margin;
        const cy2 = startY + row * (cardH + gap);
        doc.setDrawColor(220).setLineWidth(0.5);
        doc.setFillColor(250, 251, 253);
        doc.roundedRect(x, cy2, cardW, cardH, 4, 4, "FD");
        doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED);
        doc.text(k.label, x + 10, cy2 + 16);
        doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(...(k.color || PRIMARY));
        doc.text(String(k.value), x + 10, cy2 + 44);
        doc.setTextColor(0);
        return;
      }
      doc.setDrawColor(220).setLineWidth(0.5);
      doc.setFillColor(250, 251, 253);
      doc.roundedRect(x, cy, cardW, cardH, 4, 4, "FD");
      doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED);
      doc.text(k.label, x + 10, cy + 16);
      doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(...(k.color || PRIMARY));
      doc.text(String(k.value), x + 10, cy + 44);
      doc.setTextColor(0);
    });
    const rows = Math.ceil(kpis.length / cardsPerRow);
    y = startY + rows * (cardH + gap);
  };

  // ============= 1. SCORE GERAL =============
  newSection(1, "Índice geral de conformidade NR-1", "Composição do score consolidado NR-1 a partir dos quatro pilares monitorados pelo sistema.");

  const scoreKpis = [
    { label: "Score geral", value: `${m.scoreOverall}/100`, color: classify(m.scoreOverall).color },
    { label: "Riscos psicossociais", value: `${m.scorePsycho}/100`, color: classify(m.scorePsycho).color },
    { label: "PCMSO / ASO", value: `${m.scorePcmso}/100`, color: classify(m.scorePcmso).color },
    { label: "Atestados / absenteísmo", value: `${m.scoreAbsent}/100`, color: classify(m.scoreAbsent).color },
    { label: "Documentos SST", value: `${m.scoreSst}/100`, color: classify(m.scoreSst).color },
    { label: "Colaboradores ativos (CLT)", value: m.activeEmployees },
  ];
  drawKpiGrid(scoreKpis, 3);

  subTitle("Classificação por pilar");
  runTable(
    ["Pilar", "Score", "Classificação"],
    [
      ["Score geral NR-1", `${m.scoreOverall}/100`, { content: classify(m.scoreOverall).label, styles: { fontStyle: "bold", textColor: classify(m.scoreOverall).color, halign: "center" } }],
      ["Riscos psicossociais", `${m.scorePsycho}/100`, { content: classify(m.scorePsycho).label, styles: { fontStyle: "bold", textColor: classify(m.scorePsycho).color, halign: "center" } }],
      ["PCMSO / ASO", `${m.scorePcmso}/100`, { content: classify(m.scorePcmso).label, styles: { fontStyle: "bold", textColor: classify(m.scorePcmso).color, halign: "center" } }],
      ["Atestados / absenteísmo", `${m.scoreAbsent}/100`, { content: classify(m.scoreAbsent).label, styles: { fontStyle: "bold", textColor: classify(m.scoreAbsent).color, halign: "center" } }],
      ["Documentos SST", `${m.scoreSst}/100`, { content: classify(m.scoreSst).label, styles: { fontStyle: "bold", textColor: classify(m.scoreSst).color, halign: "center" } }],
    ],
    { 0: { fontStyle: "bold" }, 1: { cellWidth: 90, halign: "center" }, 2: { cellWidth: 130, halign: "center" } }
  );

  // ============= 2. PSICOSSOCIAL =============
  newSection(2, "Riscos psicossociais (PGR / NR-1)", "Indicadores agregados de risco psicossocial: pesquisa de clima, check-ins de humor e alertas de saúde mental.");
  const psychoKpis = [
    { label: "Riscos em aberto", value: m.psychoRisksOpen, color: m.psychoRisksOpen > 0 ? WARNING : SUCCESS },
    { label: "Alta severidade", value: m.psychoRisksHigh, color: m.psychoRisksHigh > 0 ? DANGER : SUCCESS },
    { label: "Fora do prazo", value: m.psychoRisksOverdue, color: m.psychoRisksOverdue > 0 ? DANGER : SUCCESS },
    { label: "Adesão pesquisa clima", value: m.climateAdherencePct != null ? `${m.climateAdherencePct}%` : "—" },
    { label: "eNPS", value: m.climateENps != null ? String(m.climateENps) : "—" },
    { label: "Humor médio (30d)", value: m.moodAvg30d != null ? `${m.moodAvg30d.toFixed(2)}/5` : "—" },
    { label: "Respondentes humor (30d)", value: m.moodRespondents30d },
    { label: "Alertas saúde mental abertos", value: m.mentalAlertsOpen, color: m.mentalAlertsOpen > 0 ? DANGER : SUCCESS },
    { label: "Alertas resolvidos (30d)", value: m.mentalAlertsResolved30d, color: SUCCESS },
  ];
  drawKpiGrid(psychoKpis, 3);

  if (m.climateLastDate) {
    paragraph(`Última pesquisa de clima aplicada em ${fmtDate(m.climateLastDate)}.`);
  }

  // ============= 3. DETALHE RISCOS =============
  newSection(3, "Detalhamento dos riscos psicossociais registrados", "Lista completa dos riscos identificados, com plano de ação, prazos e ações executadas.");
  if (!extras.psychoRisks.length) empty("Nenhum risco psicossocial registrado no período.");
  else {
    const body = extras.psychoRisks.map((r, i) => {
      const desc: string[] = [r.description || "—"];
      if (r.action_plan) desc.push(`Plano de ação: ${r.action_plan}`);
      if (r.resolution_notes) desc.push(`Ações executadas: ${r.resolution_notes}`);
      const sevColor = r.severity === "critical" || r.severity === "high" ? DANGER : r.severity === "medium" ? WARNING : MUTED;
      const stColor = r.status === "mitigated" || r.status === "accepted" ? SUCCESS : r.status === "in_progress" ? WARNING : DANGER;
      return [
        String(i + 1),
        CAT[r.category] ?? r.category,
        { content: SEV[r.severity] ?? r.severity, styles: { fontStyle: "bold", textColor: sevColor, halign: "center" } },
        { content: ST[r.status] ?? r.status, styles: { fontStyle: "bold", textColor: stColor, halign: "center" } },
        r.deadline ? fmtDate(r.deadline) : "—",
        desc.join("\n"),
      ];
    });
    runTable(["#", "Categoria", "Severidade", "Status", "Prazo", "Descrição / Plano / Ações"], body, {
      0: { cellWidth: 24, halign: "center" },
      1: { cellWidth: 130 },
      2: { cellWidth: 60, halign: "center" },
      3: { cellWidth: 70, halign: "center" },
      4: { cellWidth: 60, halign: "center" },
    });
  }

  // ============= 4. PCMSO =============
  newSection(4, "PCMSO — Atestados de Saúde Ocupacional (ASO)", "Situação atual dos ASOs frente à base ativa CLT.");
  const pcmsoKpis = [
    { label: "ASOs válidos", value: m.pcmsoValid, color: SUCCESS },
    { label: "Vencendo em 60 dias", value: m.pcmsoExpiring60, color: m.pcmsoExpiring60 > 0 ? WARNING : SUCCESS },
    { label: "Vencidos / não emitidos", value: m.pcmsoExpired, color: m.pcmsoExpired > 0 ? DANGER : SUCCESS },
  ];
  drawKpiGrid(pcmsoKpis, 3);

  // ============= 5. ATESTADOS =============
  newSection(5, "Atestados e absenteísmo", "Indicadores de afastamentos por atestado médico nos últimos 3 e 12 meses.");
  const absKpis = [
    { label: "Dias perdidos (3m)", value: m.absenteeismDays3m },
    { label: "Taxa de absenteísmo (3m)", value: m.absenteeismRate3m != null ? `${m.absenteeismRate3m.toFixed(2)}%` : "—" },
    { label: "Dias perdidos (12m)", value: m.absenteeismDays12m },
  ];
  drawKpiGrid(absKpis, 3);

  if (m.topCids.length) {
    subTitle("Top CIDs (últimos 12 meses)");
    runTable(
      ["CID", "Ocorrências"],
      m.topCids.map((c) => [c.cid, String(c.count)]),
      { 1: { cellWidth: 100, halign: "center" } }
    );
  }

  if (m.daysByStoreMonth?.length) {
    subTitle("Dias perdidos por loja (mês atual)");
    runTable(
      ["Loja", "Dias"],
      m.daysByStoreMonth.map((s) => [s.store, String(s.days)]),
      { 1: { cellWidth: 100, halign: "center" } }
    );
  }

  // ============= 6. SAÚDE MENTAL =============
  newSection(6, "Saúde mental — CID F e alertas", "Ocorrências relacionadas a transtornos mentais e comportamentais.");
  const mentalKpis = [
    { label: "Atestados CID F (12m)", value: m.cidfCount12m, color: m.cidfCount12m > 0 ? WARNING : SUCCESS },
    { label: "Dias perdidos CID F (12m)", value: m.cidfDays12m },
    { label: "Atestados CID F (90d)", value: m.cidfCount90d, color: m.cidfCount90d > 0 ? WARNING : SUCCESS },
    { label: "Colaboradores CID F (90d)", value: m.cidfEmployees90d },
    { label: "Alertas saúde mental abertos", value: m.mentalAlertsOpen, color: m.mentalAlertsOpen > 0 ? DANGER : SUCCESS },
    { label: "Alertas resolvidos (30d)", value: m.mentalAlertsResolved30d, color: SUCCESS },
  ];
  drawKpiGrid(mentalKpis, 3);

  // ============= 7. CLIMA =============
  newSection(7, "Clima organizacional", "Resultado consolidado da última pesquisa de clima aplicada.");
  const climaKpis = [
    { label: "Adesão", value: m.climateAdherencePct != null ? `${m.climateAdherencePct}%` : "—" },
    { label: "eNPS", value: m.climateENps != null ? String(m.climateENps) : "—" },
    { label: "Última pesquisa", value: m.climateLastDate ? fmtDate(m.climateLastDate) : "—" },
  ];
  drawKpiGrid(climaKpis, 3);

  const dims = Object.entries(m.climateAvgByDimension || {});
  if (dims.length) {
    subTitle("Médias por dimensão");
    runTable(
      ["Dimensão", "Média"],
      dims.map(([k, v]) => [k, Number(v).toFixed(2)]),
      { 1: { cellWidth: 100, halign: "center", fontStyle: "bold" } }
    );
  } else {
    empty("Sem dados agregados de dimensões no período (respeitando privacidade mínima).");
  }

  // ============= 8. DOCUMENTOS SST =============
  newSection(8, "Documentos SST (PGR, LTCAT, PPRA, etc.)", "Panorama dos documentos legais de segurança e saúde no trabalho.");
  const sstKpis = [
    { label: "Total de documentos", value: m.sstTotal },
    { label: "Vigentes", value: m.sstValid, color: SUCCESS },
    { label: "Vencendo em 60 dias", value: m.sstExpiring60, color: m.sstExpiring60 > 0 ? WARNING : SUCCESS },
    { label: "Vencidos", value: m.sstExpired, color: m.sstExpired > 0 ? DANGER : SUCCESS },
  ];
  drawKpiGrid(sstKpis, 4);

  if (extras.sstDocs.length) {
    subTitle("Documentos ativos");
    const body = extras.sstDocs.slice(0, 80).map((d) => {
      const isExpired = d.valid_until && d.valid_until < todayStr;
      const st = !d.valid_until
        ? { content: "sem validade", styles: { textColor: MUTED, halign: "center" } }
        : isExpired
          ? { content: "VENCIDO", styles: { fontStyle: "bold", textColor: DANGER, halign: "center" } }
          : { content: `válido até ${fmtDate(d.valid_until)}`, styles: { textColor: SUCCESS, halign: "center" } };
      return [d.title, d.document_type || "—", st];
    });
    runTable(["Documento", "Tipo", "Situação"], body, {
      1: { cellWidth: 110 }, 2: { cellWidth: 150, halign: "center" },
    });
    if (extras.sstDocs.length > 80) empty(`... e mais ${extras.sstDocs.length - 80} documentos omitidos.`);
  } else {
    empty("Nenhum documento SST cadastrado.");
  }

  // ============= FOOTER + HEADER =============
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    if (i > 1) {
      doc.setDrawColor(...PRIMARY).setLineWidth(0.5);
      doc.line(margin, 24, pageW - margin, 24);
      doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...PRIMARY);
      doc.text("SAÚDE OCUPACIONAL · NR-1", margin, 18);
      doc.setFont("helvetica", "normal").setTextColor(...MUTED);
      doc.text(extras.companyName || "NEXA Gestão Inteligente", pageW - margin, 18, { align: "right" });
    }
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
    doc.text(
      `NEXA Suite · Relatório de Saúde Ocupacional gerado em ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}`,
      margin, pageH - 20
    );
    doc.text(`Página ${i} de ${total}`, pageW - margin, pageH - 20, { align: "right" });
    doc.setTextColor(0);
  }

  return doc;
}
