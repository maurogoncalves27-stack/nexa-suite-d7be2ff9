import { jsPDF } from "jspdf";
import { COMPANY_INFO, fetchClientIp } from "./internalRegulation";

export { fetchClientIp };

export interface PositionTerm {
  key: string;
  version: string;
  title: string;
  positions: string[]; // normalized lowercased position names
  body: (employeeName: string) => string;
  commitment: string;
}

const norm = (s: string | null | undefined) =>
  (s ?? "").toString().trim().toLowerCase();

export const POSITION_TERMS: PositionTerm[] = [
  {
    key: "stockkeeper_keys",
    version: "1.0",
    title: "TERMO DE RESPONSABILIDADE – CHAVES DA CÂMERA FRIA E ESTOQUE",
    positions: ["estoquista", "estoquistas"],
    body: (employeeName) =>
      `Eu, ${employeeName}, mediante este instrumento declaro responsabilizar-me pela conservação da chave da câmera fria e outra do estoque localizado no escritório AQUELA PARMÊ, inscrito no CNPJ sob o nº ${COMPANY_INFO.cnpj}, no endereço ${COMPANY_INFO.address}, mantendo devidamente trancado e comprometendo-me a devolvê-lo em perfeito estado somente ao responsável legal pela empresa, não sendo autorizado o repasse para outro funcionário sem autorização.\n\nEm caso de extravio e danos que acarretem a perda total ou esquecimento do mesmo, prejudicando ou atrasando a abertura da empresa, fico obrigado(a) a ressarcir o proprietário dos prejuízos, sejam eles de um carro de transporte (Uber) para levar uma cópia, chaveiro, etc.`,
    commitment:
      "Declaro estar ciente das responsabilidades acima descritas e comprometo-me a cumpri-las integralmente, respondendo civilmente pelos prejuízos eventualmente causados em razão de descumprimento.",
  },
];

export function getTermsForPosition(position: string | null | undefined): PositionTerm[] {
  const p = norm(position);
  if (!p) return [];
  return POSITION_TERMS.filter((t) => t.positions.includes(p));
}

export function getTermByKey(key: string): PositionTerm | undefined {
  return POSITION_TERMS.find((t) => t.key === key);
}

export interface PositionTermPdfData {
  term: PositionTerm;
  employeeName: string;
  employeeCpf?: string | null;
  acceptedAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** ID do registro de aceite — usado pra QR Code de verificação no rodapé */
  signatureId?: string | null;
  /** dataURL PNG da assinatura cadastrada (embutida no PDF) */
  signatureDataUrl?: string | null;
  returnBlob?: boolean;
}

export async function generatePositionTermPdf(data: PositionTermPdfData): Promise<Blob | void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 18;
  const usableWidth = pageWidth - marginX * 2;
  let y = 18;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 20) {
      doc.addPage();
      y = 18;
    }
  };

  const addFooter = () => {
    const pageCount = doc.getNumberOfPages();
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`${COMPANY_INFO.name} – CNPJ ${COMPANY_INFO.cnpj}`, marginX, pageHeight - 12);
    doc.text(COMPANY_INFO.address, pageWidth / 2, pageHeight - 8, { align: "center" });
    doc.text(`Página ${pageCount}`, pageWidth - marginX, pageHeight - 8, { align: "right" });
    doc.setTextColor(0);
  };

  const writeParagraph = (text: string, options: { size?: number; bold?: boolean; gap?: number } = {}) => {
    const { size = 10, bold = false, gap = 3 } = options;
    doc.setFontSize(size);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    const lines = doc.splitTextToSize(text, usableWidth);
    const lineHeight = size * 0.45;
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, marginX, y);
      y += lineHeight;
    }
    y += gap;
  };

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(data.term.title, pageWidth / 2, y, { align: "center" });
  y += 8;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110);
  doc.text(`${COMPANY_INFO.name} – CNPJ ${COMPANY_INFO.cnpj}`, pageWidth / 2, y, { align: "center" });
  y += 4;
  doc.text(COMPANY_INFO.address, pageWidth / 2, y, { align: "center" });
  y += 8;
  doc.setTextColor(0);

  writeParagraph(data.term.body(data.employeeName), { size: 11, gap: 6 });

  ensureSpace(20);
  writeParagraph("DECLARAÇÃO", { size: 12, bold: true, gap: 3 });
  writeParagraph(data.term.commitment, { size: 10, gap: 6 });

  // Acceptance block (com assinatura embutida)
  const boxHeight = data.signatureDataUrl ? 60 : 32;
  ensureSpace(boxHeight + 8);
  doc.setDrawColor(180);
  doc.setLineWidth(0.3);
  doc.rect(marginX, y, usableWidth, boxHeight);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("ACEITE DIGITAL", marginX + 3, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const acceptedAtFmt = data.acceptedAt.toLocaleString("pt-BR");
  doc.text(`Colaborador: ${data.employeeName}`, marginX + 3, y + 12);
  if (data.employeeCpf) doc.text(`CPF: ${data.employeeCpf}`, marginX + 3, y + 17);
  doc.text(`Data e hora do aceite: ${acceptedAtFmt}`, marginX + 3, y + (data.employeeCpf ? 22 : 17));
  if (data.ipAddress) doc.text(`IP: ${data.ipAddress}`, marginX + 3, y + (data.employeeCpf ? 27 : 22));

  if (data.signatureDataUrl) {
    try {
      doc.addImage(data.signatureDataUrl, "PNG", marginX + 3, y + 32, 60, 22);
      doc.setFontSize(8);
      doc.setTextColor(110);
      doc.text("Assinatura eletrônica cadastrada", marginX + 3, y + 57);
    } catch (e) {
      console.error("[PositionTermPdf] erro ao embutir assinatura", e);
    }
  }

  doc.setFontSize(8);
  doc.setTextColor(110);
  if (data.userAgent) {
    const uaLines = doc.splitTextToSize(`Navegador: ${data.userAgent}`, usableWidth - 6);
    doc.text(uaLines.slice(0, 1), marginX + (data.signatureDataUrl ? 70 : 3), y + (data.signatureDataUrl ? 50 : 30));
  }
  doc.setTextColor(0);
  y += boxHeight + 4;

  addFooter();

  // Rodapé de verificação (QR Code) em todas as páginas
  if (data.signatureId) {
    const { addVerificationFooter } = await import("./documentVerification");
    await addVerificationFooter(doc, {
      type: "position_term",
      signatureId: data.signatureId,
      signedAt: data.acceptedAt,
    });
  }

  const safeName = data.employeeName.replace(/[^a-zA-Z0-9]+/g, "_");
  if (data.returnBlob) return doc.output("blob");
  doc.save(`${data.term.key}_${safeName}.pdf`);
}
