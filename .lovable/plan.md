# Plano executivo revisado — NEXA Suite

## Diagnóstico corrigido

O **estoque ainda não funciona de ponta a ponta** e não deve ser tratado como módulo concluído ou em produção.

O código já possui partes do fluxo:
- entrada de notas e recebimento de itens (`InventoryReceivingPanel` → `receive_invoice_item`);
- fichas técnicas com ingredientes;
- registro de produção do CD (`produce_recipe`);
- distribuição do CD para lojas (`distribute_factory_production`);
- transferências entre estoques;
- baixa de ingredientes por pedido (`consume_pdv_order_stock`), com proteção básica contra baixa duplicada.

Porém, essas partes ainda não foram validadas como um ciclo operacional único. A cobertura encontrada é pontual; não há teste ponta a ponta cobrindo compra → entrada → produção → distribuição → venda → baixa → contagem.

Consequências:
- o sistema de compras ainda não pode ser considerado testado;
- a sugestão de compras depende de saldos que ainda não são confiáveis;
- vendas ainda não entram todas no sistema nem baixam estoque de forma uniforme;
- produção e entrada do CD ainda precisam ser testadas integralmente;
- não é possível validar CMV, necessidade de compra ou divergência de estoque antes de fechar esse ciclo.

---

## Prioridade 0 — Colocar o estoque em funcionamento real

### 1. Preparar a base de produtos e fichas técnicas
- Auditar todos os itens vendáveis do cardápio e seus vínculos com `menu_items`, fichas técnicas e produtos de estoque.
- Identificar pratos, adicionais, combos, bebidas e embalagens sem ficha ou mapeamento.
- Validar unidade de compra, unidade de estoque, fatores de conversão, rendimento e perdas.
- Bloquear ou alertar claramente quando uma venda não puder gerar baixa por falta de vínculo.
- Preservar a separação entre ficha técnica e receituário.

### 2. Unificar a entrada de todas as vendas
Toda venda deverá gerar um pedido no mesmo núcleo transacional, com origem identificada:
- NEXA PDV;
- NEXA Totem;
- App Garçom;
- iFood;
- WhatsApp;
- chat do site;
- cardápio do site.

A confirmação do pedido será o único evento responsável por iniciar a baixa de estoque conforme a ficha técnica. Cancelamentos deverão estornar exatamente os movimentos gerados pelo pedido original.

### 3. Tornar a baixa de estoque segura e auditável
- Garantir idempotência: um pedido nunca pode baixar duas vezes.
- Registrar pedido, item vendido, ficha usada, ingrediente, quantidade e loja em cada movimento.
- Tratar combos, adicionais, substituições e itens vendidos diretamente como produto de estoque.
- Não permitir saldo negativo silencioso; gerar pendência operacional quando faltar saldo ou mapeamento.
- Criar reprocessamento controlado para pedidos que falharam.

### 4. Validar o ciclo completo do CD
Executar e documentar o fluxo real:
1. entrada de insumos no estoque do CD;
2. conferência de quantidade, lote, validade, custo e conversão;
3. consumo dos insumos pela produção;
4. entrada do produto acabado no estoque do CD;
5. criação da transferência para a loja;
6. saída do CD;
7. recebimento e entrada no estoque da loja;
8. venda na loja;
9. baixa dos ingredientes ou produtos correspondentes;
10. cancelamento e estorno controlado.

A produção real deve consumir insumos e gerar produto acabado de acordo com rendimento e multiplicador da ficha técnica.

### 5. Testar compras somente sobre saldos confiáveis
Depois de vendas, produção e transferências estarem fechando:
- validar estoque mínimo e contingência por loja;
- validar plano semanal do CD;
- validar consolidação da necessidade do CD com a necessidade das lojas;
- gerar cotação;
- registrar pedido ao fornecedor;
- receber nota e produtos;
- atualizar custo e saldo;
- conferir se quantidades já cotadas/compradas não são solicitadas novamente.

O sistema de compras só será marcado como funcional após esse cenário completo passar com dados reais.

### 6. Criar testes robustos de estoque
- Testes automatizados das funções críticas de entrada, produção, transferência, venda e estorno.
- Cenários com item simples, combo, adicional, embalagem, produto sem ficha, conversão de unidade, perda e estoque insuficiente.
- Teste ponta a ponta controlado em uma loja piloto.
- Relatório de reconciliação: saldo inicial + entradas + produção recebida − vendas − perdas − transferências = saldo final.
- Contagem física ao final do piloto para comparar sistema × realidade.

**Critério para concluir a Prioridade 0:** uma compra real entra no CD, vira produção, é transferida para uma loja, é vendida por um canal integrado e baixa corretamente até a contagem física, com rastreabilidade e sem ajuste manual oculto.

---

## Prioridade 1 — Vendas próprias integradas

### 7. Cardápio, WhatsApp e chat como o mesmo sistema
- Criar carrinho e checkout único para cardápio do site.
- Permitir entrega própria ou retirada.
- WhatsApp e chat usam o mesmo agente, catálogo, carrinho, cliente e pedido; são apenas canais diferentes.
- A IA monta o carrinho e encaminha para o mesmo checkout, sem criar um segundo sistema de vendas.
- Todos os pedidos entram no núcleo unificado e baixam estoque pelas mesmas regras.

### 8. Operação da entrega própria e retirada
- Pedido cai na fila da loja com aceitar, recusar, preparar, pronto, saiu para entrega e concluído.
- Entrega própria com entregador, endereço, taxa e acompanhamento.
- Retirada com aviso automático ao cliente.
- Impressão de comanda e emissão fiscal pelo fluxo comum.

---

## Prioridade 2 — Atendimento virtual unificado

### 9. Um único cérebro para WhatsApp e chat
- Unificar prompt, ferramentas, base da Giana, regras comerciais e memória do cliente.
- Manter apenas adaptadores de entrada e saída por canal.
- Agrupar o mesmo cliente pelo telefone e preservar histórico entre WhatsApp e site.
- Integrar atendimento, carrinho, pedido e CRM.

### 10. Testes de qualidade do atendimento
- Cardápio, preços, pesos, composição, horários, unidades, entrega, retirada, pedido, alteração e cancelamento.
- Reclamações, elogios, dúvidas e transferência para humano.
- Regressão anti-alucinação usando somente dados oficiais do cardápio e da base da Giana.
- Rodadas automáticas nos dois canais contra o mesmo núcleo, com nota de qualidade e alerta de regressão.

---

## Prioridade 3 — App Garçom no Gertec GPOS780

### 11. Colocar o Garçom em operação no SmartPOS comprado
- Adaptar `/garcom` para o GPOS780, com interface adequada à tela e operação rápida por mesa/comanda.
- Integrar pagamento no SmartPOS usando a solução homologada aplicável ao equipamento, sem alterar os códigos TEF congelados sem confirmação expressa.
- Integrar impressora embarcada, fila offline e retomada segura.
- Toda venda do Garçom entra no mesmo núcleo de pedidos e baixa estoque.
- Executar piloto real em uma loja antes da expansão.

---

## Prioridade 4 — Homologações e integrações externas

Após estabilizar o núcleo operacional, ou em paralelo quando depender apenas de terceiros:
1. refazer testes oficiais do iFood e finalizar merchant;
2. Lalamove;
3. Uber Direct;
4. C6 Bank API;
5. avaliações e respostas integradas iFood + Google;
6. Meta WhatsApp Cloud API;
7. demais itens da fila oficial de homologações.

PayGo e Payer permanecem homologados e congelados. O iFood em produção deve ser preservado durante a integração dos pedidos ao estoque.

## Ordem prática de execução

1. Auditoria de produtos, fichas e conversões.
2. Núcleo único de pedidos e movimentos de estoque.
3. Venda do PDV/iFood baixando estoque e cancelamento estornando.
4. Entrada de nota e insumos do CD.
5. Produção do CD e produto acabado.
6. Transferência e recebimento pela loja.
7. Compras e reposição baseadas nos saldos validados.
8. Cardápio/WhatsApp/chat com entrega própria e retirada.
9. Atendimento virtual unificado e testes de regressão.
10. App Garçom no GPOS780.
11. Homologações externas conforme a fila oficial.