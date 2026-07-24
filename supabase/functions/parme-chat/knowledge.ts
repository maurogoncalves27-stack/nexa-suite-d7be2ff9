// ============================================================
// Base de conhecimento da Giana — FONTE ÚNICA DA VERDADE.
// Se um dado NÃO está aqui, a Giana NÃO pode responder — deve
// dizer "vou confirmar com a equipe". Guards no index.ts
// reforçam isso reescrevendo respostas fora do canônico.
// ============================================================

export type TamanhoParmegiana = "individual" | "casal" | "familia";

// -------- Parmegiana (canônico, imutável) --------
export const PARMEGIANA_REGRAS = {
  proteinaPorPessoaG: 150,
  tamanhos: {
    individual: { pessoas: 1, pesoTotalG: 600, proteinaG: 150 },
    casal:      { pessoas: 2, pesoTotalG: 1200, proteinaG: 300 },
    familia:    { pessoas: 4, pesoTotalG: 2400, proteinaG: 600 },
  } as Record<TamanhoParmegiana, { pessoas: number; pesoTotalG: number; proteinaG: number }>,
  observacao:
    "Peso oficial e definitivo. NUNCA dizer 'depende do preparo', 'aproximado' ou 'varia'.",
};

// -------- Marcas --------
export type MarcaKey = "aquela-parme" | "aquele-estrogonofe" | "box-caipira";

export const MARCAS: Record<MarcaKey, { nome: string; slogan: string; descricao: string }> = {
  "aquela-parme": {
    nome: "Aquela Parmê",
    slogan: "A parmegiana que você respeita",
    descricao:
      "Filé bovino empanado, molho da casa, muçarela gratinada, arroz e batata frita.",
  },
  "aquele-estrogonofe": {
    nome: "Aquele Estrogonofe",
    slogan: "Cremosidade sem freio",
    descricao:
      "Estrogonofe de filé mignon com arroz e batata palha crocante.",
  },
  "box-caipira": {
    nome: "Box Caipira",
    slogan: "Tempero da roça",
    descricao:
      "Arroz, feijão, lombo empanado, couve, farofa e banana — tudo na caixinha.",
  },
};

// -------- Pratos --------
// Somente pratos CONFIRMADOS. Não incluir "achismos".
// Marcar tamanhos apenas onde aplica de fato.
export type Prato = {
  id: string;
  marca: MarcaKey;
  nome: string;
  descricao: string;
  tamanhos?: TamanhoParmegiana[]; // presente = tem 3 tamanhos oficiais de parmegiana
};

export const PRATOS: Prato[] = [
  {
    id: "parmegiana-file",
    marca: "aquela-parme",
    nome: "Parmegiana de Filé",
    descricao: "Filé bovino empanado, molho, muçarela gratinada, arroz e fritas.",
    tamanhos: ["individual", "casal", "familia"],
  },
  {
    id: "parmegiana-frango",
    marca: "aquela-parme",
    nome: "Parmegiana de Frango",
    descricao: "Filé de frango empanado, molho, muçarela gratinada, arroz e fritas.",
    tamanhos: ["individual", "casal", "familia"],
  },
  {
    id: "estrogonofe-file",
    marca: "aquele-estrogonofe",
    nome: "Estrogonofe de Filé Mignon",
    descricao: "Filé mignon ao creme, arroz soltinho e batata palha.",
  },
  {
    id: "estrogonofe-frango",
    marca: "aquele-estrogonofe",
    nome: "Estrogonofe de Frango",
    descricao: "Frango ao creme, arroz soltinho e batata palha.",
  },
  {
    id: "box-galinhada",
    marca: "box-caipira",
    nome: "Galinhada",
    descricao: "Galinhada caipira com açafrão e temperos da roça.",
  },
  {
    id: "box-caipira-tradicional",
    marca: "box-caipira",
    nome: "Box Caipira",
    descricao: "Arroz, feijão, lombo empanado, couve, farofa e banana na caixinha.",
  },
];

// -------- Info institucional --------
// Só campos confirmados. Se não houver dado, deixe null e a tool
// devolve "informação em confirmação com a equipe".
export const INFO = {
  lojas: {
    "asa-sul":     { nome: "Asa Sul",     endereco: null as string | null, horario: null as string | null },
    "asa-norte":   { nome: "Asa Norte",   endereco: null as string | null, horario: null as string | null },
    "aguas-claras":{ nome: "Águas Claras",endereco: null as string | null, horario: null as string | null },
    "lago-sul":    { nome: "Lago Sul",    endereco: null as string | null, horario: null as string | null },
  },
  delivery:
    "Hoje a entrega é feita 100% pelo iFood. Não temos entrega própria nem venda direta por WhatsApp/site.",
  pagamento_salao:
    "No salão aceitamos cartões (crédito/débito) e Pix. Formas exatas de bandeira e parcelamento — confirmo com a equipe.",
  reservas:
    "Reservas de mesa são feitas por aqui no chat — precisamos de nome, telefone, data, horário e nº de pessoas.",
};

// -------- FAQ canônica --------
// Perguntas que a Giana costuma inventar. Respostas oficiais.
// Se não bater com nenhuma pergunta, a tool devolve encontrado=false
// e a Giana DEVE dizer "vou confirmar com a equipe".
export type FaqEntry = { termos: string[]; resposta: string };

export const FAQ: FaqEntry[] = [
  {
    termos: ["sem gluten", "glúten", "celiac", "celiaco"],
    resposta:
      "Nossos pratos empanados levam farinha de trigo, então não são sem glúten. Para restrições específicas, confirmo com a equipe da loja qual prato do dia atende, tá?",
  },
  {
    termos: ["vegano", "vegana", "vegetariano", "vegetariana", "carne nao", "sem carne"],
    resposta:
      "Temos opção vegetariana (parmegiana de berinjela/legumes conforme disponibilidade). Vegana estrita — confirmo com a equipe. Quer que eu confirme?",
  },
  {
    termos: ["lactose", "sem leite", "sem queijo"],
    resposta:
      "A parmegiana leva muçarela gratinada, então não é sem lactose. Posso confirmar opções com a equipe da loja se quiser.",
  },
  {
    termos: ["entrega propria", "moto propria", "motoboy proprio", "entregam direto", "voces entregam"],
    resposta:
      "Hoje a entrega é 100% pelo iFood 🛵 Não temos entrega própria nem venda direta por WhatsApp/site.",
  },
  {
    termos: ["pix", "aceita pix", "aceitam pix"],
    resposta:
      "No salão sim, aceitamos Pix. Pelo delivery, o pagamento é feito pelo iFood.",
  },
  {
    termos: ["estacionamento", "manobrista"],
    resposta:
      "Cada loja tem uma realidade — confirmo com a equipe da unidade que você vai, tá?",
  },
  {
    termos: ["infantil", "menu infantil", "crianca", "criança"],
    resposta:
      "Não temos menu infantil formal — a parmegiana individual (600g) costuma render bem pra criança dividir. Detalhes específicos, confirmo com a equipe.",
  },
  {
    termos: ["calorias", "informacao nutricional", "tabela nutricional"],
    resposta:
      "Não temos tabela nutricional publicada. Se precisar de informação específica, peço pra equipe te retornar.",
  },
];

// -------- Helpers de busca --------
export function findPrato(termo: string): Prato | null {
  const t = termo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const p of PRATOS) {
    const n = p.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (n.includes(t) || t.includes(n)) return p;
  }
  return null;
}

export function findFaq(pergunta: string): FaqEntry | null {
  const t = pergunta.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const f of FAQ) {
    for (const termo of f.termos) {
      if (t.includes(termo)) return f;
    }
  }
  return null;
}

export function tamanhosParmegianaResumo() {
  return Object.entries(PARMEGIANA_REGRAS.tamanhos).map(([k, v]) => ({
    tamanho: k,
    pessoas: v.pessoas,
    pesoTotalG: v.pesoTotalG,
    proteinaG: v.proteinaG,
  }));
}
