## Objetivo
Fluxo CLT completo de férias: gerar recibo próprio (proporcional + 1/3 + abono, com INSS/IRRF), lançar conta a pagar com vencimento 2 dias antes do início, e descontar corretamente os dias gozados na folha mensal — sem pagar em duplicidade.

**⚠️ Restrição fixa:** `src/lib/c6Export.ts` e o botão de export C6 da `/folha` NÃO serão alterados. Pagamento de férias vai por caminho paralelo (contas a pagar + lote C6 separado dedicado a férias, novo arquivo).

## 1) Banco: nova tabela `vacation_receipts`
Um recibo por programação de férias (`vacation_schedule_id` único).

Campos principais:
- `vacation_schedule_id` (FK única), `employee_id`, `reference_year`, `reference_month` (do mês de início)
- Base: `monthly_salary`, `vacation_days`, `sell_days`
- Cálculo: `vacation_base`, `one_third`, `sell_amount`, `sell_one_third`
- `gross_total`, `inss`, `irrf`, `fgts` (informativo), `net_total`
- Pagamento: `payment_due_date` (start_date − 2 dias úteis), `payment_status` ('pending'|'paid'|'cancelled'), `paid_at`, `accounts_payable_id` (FK)
- `pdf_url`, `pdf_generated_at`, `calculation_details` jsonb

GRANTs + RLS: admin/RH gerenciam; colaborador vê os próprios (mesmo padrão de `payroll_receipts`).

## 2) Edge function `calculate-vacation-receipt`
Entrada: `vacation_schedule_id`.

Passos:
1. Lê schedule + employee (salário, dependentes, hire_date).
2. `vacation_base = salary / 30 × days_count`
3. `one_third = vacation_base / 3`
4. `sell_amount = (salary / 30) × sell_days`; `sell_one_third = sell_amount / 3` (abono isento de INSS/IRRF)
5. Base tributável = `vacation_base + one_third`
6. `inss = calcINSS(base)` / `irrf = calcIRRF(base, inss, dependents)` — cálculo separado da folha, tabela mensal cheia (reutiliza tabelas de `calculate-payroll` extraindo pra `_shared/taxTables.ts`).
7. `fgts = base × 0.08` (informativo)
8. `net_total = vacation_base + one_third + sell_amount + sell_one_third − inss − irrf`
9. Grava/atualiza `vacation_receipts`, gera PDF (`src/lib/vacationReceiptPdf.ts` no estilo de `employeePdf.ts`), sobe pra storage e arquiva em `employee_documents` (pasta imutável).

## 3) Automação na aprovação
Trigger AFTER UPDATE em `vacation_schedules` (status → `approved`):
- Chama `calculate-vacation-receipt` via `pg_net` (gera recibo + PDF).
- Cria `accounts_payable` com `due_date = start_date − 2` (ajustado pro dia útil anterior), categoria "Férias", vinculado ao colaborador e à loja.

## 4) Pagamento via C6 — caminho paralelo (NÃO mexe no export da folha)
- Nova página `/pagamentos/ferias` com botão **"Gerar lote C6 PIX de férias"**.
- Novo módulo `src/lib/c6ExportFerias.ts` (arquivo separado, NÃO edita `c6Export.ts`). Pode importar tipos/utilitários puros de `c6Export.ts` só como leitura, mas o export da folha continua idêntico.
- Cria `c6_payment_batches` do tipo "vacation" com linhas dos recibos pendentes.

## 5) Integração com `calculate-payroll`
No mês em que houver férias:
- Já existe leitura de `vacation_schedules`. Passar a computar `vacationDaysInMonth` por colaborador (interseção com o mês).
- **Descontar** do `proportional_salary`: `salary_daily × vacationDaysInMonth` (esses dias serão pagos pelo recibo).
- Novos campos em `payroll_calculated` (migration): `vacation_days_in_month`, `vacation_deduction`.
- **NÃO** aplicar INSS/IRRF adicional sobre esses valores na folha (já tributados no recibo).
- Adicionar linha no holerite: "Férias gozadas — pagas em recibo próprio".
- Produtividade/DSR/adicional noturno seguem calculando só sobre dias efetivamente trabalhados.

**Importante:** o valor líquido da folha muda naturalmente (fica menor porque desconta férias), mas o **arquivo C6 exportado pela folha continua sendo gerado pelo mesmo `c6Export.ts` sem alteração de lógica** — ele só vai receber o novo net_pay já com a dedução.

## 6) UI
### `/ferias` — página existente
- Linha `approved`/`completed` ganha ações: **Ver recibo (PDF)**, **Baixar**, **Marcar como paga**, **Reprocessar recibo** (admin).
- Coluna nova "Recibo": badge de status + valor bruto.

### `/pagamentos/ferias` (nova)
- Dashboard: recibos pendentes (venc. ≤ 7 dias), pagos no mês, totais.
- Botão "Gerar lote C6 PIX de férias" (usa `c6ExportFerias.ts` novo).
- Link no sidebar em "Financeiro".

### `/folha` — página existente
- Detalhe do holerite: linha "Férias gozadas (dias / R$ deduzido)".
- Aviso ao consolidar: se colaborador tem férias no mês e recibo ainda `pending`, alerta ("Emitir recibo antes de fechar a folha").
- **Botão de export C6 e `c6Export.ts` permanecem intocados.**

## 7) Ordem de execução
1. Migration: `vacation_receipts` + colunas em `payroll_calculated` + trigger de auto-geração via pg_net.
2. Extrair tabelas INSS/IRRF para `supabase/functions/_shared/taxTables.ts` (sem alterar comportamento).
3. Edge function `calculate-vacation-receipt`.
4. Helper `src/lib/vacationReceiptPdf.ts`.
5. Ajuste em `calculate-payroll` (dedução dos dias).
6. UI em `/ferias`.
7. Nova página `/pagamentos/ferias` + `c6ExportFerias.ts` + link no sidebar + PAGE_TITLES.
8. Regressão: recalcular folha do mês corrente e validar Cláudio/Francisca.

## Fora de escopo
- Alterar `c6Export.ts` ou o botão de export C6 da `/folha`.
- Férias vencidas em dobro (apenas alerta visual já existente).
- Rescisão de férias proporcionais (já existe em `rescissionCalc`).
- e-Social S-2230/S-2299.
- Alteração dos módulos "em produção" listados na memória sem pedido explícito.
