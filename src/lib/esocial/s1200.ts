// Parser do evento S-1200 (Remuneração de Trabalhador vinculado ao RGPS)

import type { S1200Rubric, S1200Worker } from "./types";
import { find, findAll, num, text } from "./xml";

export interface ParsedS1200 {
  per_apur: string | null;
  workers: S1200Worker[];
}

export const parseS1200 = (doc: Document): ParsedS1200 | null => {
  const evtRemuns = findAll(doc, "evtRemun");
  if (evtRemuns.length === 0) return null;

  const workers: S1200Worker[] = [];
  let perApur: string | null = null;

  for (const evt of evtRemuns) {
    const ideEvento = find(evt, "ideEvento");
    perApur = perApur ?? text(find(ideEvento ?? evt, "perApur"));

    const ideTrab = find(evt, "ideTrabalhador");
    const cpf = text(find(ideTrab ?? evt, "cpfTrab")) ?? "";
    if (!cpf) continue;

    const allRubrics: S1200Rubric[] = [];

    // Caminho moderno: dmDev → infoPerApur → ideEstabLot → remunPerApur → itensRemun
    const dmDevs = findAll(evt, "dmDev");
    for (const dmDev of dmDevs) {
      const itens = findAll(dmDev, "itensRemun");
      for (const item of itens) {
        const codRubr = text(find(item, "codRubr"));
        if (!codRubr) continue;
        allRubrics.push({
          cod_rubr: codRubr,
          ide_tab_rubr: text(find(item, "ideTabRubr")),
          qtd_rubr: num(find(item, "qtdRubr")),
          fator_rubr: num(find(item, "fatorRubr")),
          vr_unit: num(find(item, "vrUnit")),
          vr_rubr: num(find(item, "vrRubr")) ?? 0,
        });
      }
    }

    // Fallback: itensRemun em qualquer lugar do evento
    if (allRubrics.length === 0) {
      const itens = findAll(evt, "itensRemun");
      for (const item of itens) {
        const codRubr = text(find(item, "codRubr"));
        if (!codRubr) continue;
        allRubrics.push({
          cod_rubr: codRubr,
          ide_tab_rubr: text(find(item, "ideTabRubr")),
          qtd_rubr: num(find(item, "qtdRubr")),
          fator_rubr: num(find(item, "fatorRubr")),
          vr_unit: num(find(item, "vrUnit")),
          vr_rubr: num(find(item, "vrRubr")) ?? 0,
        });
      }
    }

    workers.push({
      cpf: cpf.replace(/\D/g, ""),
      nm_trab: text(find(ideTrab ?? evt, "nmTrab")),
      matricula: text(find(evt, "matricula")),
      cod_categ: text(find(evt, "codCateg")),
      per_apur: perApur,
      rubrics: allRubrics,
    });
  }

  return { per_apur: perApur, workers };
};
