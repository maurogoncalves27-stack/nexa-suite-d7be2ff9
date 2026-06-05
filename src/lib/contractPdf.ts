import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";

export interface ContractEmployeeData {
  id: string;
  full_name: string;
  cpf?: string | null;
  rg?: string | null;
  nationality?: string | null;
  marital_status?: string | null;
  birth_date?: string | null;
  address?: string | null;
  zip_code?: string | null;
  city?: string | null;
  state?: string | null;
  position?: string | null;
  department?: string | null;
  hire_date?: string | null;
  admission_date?: string | null;
  salary?: number | string | null;
  work_schedule?: string | null;
  contract_type?: string | null;
  experience_contract_days?: number | null;
  experience_initial_days?: number | null;
  experience_extension_days?: number | null;
  store_id: string;
  allocated_store_id?: string | null;
}

interface ContractStoreData {
  id: string;
  name: string;
  legal_name?: string | null;
  cnpj?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
}

const formatCNPJ = (raw?: string | null) => {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "").slice(0, 14);
  if (d.length !== 14) return raw;
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
};

const formatCPF = (raw?: string | null) => {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length !== 11) return raw;
  return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
};

const formatCEP = (raw?: string | null) => {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length !== 8) return raw;
  return d.replace(/^(\d{5})(\d{3})$/, "$1-$2");
};

const formatDate = (raw?: string | null) => {
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("pt-BR");
};

const formatLongDate = (date: Date) => {
  const months = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  return `${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`;
};

const formatMoney = (value?: number | string | null) => {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n)) return "";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Conversor simples de número para extenso (R$)
const numberToWords = (value?: number | string | null): string => {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n)) return "";

  const units = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
    "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const tens = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const hundreds = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos",
    "seiscentos", "setecentos", "oitocentos", "novecentos"];

  const convertGroup = (num: number): string => {
    if (num === 0) return "";
    if (num === 100) return "cem";
    let result = "";
    const h = Math.floor(num / 100);
    const t = Math.floor((num % 100) / 10);
    const u = num % 10;
    if (h) result += hundreds[h];
    if (t || u) {
      if (result) result += " e ";
      if (t < 2 && (t * 10 + u) > 0) result += units[t * 10 + u];
      else {
        if (t) result += tens[t];
        if (u) result += (t ? " e " : "") + units[u];
      }
    }
    return result;
  };

  const intPart = Math.floor(n);
  const cents = Math.round((n - intPart) * 100);

  let words = "";
  if (intPart === 0) words = "zero";
  else {
    const thousands = Math.floor(intPart / 1000);
    const rest = intPart % 1000;
    if (thousands) {
      words = thousands === 1 ? "mil" : `${convertGroup(thousands)} mil`;
      if (rest) words += rest < 100 ? " e " : " ";
    }
    if (rest) words += convertGroup(rest);
  }

  let result = `${words} ${intPart === 1 ? "real" : "reais"}`;
  if (cents > 0) {
    result += ` e ${convertGroup(cents)} ${cents === 1 ? "centavo" : "centavos"}`;
  }
  return result;
};

interface BuiltContract {
  /** Texto fixo do sistema: identificação das partes (cabeçalho) */
  header: string;
  /** Texto editável das cláusulas (vindo do template do banco, com placeholders já substituídos) */
  body: string;
  /** Texto fixo do sistema: data/local + assinaturas (rodapé) */
  footer: string;
}

/**
 * Placeholders disponíveis APENAS para a parte editável (cláusulas).
 * Cabeçalho e rodapé são montados pelo sistema e NÃO aceitam customização.
 */
export const EDITABLE_PLACEHOLDERS = [
  "{{cargo}}",
  "{{departamento}}",
  "{{loja_alocacao}}",
  "{{salario}}",
  "{{salario_extenso}}",
  "{{jornada}}",
  "{{tipo_contrato}}",
  "{{data_admissao}}",
  "{{periodo_experiencia}}",
  "{{periodo_experiencia_inicial}}",
  "{{periodo_experiencia_prorrogacao}}",
  "{{periodo_experiencia_total}}",
  "{{clausula_experiencia}}",
  "{{responsabilidades}}",
] as const;

export async function buildContract(
  employee: ContractEmployeeData,
  templateContent: string,
): Promise<BuiltContract> {
  // Buscar loja contratante (store_id) e loja de alocação
  const storeIds = Array.from(
    new Set([employee.store_id, employee.allocated_store_id].filter(Boolean)),
  ) as string[];
  const { data: stores } = await supabase
    .from("stores")
    .select("id, name, legal_name, cnpj, address, city, state")
    .in("id", storeIds);

  const storeMap = new Map<string, ContractStoreData>(
    (stores ?? []).map((s) => [s.id, s as ContractStoreData]),
  );
  const contractStore = storeMap.get(employee.store_id);
  const allocStore = employee.allocated_store_id
    ? storeMap.get(employee.allocated_store_id)
    : contractStore;

  // Buscar responsabilidades do cargo (case-insensitive)
  let responsibilities: string[] = [];
  if (employee.position) {
    const { data: resps } = await supabase
      .from("position_responsibilities")
      .select("responsibility, sort_order")
      .ilike("position", employee.position.trim())
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    responsibilities = (resps ?? []).map((r: any) => r.responsibility);
  }

  const responsibilitiesText = responsibilities.length
    ? responsibilities.map((r) => `  • ${r}`).join("\n")
    : "  • (Não há responsabilidades cadastradas para este cargo)";

  const empresaEndereco = [contractStore?.address, contractStore?.city, contractStore?.state]
    .filter(Boolean)
    .join(", ");

  const enderecoCompleto = [employee.address].filter(Boolean).join(", ");

  const today = new Date();
  const admissionDate = employee.admission_date || employee.hire_date;

  // ========= CABEÇALHO FIXO (não editável) =========
  const empresaRazao = contractStore?.legal_name || contractStore?.name || "";
  const empresaCnpj = formatCNPJ(contractStore?.cnpj);

  const header = [
    "CONTRATO INDIVIDUAL DE TRABALHO POR PRAZO INDETERMINADO",
    "",
    `EMPREGADOR: ${empresaRazao}, inscrita no CNPJ sob nº ${empresaCnpj}, com sede em ${empresaEndereco}, doravante denominada EMPREGADORA.`,
    "",
    `EMPREGADO(A): ${employee.full_name || ""}, ${employee.nationality || "brasileiro(a)"}, ${employee.marital_status || ""}, portador(a) do RG nº ${employee.rg || ""} e CPF nº ${formatCPF(employee.cpf)}, nascido(a) em ${formatDate(employee.birth_date)}, residente e domiciliado(a) em ${enderecoCompleto}, ${employee.city || ""}/${employee.state || ""}, CEP ${formatCEP(employee.zip_code)}, doravante denominado(a) EMPREGADO(A).`,
    "",
    "As partes acima identificadas têm entre si justo e contratado o presente Contrato Individual de Trabalho, mediante as cláusulas e condições a seguir:",
  ].join("\n");

  // ========= CORPO EDITÁVEL (template do banco) =========
  const replacements: Record<string, string> = {
    "{{cargo}}": employee.position || "",
    "{{departamento}}": employee.department || "",
    "{{loja_alocacao}}": allocStore?.name || contractStore?.name || "",
    "{{salario}}": formatMoney(employee.salary),
    "{{salario_extenso}}": numberToWords(employee.salary),
    "{{jornada}}": employee.work_schedule || "44 (quarenta e quatro) horas semanais",
    "{{tipo_contrato}}": employee.contract_type || "CLT",
    "{{data_admissao}}": formatDate(admissionDate),
    ...(() => {
      const inicial = Number(employee.experience_initial_days ?? employee.experience_contract_days ?? 90) || 0;
      const prorrog = Number(employee.experience_extension_days ?? 0) || 0;
      const total = inicial + prorrog;
      const clausula = prorrog > 0
        ? `O presente contrato terá período inicial de experiência de ${inicial} (${numberToWords(inicial).replace(/\s*reais?$/, "").trim() || inicial}) dias, contados a partir de ${formatDate(admissionDate)}, podendo ser prorrogado, uma única vez, por mais ${prorrog} dias, totalizando ${total} dias (art. 445, parágrafo único, da CLT; Súmula 188 do TST). Durante esse prazo, qualquer das partes poderá rescindir o contrato nos termos da legislação trabalhista. Findo o prazo final sem manifestação em contrário, o contrato passará automaticamente a vigorar por prazo indeterminado.`
        : `O presente contrato terá período de experiência de ${inicial} dias, contados a partir de ${formatDate(admissionDate)}, durante o qual qualquer das partes poderá rescindi-lo nos termos da legislação trabalhista. Findo esse prazo sem manifestação em contrário, o contrato passará automaticamente a vigorar por prazo indeterminado.`;
      return {
        "{{periodo_experiencia}}": String(total || inicial),
        "{{periodo_experiencia_inicial}}": String(inicial),
        "{{periodo_experiencia_prorrogacao}}": String(prorrog),
        "{{periodo_experiencia_total}}": String(total || inicial),
        "{{clausula_experiencia}}": clausula,
      };
    })(),
    "{{responsabilidades}}": responsibilitiesText,
  };

  let body = templateContent;
  for (const [key, val] of Object.entries(replacements)) {
    body = body.split(key).join(val);
  }

  // ========= RODAPÉ FIXO (não editável) =========
  const cidadeContrato = contractStore?.city || employee.city || "";
  const dataContrato = admissionDate ? formatLongDate(new Date(admissionDate)) : formatLongDate(today);

  const footer = [
    "",
    `${cidadeContrato}, ${dataContrato}.`,
    "",
    "",
    "_________________________________________",
    "EMPREGADORA",
    empresaRazao,
    "",
    "",
    "_________________________________________",
    "EMPREGADO(A)",
    employee.full_name || "",
    `CPF: ${formatCPF(employee.cpf)}`,
  ].join("\n");

  return { header, body, footer };
}

export interface GenerateContractOptions {
  /** PNG dataURL da assinatura desenhada — embute na linha "EMPREGADO(A)" do rodapé */
  signatureDataUrl?: string | null;
}

export async function generateContractPdf(
  employee: ContractEmployeeData,
  templateContent: string,
  options: GenerateContractOptions = {},
): Promise<jsPDF> {
  const { header, body, footer } = await buildContract(employee, templateContent);
  const fullText = `${header}\n\n${body}\n${footer}`;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 20;
  const marginTop = 20;
  const marginBottom = 28; // espaço reservado para o rodapé de verificação (QR + textos)
  const maxWidth = pageWidth - marginX * 2;
  const lineHeight = 5.5;

  doc.setFont("times", "normal");
  doc.setFontSize(11);

  let y = marginTop;
  const paragraphs = fullText.split("\n");

  // Marca a posição (página + Y) das linhas de assinatura para inserir overlays depois
  let employeeSigPage: number | null = null;
  let employeeSigY: number | null = null;
  let companySigPage: number | null = null;
  let companySigY: number | null = null;
  const sigMarker = "_________________________________________";
  // Queremos a 1ª ocorrência (EMPREGADORA) e a 2ª (EMPREGADO).
  let markerCount = 0;

  for (const para of paragraphs) {
    if (para.trim() === "") {
      y += lineHeight * 0.6;
      continue;
    }

    const isTitle =
      /^CONTRATO\b/.test(para.trim()) ||
      /^CL[ÁA]USULA\s/i.test(para.trim()) ||
      /^EMPREGADOR(A)?:/.test(para.trim()) ||
      /^EMPREGADO\(A\):/.test(para.trim());

    doc.setFont("times", isTitle ? "bold" : "normal");

    const lines = doc.splitTextToSize(para, maxWidth);
    for (const line of lines) {
      if (y > pageHeight - marginBottom) {
        doc.addPage();
        y = marginTop;
      }
      if (line.trim() === sigMarker) {
        markerCount += 1;
        if (markerCount === 1) {
          companySigPage = (doc as any).internal.getCurrentPageInfo().pageNumber;
          companySigY = y;
        } else if (markerCount === 2 && options.signatureDataUrl) {
          employeeSigPage = (doc as any).internal.getCurrentPageInfo().pageNumber;
          employeeSigY = y;
        }
      }
      doc.text(line, marginX, y);
      y += lineHeight;
    }
  }

  // Carimbo eletrônico da EMPREGADORA (acima do traço da empresa)
  if (companySigPage && companySigY !== null) {
    try {
      doc.setPage(companySigPage);
      const stampNow = new Date();
      const stampStr = stampNow.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

      // Recupera razão social/CNPJ a partir do próprio header já montado
      const headerLower = header;
      const razaoMatch = headerLower.match(/EMPREGADOR(?:A)?:\s*([^,]+),/);
      const cnpjMatch = headerLower.match(/CNPJ\s*sob\s*n[ºo]\s*([\d./-]+)/i);
      const razaoStamp = (razaoMatch?.[1] || "EMPREGADORA").trim();
      const cnpjStamp = (cnpjMatch?.[1] || "").trim();

      const stampSeed = `${employee.id}|${razaoStamp}|${cnpjStamp}|${stampNow.toISOString()}`;
      let hash = 0;
      for (let i = 0; i < stampSeed.length; i++) {
        hash = ((hash << 5) - hash + stampSeed.charCodeAt(i)) | 0;
      }
      const stampHash = (hash >>> 0).toString(16).padStart(8, "0");

      const boxX = marginX;
      const boxY = (companySigY as number) - 18;
      const boxW = 90;
      const boxH = 16;

      doc.setDrawColor(120);
      doc.setLineWidth(0.2);
      doc.roundedRect(boxX, boxY, boxW, boxH, 1.5, 1.5);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("ASSINADO ELETRONICAMENTE", boxX + 2, boxY + 4);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(razaoStamp.slice(0, 60), boxX + 2, boxY + 8);
      doc.text(`CNPJ ${cnpjStamp || "-"}`, boxX + 2, boxY + 11);
      doc.text(`em ${stampStr} · hash ${stampHash}`, boxX + 2, boxY + 14);
      doc.setFont("times", "normal");
      doc.setFontSize(11);
      doc.setDrawColor(0);
    } catch {
      /* ignora falha ao desenhar carimbo */
    }
  }

  // Embute imagem da assinatura do empregado logo acima do traço
  if (options.signatureDataUrl && employeeSigPage && employeeSigY !== null) {
    try {
      const sigW = 60; // mm
      const sigH = 22; // mm
      const sigX = marginX;
      const sigYTop = employeeSigY - sigH - 1; // 1mm acima do traço
      doc.setPage(employeeSigPage);
      doc.addImage(options.signatureDataUrl, "PNG", sigX, sigYTop, sigW, sigH);
    } catch {
      /* ignora falha ao embutir assinatura */
    }
  }

  return doc;
}

export async function downloadContractPdf(
  employee: ContractEmployeeData,
  templateContent: string,
) {
  const doc = await generateContractPdf(employee, templateContent);
  const safeName = (employee.full_name || "colaborador").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
  doc.save(`contrato_${safeName}.pdf`);
}

export async function getActiveContractTemplate(): Promise<{ id: string; name: string; content: string } | null> {
  const { data } = await supabase
    .from("contract_templates")
    .select("id, name, content")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as any) ?? null;
}
