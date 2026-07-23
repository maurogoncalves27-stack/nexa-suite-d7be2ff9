## Objetivo
Incluir no PDF de fiscalização do NutriControle uma seção com os **ASOs dos colaboradores alocados naquela loja**, para atender inspeção sanitária/trabalhista em um único documento.

## O que muda

### 1. `src/lib/nutricontroleReportPdf.ts`
- Adicionar novo campo em `NutriReportData`:
  ```ts
  employeeAsos: Array<{
    employee_name: string;
    position: string;
    aso_type: string;           // Admissional / Periódico / Retorno / Mudança / Demissional
    certificate_date: string;   // data do ASO
    valid_until: string | null; // vencimento (12 meses após, se não vier)
    status: "vigente" | "vence_em_30d" | "vencido" | "sem_aso";
  }>
  ```
- Nova seção **"ASOs dos Colaboradores"** logo após "Água" e antes do rodapé:
  - KPI cards: Total de colaboradores · ASOs vigentes · Vencendo em 30 dias · Vencidos/sem ASO
  - Tabela agrupada por status (vencidos primeiro em vermelho, vencendo em amarelo, vigentes em verde), com colunas: Colaborador · Cargo · Tipo do ASO · Emissão · Vencimento · Status.
- Colaboradores sem ASO aparecem no bloco "Vencidos/sem ASO" para o fiscal ver a pendência.

### 2. `src/components/nutricontrol/ExportNutricontroleReportButton.tsx`
Adicionar às `Promise.all` a busca dos colaboradores alocados + ASOs mais recentes:
- **Alocação por loja** (mesma regra usada no resto do RH): união de
  - `employees` com `store_id = storeId` e `status = 'active'`
  - `employees` que aparecem em `work_schedules` daquela loja no período (via `useEmployeesAtStore` reutilizado como fetch inline, ou query direta em `work_schedules`).
- Para cada colaborador, pegar o ASO mais recente de `medical_certificates` (`is_pcmso = true`, `status = 'approved'`), calcular vencimento (`valid_until` se existir, senão `certificate_date + 365d`) e classificar status.
- Passar `employeeAsos` para `generateNutricontroleReportPdf`.

## Fora do escopo
- Não altera dados. Não muda o relatório de Saúde Ocupacional (que já tem ASOs por colaborador em `Pcmso.tsx`).
- Não anexa PDFs dos ASOs no relatório (apenas o extrato tabular por colaborador). Se quiser anexar arquivos, é uma segunda fase.

## Verificação
Gerar o PDF para uma loja com colaboradores e conferir se a nova seção lista todos os alocados, com o status correto de vigência.
