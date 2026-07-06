## Causa raiz da divergência da folha (Isael e outros)

A edge function `calculate-payroll` carrega `time_clock_entries` do mês inteiro em uma única query sem paginação:

```ts
supabase.from("time_clock_entries")
  .select("employee_id, entry_at, entry_type, reference_date")
  .in("employee_id", empIds)
  .gte("reference_date", periodStart)
  .lte("reference_date", periodEnd)
```

O PostgREST corta em **1000 linhas** por padrão. Junho/2026 tem **1477 batidas** → ~477 batidas silenciosamente descartadas → colaboradores aparecem como "faltosos" em dias que trabalharam normalmente.

Confirmado no Isael:
- `timesheet_closures.summary.absences = 3` ✓ (bate com contabilidade)
- `payroll_calculated.absent_days = 7` ✗ (motor perdeu batidas de 03, 05, 08, 10/06)
- Diferença de líquido: R$ 509,47 (nosso R$ 773,33 vs contab R$ 1.282,80)

Provavelmente afeta também Cláudio, Mayke e outros colaboradores da mesma loja.

## Correção

### Etapa 1 — Paginar a query de batidas em `calculate-payroll`

Substituir a query única por um loop com `.range(from, to)` de 1000 em 1000 até esgotar:

```ts
async function fetchAllPunches(empIds: string[], periodStart: string, periodEnd: string) {
  const pageSize = 1000;
  const all: PunchEntry[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from("time_clock_entries")
      .select("employee_id, entry_at, entry_type, reference_date")
      .in("employee_id", empIds)
      .gte("reference_date", periodStart)
      .lte("reference_date", periodEnd)
      .order("entry_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as PunchEntry[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
```

Chamar `fetchAllPunches` no lugar da promise atual dentro do `Promise.all`.

### Etapa 2 — Auditoria de outras queries no mesmo arquivo

Revisar todas as outras queries `.in("employee_id", empIds)` de `calculate-payroll` que possam estourar 1000 linhas em meses movimentados:

- `work_schedules` (~escala do mês × colaboradores)
- `payroll_advance_installments`
- `medical_certificates`, `vacation_schedules`, `employee_leaves`
- `payroll_holiday_worked`

Aplicar a mesma paginação onde a contagem esperada possa exceder 1000.

### Etapa 3 — Recalcular jun/2026 e conferir

Após o deploy da correção:

1. Rodar `calculate-payroll` novamente para jun/2026.
2. Reconferir Isael: esperado `absent_days = 3`, líquido ≈ R$ 1.282,80.
3. Comparar Cláudio, Mayke e demais colaboradores do PDF com os líquidos da contabilidade — divergências residuais aí sim serão específicas (adiantamento de férias, plano de saúde etc.), tratadas caso a caso.

### Etapa 4 (opcional) — Regra defensiva

Adicionar `.order()` explícito e um `console.warn` quando qualquer página retornar exatamente `pageSize` linhas seguidas de dados adicionais, para detectar cedo se o limite voltar a estourar.

## Fora do escopo

- Não alterar `c6Export.ts` nem botão de export C6.
- Não alterar iFood, PDV, TEF.
- Não mexer em `timesheet_closures` (já está correto).
- Não criar tabela de override manual de faltas — o dado está certo em `time_clock_entries`, o bug é só de leitura.