/**
 * Exporta os resultados de uma rodada de homologação PayGo no formato
 * idêntico à planilha Setis "Planilha_de_testes_v20240306".
 * Colunas: N° teste | Obrigatoriedade | Retorno do teste | Observações | Teste
 *
 * O campo "Retorno do teste" recebe o NSU (PWINFO_REQNUM) capturado pelo
 * adapter ACBr — exatamente o que a Setis pede para "Biblioteca Windows".
 */
import * as XLSX from "xlsx";
import { HOMOLOGATION_STEPS } from "./steps";

export interface StepResultRow {
  step_number: number;
  status: "pending" | "ok" | "fail" | "skipped" | "na";
  nsu: string | null;
  requnum: string | null;
  observations: string | null;
}

export const exportHomologationXlsx = (
  rows: StepResultRow[],
  runMeta: { startedAt: string; pdcCode?: string | null; storeName?: string | null },
) => {
  const byStep = new Map<number, StepResultRow>();
  rows.forEach((r) => byStep.set(r.step_number, r));

  const data: (string | number)[][] = [
    ["N° teste", "Obrigatoriedade", "Retorno do teste", "Observações", "Teste"],
  ];

  HOMOLOGATION_STEPS.forEach((s) => {
    const result = byStep.get(s.number);
    const retorno =
      result?.nsu ||
      result?.requnum ||
      (result?.status === "na" ? "N/A" : "");
    const obs =
      result?.observations ||
      (result?.status === "fail" ? "Teste falhou — ver detalhes no painel NEXA." :
       result?.status === "skipped" ? "Teste pulado nesta rodada." :
       result?.status === "na" ? "Não aplicável (ControlPay REST não utilizado)." :
       result?.status === "pending" ? "Ainda não executado." : "");
    data.push([
      `Passo ${s.number}`,
      s.mandatory ? "SIM" : "OPCIONAL",
      retorno,
      obs,
      s.name,
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [
    { wch: 12 }, { wch: 18 }, { wch: 28 }, { wch: 50 }, { wch: 32 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Planilha de Testes");

  // Aba de capa com metadados
  const meta = XLSX.utils.aoa_to_sheet([
    ["NEXA Suite — Homologação PayGo"],
    [],
    ["Integração", "Biblioteca Windows (ACBrLibTEFD)"],
    ["Loja", runMeta.storeName ?? ""],
    ["Ponto de Captura (PdC)", runMeta.pdcCode ?? ""],
    ["Iniciado em", runMeta.startedAt],
    [],
    ["Observação", "Passos 47–50 referem-se à integração ControlPay REST e não foram executados nesta rodada (marcados como N/A)."],
  ]);
  meta["!cols"] = [{ wch: 28 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, meta, "Capa");

  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `homologacao-paygo-${dateStr}.xlsx`);
};
