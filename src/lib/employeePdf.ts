import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";

interface EmployeePdfData {
  id?: string;
  full_name: string;
  social_name?: string | null;
  cpf?: string | null;
  rg?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  gender_identity?: string | null;
  ethnicity?: string | null;
  education_level?: string | null;
  nationality?: string | null;
  marital_status?: string | null;
  spouse_name?: string | null;
  birth_state?: string | null;
  father_name?: string | null;
  mother_name?: string | null;
  nis_number?: string | null;
  voter_id?: string | null;
  voter_zone?: string | null;
  voter_section?: string | null;
  reservist_number?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  zip_code?: string | null;
  city?: string | null;
  state?: string | null;
  position?: string | null;
  department?: string | null;
  contract_type?: string | null;
  hire_date?: string | null;
  work_schedule?: string | null;
  salary?: number | string | null;
  status?: string | null;
  notes?: string | null;
  store_name?: string | null;
  company_legal_name?: string | null;
  company_cnpj?: string | null;
}

const formatCNPJ = (raw?: string | null) => {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "").slice(0, 14);
  if (d.length !== 14) return raw;
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
};

interface DocItem {
  doc_type: string;
  file_name: string;
  uploaded_at: string;
}

const GENDER_LABEL: Record<string, string> = {
  male: "Masculino",
  female: "Feminino",
};

const GENDER_IDENTITY_LABEL: Record<string, string> = {
  cis_man: "Homem cisgênero",
  cis_woman: "Mulher cisgênero",
  trans_man: "Homem trans",
  trans_woman: "Mulher trans",
  non_binary: "Não-binário",
  other: "Outro",
  prefer_not: "Prefiro não informar",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Ativo",
  on_leave: "Afastado",
  inactive: "Inativo",
  terminated: "Desligado",
};

import {
  ETHNICITY_OPTIONS,
  EDUCATION_OPTIONS,
  MARITAL_STATUS_OPTIONS,
  BRAZILIAN_STATES,
} from "@/lib/employeeOptions";

const labelOf = (list: { value: string; label: string }[], val?: string | null) =>
  (val && list.find((o) => o.value === val)?.label) || (val ?? "—");

const stateLabel = (uf?: string | null) => {
  if (!uf) return "—";
  const s = BRAZILIAN_STATES.find((x) => x.uf === uf);
  return s ? `${s.uf} — ${s.name}` : uf;
};

const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
};

const fmtMoney = (v?: number | string | null) => {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const v = (s?: string | null) => (s && s.toString().trim() ? s.toString() : "—");

async function fetchEmployeePhotoDataUrl(employeeId?: string): Promise<string | null> {
  if (!employeeId) return null;
  try {
    const { data: face } = await supabase
      .from("employee_face_descriptors")
      .select("photo_path")
      .eq("employee_id", employeeId)
      .eq("is_active", true)
      .maybeSingle();
    if (!face?.photo_path) return null;
    const { data: signed } = await supabase.storage
      .from("time-clock-photos")
      .createSignedUrl(face.photo_path, 60);
    if (!signed?.signedUrl) return null;
    const res = await fetch(signed.signedUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateEmployeePdf(
  employee: EmployeePdfData,
  documents: DocItem[] = [],
  options: { returnBlob?: boolean } = {},
): Promise<Blob | void> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 40;
  const contentW = pageW - marginX * 2;
  let y = 50;

  const photoDataUrl = await fetchEmployeePhotoDataUrl(employee.id);

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - 50) {
      doc.addPage();
      y = 50;
    }
  };

  // Header
  const headerH = employee.company_legal_name || employee.company_cnpj ? 100 : 80;
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, pageW, headerH, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Ficha de Cadastro do Colaborador", marginX, 32);

  // Razão social + CNPJ no cabeçalho
  if (employee.company_legal_name || employee.company_cnpj) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    if (employee.company_legal_name) {
      doc.text(employee.company_legal_name, marginX, 52);
    }
    doc.setFont("helvetica", "normal");
    if (employee.company_cnpj) {
      doc.text(`CNPJ: ${formatCNPJ(employee.company_cnpj)}`, marginX, 68);
    }
    doc.setFontSize(9);
    const issued = new Date().toLocaleString("pt-BR");
    doc.text(`Emitido em ${issued}`, marginX, 84);
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const issued = new Date().toLocaleString("pt-BR");
    doc.text(`Emitido em ${issued}`, marginX, 58);
  }

  // Foto do colaborador no canto direito do header
  const photoSize = 70;
  const photoX = pageW - marginX - photoSize;
  const photoY = (headerH - photoSize) / 2;
  // moldura branca arredondada
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(photoX - 2, photoY - 2, photoSize + 4, photoSize + 4, 6, 6, "F");
  if (photoDataUrl) {
    try {
      doc.addImage(photoDataUrl, "JPEG", photoX, photoY, photoSize, photoSize);
    } catch {
      // ignora se imagem falhar
    }
  } else {
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(photoX, photoY, photoSize, photoSize, 4, 4, "F");
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    const initials = (employee.full_name || "?")
      .split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();
    doc.text(initials, photoX + photoSize / 2, photoY + photoSize / 2 + 8, { align: "center" });
  }

  y = headerH + 30;
  doc.setTextColor(20, 20, 20);

  // Name block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(employee.full_name || "—", marginX, y);
  y += 18;
  if (employee.social_name) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    doc.text(`Nome social: ${employee.social_name}`, marginX, y);
    y += 16;
    doc.setTextColor(20, 20, 20);
  }
  y += 6;

  const section = (title: string) => {
    ensureSpace(40);
    doc.setDrawColor(220, 220, 220);
    doc.line(marginX, y, marginX + contentW, y);
    y += 16;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text(title, marginX, y);
    y += 14;
    doc.setTextColor(20, 20, 20);
  };

  const grid = (entries: [string, string][]) => {
    const colW = contentW / 2;
    const rowH = 32;
    for (let i = 0; i < entries.length; i += 2) {
      ensureSpace(rowH);
      const left = entries[i];
      const right = entries[i + 1];
      const drawCell = (label: string, value: string, x: number) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(110, 110, 110);
        doc.text(label.toUpperCase(), x, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.setTextColor(20, 20, 20);
        const lines = doc.splitTextToSize(value, colW - 10);
        doc.text(lines.slice(0, 1), x, y + 14);
      };
      drawCell(left[0], left[1], marginX);
      if (right) drawCell(right[0], right[1], marginX + colW);
      y += rowH;
    }
  };

  section("Dados pessoais");
  grid([
    ["CPF", v(employee.cpf)],
    ["RG", v(employee.rg)],
    ["Data de nascimento", fmtDate(employee.birth_date)],
    ["Naturalidade", v(employee.birth_state)],
    ["Nacionalidade", v(employee.nationality)],
    ["Etnia / Raça", labelOf(ETHNICITY_OPTIONS, employee.ethnicity)],
    ["Sexo biológico", employee.gender ? GENDER_LABEL[employee.gender] ?? employee.gender : "—"],
    ["Identidade de gênero", employee.gender_identity ? GENDER_IDENTITY_LABEL[employee.gender_identity] ?? employee.gender_identity : "—"],
    ["Estado civil", labelOf(MARITAL_STATUS_OPTIONS, employee.marital_status)],
    ["Cônjuge", v(employee.spouse_name)],
    ["Grau de instrução", labelOf(EDUCATION_OPTIONS, employee.education_level)],
    ["Nome do pai", v(employee.father_name)],
    ["Nome da mãe", v(employee.mother_name)],
    ["E-mail", v(employee.email)],
    ["Telefone", v(employee.phone)],
    ["Endereço", v(employee.address)],
    ["CEP", v(employee.zip_code)],
    ["Cidade", v(employee.city)],
    ["Estado (UF)", v(employee.state)],
  ]);

  section("Documentos / Registros");
  grid([
    ["NIS / PIS", v(employee.nis_number)],
    ["Título de eleitor", v(employee.voter_id)],
    ["Zona eleitoral", v(employee.voter_zone)],
    ["Seção eleitoral", v(employee.voter_section)],
    ["Reservista (nº)", v(employee.reservist_number)],
    ["", ""],
  ]);

  section("Dados contratuais");
  grid([
    ["Loja", v(employee.store_name)],
    ["Cargo", v(employee.position)],
    ["Departamento", v(employee.department)],
    ["Tipo de contrato", v(employee.contract_type)],
    ["Data de admissão", fmtDate(employee.hire_date)],
    ["Escala", v(employee.work_schedule)],
    ["Salário", fmtMoney(employee.salary)],
    ["Status", employee.status ? STATUS_LABEL[employee.status] ?? employee.status : "—"],
  ]);

  if (employee.notes && employee.notes.trim()) {
    section("Observações");
    ensureSpace(40);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(employee.notes, contentW);
    lines.forEach((line: string) => {
      ensureSpace(14);
      doc.text(line, marginX, y);
      y += 14;
    });
    y += 4;
  }

  section("Documentos enviados");
  if (documents.length === 0) {
    ensureSpace(20);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(110, 110, 110);
    doc.text("Nenhum documento enviado.", marginX, y);
    y += 14;
    doc.setTextColor(20, 20, 20);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 110);
    ensureSpace(20);
    doc.text("TIPO", marginX, y);
    doc.text("ARQUIVO", marginX + 160, y);
    doc.text("ENVIADO EM", marginX + contentW - 90, y);
    y += 6;
    doc.setDrawColor(220, 220, 220);
    doc.line(marginX, y, marginX + contentW, y);
    y += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    documents.forEach((d) => {
      ensureSpace(18);
      doc.text(doc.splitTextToSize(d.doc_type, 150)[0], marginX, y);
      doc.text(doc.splitTextToSize(d.file_name, contentW - 260)[0], marginX + 160, y);
      doc.text(new Date(d.uploaded_at).toLocaleDateString("pt-BR"), marginX + contentW - 90, y);
      y += 16;
    });
  }

  // Footer page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(140, 140, 140);
    doc.text(`Página ${i} de ${pages}`, pageW - marginX, pageH - 24, { align: "right" });
  }

  const safeName = (employee.full_name || "colaborador").replace(/[^\w\-]+/g, "_");
  if (options.returnBlob) {
    return doc.output("blob");
  }
  doc.save(`ficha_${safeName}.pdf`);
}

async function fetchSignatureDataUrl(path: string): Promise<string | null> {
  try {
    const { data: signed } = await supabase.storage
      .from("warning-signatures")
      .createSignedUrl(path, 120);
    if (!signed?.signedUrl) return null;
    const res = await fetch(signed.signedUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

interface WarningRecord {
  id: string;
  title: string;
  content: string;
  status: string;
  issued_at: string;
  signed_at?: string | null;
  refused_at?: string | null;
  refusal_reason?: string | null;
  signature_path?: string | null;
  signature_ip?: string | null;
  signature_user_agent?: string | null;
  content_hash?: string | null;
}

async function generateWarningPdfBlob(
  employee: EmployeePdfData,
  warning: WarningRecord,
): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 40;
  const contentW = pageW - marginX * 2;
  let y = 50;

  // Header
  doc.setFillColor(185, 28, 28);
  doc.rect(0, 0, pageW, 70, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Advertência Disciplinar", marginX, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  if (employee.company_legal_name) {
    doc.text(employee.company_legal_name, marginX, 50);
  }
  if (employee.company_cnpj) {
    doc.text(`CNPJ: ${formatCNPJ(employee.company_cnpj)}`, marginX, 64);
  }

  y = 100;
  doc.setTextColor(20, 20, 20);

  // Identificação
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Colaborador:", marginX, y);
  doc.setFont("helvetica", "normal");
  doc.text(employee.full_name || "—", marginX + 80, y);
  y += 16;

  if (employee.cpf) {
    doc.setFont("helvetica", "bold");
    doc.text("CPF:", marginX, y);
    doc.setFont("helvetica", "normal");
    doc.text(employee.cpf, marginX + 80, y);
    y += 16;
  }
  if (employee.position) {
    doc.setFont("helvetica", "bold");
    doc.text("Cargo:", marginX, y);
    doc.setFont("helvetica", "normal");
    doc.text(employee.position, marginX + 80, y);
    y += 16;
  }

  doc.setFont("helvetica", "bold");
  doc.text("Emitida em:", marginX, y);
  doc.setFont("helvetica", "normal");
  doc.text(new Date(warning.issued_at).toLocaleString("pt-BR"), marginX + 80, y);
  y += 24;

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(warning.title, marginX, y);
  y += 18;

  // Content
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const lines = doc.splitTextToSize(warning.content || "", contentW);
  lines.forEach((line: string) => {
    if (y + 14 > pageH - 200) {
      doc.addPage();
      y = 50;
    }
    doc.text(line, marginX, y);
    y += 14;
  });

  y += 24;

  // Status / Assinatura
  if (y + 200 > pageH - 50) {
    doc.addPage();
    y = 50;
  }

  doc.setDrawColor(200, 200, 200);
  doc.line(marginX, y, marginX + contentW, y);
  y += 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  if (warning.status === "signed") {
    doc.setTextColor(21, 128, 61);
    doc.text("ASSINADA PELO COLABORADOR", marginX, y);
    y += 16;
    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    if (warning.signed_at) {
      doc.text(`Assinada em ${new Date(warning.signed_at).toLocaleString("pt-BR")}`, marginX, y);
      y += 18;
    }
    if (warning.signature_path) {
      const sig = await fetchSignatureDataUrl(warning.signature_path);
      if (sig) {
        try {
          doc.addImage(sig, "PNG", marginX, y, 240, 90);
          y += 96;
        } catch {
          // ignora
        }
      }
    }
    doc.setDrawColor(120, 120, 120);
    doc.line(marginX, y, marginX + 240, y);
    y += 12;
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text("Assinatura do colaborador", marginX, y);
  } else if (warning.status === "refused") {
    doc.setTextColor(185, 28, 28);
    doc.text("ASSINATURA RECUSADA", marginX, y);
    y += 16;
    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    if (warning.refused_at) {
      doc.text(`Recusada em ${new Date(warning.refused_at).toLocaleString("pt-BR")}`, marginX, y);
      y += 16;
    }
    if (warning.refusal_reason) {
      doc.setFont("helvetica", "bold");
      doc.text("Motivo declarado:", marginX, y);
      y += 14;
      doc.setFont("helvetica", "normal");
      const rl = doc.splitTextToSize(warning.refusal_reason, contentW);
      rl.forEach((line: string) => {
        doc.text(line, marginX, y);
        y += 14;
      });
    }
  } else {
    doc.setTextColor(146, 64, 14);
    doc.text("PENDENTE DE ASSINATURA", marginX, y);
    y += 24;
    doc.setTextColor(20, 20, 20);
    doc.setDrawColor(120, 120, 120);
    doc.line(marginX, y + 30, marginX + 240, y + 30);
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text("Assinatura do colaborador", marginX, y + 44);
  }

  // Bloco de trilha de auditoria (validade jurídica — MP 2.200-2/2001)
  if (warning.status === "signed" || warning.status === "refused") {
    if (y + 80 > pageH - 40) { doc.addPage(); y = 50; }
    y += 16;
    doc.setDrawColor(220, 220, 220);
    doc.line(marginX, y, marginX + contentW, y);
    y += 14;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text("TRILHA DE AUDITORIA", marginX, y);
    y += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    const audit: string[] = [];
    if (warning.signature_ip) audit.push(`IP de origem: ${warning.signature_ip}`);
    if (warning.signature_user_agent) audit.push(`Dispositivo: ${warning.signature_user_agent}`);
    if (warning.content_hash) audit.push(`Hash SHA-256 do conteúdo: ${warning.content_hash}`);
    audit.push(`Documento gerado em: ${new Date().toLocaleString("pt-BR")}`);
    audit.forEach((line) => {
      const wrapped = doc.splitTextToSize(line, contentW);
      wrapped.forEach((l: string) => {
        if (y + 11 > pageH - 30) { doc.addPage(); y = 50; }
        doc.text(l, marginX, y);
        y += 11;
      });
    });
  }

  // Rodapé com QR Code de verificação (apenas advertências assinadas)
  if (warning.status === "signed") {
    try {
      const { addVerificationFooter } = await import("./documentVerification");
      await addVerificationFooter(doc, {
        type: "warning",
        signatureId: warning.id,
        contentHash: warning.content_hash ?? null,
        signedAt: warning.signed_at ?? null,
      });
    } catch (err) {
      console.warn("[Warning PDF] falha ao adicionar QR de verificação", err);
    }
  }

  return doc.output("blob");
}

export async function exportEmployeeFolderZip(
  employee: EmployeePdfData,
  documents: (DocItem & { file_path: string })[],
) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  const safeBase = (employee.full_name || "colaborador").replace(/[^\w\-]+/g, "_");

  // 1) Ficha em PDF
  const fichaBlob = (await generateEmployeePdf(
    employee,
    documents.map((d) => ({ doc_type: d.doc_type, file_name: d.file_name, uploaded_at: d.uploaded_at })),
    { returnBlob: true },
  )) as Blob;
  zip.file(`ficha_${safeBase}.pdf`, fichaBlob);

  // 1.1) Advertências (se houver) — um PDF por advertência, com assinatura/recusa
  if (employee.id) {
    const { data: warnings, error: wErr } = await supabase
      .from("employee_warnings")
      .select("id, title, content, status, issued_at, signed_at, refused_at, refusal_reason, signature_path, signature_ip, signature_user_agent, content_hash")
      .eq("employee_id", employee.id)
      .order("issued_at", { ascending: false });

    console.log("[ZIP Export] advertências encontradas:", warnings?.length ?? 0, "erro:", wErr);

    if (wErr) {
      console.error("[ZIP Export] erro ao buscar advertências:", wErr);
    }

    if (warnings && warnings.length > 0) {
      const warnFolder = zip.folder("advertencias");
      if (warnFolder) {
        for (const w of warnings as WarningRecord[]) {
          try {
            console.log("[ZIP Export] gerando PDF da advertência:", w.id, w.title);
            const blob = await generateWarningPdfBlob(employee, w);
            const dateStr = new Date(w.issued_at).toISOString().slice(0, 10);
            const safeTitle = (w.title || "advertencia").replace(/[^\w\-]+/g, "_").slice(0, 60);
            const statusTag =
              w.status === "signed" ? "ASSINADA" :
              w.status === "refused" ? "RECUSADA" : "PENDENTE";
            warnFolder.file(`${dateStr}__${statusTag}__${safeTitle}.pdf`, blob);
            console.log("[ZIP Export] PDF adicionado ao ZIP:", w.id);
          } catch (err) {
            console.error("[ZIP Export] FALHA ao gerar PDF da advertência", w.id, err);
          }
        }
      }
    }
  } else {
    console.warn("[ZIP Export] employee.id ausente — advertências não serão exportadas");
  }

  // 2) Documentos anexados
  const docsFolder = zip.folder("documentos");
  if (docsFolder && documents.length > 0) {
    const usedNames = new Set<string>();
    for (const d of documents) {
      try {
        const { data: signed } = await supabase.storage
          .from("employee-documents")
          .createSignedUrl(d.file_path, 120);
        if (!signed?.signedUrl) continue;
        const res = await fetch(signed.signedUrl);
        if (!res.ok) continue;
        const blob = await res.blob();

        const safeType = (d.doc_type || "documento").replace(/[^\w\-]+/g, "_");
        const originalName = d.file_name || "arquivo";
        let finalName = `${safeType}__${originalName}`;
        let counter = 1;
        while (usedNames.has(finalName)) {
          const dotIdx = finalName.lastIndexOf(".");
          if (dotIdx > 0) {
            finalName = `${finalName.slice(0, dotIdx)}_${counter}${finalName.slice(dotIdx)}`;
          } else {
            finalName = `${finalName}_${counter}`;
          }
          counter++;
        }
        usedNames.add(finalName);
        docsFolder.file(finalName, blob);
      } catch {
        // ignora arquivo com falha e continua
      }
    }
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pasta_${safeBase}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
