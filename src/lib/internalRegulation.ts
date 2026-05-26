export const INTERNAL_REGULATION_VERSION = "1.0";

export const INTERNAL_REGULATION_TITLE = "REGULAMENTO INTERNO DA EMPRESA";

export const INTERNAL_REGULATION_INTRO =
  "O presente Regulamento Interno estabelece normas de conduta, disciplina, organização e procedimentos operacionais obrigatórios para todos os colaboradores da empresa. As regras aqui estabelecidas visam garantir a qualidade do atendimento, a segurança alimentar, a proteção do patrimônio da empresa e o cumprimento da legislação trabalhista vigente.";

export interface RegulationChapter {
  title: string;
  articles: string[];
}

export const INTERNAL_REGULATION_CHAPTERS: RegulationChapter[] = [
  {
    title: "CAPÍTULO I – DAS DISPOSIÇÕES GERAIS",
    articles: [
      "Art. 1º O presente Regulamento aplica-se a todos os colaboradores da empresa, independentemente de cargo, função ou unidade de trabalho.",
      "Art. 2º O cumprimento das normas estabelecidas neste regulamento é obrigatório.",
      "Art. 3º O descumprimento das disposições poderá resultar na aplicação de medidas disciplinares previstas na legislação trabalhista.",
    ],
  },
  {
    title: "CAPÍTULO II – DA JORNADA DE TRABALHO E CONTROLE DE PONTO",
    articles: [
      "Art. 4º Todos os colaboradores deverão registrar corretamente sua jornada por meio do sistema de ponto eletrônico adotado pela empresa.",
      "Art. 5º A ausência de registro de ponto poderá resultar no não reconhecimento do período como tempo trabalhado.",
      "Art. 6º Antes de registrar o ponto, o colaborador deverá guardar seus pertences pessoais no local apropriado.",
      "Art. 7º O colaborador que se atrasar, faltar ou necessitar se ausentar durante a jornada deverá comunicar a empresa.\n§1º A tolerância máxima para atrasos é de 10 minutos.\n§2º A reincidência de atrasos ou faltas injustificadas poderá resultar em medidas disciplinares.",
    ],
  },
  {
    title: "CAPÍTULO III – DA MULTIFUNCIONALIDADE",
    articles: [
      "Art. 8º Considerando a natureza dinâmica das atividades do setor de alimentação e delivery, o colaborador poderá ser designado para exercer atividades correlatas à sua função principal.\n§1º A execução de atividades correlatas visa garantir a continuidade da operação e a eficiência do atendimento.\n§2º A realização dessas atividades não caracteriza acúmulo ou desvio de função, desde que compatíveis com a atividade principal do colaborador.",
    ],
  },
  {
    title: "CAPÍTULO IV – DO UNIFORME, HIGIENE E APRESENTAÇÃO PESSOAL",
    articles: [
      "Art. 9º O uso do uniforme fornecido pela empresa é obrigatório durante toda a jornada de trabalho.\n§1º O uniforme deverá estar limpo, conservado e adequado às atividades desempenhadas.\n§2º O colaborador é responsável pela conservação do uniforme.",
      "Art. 10º Os colaboradores que atuam na manipulação de alimentos deverão observar rigorosamente as normas de higiene:\nI – manter cabelos presos e protegidos por touca;\nII – manter unhas curtas e sem esmalte;\nIII – não utilizar adornos pessoais;\nIV – manter asseio pessoal adequado;\nV – seguir rigorosamente os procedimentos de manipulação de alimentos.",
    ],
  },
  {
    title: "CAPÍTULO V – DAS NORMAS DE SEGURANÇA ALIMENTAR",
    articles: [
      "Art. 11º Todos os colaboradores deverão cumprir rigorosamente as normas sanitárias aplicáveis à manipulação de alimentos, conforme legislação sanitária vigente e orientações da Agência Nacional de Vigilância Sanitária.",
      "Art. 12º Constituem obrigações relacionadas à segurança alimentar:\nI – higienização correta das mãos;\nII – uso de equipamentos de proteção quando exigido;\nIII – cumprimento dos checklists operacionais;\nIV – manutenção da limpeza e organização do ambiente;\nV – cumprimento dos procedimentos operacionais padronizados.",
      "Art. 13º O descumprimento das normas de segurança alimentar poderá resultar em penalidades disciplinares, considerando o risco sanitário envolvido.",
    ],
  },
  {
    title: "CAPÍTULO VI – DA CONFERÊNCIA OBRIGATÓRIA DE PEDIDOS",
    articles: [
      "Art. 14º Todos os pedidos preparados para clientes, delivery ou retirada deverão ser obrigatoriamente conferidos antes do envio.\n§1º A conferência deverá seguir os checklists operacionais definidos pela empresa.\n§2º O colaborador responsável pela conferência deverá verificar:\nI – itens do pedido;\nII – quantidades;\nIII – embalagens;\nIV – observações do cliente.\n§3º A ausência de conferência ou negligência na verificação poderá resultar em medidas disciplinares.",
    ],
  },
  {
    title: "CAPÍTULO VII – DA BONIFICAÇÃO POR DESEMPENHO",
    articles: [
      "Art. 15º A empresa poderá conceder bonificações, prêmios ou incentivos aos colaboradores em razão de desempenho, produtividade ou cumprimento de metas.\n§1º Tais valores possuem natureza de prêmio, nos termos do art. 457 da Consolidação das Leis do Trabalho.\n§2º As bonificações possuem caráter eventual, variável e condicionado ao desempenho, não constituindo salário.\n§3º Os valores pagos a título de bonificação não se incorporam à remuneração do colaborador, não gerando reflexos em férias, décimo terceiro salário, aviso prévio ou FGTS.",
    ],
  },
  {
    title: "CAPÍTULO VIII – DA RESPONSABILIDADE POR EQUIPAMENTOS E ESTOQUE",
    articles: [
      "Art. 16º Os colaboradores deverão zelar pela conservação dos equipamentos, utensílios, mobiliários e demais bens da empresa.",
      "Art. 17º É dever do colaborador comunicar imediatamente qualquer dano, irregularidade ou mau funcionamento de equipamentos.",
      "Art. 18º Nos termos do art. 462 da CLT, o colaborador poderá ser responsabilizado por prejuízos causados à empresa quando comprovado dolo ou culpa.",
    ],
  },
  {
    title: "CAPÍTULO IX – DO USO DE TELEFONE CELULAR",
    articles: [
      "Art. 19º É proibido o uso de telefone celular para fins pessoais durante a jornada de trabalho e nas áreas operacionais.\n§1º O uso somente será permitido quando necessário para atividades de trabalho e autorizado pela empresa.\n§2º A empresa poderá determinar que o celular permaneça guardado no guarda-volumes durante o expediente.",
    ],
  },
  {
    title: "CAPÍTULO X – DOS GRUPOS DE COMUNICAÇÃO OPERACIONAL",
    articles: [
      "Art. 20º A empresa poderá utilizar aplicativos de comunicação digital como ferramenta operacional de trabalho.",
      "Art. 21º Os grupos oficiais deverão ser utilizados exclusivamente para comunicação relacionada ao trabalho. É proibido:\nI – envio de mensagens pessoais;\nII – conteúdos políticos ou religiosos;\nIII – conteúdos ofensivos ou inadequados.",
    ],
  },
  {
    title: "CAPÍTULO XI – DO MONITORAMENTO POR CÂMERAS",
    articles: [
      "Art. 22º As dependências da empresa poderão possuir sistema de monitoramento por câmeras de segurança.\n§1º O monitoramento tem finalidade de:\nI – garantir a segurança de colaboradores e clientes;\nII – proteger o patrimônio da empresa;\nIII – acompanhar procedimentos operacionais.\n§2º As imagens poderão ser utilizadas para apuração de ocorrências internas ou situações relacionadas ao trabalho.",
    ],
  },
  {
    title: "CAPÍTULO XII – DAS PROIBIÇÕES",
    articles: [
      "Art. 23º É proibido ao colaborador:\nI – retirar produtos ou equipamentos da empresa sem autorização;\nII – portar armas ou substâncias ilícitas;\nIII – apresentar-se ao trabalho sob efeito de álcool ou drogas;\nIV – fumar nas dependências da empresa;\nV – tratar clientes ou colegas com desrespeito;\nVI – permitir entrada de pessoas estranhas sem autorização;\nVII – petiscar produtos ou fazer refeições fora do horário de intervalo;\nVIII – almoçar itens fora da escala permitida para o almoço.",
    ],
  },
  {
    title: "CAPÍTULO XIII – DAS PENALIDADES DISCIPLINARES",
    articles: [
      "Art. 24º O descumprimento das normas poderá resultar nas seguintes penalidades:\nI – advertência verbal;\nII – advertência escrita;\nIII – suspensão disciplinar;\nIV – demissão.",
      "Art. 25º As penalidades serão aplicadas conforme a gravidade da infração.",
    ],
  },
  {
    title: "CAPÍTULO XIV – DAS DISPOSIÇÕES FINAIS",
    articles: [
      "Art. 26º O presente Regulamento integra o contrato de trabalho.",
      "Art. 27º A empresa poderá atualizar este regulamento sempre que necessário.",
      "Art. 28º Os casos omissos serão resolvidos com base na legislação trabalhista vigente.",
    ],
  },
];

export const INTERNAL_REGULATION_COMMITMENT =
  "Declaro que recebi uma cópia do Regulamento Interno da Empresa, tendo lido e compreendido todas as suas disposições. Declaro estar ciente de que as normas estabelecidas neste documento integram meu contrato de trabalho e comprometo-me a cumpri-las integralmente.";

export const COMPANY_INFO = {
  name: "DVF FOODS SERVICE LTDA",
  cnpj: "44.932.369/0001-08",
  address: "SHCS Cr Quadra 513 Bloco B - Asa Sul, Brasília - DF, 70.380-520",
};

interface PdfData {
  employeeName: string;
  employeeCpf?: string | null;
  acceptedAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** ID do registro de aceite — usado pra QR Code de verificação no rodapé */
  signatureId?: string | null;
  /** dataURL PNG da assinatura cadastrada (embutida no PDF) */
  signatureDataUrl?: string | null;
  /** Se true, retorna o Blob ao invés de baixar o arquivo */
  returnBlob?: boolean;
}

export async function generateInternalRegulationPdf(data: PdfData): Promise<Blob | void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 18;
  const marginTop = 18;
  const marginBottom = 22;
  const usableWidth = pageWidth - marginX * 2;
  let y = marginTop;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - marginBottom) {
      addFooter();
      doc.addPage();
      y = marginTop;
    }
  };

  const addFooter = () => {
    const pageCount = doc.getNumberOfPages();
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      `${COMPANY_INFO.name} • CNPJ ${COMPANY_INFO.cnpj}`,
      pageWidth / 2,
      pageHeight - 12,
      { align: "center" }
    );
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
  doc.setFontSize(14);
  doc.text(INTERNAL_REGULATION_TITLE, pageWidth / 2, y, { align: "center" });
  y += 8;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110);
  doc.text(`${COMPANY_INFO.name} – CNPJ ${COMPANY_INFO.cnpj}`, pageWidth / 2, y, { align: "center" });
  y += 4;
  doc.text(COMPANY_INFO.address, pageWidth / 2, y, { align: "center" });
  y += 8;
  doc.setTextColor(0);

  writeParagraph(INTERNAL_REGULATION_INTRO, { size: 10, gap: 4 });

  for (const chapter of INTERNAL_REGULATION_CHAPTERS) {
    ensureSpace(10);
    writeParagraph(chapter.title, { size: 11, bold: true, gap: 2 });
    for (const article of chapter.articles) {
      writeParagraph(article, { size: 10, gap: 2 });
    }
    y += 1;
  }

  // Termo de ciência
  ensureSpace(30);
  writeParagraph("TERMO DE CIÊNCIA E COMPROMISSO", { size: 12, bold: true, gap: 3 });
  writeParagraph(INTERNAL_REGULATION_COMMITMENT, { size: 10, gap: 6 });

  // Bloco de aceite (com assinatura embutida)
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
      console.error("[RegulationPdf] erro ao embutir assinatura", e);
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
      type: "regulation",
      signatureId: data.signatureId,
      signedAt: data.acceptedAt,
    });
  }

  const safeName = data.employeeName.replace(/[^a-zA-Z0-9]+/g, "_");
  if (data.returnBlob) return doc.output("blob");
  doc.save(`regimento_interno_${safeName}.pdf`);
}

async function fetchClientIp(): Promise<string | null> {
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    if (!res.ok) return null;
    const data = await res.json();
    return data.ip ?? null;
  } catch {
    return null;
  }
}

export { fetchClientIp };
