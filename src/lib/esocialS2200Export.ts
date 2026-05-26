// Geração simples do XML eSocial S-2200 (Cadastramento Inicial / Admissão CLT)
// para um colaborador. É o XML base — assinatura digital e transmissão são responsabilidade do contador.

interface EmployeeForS2200 {
  full_name: string | null;
  cpf: string | null;
  birth_date: string | null;
  gender: string | null;
  ethnicity: string | null;
  education_level: string | null;
  marital_status: string | null;
  nationality: string | null;
  mother_name: string | null;
  father_name: string | null;
  nis_number: string | null;
  ctps_number: string | null;
  ctps_series: string | null;
  ctps_uf: string | null;
  rg: string | null;
  rg_issuer: string | null;
  rg_uf: string | null;
  rg_issue_date: string | null;
  registration_number: string | null;
  admission_date: string | null;
  hire_date: string | null;
  esocial_category: string | null;
  work_regime: string | null;
  journey_type: string | null;
  weekly_hours: number | null;
  monthly_hours: number | null;
  salary_type: string | null;
  salary: number | null;
  cbo_code: string | null;
  cbo_title: string | null;
  position: string | null;
  contract_type: string | null;
  zip_code: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
}

const xmlEscape = (s: any) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const onlyDigits = (s: any) => String(s ?? "").replace(/\D/g, "");
const fmt = (n: number | null | undefined) => Number(n || 0).toFixed(2);
const ucWord = (s: string | null) =>
  (s ?? "").trim().toUpperCase();

const sexFromGender = (g: string | null): string => {
  const v = (g ?? "").toLowerCase();
  if (v.startsWith("m")) return "M";
  return "F";
};

const racCorFromEthnicity = (e: string | null): string => {
  switch ((e ?? "").toLowerCase()) {
    case "branca": return "1";
    case "preta": return "2";
    case "parda": return "3";
    case "amarela": return "4";
    case "indigena": return "5";
    default: return "6";
  }
};

const grauInstrucao = (g: string | null): string => {
  switch ((g ?? "").toLowerCase()) {
    case "fundamental_incompleto": return "02";
    case "fundamental_completo": return "05";
    case "medio_incompleto": return "06";
    case "medio_completo": return "07";
    case "tecnico": return "08";
    case "superior_incompleto": return "08";
    case "superior_completo": return "09";
    case "pos_graduacao": return "10";
    case "mestrado": return "11";
    case "doutorado": return "12";
    default: return "01";
  }
};

const estCivFromMarital = (m: string | null): string => {
  switch ((m ?? "").toLowerCase()) {
    case "solteiro": return "1";
    case "casado": return "2";
    case "uniao_estavel": return "5";
    case "divorciado": return "4";
    case "separado": return "4";
    case "viuvo": return "3";
    default: return "1";
  }
};

const undSalario = (t: string | null): string => {
  switch ((t ?? "").toLowerCase()) {
    case "horario": return "1";
    case "diario": return "2";
    case "semanal": return "3";
    case "quinzenal": return "4";
    case "mensal": return "5";
    case "tarefa": return "7";
    default: return "5";
  }
};

const tpRegTrab = (regime: string | null): string => {
  switch ((regime ?? "").toLowerCase()) {
    case "estatutario": return "2";
    default: return "1"; // CLT
  }
};

export function buildS2200Xml(opts: {
  employee: EmployeeForS2200;
  cnpj: string;
}): string {
  const { employee: e, cnpj } = opts;
  const cpf = onlyDigits(e.cpf);
  const admission = e.admission_date || e.hire_date || "";
  const codCateg = e.esocial_category || "101";
  const lines: string[] = [];

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtAdmissao/v_S_01_03_00">');
  lines.push(`  <evtAdmissao Id="ID1${cnpj}${Date.now().toString().padStart(14, "0").slice(-14)}">`);

  // ideEvento
  lines.push("    <ideEvento>");
  lines.push("      <indRetif>1</indRetif>");
  lines.push("      <tpAmb>2</tpAmb>");
  lines.push("      <procEmi>1</procEmi>");
  lines.push("      <verProc>nexa-1.0</verProc>");
  lines.push("    </ideEvento>");

  // ideEmpregador
  lines.push("    <ideEmpregador>");
  lines.push("      <tpInsc>1</tpInsc>");
  lines.push(`      <nrInsc>${xmlEscape(cnpj)}</nrInsc>`);
  lines.push("    </ideEmpregador>");

  // trabalhador
  lines.push("    <trabalhador>");
  lines.push(`      <cpfTrab>${xmlEscape(cpf)}</cpfTrab>`);
  lines.push(`      <nmTrab>${xmlEscape(ucWord(e.full_name))}</nmTrab>`);
  if ((e as any).social_name) lines.push(`      <nmSoc>${xmlEscape(ucWord((e as any).social_name))}</nmSoc>`);
  lines.push(`      <sexo>${sexFromGender(e.gender)}</sexo>`);
  lines.push(`      <racaCor>${racCorFromEthnicity(e.ethnicity)}</racaCor>`);
  lines.push(`      <estCiv>${estCivFromMarital(e.marital_status)}</estCiv>`);
  lines.push(`      <grauInstr>${grauInstrucao(e.education_level)}</grauInstr>`);
  lines.push("      <nascimento>");
  if (e.birth_date) lines.push(`        <dtNascto>${xmlEscape(e.birth_date)}</dtNascto>`);
  lines.push("        <paisNascto>105</paisNascto>");
  lines.push("        <paisNac>105</paisNac>");
  if (e.mother_name) lines.push(`        <nmMae>${xmlEscape(ucWord(e.mother_name))}</nmMae>`);
  if (e.father_name) lines.push(`        <nmPai>${xmlEscape(ucWord(e.father_name))}</nmPai>`);
  lines.push("      </nascimento>");

  // documentos
  if (e.ctps_number || e.rg) {
    lines.push("      <documentos>");
    if (e.ctps_number) {
      lines.push("        <CTPS>");
      lines.push(`          <nrCtps>${xmlEscape(e.ctps_number)}</nrCtps>`);
      if (e.ctps_series) lines.push(`          <serieCtps>${xmlEscape(e.ctps_series)}</serieCtps>`);
      if (e.ctps_uf) lines.push(`          <ufCtps>${xmlEscape(e.ctps_uf)}</ufCtps>`);
      lines.push("        </CTPS>");
    }
    if (e.rg) {
      lines.push("        <RG>");
      lines.push(`          <nrRg>${xmlEscape(e.rg)}</nrRg>`);
      if (e.rg_issuer) lines.push(`          <orgaoEmissor>${xmlEscape(e.rg_issuer)}</orgaoEmissor>`);
      if (e.rg_issue_date) lines.push(`          <dtExped>${xmlEscape(e.rg_issue_date)}</dtExped>`);
      lines.push("        </RG>");
    }
    lines.push("      </documentos>");
  }

  // endereço
  if (e.address || e.zip_code) {
    lines.push("      <endereco>");
    lines.push("        <brasil>");
    if (e.zip_code) lines.push(`          <cep>${xmlEscape(onlyDigits(e.zip_code))}</cep>`);
    if (e.address) lines.push(`          <dscLograd>${xmlEscape(e.address)}</dscLograd>`);
    if (e.city) lines.push(`          <nmCid>${xmlEscape(ucWord(e.city))}</nmCid>`);
    if (e.state) lines.push(`          <uf>${xmlEscape(e.state)}</uf>`);
    lines.push("        </brasil>");
    lines.push("      </endereco>");
  }

  // contato
  if (e.phone || e.email) {
    lines.push("      <contato>");
    if (e.phone) lines.push(`        <fonePrinc>${xmlEscape(onlyDigits(e.phone))}</fonePrinc>`);
    if (e.email) lines.push(`        <emailPrinc>${xmlEscape(e.email)}</emailPrinc>`);
    lines.push("      </contato>");
  }

  lines.push("    </trabalhador>");

  // vínculo
  lines.push("    <vinculo>");
  if (e.registration_number) lines.push(`      <matricula>${xmlEscape(e.registration_number)}</matricula>`);
  lines.push(`      <tpRegTrab>${tpRegTrab(e.work_regime)}</tpRegTrab>`);
  lines.push("      <tpRegPrev>1</tpRegPrev>");
  if (e.nis_number) lines.push(`      <nisTrab>${xmlEscape(onlyDigits(e.nis_number))}</nisTrab>`);

  lines.push("      <infoRegimeTrab>");
  lines.push("        <infoCeletista>");
  lines.push(`          <dtAdm>${xmlEscape(admission)}</dtAdm>`);
  lines.push(`          <tpAdmissao>1</tpAdmissao>`);
  lines.push(`          <indAdmissao>1</indAdmissao>`);
  lines.push(`          <tpRegJor>${e.journey_type || "1"}</tpRegJor>`);
  lines.push(`          <natAtividade>1</natAtividade>`);
  lines.push("        </infoCeletista>");
  lines.push("      </infoRegimeTrab>");

  lines.push("      <infoContrato>");
  lines.push(`        <nmCargo>${xmlEscape(ucWord(e.position))}</nmCargo>`);
  if (e.cbo_code) lines.push(`        <CBOCargo>${xmlEscape(onlyDigits(e.cbo_code))}</CBOCargo>`);
  lines.push(`        <codCateg>${xmlEscape(codCateg)}</codCateg>`);
  lines.push("        <remuneracao>");
  lines.push(`          <vrSalFx>${fmt(e.salary)}</vrSalFx>`);
  lines.push(`          <undSalFixo>${undSalario(e.salary_type)}</undSalFixo>`);
  lines.push("        </remuneracao>");
  lines.push("        <duracao>");
  lines.push("          <tpContr>1</tpContr>");
  lines.push("        </duracao>");
  lines.push("        <localTrabalho>");
  lines.push("          <localTrabGeral>");
  lines.push("            <tpInsc>1</tpInsc>");
  lines.push(`            <nrInsc>${xmlEscape(cnpj)}</nrInsc>`);
  lines.push("          </localTrabGeral>");
  lines.push("        </localTrabalho>");
  lines.push("        <horContratual>");
  lines.push(`          <qtdHrsSem>${Number(e.weekly_hours || 44).toFixed(2)}</qtdHrsSem>`);
  lines.push("          <tpJornada>1</tpJornada>");
  lines.push("          <dscJorn>Jornada padrão</dscJorn>");
  lines.push("          <tmpParc>0</tmpParc>");
  lines.push("        </horContratual>");
  lines.push("      </infoContrato>");

  lines.push("    </vinculo>");
  lines.push("  </evtAdmissao>");
  lines.push("</eSocial>");

  return lines.join("\n");
}

export function downloadS2200Xml(xml: string, employeeName: string | null, cpf: string | null) {
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = (employeeName ?? "colaborador").replace(/[^a-zA-Z0-9]+/g, "_");
  a.href = url;
  a.download = `eSocial-S2200-${safe}-${onlyDigits(cpf) || "sem-cpf"}.xml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function getMissingS2200Fields(e: Partial<EmployeeForS2200>): string[] {
  const miss: string[] = [];
  if (!e.cpf) miss.push("CPF");
  if (!e.full_name) miss.push("Nome");
  if (!e.birth_date) miss.push("Nascimento");
  if (!e.gender) miss.push("Sexo");
  if (!e.mother_name) miss.push("Nome da mãe");
  if (!(e.admission_date || e.hire_date)) miss.push("Data de admissão");
  if (!e.position) miss.push("Cargo");
  if (!e.salary) miss.push("Salário");
  if (!e.esocial_category) miss.push("Categoria eSocial");
  if (!e.ctps_number) miss.push("CTPS");
  if (!e.work_regime) miss.push("Regime");
  if (!e.journey_type) miss.push("Tipo de jornada");
  if (!e.weekly_hours) miss.push("Horas semanais");
  if (!e.salary_type) miss.push("Tipo de salário");
  return miss;
}
