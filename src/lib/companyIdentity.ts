// Identidade da empresa em um único lugar.
// Evita CNPJ/razão social espalhados como literal por PDFs, termos e exportações.
// Se um dia houver mais de uma empresa, basta trocar a origem aqui.

/** CNPJ da matriz apenas com dígitos (usado em XML/eSocial e integrações). */
export const COMPANY_CNPJ_DIGITS = "44932369000108";

/** CNPJ da matriz formatado (usado em documentos e PDFs). */
export const COMPANY_CNPJ = "44.932.369/0001-08";

/** Razão social usada em contratos, termos e rodapés legais. */
export const COMPANY_LEGAL_NAME = "NEXA Gestão Inteligente";

/** Formata um CNPJ (com ou sem máscara) no padrão 00.000.000/0000-00. */
export function formatCnpj(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D+/g, "");
  if (d.length !== 14) return raw ?? "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
