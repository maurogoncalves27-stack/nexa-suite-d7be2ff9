## Objetivo

Migrar o controle de uniformes de "kit fechado" para **peça a peça**, com **estoque único centralizado na sede** (com marcação de peça nova vs. usada), e criar mecanismos que **impeçam colaboradores desligados de sumirem com o uniforme**.

---

## 1. Entrega peça a peça (kit vira sugestão)

Na tela de nova entrega:
- Ao escolher o colaborador, o sistema **sugere automaticamente** as peças do kit do cargo dele (comportamento atual), mas cada peça vira uma linha editável.
- O gestor pode **adicionar, remover, trocar tamanho e ajustar quantidade** peça a peça antes de confirmar.
- Cada linha permite escolher **"Peça nova" ou "Peça usada"** (quando houver usada disponível no tamanho).
- A aba **Kits** continua existindo apenas para definir o "previsto por cargo" (base da sugestão) — sem mudança visual grande.

---

## 2. Estoque único na sede, com tag Nova/Usada

Como todas as peças voltam para a sede, o estoque deixa de ser por loja:
- Estoque passa a ser **por peça + tamanho + condição** (`nova` / `usada`), tudo consolidado em um único local ("Sede").
- A aba **Estoque** ganha duas colunas: **Novas** e **Usadas**, com total geral.
- Movimentações registram a condição, então dá pra ver histórico de peças usadas voltando ao estoque.
- Entregas descontam da condição escolhida; devoluções em bom estado entram como **usadas**; devoluções danificadas viram baixa (não voltam ao estoque).

---

## 3. Devoluções ao desligar — bloqueio + desconto automático

Quando o colaborador é desligado (`status = terminated`):
- Sistema calcula automaticamente as **peças em aberto** (entregues com "devolução esperada" e ainda não devolvidas).
- Aparece um card vermelho **"Uniformes pendentes"** no perfil do colaborador e no painel de uniformes.
- Na tela de **rescisão / TRCT**:
  - **Bloqueia a geração** enquanto houver peça pendente sem resolução.
  - O gestor tem 3 opções por peça: **Devolveu** (entra no estoque de usados) / **Não devolveu — descontar** (custo unitário vai para o TRCT como desconto automático) / **Não devolveu — perdoar** (exige justificativa por escrito).
- Só depois de todas as peças resolvidas o TRCT é liberado.

---

## 4. Painel "Uniformes a devolver"

Nova aba no módulo de uniformes:
- Lista todos os desligados com peças ainda em aberto.
- Filtro por loja de origem (para o gestor de cada loja cobrar).
- Mostra dias desde o desligamento, valor total pendente e botão de ação rápida (registrar devolução ou descontar).
- Serve de pressão visual para os gestores não deixarem peças "jogadas na loja".

---

## Detalhes técnicos

**Banco de dados** (`uniform_stock`, `uniform_stock_movements`, `uniform_return_items`, `uniform_delivery_items`):
- Adicionar coluna `condition text` (`'nova' | 'usada'`) em `uniform_stock` e `uniform_stock_movements`, com a chave única passando a incluir a condição.
- `uniform_delivery_items` já tem `expected_return` e `returned_quantity` — vamos aproveitar; acrescentar `condition_at_delivery` (peça saiu nova ou usada).
- `uniform_return_items` já tem `condition` e `back_to_stock`; ajustar trigger para que, quando `back_to_stock = true`, a peça entre no estoque como `usada` (independente da condição de saída).
- Migração de dados: consolidar todo o estoque atual das lojas em um único registro de "Sede" marcado como `nova`.
- View `uniform_pending_returns` retornando, por colaborador desligado, as peças em aberto com custo unitário.
- Função `has_pending_uniforms(_employee_id)` usada pelo bloqueio de rescisão.

**Frontend**:
- `UniformDeliveriesPanel.tsx`: refatorar o dialog de nova entrega para lista de peças editável, com toggle nova/usada por linha.
- `UniformStockPanel.tsx`: passar a mostrar coluna única "Sede" com sub-colunas Novas/Usadas.
- `UniformKitsPanel.tsx`: manter, com aviso "usado apenas como sugestão de entrega".
- Novo `UniformPendingReturnsPanel.tsx` como aba do módulo.
- Integração no fluxo de rescisão (`src/pages/Rescisoes.tsx` ou equivalente) para bloqueio + desconto automático via `rescissionCalc`.
- Card de alerta no perfil do colaborador quando `has_pending_uniforms = true`.

**Fora de escopo** (posso propor depois se você quiser):
- Impressão de recibo de devolução assinado.
- App do colaborador confirmando recebimento das peças.
