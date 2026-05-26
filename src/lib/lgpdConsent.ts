import { jsPDF } from "jspdf";

export const LGPD_CONSENT_VERSION = "1.1";
export const LGPD_CONSENT_TITLE =
  "TERMO DE CONSENTIMENTO — LEI GERAL DE PROTEÇÃO DE DADOS (LGPD)";

interface Section {
  title: string;
  body: string;
}

const SECTIONS: Section[] = [
  {
    title: "1. Aceitação dos Termos",
    body:
      "Ao criar uma conta e utilizar esta plataforma de gestão de pessoas, o titular declara ter lido, compreendido e concordado integralmente com estes Termos de Uso e com a Política de Privacidade descrita abaixo, em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018).",
  },
  {
    title: "2. Finalidade do Tratamento de Dados",
    body:
      "Os dados pessoais serão tratados com as seguintes finalidades:\n• Cumprimento de obrigações trabalhistas, previdenciárias e fiscais;\n• Gestão da relação de trabalho (admissão, jornada, férias, folha de pagamento);\n• Avaliações de desempenho, treinamentos e plano de carreira;\n• Controle de ponto, biometria facial e autenticação segura;\n• Comunicações internas, avisos, escalas e tarefas;\n• Cumprimento de exigências legais e regulatórias.",
  },
  {
    title: "3. Dados Coletados",
    body:
      "Coletamos e tratamos os seguintes dados, conforme aplicável:\n• Identificação: nome, CPF, RG, data de nascimento, foto;\n• Contato: e-mail, telefone, endereço;\n• Profissionais: cargo, salário, jornada, histórico funcional;\n• Bancários: dados para pagamento (conta, PIX);\n• Biométricos: reconhecimento facial e/ou impressão digital, com base no consentimento e finalidade de autenticação;\n• Sensíveis: atestados médicos, dados de dependentes, apenas quando necessários ao vínculo trabalhista.",
  },
  {
    title: "4. Base Legal (Art. 7º e 11 da LGPD)",
    body:
      "O tratamento de seus dados está fundamentado em:\n• Cumprimento de obrigação legal ou regulatória;\n• Execução de contrato de trabalho;\n• Legítimo interesse do empregador;\n• Consentimento expresso (para dados biométricos e finalidades específicas).",
  },
  {
    title: "5. Compartilhamento de Dados",
    body:
      "Seus dados poderão ser compartilhados apenas com:\n• Órgãos governamentais (eSocial, Receita Federal, INSS, Ministério do Trabalho);\n• Instituições financeiras (para pagamento de salários e benefícios);\n• Prestadores de serviços contratados sob acordo de confidencialidade;\n• Autoridades judiciais ou administrativas, quando exigido por lei.\n\nSeus dados não serão vendidos nem utilizados para fins de marketing de terceiros.",
  },
  {
    title: "6. Armazenamento e Segurança",
    body:
      "Os dados são armazenados em servidores seguros, com criptografia em trânsito e em repouso. Adotamos medidas técnicas e administrativas para proteger seus dados contra acesso não autorizado, perda ou vazamento. O período de retenção segue os prazos legais aplicáveis (mínimo de 5 anos após o término do vínculo, conforme legislação trabalhista).",
  },
  {
    title: "7. Seus Direitos (Art. 18 da LGPD)",
    body:
      "Você tem o direito de:\n• Confirmar a existência de tratamento de seus dados;\n• Acessar seus dados a qualquer momento;\n• Corrigir dados incompletos, inexatos ou desatualizados;\n• Solicitar a anonimização, bloqueio ou eliminação de dados desnecessários;\n• Solicitar a portabilidade dos dados a outro fornecedor;\n• Revogar o consentimento, quando aplicável;\n• Obter informações sobre o compartilhamento de seus dados.\n\nPara exercer seus direitos, entre em contato com o Departamento de Recursos Humanos ou com o Encarregado de Dados (DPO) da empresa.",
  },
  {
    title: "8. Uso da Plataforma",
    body:
      "O usuário compromete-se a:\n• Manter sigilo sobre suas credenciais de acesso;\n• Utilizar a plataforma apenas para finalidades profissionais legítimas;\n• Não compartilhar acesso com terceiros;\n• Comunicar imediatamente qualquer suspeita de uso indevido.",
  },
  {
    title: "9. Uso de Dispositivo Pessoal (BYOD)",
    body:
      "O titular autoriza expressamente o uso de seu dispositivo pessoal (smartphone, tablet ou computador) para acessar o sistema de gestão da empresa, incluindo funcionalidades como registro de ponto, reconhecimento facial, recebimento de notificações, consulta de escalas, contracheques, avisos e demais módulos disponibilizados.\n\nO titular declara estar ciente de que:\n• O uso do dispositivo pessoal é voluntário e configura facilidade operacional para ambas as partes;\n• A empresa não terá acesso a dados pessoais armazenados no dispositivo (fotos, contatos, mensagens, aplicativos pessoais);\n• Apenas dados estritamente necessários ao funcionamento do sistema (localização aproximada para ponto, imagem facial para autenticação, token de notificação push) serão coletados, sempre com finalidade definida;\n• É responsabilidade do titular manter o dispositivo seguro (bloqueio de tela, antivírus, sistema atualizado) para proteger seu próprio acesso;\n• A empresa não se responsabiliza por custos de internet móvel, desgaste do aparelho ou consumo de bateria decorrentes do uso profissional;\n• O titular pode revogar esta autorização a qualquer momento, ficando ciente de que poderá ser necessário utilizar dispositivo fornecido pela empresa ou ponto físico alternativo;\n• Em caso de desligamento, perda ou troca do aparelho, o titular deve comunicar o RH imediatamente para revogação dos acessos e remoção de credenciais.",
  },
  {
    title: "10. Registro do Consentimento",
    body:
      "Ao aceitar estes termos, foi registrado em nossa base de dados a data, hora, endereço IP e navegador utilizado, conforme exigido pelo Art. 8º da LGPD para comprovação do consentimento livre, informado e inequívoco.",
  },
  {
    title: "11. Alterações",
    body:
      "Estes Termos podem ser atualizados a qualquer momento. Em caso de alterações materiais, o titular será notificado e poderá ser solicitado um novo aceite.",
  },
];

export interface LgpdPdfData {
  employeeName: string;
  employeeCpf?: string | null;
  acceptedAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function generateLgpdConsentPdf(data: LgpdPdfData): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 18;
  const marginY = 18;
  const usableWidth = pageWidth - marginX * 2;
  let y = marginY;

  const addFooter = () => {
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(
        `Página ${i} de ${totalPages}`,
        pageWidth - marginX,
        pageHeight - 8,
        { align: "right" },
      );
      doc.setTextColor(0);
    }
  };

  const ensureSpace = (h: number) => {
    if (y + h > pageHeight - marginY) {
      doc.addPage();
      y = marginY;
    }
  };

  const writeParagraph = (
    text: string,
    opts: { size?: number; bold?: boolean; gap?: number } = {},
  ) => {
    const { size = 10, bold = false, gap = 3 } = opts;
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, usableWidth) as string[];
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
  doc.text(LGPD_CONSENT_TITLE, pageWidth / 2, y, { align: "center" });
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(`Versão ${LGPD_CONSENT_VERSION}`, pageWidth / 2, y, {
    align: "center",
  });
  y += 8;
  doc.setTextColor(0);

  for (const section of SECTIONS) {
    ensureSpace(8);
    writeParagraph(section.title, { size: 11, bold: true, gap: 2 });
    writeParagraph(section.body, { size: 10, gap: 4 });
  }

  // Bloco de aceite
  ensureSpace(45);
  doc.setDrawColor(180);
  doc.setLineWidth(0.3);
  doc.rect(marginX, y, usableWidth, 36);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("REGISTRO DE CONSENTIMENTO", marginX + 3, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const acceptedAtFmt = data.acceptedAt.toLocaleString("pt-BR");
  let yLine = y + 12;
  doc.text(`Titular: ${data.employeeName}`, marginX + 3, yLine);
  yLine += 5;
  if (data.employeeCpf) {
    doc.text(`CPF: ${data.employeeCpf}`, marginX + 3, yLine);
    yLine += 5;
  }
  doc.text(`Data e hora do aceite: ${acceptedAtFmt}`, marginX + 3, yLine);
  yLine += 5;
  if (data.ipAddress) {
    doc.text(`Endereço IP: ${data.ipAddress}`, marginX + 3, yLine);
    yLine += 5;
  }
  if (data.userAgent) {
    doc.setFontSize(8);
    doc.setTextColor(110);
    const uaLines = doc.splitTextToSize(
      `Navegador: ${data.userAgent}`,
      usableWidth - 6,
    );
    doc.text(uaLines.slice(0, 1), marginX + 3, yLine);
    doc.setTextColor(0);
  }
  y += 40;

  addFooter();

  return doc.output("blob");
}

export async function downloadLgpdConsentPdf(data: LgpdPdfData): Promise<void> {
  const blob = await generateLgpdConsentPdf(data);
  const safeName = data.employeeName.replace(/[^a-zA-Z0-9]+/g, "_");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `termo_lgpd_${safeName}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
