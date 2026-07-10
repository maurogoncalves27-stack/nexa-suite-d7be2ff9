## Problema

Na página **Extrato da conta** (`/financeiro/extrato`), com filtro 01/06/2026 → 30/06/2026 aparecem linhas rotuladas como **31/05/2026**.

Não é bug de filtro — é bug de exibição por timezone.

Confirmado no banco: as linhas `-76,33`, `-33,00 (VT Jennifer)`, `-1.398,00`, `-55,10`, `-211,00`, `+100 (Coleta óleo)`, `-2.204,61 (Boleto)`, `-23,20 (VT Treinamento)`, etc. têm `posted_at = 2026-06-01` no banco. Elas entram corretamente no filtro de junho, mas são renderizadas como 31/05.

## Causa

`posted_at` é `date` (ex.: `"2026-06-01"`). O código faz:

```ts
format(new Date(r.posted_at), "dd/MM/yyyy")
```

`new Date("2026-06-01")` interpreta a string como **UTC meia-noite**. Em BRT (UTC-3) isso vira `2026-05-31 21:00`, e o `format` mostra **31/05/2026**. Todas as datas do extrato aparecem "um dia antes" do real.

## Correção

Em `src/pages/FinanceAccountStatement.tsx`, substituir `new Date(r.posted_at)` por um parser que trata a string `YYYY-MM-DD` como data local (sem UTC).

Padrão a aplicar nos 3 pontos (tabela desktop, lista mobile, export CSV):

```ts
const parseLocalDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
```

E usar `format(parseLocalDate(r.posted_at), "dd/MM/yyyy", { locale: ptBR })`.

Escopo estritamente visual: nenhuma alteração em filtros, cálculos de saldo ou consultas.

## Verificação

Após o ajuste, recarregar `/financeiro/extrato` com filtro 01/06 → 30/06 e conferir que a primeira linha passa a mostrar **01/06/2026** (não 31/05).
