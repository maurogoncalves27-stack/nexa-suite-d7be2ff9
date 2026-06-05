# Afastamento previdenciário na folha (CLT art. 60 §3º)

Quando o colaborador é afastado por incapacidade, o empregador paga os **15 primeiros dias** como salário e, do **16º em diante**, o INSS assume e o contrato fica suspenso. Hoje a folha só gera "Salário mês civil" proporcional, sem separar as rubricas — vamos corrigir.

## 1. Catálogo de rubricas (defaults)

Adicionar 2 rubricas-padrão no `payrollTables.ts`/cadastro:

| Código | Descrição | Tipo | Incidências | eSocial |
|---|---|---|---|---|
| `AFAST_PREV_15` | Afastamento previdenciário — 15 primeiros dias | Provento | INSS, FGTS, IRRF | `1003` |
| `AFAST_PREV_INSS` | Afastamento pelo INSS (a partir do 16º dia) | Informativa | nenhuma | `9999` |

Contabilidade pode trocar os códigos depois em **Configurações → Rubricas**.

## 2. Extensão de `/atestados`

Atestado com **duração > 15 dias** ganha bloco extra:

- Toggle **"Encaminhar ao INSS (afastamento previdenciário)"**
- Campos: tipo de benefício (B31 doença / B91 acidente / B80 maternidade), NB, CID já existe, **data início** = data do atestado, **data fim prevista** (editável conforme perícia)
- Ao salvar, grava em `employees.current_leave_*` (3 colunas novas: `current_leave_start`, `current_leave_end`, `current_leave_type`) — sem nova tabela, conforme escolhido.
- Anexo do atestado segue arquivado em `employee_documents` (pasta imutável).

Quando o atestado é fechado (alta), grava `current_leave_end` real e limpa o "ativo".

## 3. Cálculo da folha

Para cada colaborador no mês de referência:

```text
dias_mes        = dias do mês de referência (28/29/30/31)
afast_inicio    = max(current_leave_start, dia 1 do mês)
afast_fim       = min(current_leave_end, último dia do mês)
dias_afast      = dias entre afast_inicio e afast_fim (0 se sem afastamento)

dias_15         = dias do afastamento que caem dentro dos 15 primeiros
                  (relativo ao início real do afastamento, não do mês)
dias_inss       = dias_afast - dias_15
dias_trab       = dias_mes - dias_afast
```

Rubricas geradas:

- **Salário mês civil** = `salario / dias_mes * dias_trab`
- **AFAST_PREV_15** = `salario / dias_mes * dias_15` (só se `dias_15 > 0`)
- **AFAST_PREV_INSS** (informativa, R$ 0,00, ref = `dias_inss`) — só se `dias_inss > 0`
- **Base INSS/FGTS/IRRF** = `Salário mês civil + AFAST_PREV_15`
- **VT/VA/produtividade/bonificação**: proporcionais a `dias_trab / dias_mes` (afastamento não zera produtividade — diferente de falta injustificada).

## 4. UI da folha

- Badge **🏥 Afastado INSS — desde dd/mm** ao lado do nome do colaborador na linha da folha quando houver afastamento ativo no período.
- Tooltip mostra: dias trabalhados / dias 15-empregador / dias INSS.

## 5. Exportação eSocial

- `esocialS1200Export.ts` já lê rubricas do catálogo — só precisa dos códigos cadastrados.
- **S-2230** (afastamento temporário) fica fora do escopo desta entrega (continua manual no portal do contador).

## 6. Mayke / folha atual

Conforme decidido: **não re-rubricar a folha atual**. A regra entra em vigor para a próxima referência.

---

## Detalhes técnicos

**Migração:**
```sql
ALTER TABLE public.employees
  ADD COLUMN current_leave_type text,
  ADD COLUMN current_leave_start date,
  ADD COLUMN current_leave_end date;
```
(Sem alteração de RLS — campos pertencem ao mesmo escopo do registro do colaborador.)

**Arquivos afetados:**
- `supabase/migrations/...` — colunas em `employees` + seed de 2 rubricas-padrão.
- `src/pages/MedicalCertificates.tsx` (+ form/dialog) — toggle e campos quando `dias > 15`.
- `src/lib/payrollTables.ts` — defaults `AFAST_PREV_15` / `AFAST_PREV_INSS`.
- `supabase/functions/payroll-generate/index.ts` (ou equivalente) — cálculo com `dias_15` / `dias_inss`.
- `src/components/payroll/SimpleManagerPayrollPanel.tsx` — badge "Afastado INSS".
- Nenhuma alteração em `c6Export.ts` nem no botão de exportação C6.

**Fora de escopo:**
- S-2230, novo módulo `/afastamentos`, recálculo retroativo do Mayke, suspensão de FGTS para B91 (regra continua igual à atual).
