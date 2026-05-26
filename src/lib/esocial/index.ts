// Parser para arquivos XML do eSocial
// Suporta:
//  - S-1010: Tabela de Rubricas (cadastro do empregador)
//  - S-1200: Remuneração de Trabalhador vinculado ao RGPS

import { parseS1010 } from "./s1010";
import { parseS1200 } from "./s1200";
import type { ParsedEsocial } from "./types";
import { parseXmlString } from "./xml";

export type {
  ParsedEsocial,
  RubricCategory,
  S1010Rubric,
  S1200Rubric,
  S1200Worker,
} from "./types";
export { guessCategoryFromDescription } from "./categoryGuess";

export const parseEsocialXml = (xmlString: string): ParsedEsocial => {
  const doc = parseXmlString(xmlString);

  const s1010 = parseS1010(doc);
  if (s1010) {
    return { type: "S-1010", per_apur: null, rubrics_table: s1010, workers: [] };
  }

  const s1200 = parseS1200(doc);
  if (s1200) {
    return {
      type: "S-1200",
      per_apur: s1200.per_apur,
      rubrics_table: [],
      workers: s1200.workers,
    };
  }

  return { type: "unknown", per_apur: null, rubrics_table: [], workers: [] };
};
