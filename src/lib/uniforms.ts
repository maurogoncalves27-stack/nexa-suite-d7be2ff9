export const UNIFORM_CATEGORIES = [
  { value: "superior", label: "Vestuário Superior" },
  { value: "inferior", label: "Vestuário Inferior" },
  { value: "calcado", label: "Calçado" },
  { value: "epi", label: "EPI" },
  { value: "acessorio", label: "Acessório" },
];

export const SIZE_TYPES = [
  { value: "letra", label: "Letra (PP a EG)" },
  { value: "numero", label: "Numérico (33-48)" },
  { value: "unico", label: "Tamanho único" },
];

export const LETTER_SIZES = ["PP", "P", "M", "G", "GG", "EG"];
export const NUMERIC_SIZES = Array.from({ length: 16 }, (_, i) => String(33 + i));
export const UNIQUE_SIZES = ["ÚNICO"];

export const sizesFor = (sizeType: string) =>
  sizeType === "numero" ? NUMERIC_SIZES : sizeType === "unico" ? UNIQUE_SIZES : LETTER_SIZES;

export const MOVEMENT_TYPES = [
  { value: "entrada", label: "Entrada (compra/recebimento)" },
  { value: "saida", label: "Saída manual" },
  { value: "devolucao", label: "Devolução de colaborador" },
  { value: "ajuste", label: "Ajuste de inventário" },
  { value: "perda", label: "Perda / extravio" },
];

export const DELIVERY_TYPES = [
  { value: "inicial", label: "Entrega inicial" },
  { value: "troca", label: "Troca periódica" },
  { value: "reposicao", label: "Reposição" },
  { value: "avaria", label: "Reposição por avaria" },
  { value: "perda", label: "Reposição por perda" },
];

export const CHARGE_REASONS = [
  { value: "nenhum", label: "Sem cobrança" },
  { value: "avaria", label: "Avaria" },
  { value: "perda", label: "Perda" },
  { value: "nao_devolucao", label: "Não devolução" },
];

export const RETURN_REASONS = [
  { value: "desligamento", label: "Desligamento" },
  { value: "troca", label: "Troca" },
  { value: "avaria", label: "Avaria" },
];

export const RETURN_CONDITIONS = [
  { value: "bom", label: "Bom estado (volta ao estoque)" },
  { value: "danificado", label: "Danificado (descarte)" },
  { value: "perdido", label: "Perdido (cobrar)" },
];

export interface UniformItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  size_type: string;
  is_durable: boolean;
  unit_cost: number;
  replacement_months: number;
  is_active: boolean;
}

export interface UniformPending {
  uniform_item_id: string;
  item_name: string;
  size: string;
  delivered: number;
  returned: number;
  pending: number;
}

// SEDE única do estoque de uniformes = ESTOQUE CENTRAL
export const UNIFORM_CENTRAL_STORE_ID = "06ae09d6-4589-47a4-8a7e-b5467e94d081";

export const CONDITION_OPTIONS = [
  { value: "nova", label: "Nova" },
  { value: "usada", label: "Usada" },
] as const;

export type UniformCondition = "nova" | "usada";

