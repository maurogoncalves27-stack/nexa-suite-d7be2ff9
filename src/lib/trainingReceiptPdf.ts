import { jsPDF } from "jspdf";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface TrainingReceiptData {
  employee_name: string;
  employee_cpf?: string | null;
  employee_rg?: string | null;
  position?: string | null;
  store_name?: string | null;
  company_name?: string | null;
  company_cnpj?: string | null;
  training_start: string; // YYYY-MM-DD
  training_end: string;   // YYYY-MM-DD
  worked_days: number;
  monthly_salary: number;
  daily_rate: number;     // salary / dias do mês de referência
  total_amount: number;
  issued_at?: string;     // ISO
  city?: string;
  signature_data_url?: string | null;
  signed_at?: string | null;
}

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (iso: string) => {
  try { return format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR }); }
  catch { return iso; }
};

// Conversão básica de número para extenso em PT-BR (até milhões)
function numToExtenso(v: number): string {
  const n = Math.round(v * 100);
  const reais = Math.floor(n / 100);
  const cents = n % 100;
  const parts: string[] = [];
  if (reais > 0) parts.push(`${intToExtenso(reais)} ${reais === 1 ? "real" : "reais"}`);
  if (cents > 0) parts.push(`${intToExtenso(cents)} ${cents === 1 ? "centavo" : "centavos"}`);
  if (parts.length === 0) return "zero real";
  return parts.join(" e ");
}

function intToExtenso(n: number): string {
  if (n === 0) return "zero";
  if (n === 100) return "cem";
  const u = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
    "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const d = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const c = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos",
    "seiscentos", "setecentos", "oitocentos", "novecentos"];

  const partes: string[] = [];
  const milhoes = Math.floor(n / 1_000_000);
  const milhares = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;

  if (milhoes > 0) partes.push(`${intToExtenso(milhoes)} ${milhoes === 1 ? "milhão" : "milhões"}`);
  if (milhares > 0) partes.push(milhares === 1 ? "mil" : `${intToExtenso(milhares)} mil`);
  if (resto > 0) {
    const cent = Math.floor(resto / 100);
    const dez = Math.floor((resto % 100) / 10);
    const uni = resto % 10;
    const sub: string[] = [];
    if (cent > 0) sub.push(resto === 100 ? "cem" : c[cent]);
    if (dez === 1) sub.push(u[10 + uni]);
    else {
      if (dez > 0) sub.push(d[dez]);
      if (uni > 0) sub.push(u[uni]);
    }
    partes.push(sub.join(" e "));
  }
  return partes.join(" e ");
}

export function generateTrainingReceiptPdf(data: TrainingReceiptData): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = margin;

  // Cabeçalho
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("RECIBO DE PAGAMENTO – PERÍODO DE TREINAMENTO", pageW / 2, y, { align: "center" });
  y += 12;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  // Empresa
  if (data.company_name) {
    doc.text(`Empresa: ${data.company_name}${data.company_cnpj ? ` – CNPJ ${data.company_cnpj}` : ""}`, margin, y);
    y += 6;
  }
  if (data.store_name) {
    doc.text(`Loja: ${data.store_name}`, margin, y);
    y += 6;
  }
  y += 4;

  // Valor em destaque
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`Valor: ${fmtBRL(data.total_amount)}`, margin, y);
  y += 10;

  // Corpo
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const cpfStr = data.employee_cpf ? `, inscrito(a) no CPF nº ${data.employee_cpf}` : "";
  const rgStr = data.employee_rg ? `, RG nº ${data.employee_rg}` : "";
  const cargoStr = data.position ? `, no cargo de ${data.position}` : "";

  const corpo =
`Eu, ${data.employee_name}${cpfStr}${rgStr}${cargoStr}, declaro ter recebido da empresa acima identificada a importância de ${fmtBRL(data.total_amount)} (${numToExtenso(data.total_amount)}), referente a ${data.worked_days} dia(s) trabalhado(s) durante o período de treinamento, compreendido entre ${fmtDate(data.training_start)} e ${fmtDate(data.training_end)}.

O cálculo foi efetuado com base no salário mensal contratual de ${fmtBRL(data.monthly_salary)}, equivalente a uma diária de ${fmtBRL(data.daily_rate)} (salário ÷ 30 dias), multiplicada pelos dias efetivamente trabalhados no período de treinamento.

Por ser verdade e expressão da pura realidade, dou plena, geral, rasa e irrevogável quitação da importância recebida, para nada mais reclamar a qualquer tempo e a que título for.`;

  const linhas = doc.splitTextToSize(corpo, pageW - 2 * margin);
  doc.text(linhas, margin, y);
  y += linhas.length * 5.5 + 10;

  // Tabela resumo
  doc.setFont("helvetica", "bold");
  doc.text("Memória de cálculo", margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  const linhasCalc = [
    [`Salário mensal contratual:`, fmtBRL(data.monthly_salary)],
    [`Diária (salário ÷ 30):`, fmtBRL(data.daily_rate)],
    [`Dias trabalhados em treinamento:`, String(data.worked_days)],
    [`Total a pagar:`, fmtBRL(data.total_amount)],
  ];
  linhasCalc.forEach(([k, v]) => {
    doc.text(k, margin, y);
    doc.text(v, pageW - margin, y, { align: "right" });
    y += 6;
  });

  // Local e data
  y += 12;
  const cidade = data.city ?? "Brasília – DF";
  const dataStr = data.issued_at
    ? format(new Date(data.issued_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
    : format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  doc.text(`${cidade}, ${dataStr}.`, margin, y);

  // Assinatura
  y += 25;
  if (data.signature_data_url) {
    try {
      doc.addImage(data.signature_data_url, "PNG", pageW / 2 - 35, y - 18, 70, 20);
    } catch {}
  }
  doc.line(margin + 20, y, pageW - margin - 20, y);
  y += 5;
  doc.setFontSize(10);
  doc.text(data.employee_name, pageW / 2, y, { align: "center" });
  if (data.employee_cpf) {
    y += 4;
    doc.text(`CPF: ${data.employee_cpf}`, pageW / 2, y, { align: "center" });
  }
  if (data.signed_at) {
    y += 4;
    doc.setFontSize(8);
    doc.text(`Assinado eletronicamente em ${format(new Date(data.signed_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}`, pageW / 2, y, { align: "center" });
  }

  return doc;
}
