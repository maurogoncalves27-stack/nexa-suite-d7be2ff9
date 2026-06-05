## Objetivo

Registrar o valor efetivamente pago de VT por colaborador/mês e usar esse valor real como base do cálculo da folha (provento informativo e desconto de VT não utilizado).

## Mudanças

### 1. Banco de dados

Nova tabela `transport_voucher_monthly_payments`:
- `employee_id`, `reference_year`, `reference_month`
- `amount_paid` (R$ realmente recarregado/pago no mês)
- `days_paid` (qtde de dias custeada — opcional, informativo)
- `paid_at`, `paid_by`, `notes`
- Único por (employee_id, year, month)
- RLS: admin/manager/hr na própria loja

Ajustar `transport_voucher_settings.payment_frequency` → default `monthly` (manter campo, só fixar UI).

### 2. Página `/vale-transporte`

- Adicionar coluna/seção **"Pago no mês (R$)"** na lista de colaboradores, com input editável por mês de referência.
- Botão **"Aprovar VT deste mês"** continua, mas só libera se todos os colaboradores ativos com VT tiverem `amount_paid` informado (> 0 ou explicitamente 0 com nota).
- Indicador visual: badge amarelo "pendente recarga" quando não há registro.

### 3. Edge function `calculate-payroll`

Substituir cálculo teórico do VT por:

- `transport_voucher` (provento informativo) = `amount_paid` do mês (vindo da nova tabela). Se não houver registro, cai no cálculo teórico atual (fallback retroativo).
- `vt_unused_adjustment` (desconto): 
  - `diasUsados` = dias com ponto válido dentro do mês × `dailyValue`
  - `nãoUtilizado = max(0, amount_paid − diasUsados)`
- `transport_discount` (% sobre salário) continua exatamente como hoje (3% ou 6%, regra CLT/CCT inalterada).

### 4. Exibição na folha

- Holerite/painéis: rubrica "Vale Transporte" mostra valor pago real; "Desc. VT Não Utilizado" mostra delta calculado; "Desconto VT (%)" inalterado.

## Detalhes técnicos

- Arquivos afetados: 
  - migração SQL (nova tabela + grants + RLS + trigger updated_at)
  - `src/pages/TransportVoucher.tsx` (input por colaborador + gating do botão de aprovar)
  - `supabase/functions/calculate-payroll/index.ts` (ler tabela, trocar fonte do `transport_voucher` e do `vt_unused_adjustment`)
- Backfill: não preencher meses passados. Folhas já consolidadas continuam imutáveis; meses abertos usam fallback teórico quando `amount_paid` ausente.
- Memória atualizada: substituir regra de "quinzena" pela regra de "mensal com valor real".

## Fora do escopo

- Integração com operadora de VT (importar extrato).
- Mudar regra do desconto % (continua 3%/6% por escala).
- Mexer em `c6Export.ts` (imutável).
