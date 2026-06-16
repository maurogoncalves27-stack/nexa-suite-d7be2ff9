## Resumo

Adicionar **rateio por loja** nas contas (a pagar/a receber) e na **conciliação bancária**, mantendo o modelo atual de `store_id` único como atalho quando não houver rateio. "Centro de custo" = a própria loja (`stores`).

## Modelo de dados (1 migração)

Nova tabela `finance_allocations` (genérica, serve para AP, AR e bank tx):

```
finance_allocations
  id uuid pk
  source_kind text check in ('payable','receivable','bank_tx')
  source_id   uuid          -- FK lógica para accounts_payable/receivable/bank_transactions
  store_id    uuid not null references stores(id)
  amount      numeric(14,2) not null   -- valor absoluto da fatia
  percent     numeric(7,4)             -- opcional, só para UI
  notes       text
  created_at / updated_at
  unique (source_kind, source_id, store_id)
```

Regras:
- RLS: mesmas regras de quem lê o `source` (reusar `has_role`/políticas já existentes).
- **GRANT** para `authenticated` + `service_role`.
- Trigger valida que `SUM(amount)` das alocações de um `source` é igual ao valor do registro origem (tolerância R$ 0,02). Se ninguém criar alocação, o sistema cai no `store_id` único do registro (compatibilidade total — nada quebra).
- View `v_finance_allocations_effective` que, para qualquer AP/AR/bank_tx, devolve:
  - as linhas de `finance_allocations` se existirem, OU
  - 1 linha sintética com `store_id` e `amount` do próprio registro.
  Toda análise (DRE por loja, relatórios) passa a consumir essa view → migração transparente.

## UI (cirúrgica, sem mexer em fluxos existentes)

1. **Conta a pagar / a receber** (`NewPayableDialog`, edição de AR):
   - Botão "Ratear entre lojas" abre sub-painel com lista de lojas + valor/%. Padrão = 1 loja (a atual). Salva em `finance_allocations` ao confirmar.
2. **Conciliação bancária** (`BankReconciliationPanel`):
   - Quando a transação não tem AP/AR vinculado (ou o usuário clica "Ratear"), abrir o mesmo sub-painel e gravar em `finance_allocations` com `source_kind='bank_tx'`. A transação fica conciliada normalmente.
   - Quando vincula a um AP/AR já rateado, herda automaticamente o rateio dele (cópia para `bank_tx`).
3. **DRE / relatórios por loja**: trocar consultas que hoje fazem `GROUP BY store_id` direto na tabela para usar a view `v_finance_allocations_effective`. Resultado idêntico para quem não usa rateio.

## O que NÃO muda

- Modelo atual `store_id + category_id` em AP/AR continua intacto.
- Conciliação atual segue funcionando para quem não quer rateio.
- `c6Export.ts`, folha, PDV, iFood — nada tocado.

## Arquivos previstos

- 1 migração SQL (tabela + view + trigger + RLS + grants).
- `src/components/finance/AllocationEditor.tsx` (novo, reutilizável).
- `src/components/finance/NewPayableDialog.tsx` (botão "Ratear").
- `src/components/finance/BankReconciliationPanel.tsx` (botão "Ratear" + herança do rateio do AP/AR vinculado).
- `src/lib/dre.ts` / consultas de DRE por loja → trocar para a view.

## Risco

Médio. Mexe em DRE por loja. Mitigação: view garante fallback automático (sem alocação = comportamento atual), e o trigger só dispara quando há linhas em `finance_allocations`.

Posso seguir?