import { jsPDF } from "jspdf";
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
}

const STORAGE: Record<string, string> = { refrigerado: "Refrigerado", congelado: "Congelado" };
const URGENCY: Record<string, string> = { baixa: "Baixa", media: "Média", alta: "Alta", critica: "Crítica" };
const REQ_STATUS: Record<string, string> = {
  pending: "Pendente", approved: "Aprovado", rejected: "Rejeitado", in_progress: "Em andamento", completed: "Concluído",
};

const fmtDate = (s: string) => format(new Date(s), "dd/MM/yyyy", { locale: ptBR });
const fmtDT = (s: string) => format(new Date(s), "dd/MM/yyyy HH:mm", { locale: ptBR });

export function generateNutricontroleReportPdf(d: NutriReportData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  const ensure = (need: number) => {
    if (y + need > pageH - margin) { doc.addPage(); y = margin; }
  };
  const h1 = (t: string) => {
    ensure(30);
    doc.setFont("helvetica", "bold").setFontSize(13);
    doc.text(t, margin, y);
    y += 6;
    doc.setDrawColor(0).setLineWidth(0.6).line(margin, y, pageW - margin, y);
    y += 12;
    doc.setFont("helvetica", "normal").setFontSize(9);
  };
  const kv = (k: string, v: string) => {
    ensure(13);
    doc.setFont("helvetica", "bold").setFontSize(9).text(k, margin, y);
    doc.setFont("helvetica", "normal").text(v, margin + 200, y);
    y += 13;
  };
  const p = (text: string, size = 9) => {
    doc.setFont("helvetica", "normal").setFontSize(size);
    const lines = doc.splitTextToSize(text, pageW - margin * 2);
    lines.forEach((ln: string) => { ensure(size + 3); doc.text(ln, margin, y); y += size + 3; });
  };
  const empty = (msg: string) => {
    doc.setFont("helvetica", "italic").setFontSize(9).setTextColor(120);
    ensure(13); doc.text(msg, margin, y); y += 13;
    doc.setTextColor(0);
  };

  // Header
  doc.setFont("helvetica", "bold").setFontSize(15);
  doc.text("RELATÓRIO NUTRICONTROLE — BOAS PRÁTICAS", pageW / 2, y, { align: "center" });
  y += 18;
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text("Controle de manipulação de alimentos (RDC 216/ANVISA)", pageW / 2, y, { align: "center" });
  y += 20;

  if (d.companyName) kv("Empresa:", d.companyName);
  if (d.companyCnpj) kv("CNPJ:", d.companyCnpj);
  kv("Loja:", d.storeName);
  kv("Período:", `${fmtDate(d.periodFrom)} a ${fmtDate(d.periodTo)}`);
  kv("Emitido em:", format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR }));
  y += 4;

  // Resumo
  h1("1. Resumo do período");
  kv("Registros de higiene:", String(d.dailyChecklist.length));
  kv("Leituras de temperatura:", String(d.temperatures.length));
  kv("Alertas de temperatura:", String(d.temperatureAlerts.length));
  kv("Recebimentos de mercadoria:", String(d.merchandise.length));
  kv("Irregularidades em recebimento:", String(d.merchandise.filter((m) => m.has_irregularity || m.is_return).length));
  kv("Registros de qualidade do óleo:", String(d.oilQuality.length));
  kv("Trocas de óleo:", String(d.oilQuality.filter((o) => o.changed).length));
  kv("Coletas de óleo usado:", String(d.oilDisposal.length));
  kv("Dedetizações:", String(d.pestControl.length));
  kv("Ocorrências de pragas:", String(d.pestOccurrences.length));
  kv("Manutenções realizadas:", String(d.maintenance.length));
  kv("Solicitações de manutenção:", String(d.maintenanceRequests.length));
  kv("Limpezas de caixa d'água:", String(d.waterTank.length));

  // 2. Higiene
  h1("2. Check-list diário de higiene");
  if (!d.dailyChecklist.length) empty("Sem registros no período.");
  else {
    d.dailyChecklist.slice(0, 400).forEach((r) => {
      p(`• ${fmtDate(r.date)} — ${r.item}: ${r.sim_nao ? "SIM" : "NÃO"}${r.note ? ` — ${r.note}` : ""}`);
    });
    if (d.dailyChecklist.length > 400) empty(`... e mais ${d.dailyChecklist.length - 400} registros.`);
  }

  // 3. Temperatura
  h1("3. Controle de temperatura de equipamentos");
  if (!d.temperatures.length) empty("Sem leituras no período.");
  else {
    d.temperatures.slice(0, 300).forEach((r) => {
      const hum = r.humidity != null ? ` · ${r.humidity}%` : "";
      p(`• ${fmtDT(r.recorded_at)} — ${r.equipment}: ${r.temperature}°C${hum}${r.note ? ` — ${r.note}` : ""}`);
    });
    if (d.temperatures.length > 300) empty(`... e mais ${d.temperatures.length - 300} leituras.`);
  }
  if (d.temperatureAlerts.length) {
    y += 4;
    doc.setFont("helvetica", "bold").setFontSize(10); ensure(13); doc.text("Alertas registrados:", margin, y); y += 13;
    d.temperatureAlerts.forEach((a) => {
      const val = a.value != null ? ` (${a.value})` : "";
      const st = a.resolved_at ? `resolvido em ${fmtDT(a.resolved_at)}` : "em aberto";
      p(`• ${fmtDT(a.started_at)} — ${a.equipment} · ${a.kind}${val} — ${st}`);
    });
  }

  // 4. Recebimento de mercadoria
  h1("4. Recebimento de mercadoria");
  if (!d.merchandise.length) empty("Sem recebimentos no período.");
  else {
    d.merchandise.forEach((m) => {
      const flags = [m.has_irregularity ? "IRREGULARIDADE" : null, m.is_return ? "DEVOLUÇÃO" : null].filter(Boolean).join(" · ");
      p(`• ${fmtDT(m.received_at)} — ${m.supplier} · ${m.product_name} (lote ${m.batch}) — ${STORAGE[m.storage_type] ?? m.storage_type} ${m.temperature}°C${flags ? ` — ${flags}` : ""}${m.note ? ` — ${m.note}` : ""}`);
    });
  }

  // 5. Óleo
  h1("5. Qualidade e descarte de óleo");
  if (d.oilQuality.length) {
    d.oilQuality.forEach((o) => {
      p(`• ${fmtDT(o.recorded_at)} — Qualidade: ${o.quality.toUpperCase()}${o.changed ? " · ÓLEO TROCADO" : ""}${o.note ? ` — ${o.note}` : ""}`);
    });
  } else empty("Sem registros de qualidade no período.");
  if (d.oilDisposal.length) {
    y += 4;
    doc.setFont("helvetica", "bold").setFontSize(10); ensure(13); doc.text("Coletas de óleo usado:", margin, y); y += 13;
    d.oilDisposal.forEach((o) => {
      const lit = o.liters != null ? `${o.liters} L` : "—";
      p(`• ${fmtDate(o.pickup_date)} — ${o.collector_name ?? "—"} · ${lit} · R$ ${Number(o.amount_received).toFixed(2)}${o.notes ? ` — ${o.notes}` : ""}`);
    });
  }

  // 6. Pragas
  h1("6. Controle de pragas");
  if (d.pestControl.length) {
    d.pestControl.forEach((c) => {
      p(`• ${fmtDate(c.service_date)} — ${c.company_name}${c.has_certificate ? " · certificado anexado" : ""}${c.note ? ` — ${c.note}` : ""}`);
    });
  } else empty("Sem dedetizações registradas no período.");
  if (d.pestOccurrences.length) {
    y += 4;
    doc.setFont("helvetica", "bold").setFontSize(10); ensure(13); doc.text("Ocorrências de pragas:", margin, y); y += 13;
    d.pestOccurrences.forEach((o) => {
      p(`• ${fmtDT(o.recorded_at)} — ${o.pest_type} em ${o.location || "—"}${o.note ? ` — ${o.note}` : ""}`);
    });
  }

  // 7. Manutenção
  h1("7. Manutenção de equipamentos");
  if (d.maintenance.length) {
    d.maintenance.forEach((m) => {
      p(`• ${fmtDate(m.date)} — ${m.equipment_type} · ${m.maintenance_type}${m.note ? ` — ${m.note}` : ""}`);
    });
  } else empty("Sem manutenções registradas no período.");
  if (d.maintenanceRequests.length) {
    y += 4;
    doc.setFont("helvetica", "bold").setFontSize(10); ensure(13); doc.text("Solicitações de manutenção:", margin, y); y += 13;
    d.maintenanceRequests.forEach((r) => {
      p(`• ${fmtDT(r.requested_at)} — ${r.equipment_type} · ${URGENCY[r.urgency] ?? r.urgency} · ${REQ_STATUS[r.status] ?? r.status} — ${r.description}`);
    });
  }

  // 8. Caixa d'água
  h1("8. Higienização de caixa d'água");
  if (!d.waterTank.length) empty("Sem limpezas registradas no período.");
  else {
    d.waterTank.forEach((w) => {
      p(`• ${fmtDate(w.cleaning_date)} — Responsável: ${w.responsible || "—"}${w.has_report ? " · laudo anexado" : ""}${w.note ? ` — ${w.note}` : ""}`);
    });
  }

  // Footer
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(120);
    doc.text(
      `Relatório NutriControle gerado pelo NEXA Suite em ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })} — página ${i} de ${total}`,
      pageW / 2, pageH - 20, { align: "center" }
    );
    doc.setTextColor(0);
  }

  return doc;
}
