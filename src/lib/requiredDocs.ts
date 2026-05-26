/**
 * Documentos recomendados/obrigatórios para admissão.
 * O sistema permite salvar o cadastro mesmo sem todos eles, mas exibe um alerta
 * elencando o que ainda falta para completar a admissão oficial.
 */
export const REQUIRED_ADMISSION_DOCS = [
  "Exame Admissional",
  "RG",
  "CPF",
  "Comprovante de Residência",
  "Carteira de Trabalho",
] as const;

/**
 * Documentos obrigatórios para estagiários (regra mais enxuta).
 */
export const REQUIRED_INTERNSHIP_DOCS = [
  "RG",
  "Contrato de Estágio",
  "Comprovante de Residência",
] as const;

export type RequiredAdmissionDoc = typeof REQUIRED_ADMISSION_DOCS[number];

export interface DocLike {
  doc_type: string;
}

const isInternship = (contractType?: string | null): boolean => {
  if (!contractType) return false;
  const v = contractType.toLowerCase();
  return v.includes("estág") || v.includes("estag") || v === "internship";
};

/**
 * Retorna a lista de documentos obrigatórios que ainda não foram anexados.
 * - Estagiários: lista enxuta (RG, Contrato de Estágio, Comprovante de Residência).
 * - Demais contratos: lista padrão CLT/PJ (+ Certificado de Reservista para sexo masculino).
 */
export function getMissingAdmissionDocs(
  documents: DocLike[],
  gender?: string | null,
  contractType?: string | null,
  opts?: { hasInternshipContract?: boolean },
): string[] {
  const present = new Set(documents.map((d) => d.doc_type));

  if (isInternship(contractType)) {
    // O Termo de Compromisso de Estágio pode estar tanto em employee_documents
    // (como "Contrato de Estágio" ou "Contrato de Trabalho") quanto na tabela
    // dedicada internship_contracts (componente próprio do estágio).
    if (
      opts?.hasInternshipContract ||
      present.has("Contrato de Trabalho")
    ) {
      present.add("Contrato de Estágio");
    }
    return [...REQUIRED_INTERNSHIP_DOCS].filter((doc) => !present.has(doc));
  }

  const required: string[] = [...REQUIRED_ADMISSION_DOCS];
  if (gender === "male") {
    required.push("Certificado de Reservista");
  }
  return required.filter((doc) => !present.has(doc));
}

/**
 * Campos recomendados no cadastro do colaborador, com rótulos amigáveis.
 * Estes campos NÃO bloqueiam o salvamento, mas são listados como pendências
 * até serem preenchidos.
 */
export const RECOMMENDED_EMPLOYEE_FIELDS: { key: string; label: string }[] = [
  { key: "cpf", label: "CPF" },
  { key: "rg", label: "RG" },
  { key: "birth_date", label: "Data de nascimento" },
  { key: "phone", label: "Telefone" },
  { key: "email", label: "E-mail" },
  { key: "address", label: "Endereço" },
  { key: "zip_code", label: "CEP" },
  { key: "city", label: "Cidade" },
  { key: "state", label: "Estado (UF)" },
  { key: "mother_name", label: "Nome da mãe" },
  { key: "nationality", label: "Nacionalidade" },
  { key: "marital_status", label: "Estado civil" },
  { key: "education_level", label: "Grau de instrução" },
  { key: "nis_number", label: "NIS / PIS" },
  { key: "position", label: "Cargo" },
  { key: "contract_type", label: "Tipo de contrato" },
  { key: "admission_date", label: "Data de admissão" },
  { key: "salary", label: "Salário" },
  { key: "work_schedule", label: "Jornada de trabalho" },
];

/**
 * Campos recomendados para estagiários (regra enxuta):
 * Nome completo, CPF, RG e Telefone.
 */
export const RECOMMENDED_INTERNSHIP_FIELDS: { key: string; label: string }[] = [
  { key: "full_name", label: "Nome completo" },
  { key: "cpf", label: "CPF" },
  { key: "rg", label: "RG" },
  { key: "phone", label: "Telefone" },
];

/**
 * Retorna a lista de campos recomendados que ainda não foram preenchidos.
 * Para estagiários, usa a lista enxuta de campos obrigatórios.
 */
export function getMissingEmployeeFields(
  employee: Record<string, any>,
): { key: string; label: string }[] {
  const fields = isInternship(employee?.contract_type)
    ? RECOMMENDED_INTERNSHIP_FIELDS
    : RECOMMENDED_EMPLOYEE_FIELDS;
  return fields.filter((f) => {
    const v = employee?.[f.key];
    return v === null || v === undefined || String(v).trim() === "";
  });
}
