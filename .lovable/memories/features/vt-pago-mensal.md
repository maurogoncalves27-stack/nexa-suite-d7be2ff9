---
name: VT pago mensal (valor real)
description: Tabela transport_voucher_monthly_payments armazena valor efetivamente recarregado por colaborador/mês; calculate-payroll usa esse valor em vez do teórico
type: feature
---

Pagamento de VT é **mensal** (não quinzenal). Em `/vale-transporte` há coluna **"Pago em <mês>"** por colaborador que grava em `transport_voucher_monthly_payments (employee_id, reference_year, reference_month, amount_paid)`.

`calculate-payroll`:
- Quando há `amount_paid > 0` no mês → `transport_voucher` (provento) = `amount_paid` e `vt_unused_adjustment = max(0, amount_paid − diasComPonto × daily_value)`.
- Sem registro → fallback teórico antigo (`daily × working_days_per_month × proporção` e `unused = diasEscaladosSemBatida × daily`).
- Desconto % (3%/6% por escala CLT/CCT) **continua sobre salário proporcional** — não muda.

Editar valor pago **invalida** a aprovação do VT do mês (igual demais edições).
