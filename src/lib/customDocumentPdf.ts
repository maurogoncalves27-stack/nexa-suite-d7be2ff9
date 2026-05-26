// Gera PDF do documento personalizado assinado, com rodapé de verificação (QR + hash).
import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { addVerificationFooter, sha256Hex } from "./documentVerification";
import { getUserSignatureDataUrl } from "./userSignature";

interface CustomDocPdfInput {
  signatureId: string;
  returnBlob?: boolean;
}

const stripHtml = (html: string): string => {
  // Remove tags e decodifica entidades básicas, preservando quebras de bloco.
  const withBreaks = html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ");
  const text = withBreaks.replace(/<[^>]+>/g, "");
  const decoded = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return decoded.replace(/\n{3,}/g, "\n\n").trim();
};

const formatCpf = (raw?: string | null) => {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length !== 11) return raw;
  return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
};

export async function downloadCustomDocumentPdf({ signatureId, returnBlob }: CustomDocPdfInput): Promise<Blob | void> {
  const { data: sig, error } = await supabase
    .from("custom_document_signatures")
    .select("id, document_id, version_id, version_number, signed_at, ip_address, user_agent, employee_id, user_id")
    .eq("id", signatureId)
    .maybeSingle();
  if (error || !sig) throw new Error(error?.message || "Assinatura não encontrada");

  // Busca a assinatura única cadastrada do usuário que assinou
  const { data: userSig } = await supabase
    .from("user_signatures")
    .select("signature_path")
    .eq("user_id", sig.user_id)
    .maybeSingle();
  const signatureImageDataUrl = userSig?.signature_path
    ? await getUserSignatureDataUrl(userSig.signature_path)
    : null;

  const [{ data: doc }, { data: ver }, { data: emp }] = await Promise.all([
    supabase.from("custom_documents").select("title, description").eq("id", sig.document_id).maybeSingle(),
    supabase.from("custom_document_versions").select("content").eq("id", sig.version_id).maybeSingle(),
    sig.employee_id
      ? supabase.from("employees").select("full_name, cpf, position, store_id").eq("id", sig.employee_id).maybeSingle()
      : Promise.resolve({ data: null as any }),
  ]);

  const { data: store } = emp?.store_id
    ? await supabase.from("stores").select("name, legal_name, cnpj").eq("id", emp.store_id).maybeSingle()
    : { data: null as any };

  const title = doc?.title ?? "Documento";
  const contentText = stripHtml(ver?.content ?? "");
  const contentHash = await sha256Hex(ver?.content ?? "");

  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const marginX = 40;
  const contentW = pageW - marginX * 2;
  let y = 50;

  // Header
  pdf.setFillColor(37, 99, 235);
  pdf.rect(0, 0, pageW, 70, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(title, marginX, 32);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  if (store?.legal_name || store?.name) {
    pdf.text(store?.legal_name || store?.name || "", marginX, 50);
  }
  if (store?.cnpj) {
    pdf.text(`CNPJ: ${store.cnpj}`, marginX, 64);
  }

  y = 100;
  pdf.setTextColor(20, 20, 20);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("Colaborador:", marginX, y);
  pdf.setFont("helvetica", "normal");
  pdf.text(emp?.full_name ?? "—", marginX + 80, y);
  y += 16;
  if (emp?.cpf) {
    pdf.setFont("helvetica", "bold");
    pdf.text("CPF:", marginX, y);
    pdf.setFont("helvetica", "normal");
    pdf.text(formatCpf(emp.cpf), marginX + 80, y);
    y += 16;
  }
  if (emp?.position) {
    pdf.setFont("helvetica", "bold");
    pdf.text("Cargo:", marginX, y);
    pdf.setFont("helvetica", "normal");
    pdf.text(emp.position, marginX + 80, y);
    y += 16;
  }
  pdf.setFont("helvetica", "bold");
  pdf.text("Versão:", marginX, y);
  pdf.setFont("helvetica", "normal");
  pdf.text(`v${sig.version_number}`, marginX + 80, y);
  y += 24;

  // Body
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  const lines = pdf.splitTextToSize(contentText, contentW);
  for (const line of lines) {
    if (y + 14 > pageH - 140) {
      pdf.addPage();
      y = 50;
    }
    pdf.text(line, marginX, y);
    y += 14;
  }

  y += 16;
  if (y + 70 > pageH - 100) {
    pdf.addPage();
    y = 50;
  }

  pdf.setDrawColor(200, 200, 200);
  pdf.line(marginX, y, marginX + contentW, y);
  y += 14;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(21, 128, 61);
  pdf.text("ASSINADO ELETRONICAMENTE", marginX, y);
  y += 16;

  // Embute a assinatura cadastrada
  if (signatureImageDataUrl) {
    try {
      pdf.addImage(signatureImageDataUrl, "PNG", marginX, y, 160, 60);
      y += 64;
      pdf.setDrawColor(150, 150, 150);
      pdf.line(marginX, y, marginX + 160, y);
      y += 4;
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(8);
      pdf.setTextColor(110);
      pdf.text("Assinatura eletrônica cadastrada do colaborador", marginX, y);
      y += 12;
    } catch (e) {
      console.error("[CustomDocPdf] erro ao embutir assinatura", e);
    }
  }

  pdf.setTextColor(20, 20, 20);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  if (sig.signed_at) {
    pdf.text(`Assinado em ${new Date(sig.signed_at).toLocaleString("pt-BR")}`, marginX, y);
    y += 14;
  }
  pdf.setFontSize(9);
  pdf.setTextColor(90, 90, 90);
  pdf.text("Conforme MP 2.200-2/2001 — Marco da Assinatura Eletrônica.", marginX, y);

  // Rodapé com QR Code de verificação em todas as páginas
  await addVerificationFooter(pdf, {
    type: "custom_doc",
    signatureId: sig.id,
    contentHash,
    signedAt: sig.signed_at,
  });

  const safeTitle = title.replace(/[^\w\-]+/g, "_").slice(0, 60);
  if (returnBlob) return pdf.output("blob");
  pdf.save(`${safeTitle}_v${sig.version_number}.pdf`);
}
