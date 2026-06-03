// Helper para gerar QR Code e adicionar rodapé de verificação aos PDFs.
import QRCode from "qrcode";
import type { jsPDF } from "jspdf";

export type VerifiableDocType =
  | "contract"
  | "custom_doc"
  | "warning"
  | "regulation"
  | "position_term";

/** URL pública de verificação (usada no QR Code e impressa no rodapé) */
export function getVerificationUrl(type: VerifiableDocType, id: string): string {
  // Sempre usa o domínio publicado pra estabilidade do QR (não o de preview)
  const base = "https://nexasuite.aquelaparme.com.br";
  return `${base}/verificar/${type}/${id}`;
}

/** Gera o QR Code como dataURL PNG */
export async function generateVerificationQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    margin: 0,
    width: 256,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#FFFFFF" },
  });
}

interface VerificationFooterOptions {
  type: VerifiableDocType;
  signatureId: string;
  contentHash?: string | null;
  signedAt?: string | Date | null;
}

/**
 * Adiciona rodapé de verificação (QR Code + hash + URL) APENAS na última página do PDF.
 * Se não houver espaço suficiente na última página, adiciona uma nova página dedicada.
 * Deve ser chamado por último, depois que todo o conteúdo já foi adicionado.
 */
export async function addVerificationFooter(
  doc: jsPDF,
  opts: VerificationFooterOptions,
): Promise<void> {
  const url = getVerificationUrl(opts.type, opts.signatureId);
  const qrDataUrl = await generateVerificationQrDataUrl(url);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const isPt = (doc.internal.scaleFactor || 1) > 2; // pt vs mm

  // Tamanhos baseados na unidade
  const qrSize = isPt ? 70 : 25; // pt: 70; mm: 25 (maior, já que só aparece uma vez)
  const margin = isPt ? 36 : 12;
  const fontSize = isPt ? 8 : 8;
  const lineGap = isPt ? 10 : 3.5;

  const shortHash = opts.contentHash ? opts.contentHash.slice(0, 16) + "…" : null;
  const signedAtText = opts.signedAt
    ? new Date(opts.signedAt).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  // Vai para a última página existente
  const pageCount = (doc as any).internal.getNumberOfPages();
  doc.setPage(pageCount);

  // Verifica se o cursor de conteúdo permite o bloco; jsPDF não nos diz onde foi
  // o último texto, então usamos uma heurística conservadora: adiciona página nova
  // sempre que não há espaço suficiente reservado no final (margem inferior padrão).
  // Como o gerador chamou addVerificationFooter por último, simplesmente adiciona
  // uma nova página dedicada para garantir que NUNCA cubra texto.
  doc.addPage();
  const yBase = pageHeight - margin - qrSize;
  const finalPage = (doc as any).internal.getNumberOfPages();
  doc.setPage(finalPage);

  // Linha separadora
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(isPt ? 0.5 : 0.2);
  doc.line(margin, yBase - (isPt ? 10 : 3.5), pageWidth - margin, yBase - (isPt ? 10 : 3.5));

  // QR Code à esquerda
  try {
    doc.addImage(qrDataUrl, "PNG", margin, yBase, qrSize, qrSize);
  } catch {
    /* ignora */
  }

  // Texto à direita do QR
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(80, 80, 80);

  const textX = margin + qrSize + (isPt ? 12 : 5);
  let textY = yBase + (isPt ? 12 : 4);

  doc.setFont("helvetica", "bold");
  doc.text("Documento assinado eletronicamente", textX, textY);
  doc.setFont("helvetica", "normal");

  textY += lineGap;
  if (signedAtText) {
    doc.text(`Assinado em ${signedAtText}`, textX, textY);
    textY += lineGap;
  }
  if (shortHash) {
    doc.text(`Hash SHA-256: ${shortHash}`, textX, textY);
    textY += lineGap;
  }
  doc.text(`Verifique em: ${url}`, textX, textY);
  textY += lineGap;
  doc.setTextColor(120, 120, 120);
  doc.text(`ID: ${opts.signatureId}`, textX, textY);

  doc.setTextColor(0, 0, 0);

  // Numeração de páginas em todas as páginas (sem o QR)
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(isPt ? 7 : 7);
    doc.setTextColor(140, 140, 140);
    doc.text(`Pág. ${i}/${totalPages}`, pageWidth - margin, pageHeight - (isPt ? 12 : 4), {
      align: "right",
    });
    doc.setTextColor(0, 0, 0);
  }
}



/** Calcula SHA-256 de uma string (uso client-side, igual ao que é gravado no banco) */
export async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
