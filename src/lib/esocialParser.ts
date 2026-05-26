// Re-export para manter compatibilidade com código existente.
// A implementação real está em src/lib/esocial/*.

export {
  parseEsocialXml,
  guessCategoryFromDescription,
  type ParsedEsocial,
  type RubricCategory,
  type S1010Rubric,
  type S1200Rubric,
  type S1200Worker,
} from "./esocial";
