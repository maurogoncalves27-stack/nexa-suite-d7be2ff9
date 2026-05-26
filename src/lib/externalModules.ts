/**
 * Módulos liberáveis para parceiros externos (fornecedores e terceirizados).
 * Cada chave corresponde a uma rota/funcionalidade do sistema.
 */
export const EXTERNAL_MODULES = [
  { key: "fichas_tecnicas", label: "Fichas técnicas", route: "/fichas-tecnicas" },
  { key: "nutricontrol", label: "NutriControle", route: "/nutricontrol" },
  { key: "nutri_visita", label: "Visita técnica", route: "/nutri-visita" },
  { key: "nutri_relatorios", label: "Relatórios NutriControle", route: "/nutri-relatorios" },
  { key: "financeiro", label: "Financeiro", route: "/financeiro" },
  { key: "cotacoes", label: "Cotações (fornecedor)", route: "/fornecedor/painel" },
] as const;

export type ExternalModuleKey = (typeof EXTERNAL_MODULES)[number]["key"];

export const getModuleByRoute = (route: string) =>
  EXTERNAL_MODULES.find((m) => route.startsWith(m.route));
