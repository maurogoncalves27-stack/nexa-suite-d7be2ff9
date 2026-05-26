import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { calcRescission, type TerminationReason, TERMINATION_REASON_LABELS } from "./rescissionCalc";

const fmtCPF = (raw?: string | null) => {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length !== 11) return raw;
  return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
};
const fmtCNPJ = (raw?: string | null) => {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "").slice(0, 14);
  if (d.length !== 14) return raw;
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
};
const fmtDate = (raw?: string | null) => {
  if (!raw) return "";
  const [y, m, d] = String(raw).slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : String(raw);
};
const money = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Códigos oficiais aproximados do TRCT (Portaria MTE 1.621/2010 e atualizações)
const CODE_MAP: Record<string, string> = {
  "Saldo de salário": "02",
  "Aviso prévio indenizado": "03",
  "13º salário proporcional": "06",
  "13º sobre aviso prévio": "07",
  "Férias proporcionais": "11",
  "1/3 sobre férias proporcionais": "12",
  "INSS sobre rescisão": "75",
  "IRRF sobre rescisão": "79",
};

// Causas de afastamento (códigos oficiais TRCT)
const CAUSA_AFASTAMENTO: Record<TerminationReason, { code: string; label: string }> = {
  dismissal_without_cause: { code: "11", label: "Rescisão sem justa causa por iniciativa do empregador" },
  employee_resignation: { code: "21", label: "Rescisão por pedido de demissão" },
  dismissal_with_cause: { code: "12", label: "Rescisão por justa causa por iniciativa do empregador" },
  end_of_trial_contract: { code: "32", label: "Término de contrato de experiência" },
  end_of_fixed_term: { code: "31", label: "Término de contrato por prazo determinado" },
  mutual_agreement_484a: { code: "23", label: "Rescisão por acordo entre as partes (art. 484-A da CLT)" },
};

export async function generateTrctPdf(
  employeeId: string,
  opts?: { amount?: number; reason?: TerminationReason | string; terminationDate?: string; fgtsBalance?: number }
) {
  const { data: emp } = await (supabase as any)
    .from("employees")
    .select("id, full_name, cpf, rg, position, admission_date, hire_date, salary, contract_type, termination_date, termination_reason, store_id, allocated_store_id, address, city, state, zip_code, mother_name")
    .eq("id", employeeId)
    .maybeSingle();
  if (!emp) throw new Error("Colaborador não encontrado");

  const storeId = emp.allocated_store_id || emp.store_id;
  const { data: store } = await (supabase as any)
    .from("stores")
    .select("name, legal_name, cnpj, address, city, state, zip_code")
    .eq("id", storeId)
    .maybeSingle();

  const reason = (opts?.reason || emp.termination_reason || "dismissal_without_cause") as TerminationReason;
  const hireDate = (emp.admission_date || emp.hire_date || "").slice(0, 10);
  const termDate = (opts?.terminationDate || emp.termination_date || "").slice(0, 10);

  let calc: ReturnType<typeof calcRescission> | null = null;
  if (hireDate && termDate && Number(emp.salary) > 0) {
    try {
      calc = calcRescission({
        salary: Number(emp.salary),
        hireDate,
        terminationDate: termDate,
        reason,
        dependentsIRRF: 0,
        fgtsBalance: opts?.fgtsBalance,
      });
    } catch {}
  }

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 10;
  let y = M;

  // ======== Cabeçalho oficial ========
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("MINISTÉRIO DO TRABALHO E EMPREGO", W / 2, y, { align: "center" });
  y += 4;
  doc.setFontSize(11);
  doc.text("TERMO DE RESCISÃO DO CONTRATO DE TRABALHO – TRCT", W / 2, y, { align: "center" });
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("CLT, art. 477 — Portaria MTE nº 1.621/2010 e alterações", W / 2, y, { align: "center" });
  y += 5;

  // Helper de caixa rotulada
  const box = (x: number, yy: number, w: number, h: number, label: string, value: string, opts2?: { bold?: boolean; size?: number; align?: "left" | "center" | "right" }) => {
    doc.setLineWidth(0.2);
    doc.rect(x, yy, w, h);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text(label, x + 1, yy + 2.4);
    doc.setFont("helvetica", opts2?.bold ? "bold" : "normal");
    doc.setFontSize(opts2?.size ?? 9);
    const align = opts2?.align ?? "left";
    const tx = align === "center" ? x + w / 2 : align === "right" ? x + w - 1.5 : x + 1.5;
    doc.text(String(value || ""), tx, yy + h - 1.8, { align });
  };

  const sectionHeader = (title: string) => {
    doc.setFillColor(220, 220, 220);
    doc.rect(M, y, W - 2 * M, 4.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(title, M + 1.5, y + 3.2);
    y += 4.5;
  };

  // ======== I - Identificação do Empregador ========
  sectionHeader("I — IDENTIFICAÇÃO DO EMPREGADOR");
  const fullW = W - 2 * M;
  box(M, y, fullW * 0.65, 8, "01 Razão Social / Nome", store?.legal_name || store?.name || "");
  box(M + fullW * 0.65, y, fullW * 0.35, 8, "02 CNPJ / CEI", fmtCNPJ(store?.cnpj));
  y += 8;
  box(M, y, fullW * 0.5, 8, "03 Endereço (Rua, Av., etc.)", store?.address || "");
  box(M + fullW * 0.5, y, fullW * 0.3, 8, "04 Município", store?.city || "");
  box(M + fullW * 0.8, y, fullW * 0.1, 8, "05 UF", store?.state || "", { align: "center" });
  box(M + fullW * 0.9, y, fullW * 0.1, 8, "06 CEP", store?.zip_code || "", { align: "center" });
  y += 8;
  box(M, y, fullW, 8, "07 CBO / Função", emp.position || "");
  y += 9;

  // ======== II - Identificação do Trabalhador ========
  sectionHeader("II — IDENTIFICAÇÃO DO TRABALHADOR");
  box(M, y, fullW * 0.6, 8, "09 Nome", emp.full_name || "");
  box(M + fullW * 0.6, y, fullW * 0.25, 8, "10 CPF", fmtCPF(emp.cpf));
  box(M + fullW * 0.85, y, fullW * 0.15, 8, "11 RG", emp.rg || "");
  y += 8;
  box(M, y, fullW * 0.5, 8, "12 Endereço", emp.address || "");
  box(M + fullW * 0.5, y, fullW * 0.25, 8, "13 Município", emp.city || "");
  box(M + fullW * 0.75, y, fullW * 0.1, 8, "14 UF", emp.state || "", { align: "center" });
  box(M + fullW * 0.85, y, fullW * 0.15, 8, "15 CEP", emp.zip_code || "", { align: "center" });
  y += 8;
  box(M, y, fullW * 0.6, 8, "16 Nome da mãe", emp.mother_name || "");
  box(M + fullW * 0.6, y, fullW * 0.4, 8, "17 Cargo / Função", emp.position || "");
  y += 9;

  // ======== III - Dados do Contrato ========
  sectionHeader("III — DADOS DO CONTRATO");
  const causa = CAUSA_AFASTAMENTO[reason] || CAUSA_AFASTAMENTO.dismissal_without_cause;
  box(M, y, fullW * 0.2, 8, "20 Admissão", fmtDate(hireDate), { align: "center" });
  box(M + fullW * 0.2, y, fullW * 0.2, 8, "21 Afastamento", fmtDate(termDate), { align: "center" });
  box(M + fullW * 0.4, y, fullW * 0.1, 8, "22 Aviso prévio", reason === "dismissal_without_cause" ? "Indenizado" : reason === "employee_resignation" ? "Dispensado" : "Não devido", { align: "center", size: 7.5 });
  box(M + fullW * 0.5, y, fullW * 0.5, 8, "23 Causa do Afastamento", `${causa.code} — ${causa.label}`, { size: 8 });
  y += 8;
  box(M, y, fullW * 0.4, 8, "24 Remuneração mês anterior (R$)", money(Number(emp.salary || 0)), { align: "right" });
  box(M + fullW * 0.4, y, fullW * 0.3, 8, "25 Tipo de contrato", emp.contract_type || "Indeterminado");
  box(M + fullW * 0.7, y, fullW * 0.3, 8, "26 Pensão alimentícia", "Não informada");
  y += 9;

  // ======== IV - Discriminação das Verbas ========
  sectionHeader("IV — DISCRIMINAÇÃO DAS VERBAS RESCISÓRIAS");

  // Cabeçalho da tabela
  const colCode = M;
  const colDesc = M + 12;
  const colCred = M + fullW * 0.65;
  const colDeb = M + fullW * 0.825;
  const colEnd = M + fullW;

  doc.setFillColor(240, 240, 240);
  doc.rect(M, y, fullW, 5, "F");
  doc.setLineWidth(0.2);
  doc.rect(M, y, fullW, 5);
  doc.line(colDesc, y, colDesc, y + 5);
  doc.line(colCred, y, colCred, y + 5);
  doc.line(colDeb, y, colDeb, y + 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("Cód.", colCode + 6, y + 3.5, { align: "center" });
  doc.text("Descrição", colDesc + 2, y + 3.5);
  doc.text("Vencimentos (R$)", (colCred + colDeb) / 2, y + 3.5, { align: "center" });
  doc.text("Descontos (R$)", (colDeb + colEnd) / 2, y + 3.5, { align: "center" });
  y += 5;

  const rowH = 4.5;
  const drawRow = (code: string, desc: string, credit?: number, debit?: number, detail?: string) => {
    doc.rect(M, y, fullW, rowH);
    doc.line(colDesc, y, colDesc, y + rowH);
    doc.line(colCred, y, colCred, y + rowH);
    doc.line(colDeb, y, colDeb, y + rowH);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(code, colCode + 6, y + 3, { align: "center" });
    const fullDesc = detail ? `${desc} (${detail})` : desc;
    doc.text(doc.splitTextToSize(fullDesc, colCred - colDesc - 3)[0], colDesc + 2, y + 3);
    if (typeof credit === "number" && credit > 0) doc.text(money(credit), colDeb - 1.5, y + 3, { align: "right" });
    if (typeof debit === "number" && debit > 0) doc.text(money(debit), colEnd - 1.5, y + 3, { align: "right" });
    y += rowH;
  };

  let totalCred = 0;
  let totalDeb = 0;

  if (calc) {
    for (const e of calc.earnings) {
      const code = CODE_MAP[e.label] || "—";
      drawRow(code, e.label, e.amount, undefined, e.detail);
      totalCred += e.amount;
    }
    for (const d of calc.deductions) {
      const code = CODE_MAP[d.label] || "—";
      drawRow(code, d.label, undefined, d.amount, d.detail);
      totalDeb += d.amount;
    }
  }

  // Linhas em branco para preenchimento manual (mínimo de 4)
  const minRows = 4;
  const filled = (calc?.earnings.length || 0) + (calc?.deductions.length || 0);
  for (let i = filled; i < Math.max(filled, minRows); i++) {
    drawRow("", "", undefined, undefined);
  }

  // Totalizadores
  const net = totalCred - totalDeb;
  doc.setFillColor(245, 245, 245);
  doc.rect(M, y, fullW, 5, "F");
  doc.rect(M, y, fullW, 5);
  doc.line(colCred, y, colCred, y + 5);
  doc.line(colDeb, y, colDeb, y + 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("100  TOTAL BRUTO DOS VENCIMENTOS / DESCONTOS", colDesc + 2, y + 3.5);
  doc.text(money(totalCred), colDeb - 1.5, y + 3.5, { align: "right" });
  doc.text(money(totalDeb), colEnd - 1.5, y + 3.5, { align: "right" });
  y += 5;

  doc.setFillColor(225, 225, 225);
  doc.rect(M, y, fullW, 6, "F");
  doc.rect(M, y, fullW, 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("101  LÍQUIDO A RECEBER (R$)", colDesc + 2, y + 4);
  doc.text(money(typeof opts?.amount === "number" ? opts.amount : net), colEnd - 1.5, y + 4, { align: "right" });
  y += 8;

  // FGTS informativo
  if (calc?.fgtsFine && calc.fgtsFine > 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.text(`Multa FGTS (informativa, recolhida via GRRF): ${money(calc.fgtsFine)}`, M, y);
    y += 4;
  }

  // Observações
  if (calc?.notes && calc.notes.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text("Observações:", M, y); y += 3.5;
    doc.setFont("helvetica", "normal");
    for (const n of calc.notes) {
      const lines = doc.splitTextToSize(`• ${n}`, fullW);
      doc.text(lines, M, y);
      y += lines.length * 3.2;
    }
    y += 2;
  }

  // ======== V - Quitação e assinaturas ========
  if (y > H - 55) { doc.addPage(); y = M; }
  sectionHeader("V — QUITAÇÃO");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const quit = doc.splitTextToSize(
    "Para maior clareza, firmo o presente termo de rescisão dando ao empregador plena, geral e irrevogável quitação " +
    "pelos valores discriminados, nos termos do art. 477 da CLT, ressalvado ao trabalhador o direito de pleitear, em juízo, " +
    "diferenças que entender devidas.",
    fullW
  );
  doc.text(quit, M, y + 4);
  y += quit.length * 3.5 + 8;

  const cidade = store?.city || "Brasília";
  const uf = store?.state || "DF";
  doc.text(`Local: ${cidade} / ${uf}`, M, y);
  doc.text(`Data: ${fmtDate(termDate)}`, W - M, y, { align: "right" });
  y += 14;

  const sigW = (fullW - 14) / 2;
  doc.setLineWidth(0.3);
  doc.line(M, y, M + sigW, y);
  doc.line(M + sigW + 14, y, W - M, y);
  y += 4;
  doc.setFontSize(8);
  doc.text("Assinatura e carimbo do Empregador", M + sigW / 2, y, { align: "center" });
  doc.text("Assinatura do Empregado", M + sigW + 14 + sigW / 2, y, { align: "center" });

  doc.save(`TRCT_${(emp.full_name || "colaborador").replace(/\s+/g, "_")}.pdf`);
}
