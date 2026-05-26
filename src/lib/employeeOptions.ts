export const BRAZILIAN_STATES = [
  { uf: "AC", name: "Acre" },
  { uf: "AL", name: "Alagoas" },
  { uf: "AP", name: "Amapá" },
  { uf: "AM", name: "Amazonas" },
  { uf: "BA", name: "Bahia" },
  { uf: "CE", name: "Ceará" },
  { uf: "DF", name: "Distrito Federal" },
  { uf: "ES", name: "Espírito Santo" },
  { uf: "GO", name: "Goiás" },
  { uf: "MA", name: "Maranhão" },
  { uf: "MT", name: "Mato Grosso" },
  { uf: "MS", name: "Mato Grosso do Sul" },
  { uf: "MG", name: "Minas Gerais" },
  { uf: "PA", name: "Pará" },
  { uf: "PB", name: "Paraíba" },
  { uf: "PR", name: "Paraná" },
  { uf: "PE", name: "Pernambuco" },
  { uf: "PI", name: "Piauí" },
  { uf: "RJ", name: "Rio de Janeiro" },
  { uf: "RN", name: "Rio Grande do Norte" },
  { uf: "RS", name: "Rio Grande do Sul" },
  { uf: "RO", name: "Rondônia" },
  { uf: "RR", name: "Roraima" },
  { uf: "SC", name: "Santa Catarina" },
  { uf: "SP", name: "São Paulo" },
  { uf: "SE", name: "Sergipe" },
  { uf: "TO", name: "Tocantins" },
];

export const ETHNICITY_OPTIONS = [
  { value: "branca", label: "Branca" },
  { value: "preta", label: "Preta" },
  { value: "parda", label: "Parda" },
  { value: "amarela", label: "Amarela" },
  { value: "indigena", label: "Indígena" },
  { value: "nao_declarado", label: "Não declarado" },
];

export const EDUCATION_OPTIONS = [
  { value: "fundamental_incompleto", label: "Fundamental incompleto" },
  { value: "fundamental_completo", label: "Fundamental completo" },
  { value: "medio_incompleto", label: "Médio incompleto" },
  { value: "medio_completo", label: "Médio completo" },
  { value: "tecnico", label: "Técnico" },
  { value: "superior_incompleto", label: "Superior incompleto" },
  { value: "superior_completo", label: "Superior completo" },
  { value: "pos_graduacao", label: "Pós-graduação" },
  { value: "mestrado", label: "Mestrado" },
  { value: "doutorado", label: "Doutorado" },
];

export const MARITAL_STATUS_OPTIONS = [
  { value: "solteiro", label: "Solteiro(a)" },
  { value: "casado", label: "Casado(a)" },
  { value: "uniao_estavel", label: "União estável" },
  { value: "divorciado", label: "Divorciado(a)" },
  { value: "viuvo", label: "Viúvo(a)" },
  { value: "separado", label: "Separado(a)" },
];

export const MARITAL_REQUIRES_SPOUSE = ["casado", "uniao_estavel"];

// Categorias eSocial mais comuns (S-2200 / cadInicial)
export const ESOCIAL_CATEGORY_OPTIONS = [
  { value: "101", label: "101 — Empregado CLT (geral, exceto doméstico/aprendiz)" },
  { value: "102", label: "102 — Empregado CLT - Trabalho intermitente" },
  { value: "103", label: "103 — Empregado CLT - Aprendiz" },
  { value: "104", label: "104 — Empregado CLT - Doméstico" },
  { value: "105", label: "105 — Empregado CLT - Contrato a termo" },
  { value: "106", label: "106 — Trabalhador temporário (Lei 6.019/74)" },
  { value: "111", label: "111 — Empregado - Contrato verde e amarelo" },
  { value: "201", label: "201 — Trabalhador avulso portuário" },
  { value: "202", label: "202 — Trabalhador avulso não portuário" },
  { value: "401", label: "401 — Dirigente sindical" },
  { value: "701", label: "701 — Estagiário" },
  { value: "711", label: "711 — Diretor não empregado com FGTS" },
  { value: "712", label: "712 — Diretor não empregado sem FGTS" },
  { value: "901", label: "901 — Servidor público (estatutário)" },
];

export const WORK_REGIME_OPTIONS = [
  { value: "clt", label: "CLT" },
  { value: "rgps_diferenciado", label: "RGPS - Trabalhador rural / outros" },
  { value: "estatutario", label: "Estatutário (RPPS)" },
  { value: "outros", label: "Outros" },
];

export const JOURNEY_TYPE_OPTIONS = [
  { value: "1", label: "Jornada com horário definido" },
  { value: "2", label: "Turnos ininterruptos de revezamento" },
  { value: "3", label: "Escala (12x36)" },
  { value: "4", label: "Disponibilidade / sobreaviso" },
  { value: "9", label: "Demais tipos de jornada" },
];

export const SALARY_TYPE_OPTIONS = [
  { value: "mensal", label: "Mensal" },
  { value: "quinzenal", label: "Quinzenal" },
  { value: "semanal", label: "Semanal" },
  { value: "diario", label: "Diário (diarista)" },
  { value: "horario", label: "Por hora (horista)" },
  { value: "tarefa", label: "Por tarefa / produção" },
];

export const HAZARD_PAY_OPTIONS = [
  { value: "none", label: "Nenhum" },
  { value: "insalubridade_10", label: "Insalubridade — 10%" },
  { value: "insalubridade_20", label: "Insalubridade — 20%" },
  { value: "insalubridade_40", label: "Insalubridade — 40%" },
  { value: "periculosidade_30", label: "Periculosidade — 30%" },
];

export const DISABILITY_OPTIONS = [
  { value: "none", label: "Não possui" },
  { value: "fisica", label: "Física" },
  { value: "auditiva", label: "Auditiva" },
  { value: "visual", label: "Visual" },
  { value: "mental", label: "Mental / Intelectual" },
  { value: "multipla", label: "Múltipla" },
  { value: "reabilitado", label: "Reabilitado pelo INSS" },
];

export const CNH_CATEGORY_OPTIONS = ["A", "B", "AB", "C", "D", "E", "AC", "AD", "AE"].map((c) => ({
  value: c,
  label: c,
}));

// Cargos: a fonte oficial é a tabela `positions` no banco.
// Use o hook `usePositions()` em `@/hooks/usePositions` para acessá-los.

