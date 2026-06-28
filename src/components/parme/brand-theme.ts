import { parmeAssets } from "@/assets/parme-assets";

export type BrandKey = "parme" | "box" | "estro";

export type BrandTheme = {
  key: BrandKey;
  logo: string;
  hero: string;
  circle1: string;
  circle2: string;
  bg: string;
  bgText: string;
  bgMuted: string;
  primary: string;
  primaryText: string;
  accent: string;
  scriptTagline: string;
  bigTitle: [string, string];
  heroTitle: [string, string];
  heroSubtitle: string;
  longCopy: string[];
  collage: string[];
  dishes: { name: string; img: string }[];
};

const COMMON_INSTAGRAM = [
  parmeAssets.i1, parmeAssets.i2, parmeAssets.i3,
  parmeAssets.i4, parmeAssets.i5, parmeAssets.i6,
];
export const INSTAGRAM_TILES = COMMON_INSTAGRAM;

export const BRAND_THEMES: Record<BrandKey, BrandTheme> = {
  parme: {
    key: "parme",
    logo: parmeAssets.Logo_Aquela_Parme,
    hero: parmeAssets.IMG_dobra_01_parme,
    circle1: parmeAssets.Circulo_fundo_parme_1,
    circle2: parmeAssets.Circulo_fundo_parme_2,
    bg: "#e8231f",
    bgText: "#fff7e6",
    bgMuted: "#fff1d6",
    primary: "#e8231f",
    primaryText: "#fff7e6",
    accent: "#7a0c0c",
    scriptTagline: "a melhor hora do dia",
    bigTitle: ["A Parmegiana", "que você respeita"],
    heroTitle: ["O barulhinho da crocância,", "o exagero do queijo"],
    heroSubtitle:
      "A parmegiana virou referência. Molho artesanal, gratinado no ponto e aquele crac que ninguém esquece.",
    longCopy: [
      "Aqui não é só mais uma parmegiana. É AQUELA — com pão fresco, molho de tomate feito devagar e queijo derretido sem economia.",
      "Cada porção sai pra atender a fome de verdade: filé macio, dourado por fora, com aquele queijo gratinado que estica e faz festa.",
    ],
    collage: [
      parmeAssets.parmegiana_familia,
      parmeAssets.milanesa_queijo_gratinado_e_molho_separado,
      parmeAssets.parmegiana_com_churros,
      parmeAssets.milanesa_de_file_com_fritas,
      parmeAssets.milanesa_de_file_com_dore,
    ],
    dishes: [
      { name: "Parmegiana família", img: parmeAssets.parmegiana_familia },
      { name: "Milanesa gratinada", img: parmeAssets.milanesa_queijo_gratinado_e_molho_separado },
      { name: "Parmegiana com churros", img: parmeAssets.parmegiana_com_churros },
      { name: "Milanesa com fritas", img: parmeAssets.milanesa_de_file_com_fritas },
      { name: "Milanesa com dore", img: parmeAssets.milanesa_de_file_com_dore },
      { name: "Vegetariano", img: parmeAssets.vegetariano },
    ],
  },
  box: {
    key: "box",
    logo: parmeAssets.Logo_Box_Caipira,
    hero: parmeAssets.IMG_dobra_01_box,
    circle1: parmeAssets.Circulo_fundo_box1,
    circle2: parmeAssets.Circulo_fundo_box_2,
    bg: "#ef6b3a",
    bgText: "#fff7e6",
    bgMuted: "#fff1d6",
    primary: "#ef6b3a",
    primaryText: "#fff7e6",
    accent: "#a13c12",
    scriptTagline: "comidinha de raiz",
    bigTitle: ["A comida caipira", "que você respeita"],
    heroTitle: ["O sabor do fogão de lenha,", "no conforto da sua casa"],
    heroSubtitle:
      "Galinhada na manteiga de garrafa, costelinha que desmancha e arroz caipira soltinho. Comida de verdade, sem frescura.",
    longCopy: [
      "Receita simples, feita com paciência. A galinhada vai pra mesa amarela de açafrão, com aquele gosto que lembra o quintal da vó.",
      "Tudo preparado pra dividir, pra demorar, pra repetir o prato sem culpa. É comida pra encher o estômago e o coração.",
    ],
    collage: [
      parmeAssets.galinhada,
      parmeAssets.costela_suina,
      parmeAssets.carreteiro_candango,
      parmeAssets.arroz_caipira,
      parmeAssets.batata_frita,
    ],
    dishes: [
      { name: "Galinhada", img: parmeAssets.galinhada },
      { name: "Costela suína", img: parmeAssets.costela_suina },
      { name: "Carreteiro candango", img: parmeAssets.carreteiro_candango },
      { name: "Arroz caipira", img: parmeAssets.arroz_caipira },
      { name: "Batata frita", img: parmeAssets.batata_frita },
      { name: "Churros", img: parmeAssets.churros },
    ],
  },
  estro: {
    key: "estro",
    logo: parmeAssets.Logo_Aquele_estrogonofe,
    hero: parmeAssets.IMG_dobra_01_estrogonofe,
    circle1: parmeAssets.Circulo_fundo_estrogonofe_1,
    circle2: parmeAssets.Circulo_fundo_estrogonofe_2,
    bg: "#bba07a",
    bgText: "#fff7e6",
    bgMuted: "#f5ead5",
    primary: "#9a7b4f",
    primaryText: "#fff7e6",
    accent: "#5b3d1c",
    scriptTagline: "cremosidade sem freio",
    bigTitle: ["O estrogonofe", "que você respeita"],
    heroTitle: ["A cremosidade que abraça,", "o filé que derrete"],
    heroSubtitle:
      "Filé na manteiga, creme de leite fresco, cogumelos e aquele toque de mostarda. Estrogonofe como tem que ser.",
    longCopy: [
      "A receita é antiga, do tipo que pede colher cheia. Filé alto na frigideira quente, deglacê com vinho, creme fresco e mostarda no ponto.",
      "Servido com arroz soltinho e batata palha crocante. Pode pedir individual ou família — vai sobrar pouco, e ainda assim você vai querer mais.",
    ],
    collage: [
      parmeAssets.estrogonofe_frango_individual,
      parmeAssets.estrogonofe_frango_familia,
      parmeAssets.espaguete_estrogonofe_file,
      parmeAssets.espaguete_alho_e_oleo,
      parmeAssets.espaguete_sugo,
    ],
    dishes: [
      { name: "Estrogonofe individual", img: parmeAssets.estrogonofe_frango_individual },
      { name: "Estrogonofe família", img: parmeAssets.estrogonofe_frango_familia },
      { name: "Espaguete estrogonofe", img: parmeAssets.espaguete_estrogonofe_file },
      { name: "Espaguete alho e óleo", img: parmeAssets.espaguete_alho_e_oleo },
      { name: "Espaguete ao sugo", img: parmeAssets.espaguete_sugo },
      { name: "Combo família", img: parmeAssets.combo_faltante },
    ],
  },
};
