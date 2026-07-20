import { jsPDF } from "jspdf";
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

function classify(score: number): string {
  if (score >= 80) return "ADEQUADO";
  if (score >= 60) return "ATENÇÃO";
  return "CRÍTICO";
}

export function generateOccupationalHealthReportPdf(m: Nr1Metrics, extras: OhReportExtras): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  const ensure = (need: number) => {
    if (y + need > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const h1 = (t: string) => {
    ensure(28);
    doc.setFont("helvetica", "bold").setFontSize(14);
    doc.text(t, margin, y);
    y += 6;
    doc.setDrawColor(0).setLineWidth(0.6).line(margin, y, pageW - margin, y);
    y += 14;
    doc.setFont("helvetica", "normal").setFontSize(10);
  };

  const kv = (k: string, v: string) => {
    ensure(14);
    doc.setFont("helvetica", "bold").setFontSize(10).text(k, margin, y);
    doc.setFont("helvetica", "normal").text(v, margin + 220, y);
    y += 14;
  };

  const p = (text: string, size = 10) => {
    doc.setFont("helvetica", "normal").setFontSize(size);
    const lines = doc.splitTextToSize(text, pageW - margin * 2);
    lines.forEach((ln: string) => {
      ensure(size + 3);
      doc.text(ln, margin, y);
      y += size + 3;
    });
  };

  // Cabeçalho
  doc.setFont("helvetica", "bold").setFontSize(16);
  doc.text("RELATÓRIO DE SAÚDE OCUPACIONAL", pageW / 2, y, { align: "center" });
  y += 20;
  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.text("Conformidade com NR-1 (Gerenciamento de Riscos Ocupacionais e Riscos Psicossociais)", pageW / 2, y, { align: "center" });
  y += 24;

  if (extras.companyName) kv("Empresa:", extras.companyName);
  if (extras.companyCnpj) kv("CNPJ:", extras.companyCnpj);
  kv("Data de emissão:", format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR }));
  kv("Colaboradores ativos (CLT):", String(m.activeEmployees));
  y += 6;

  // Score geral
  h1("1. Índice geral de conformidade NR-1");
  kv("Score geral:", `${m.scoreOverall}/100 — ${classify(m.scoreOverall)}`);
  kv("Riscos psicossociais:", `${m.scorePsycho}/100 — ${classify(m.scorePsycho)}`);
  kv("PCMSO / ASO:", `${m.scorePcmso}/100 — ${classify(m.scorePcmso)}`);
  kv("Atestados / absenteísmo:", `${m.scoreAbsent}/100 — ${classify(m.scoreAbsent)}`);
  kv("Documentos SST:", `${m.scoreSst}/100 — ${classify(m.scoreSst)}`);

  // Psicossocial
  h1("2. Riscos psicossociais (PGR / NR-1)");
  kv("Riscos em aberto:", String(m.psychoRisksOpen));
  kv("De alta severidade:", String(m.psychoRisksHigh));
  kv("Fora do prazo:", String(m.psychoRisksOverdue));
  if (m.climateAdherencePct != null) kv("Adesão à pesquisa de clima:", `${m.climateAdherencePct}%`);
  if (m.climateENps != null) kv("eNPS:", String(m.climateENps));
  if (m.moodAvg30d != null) kv("Humor médio (30d):", m.moodAvg30d.toFixed(2) + " / 5");
  kv("Alertas de saúde mental em aberto:", String(m.mentalAlertsOpen));
  kv("Alertas resolvidos (30d):", String(m.mentalAlertsResolved30d));
  if (m.climateLastDate) kv("Última pesquisa de clima:", format(new Date(m.climateLastDate), "dd/MM/yyyy", { locale: ptBR }));
  y += 6;

  // Detalhamento dos riscos
  h1("3. Detalhamento dos riscos psicossociais registrados");
  if (extras.psychoRisks.length === 0) {
    p("Nenhum risco psicossocial registrado no período.");
  } else {
    extras.psychoRisks.forEach((r, i) => {
      ensure(60);
      doc.setFont("helvetica", "bold").setFontSize(10);
      doc.text(`${i + 1}. [${SEV[r.severity] ?? r.severity} · ${ST[r.status] ?? r.status}] ${CAT[r.category] ?? r.category}`, margin, y);
      y += 12;
      p(r.description);
      if (r.action_plan) p("Plano de ação: " + r.action_plan);
      if (r.resolution_notes) p("Ações executadas: " + r.resolution_notes);
      if (r.deadline) p("Prazo: " + format(new Date(r.deadline), "dd/MM/yyyy", { locale: ptBR }));
      y += 4;
    });
  }

  // PCMSO
  h1("4. PCMSO — Atestados de Saúde Ocupacional (ASO)");
  kv("ASOs válidos:", String(m.pcmsoValid));
  kv("ASOs vencendo em 60 dias:", String(m.pcmsoExpiring60));
  kv("ASOs vencidos / não emitidos:", String(m.pcmsoExpired));

  // Atestados
  h1("5. Atestados e absenteísmo");
  kv("Dias perdidos (últimos 3 meses):", String(m.absenteeismDays3m));
  kv("Taxa de absenteísmo (3m):", m.absenteeismRate3m != null ? m.absenteeismRate3m.toFixed(2) + "%" : "—");
  kv("Dias perdidos (últimos 12 meses):", String(m.absenteeismDays12m));
  kv("Atestados CID F (12m):", `${m.cidfCount12m} atestados / ${m.cidfDays12m} dias`);
  kv("CID F nos últimos 90 dias:", `${m.cidfCount90d} atestados / ${m.cidfEmployees90d} colaboradores`);
  if (m.topCids.length) {
    y += 4;
    doc.setFont("helvetica", "bold").text("Top CIDs (12 meses):", margin, y);
    y += 12;
    m.topCids.forEach((c) => {
      p(`• ${c.cid} — ${c.count} ocorrência(s)`);
    });
  }

  // SST docs
  h1("6. Documentos SST (PGR, LTCAT, PPRA, etc.)");
  kv("Total de documentos:", String(m.sstTotal));
  kv("Vigentes:", String(m.sstValid));
  kv("Vencendo em 60 dias:", String(m.sstExpiring60));
  kv("Vencidos:", String(m.sstExpired));
  if (extras.sstDocs.length) {
    y += 4;
    extras.sstDocs.slice(0, 40).forEach((d) => {
      ensure(14);
      const st = d.valid_until
        ? (d.valid_until < format(new Date(), "yyyy-MM-dd") ? "VENCIDO" : `válido até ${format(new Date(d.valid_until), "dd/MM/yyyy", { locale: ptBR })}`)
        : "sem validade";
      p(`• ${d.title}${d.document_type ? ` (${d.document_type})` : ""} — ${st}`);
    });
  }

  // Rodapé
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(120);
    doc.text(
      `Relatório gerado automaticamente pelo NEXA Suite em ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })} — página ${i} de ${total}`,
      pageW / 2,
      pageH - 20,
      { align: "center" }
    );
    doc.setTextColor(0);
  }

  return doc;
}
