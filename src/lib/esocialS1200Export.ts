// Geração simples de XML do evento S-1200 (Remuneração mensal CLT) a partir
// das linhas/rubricas da folha. Não substitui certificado digital nem assinatura;
// é o XML base que o contador entrega no portal/transmissor.

interface RubricExport {
  code: string | null;
  description: string | null;
  reference: string | null;
  kind: "earning" | "deduction" | "informative";
  value: number;
}

interface RowExport {
  full_name: string | null;
  cpf: string | null;
  registration_number: string | null;
  rubrics: RubricExport[];
}

const xmlEscape = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const fmt = (n: number) => Number(n || 0).toFixed(2);

const tpRubrFromKind = (kind: RubricExport["kind"]): string =>
  kind === "earning" ? "1" : kind === "deduction" ? "2" : "3";

export function buildS1200Xml(opts: {
  rows: RowExport[];
  refYear: number;
  refMonth: number;
  cnpj?: string;
}): string {
  const { rows, refYear, refMonth, cnpj } = opts;
  const perApur = `${refYear}-${String(refMonth).padStart(2, "0")}`;
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtRemun/v_S_01_03_00">');

  rows.forEach((r, idx) => {
    const cpf = (r.cpf ?? "").replace(/\D/g, "");
    if (!cpf) return;
    lines.push(`  <evtRemun Id="ID${idx.toString().padStart(20, "0")}">`);
    lines.push("    <ideEvento>");
    lines.push("      <indRetif>1</indRetif>");
    lines.push(`      <perApur>${perApur}</perApur>`);
    lines.push("      <indApuracao>1</indApuracao>");
    lines.push("      <indGuia>1</indGuia>");
    lines.push("      <tpAmb>2</tpAmb>");
    lines.push("      <procEmi>1</procEmi>");
    lines.push("      <verProc>nexa-1.0</verProc>");
    lines.push("    </ideEvento>");
    if (cnpj) {
      lines.push("    <ideEmpregador>");
      lines.push("      <tpInsc>1</tpInsc>");
      lines.push(`      <nrInsc>${xmlEscape(cnpj)}</nrInsc>`);
      lines.push("    </ideEmpregador>");
    }
    lines.push("    <ideTrabalhador>");
    lines.push(`      <cpfTrab>${xmlEscape(cpf)}</cpfTrab>`);
    lines.push("    </ideTrabalhador>");
    lines.push("    <dmDev>");
    lines.push(`      <ideDmDev>${idx + 1}</ideDmDev>`);
    lines.push("      <codCateg>101</codCateg>");
    lines.push("      <infoPerApur>");
    lines.push("        <ideEstabLot>");
    lines.push("          <tpInsc>1</tpInsc>");
    lines.push(`          <nrInsc>${xmlEscape(cnpj ?? "")}</nrInsc>`);
    lines.push("          <codLotacao>0001</codLotacao>");
    lines.push("          <remunPerApur>");
    lines.push(`            <matricula>${xmlEscape(r.registration_number ?? "")}</matricula>`);
    r.rubrics.forEach((rb) => {
      if (!rb.value) return;
      lines.push("            <itensRemun>");
      lines.push(`              <codRubr>${xmlEscape(rb.code ?? "0")}</codRubr>`);
      lines.push("              <ideTabRubr>1</ideTabRubr>");
      lines.push(`              <vrRubr>${fmt(rb.value)}</vrRubr>`);
      lines.push("            </itensRemun>");
    });
    lines.push("          </remunPerApur>");
    lines.push("        </ideEstabLot>");
    lines.push("      </infoPerApur>");
    lines.push("    </dmDev>");
    lines.push("  </evtRemun>");
  });

  lines.push("</eSocial>");
  return lines.join("\n");
}

export function downloadS1200Xml(xml: string, refYear: number, refMonth: number) {
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `eSocial-S1200-${refYear}-${String(refMonth).padStart(2, "0")}.xml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
