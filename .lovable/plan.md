## Validação automática simples do roteiro PayGo

Manter o roteiro com look-and-feel atual; só acrescentar uma camada simples que olha a tabela `pdv_tef_transactions` da Asa Sul e marca verde sozinho o que o log já comprova. Quando não houver evidência clara, fica em manual (check normal do operador).

### Como funciona

1. **Marco zero por rodada**
   - O botão **Resetar** já existente passa a salvar também `runStartedAt = new Date().toISOString()` no mesmo `localStorage` (`tef-paygo-roteiro-obrig-v1`).
   - Se nunca resetou, assume marco zero = momento em que abriu a página pela primeira vez (já cria na montagem se não existir).

2. **Polling leve a cada 10s** (e em foco da aba)
   - `SELECT * FROM pdv_tef_transactions WHERE store_id = ASA_SUL_ID AND provider = 'paygo' AND finished_at >= runStartedAt ORDER BY finished_at ASC`
   - Resultado vai pra um `useMemo` que aplica os matchers de cada passo.

3. **Matchers (auto-detectáveis) — apenas estes ganham marca automática:**
   - **2** valor máximo: `amount >= 99999 && status='approved'`
   - **3** pré-seleção DEMO crédito à vista: `acquirer='DEMO' && status='approved' && method=credit && installments<=1` (method/installments lido do `raw_response`)
   - **4** negada: `amount = 1000.01 && status != 'approved'`
   - **5** cancelada na seleção de rede: `status='cancelled'` + mensagem contém `OPERAÇÃO CANCELADA` ou `REDE`
   - **6** crédito: primeira venda crédito aprovada
   - **7** débito: primeira venda débito aprovada
   - **8** crédito 99x: `installments = 99 && approved`
   - **11** PIX C6 BANK: `acquirer='PIX C6 BANK' && approved`
   - **19** venda OK para cancelar
   - **21** cancelamento aprovado (status `cancelled` numa segunda transação após uma venda aprovada anterior)
   - **41–44** cancelamento por referência: `status='cancelled'` + raw contém `referenciaLocal`/`referenciaExterna`
   - **45/46** contactless com e sem senha: raw contém `CTLS`/`contactless`; PIN ausente para 46
   - **52/53/54** QR Code: `method='pix'` aprovado/cancelado

   Demais passos (1, 9, 10, 12, 16, 24, 25, 26–35, 37, 51) ficam **manuais** (o usuário marca como já fazia hoje).

4. **Estado do checkbox: 3 origens**
   - `auto`: pintado verde pelo matcher (não persistido — recalcula sempre)
   - `manual`: marcado pelo usuário (persistido no localStorage como hoje)
   - O checkbox aparece marcado se for `auto OR manual`. Manual sempre pode sobrescrever (desmarcar um auto força um "ignorar" que dura só até reset). Para simplificar ao máximo: **não permite desmarcar auto** — sumiu a complicação, evidência manda.

5. **Evidência visual mínima**
   - Quando um passo é auto, ao lado do título aparece um chip pequeno `auto • NSU 123456 • R$ 1.000,01` (texto-only, sem cor extra além de `text-muted-foreground`).
   - Sem painel separado, sem botão extra. Só o chip.

6. **Resumo do progresso**
   - O cabeçalho já mostra "Concluídos X/Y". Passa a contar `auto + manual` (sem duplicar). Nada mais muda.

### Arquivos

- **`src/components/tef-paygo/TefRoteiroTestesCard.tsx`**
  - Adiciona estado `runStartedAt` + persistência no mesmo `STORAGE_KEY` (estende formato pra `{ estado, runStartedAt }` com migração graciosa do formato antigo).
  - Botão **Resetar** atualiza `runStartedAt = now()`.
  - Novo hook interno `useAutoValidation(runStartedAt)` que:
    - Carrega `pdv_tef_transactions` via `supabase.from(...).select(...).gte('finished_at', runStartedAt).eq('store_id', ASA_SUL_ID).eq('provider','paygo')`
    - Re-busca a cada 10s e em `visibilitychange`.
    - Retorna `Map<passoN, { nsu, amount, acquirer }>`.
  - Renderiza chip de evidência quando o passo está em `auto`.

- **Sem migrações de banco**, sem edge function nova, sem mudança no card de venda de teste.

### O que fica explicitamente fora

- Passos que dependem do agente expor eventos novos (ADM, pendentes, desfazimento, dado/menu genérico). Continuam manuais — adicionar mais tarde quando o agente publicar esses logs.
- Nenhuma alteração no `paygoAdapter`, `TefTestSaleCard`, nem na tabela `pdv_tef_transactions`.
