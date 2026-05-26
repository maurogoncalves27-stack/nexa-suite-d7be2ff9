// Sugere uma categoria para um produto a partir do nome.
// Combina (1) lista de categorias existentes (match por substring inteligente)
// e (2) regras por palavra-chave em PT-BR para insumos comuns de cozinha.

const stripDiacritics = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const norm = (s: string) => stripDiacritics(s.toLowerCase()).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

// Regras de palavra-chave → nome canônico (será comparado contra as categorias existentes)
const KEYWORD_RULES: { match: RegExp; suggest: string }[] = [
  { match: /\b(arroz|feijao|macarrao|massa|farinha|fuba|amido|polenta|trigo|aveia|granola|cereal)\b/, suggest: "Mercearia" },
  { match: /\b(acucar|sal|azeite|oleo|vinagre|tempero|colorau|pimenta|oregano|alho|cebola em po|caldo|shoyu|molho ingles|mostarda|maionese|ketchup|catchup)\b/, suggest: "Mercearia" },
  { match: /\b(extrato|tomate pelado|polpa|molho de tomate|sugo)\b/, suggest: "Molhos e Conservas" },
  { match: /\b(leite|creme|nata|manteiga|requeijao|iogurte|queijo|mussarela|parmesao|provolone|catupiry|ricota|cream cheese)\b/, suggest: "Laticínios" },
  { match: /\b(ovo|ovos)\b/, suggest: "Laticínios" },
  { match: /\b(carne|file|alcatra|patinho|musculo|coxao|paleta|fraldinha|maminha|picanha|bovina|boi)\b/, suggest: "Carnes" },
  { match: /\b(frango|peito|coxa|sobrecoxa|ave|peru|chester)\b/, suggest: "Aves" },
  { match: /\b(porco|suino|bacon|linguica|salsicha|presunto|mortadela|salame|copa|toscana|calabresa)\b/, suggest: "Frios e Embutidos" },
  { match: /\b(peixe|salmao|tilapia|bacalhau|atum|camarao|fruto do mar|polvo|lula)\b/, suggest: "Peixes e Frutos do Mar" },
  { match: /\b(alface|tomate|cebola|cenoura|batata|abobrinha|berinjela|pimentao|brocolis|couve|espinafre|rucula|agriao|repolho|pepino|abobora|chuchu|vagem|beterraba|mandioca|aipim|inhame|alho fresco)\b/, suggest: "Hortifruti" },
  { match: /\b(banana|maca|laranja|limao|abacaxi|manga|melancia|mamao|uva|morango|kiwi|pera|abacate|coco)\b/, suggest: "Hortifruti" },
  { match: /\b(refrigerante|coca|guarana|sprite|fanta|suco|agua|cerveja|chopp|vinho|energetico)\b/, suggest: "Bebidas" },
  { match: /\b(pao|baguete|broa|forma|hamburguer|focaccia|ciabatta|brioche)\b/, suggest: "Padaria" },
  { match: /\b(sorvete|chocolate|brownie|bolo|torta|sobremesa|doce|pudim|mousse)\b/, suggest: "Sobremesas" },
  { match: /\b(copo|guardanapo|sacola|embalagem|marmita|marmitex|caixa|pote|tampa|talher|canudo|bandeja)\b/, suggest: "Embalagens e Descartáveis" },
  { match: /\b(detergente|desinfetante|alcool|sabao|sanitario|limpeza|esponja|pano|saco de lixo|luva|papel toalha)\b/, suggest: "Limpeza" },
  { match: /\b(fermento|chocolate em po|cacau|leite condensado|creme de leite|gelatina|farinha de trigo|coco ralado|baunilha|essencia)\b/, suggest: "Confeitaria" },
];

// Tenta casar um sugerido com uma categoria já existente (case/acentos insensível)
const matchExisting = (suggested: string, existing: string[]): string | null => {
  const ns = norm(suggested);
  for (const cat of existing) {
    const nc = norm(cat);
    if (nc === ns) return cat;
  }
  // Tenta inclusão parcial (ex.: sugerido "Bebidas" e existe "Bebidas Geladas")
  for (const cat of existing) {
    const nc = norm(cat);
    if (nc.includes(ns) || ns.includes(nc)) return cat;
  }
  return null;
};

export function suggestCategory(productName: string, existingCategories: string[]): string | null {
  const name = norm(productName);
  if (!name) return null;

  // 1. Match direto por palavras do produto contra categorias existentes
  const tokens = name.split(" ").filter((t) => t.length >= 4);
  for (const cat of existingCategories) {
    const nc = norm(cat);
    for (const tk of tokens) {
      if (nc.includes(tk)) return cat;
    }
  }

  // 2. Regras de palavra-chave
  for (const rule of KEYWORD_RULES) {
    if (rule.match.test(name)) {
      const existing = matchExisting(rule.suggest, existingCategories);
      return existing ?? rule.suggest;
    }
  }

  return null;
}
