// Metadados das três marcas do Aquela Parmê.
// Sem imagens — uso colocou os hex direto pra evitar acoplar a assets.

export type BrandKey = "parme" | "box" | "estro";

export type BrandTheme = {
  key: BrandKey;
  slug: "aquela-parme" | "box-caipira" | "aquele-estrogonofe";
  name: string;
  bg: string; // hex
  bgMuted: string;
  primary: string;
  accent: string;
  scriptTagline: string;
  bigTitle: string;
  heroTitle: [string, string];
  heroSubtitle: string;
  longCopy: string[];
  dishes: string[]; // só nomes; visual via tipografia
  emoji: string;
};

export const BRAND_THEMES: Record<BrandKey, BrandTheme> = {
  parme: {
    key: "parme",
    slug: "aquela-parme",
    name: "Aquela Parmê",
    bg: "#e8231f",
    bgMuted: "#fff1d6",
    primary: "#e8231f",
    accent: "#7a0c0c",
    scriptTagline: "a melhor hora do dia",
    bigTitle: "A Parmegiana que você respeita",
    heroTitle: ["O barulhinho da crocância,", "o exagero do queijo"],
    heroSubtitle:
      "Molho artesanal, gratinado no ponto e aquele crac que ninguém esquece.",
    longCopy: [
      "Aqui não é só mais uma parmegiana. É AQUELA — com pão fresco, molho de tomate feito devagar e queijo derretido sem economia.",
      "Cada porção sai pra atender a fome de verdade: filé macio, dourado por fora, com queijo gratinado que estica e faz festa.",
    ],
    dishes: [
      "Parmegiana família",
      "Milanesa gratinada",
      "Parmegiana com churros",
      "Milanesa com fritas",
      "Milanesa com dore",
      "Vegetariano",
    ],
    emoji: "🍝",
  },
  box: {
    key: "box",
    slug: "box-caipira",
    name: "Box Caipira",
    bg: "#ef6b3a",
    bgMuted: "#fff1d6",
    primary: "#ef6b3a",
    accent: "#a13c12",
    scriptTagline: "comidinha de raiz",
    bigTitle: "A comida caipira que você respeita",
    heroTitle: ["O sabor do fogão de lenha,", "no conforto da sua casa"],
    heroSubtitle:
      "Galinhada na manteiga de garrafa, costelinha que desmancha e arroz caipira soltinho. Comida de verdade, sem frescura.",
    longCopy: [
      "Receita simples, feita com paciência. A galinhada vai pra mesa amarela de açafrão, com gosto que lembra o quintal da vó.",
      "Tudo pra dividir, demorar, repetir o prato sem culpa. Comida pra encher o estômago e o coração.",
    ],
    dishes: [
      "Galinhada",
      "Costela suína",
      "Carreteiro candango",
      "Arroz caipira",
      "Batata frita",
      "Churros",
    ],
    emoji: "🍱",
  },
  estro: {
    key: "estro",
    slug: "aquele-estrogonofe",
    name: "Aquele Estrogonofe",
    bg: "#bba07a",
    bgMuted: "#f5ead5",
    primary: "#9a7b4f",
    accent: "#5b3d1c",
    scriptTagline: "cremosidade sem freio",
    bigTitle: "O estrogonofe que você respeita",
    heroTitle: ["A cremosidade que abraça,", "o filé que derrete"],
    heroSubtitle:
      "Filé na manteiga, creme de leite fresco, cogumelos e aquele toque de mostarda. Estrogonofe como tem que ser.",
    longCopy: [
      "Receita antiga, do tipo que pede colher cheia. Filé alto na frigideira quente, deglacê com vinho, creme fresco e mostarda no ponto.",
      "Servido com arroz soltinho e batata palha crocante. Individual ou família — vai sobrar pouco, mas você vai querer mais.",
    ],
    dishes: [
      "Estrogonofe individual",
      "Estrogonofe família",
      "Espaguete estrogonofe",
      "Espaguete alho e óleo",
      "Espaguete ao sugo",
      "Combo família",
    ],
    emoji: "🥩",
  },
};

export const STORES = [
  {
    name: "Águas Claras",
    address:
      "Quadra 101 – Rua das Figueiras, 6, Loja 15 – Águas Claras-DF · CEP 71906-750",
    services: ["delivery", "retirada"] as const,
  },
  {
    name: "Asa Sul",
    address: "CRS 513 Bloco B, Loja 79 – Asa Sul, Brasília-DF · CEP 70380-520",
    services: ["delivery", "retirada"] as const,
  },
  {
    name: "Asa Norte",
    address: "CLN 114 Bloco B, Loja 60 – Asa Norte, Brasília-DF · CEP 70764-520",
    services: ["mesa", "delivery", "retirada"] as const,
  },
  {
    name: "Lago Sul",
    address:
      "SMDB Conj. 12, PAC 2 Parte 2 – Lago Sul, Brasília-DF · CEP 71680-116",
    services: ["delivery", "retirada"] as const,
  },
];
