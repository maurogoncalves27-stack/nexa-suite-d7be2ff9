// Parser do evento S-1010 (Tabela de Rubricas)

import type { S1010Rubric } from "./types";
import { find, findAll, text } from "./xml";

export const parseS1010 = (doc: Document): S1010Rubric[] | null => {
  const evtTabs = findAll(doc, "evtTabRubrica");
  if (evtTabs.length === 0) return null;

  const rubrics: S1010Rubric[] = [];
  for (const evt of evtTabs) {
    // Inclusão / alteração / exclusão — pegamos infoRubrica e dentro dela
    const infos = findAll(evt, "infoRubrica");
    for (const info of infos) {
      // Pode ter <inclusao> <alteracao> ou <exclusao> com <ideRubrica> + <dadosRubrica>
      const ideRubrica = find(info, "ideRubrica") ?? info; // se for exclusão, fica na raiz
      const codRubr = text(find(ideRubrica, "codRubr"));
      const ideTabRubr = text(find(ideRubrica, "ideTabRubr"));
      const dados = find(info, "dadosRubrica");
      if (!codRubr) continue;
      const desc = text(find(dados ?? info, "dscRubr")) ?? codRubr;
      const natRubr = text(find(dados ?? info, "natRubr"));
      const tpRubr = text(find(dados ?? info, "tpRubr"));
      rubrics.push({
        cod_rubr: codRubr,
        ide_tab_rubr: ideTabRubr,
        description: desc,
        nat_rubr: natRubr,
        tp_rubr: tpRubr,
      });
    }
  }
  return rubrics;
};
