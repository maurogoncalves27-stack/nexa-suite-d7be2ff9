# Cardápio único e complementos no Totem

## Diagnóstico confirmado

- O cadastro principal já é único: os canais leem produtos de `menu_items`, com vínculos de marca em `menu_item_brands` e disponibilidade por loja em `menu_item_stores`.
- Porém, a regra de leitura está duplicada em cada tela. O Totem filtra corretamente por marca e loja, enquanto PDV Novo e Garçom ainda carregam o catálogo global; o pedido online também não aplica todos os mesmos filtros.
- Portanto, hoje uma alteração no nome, preço, descrição ou foto do item tende a refletir nos canais, mas disponibilidade, marca, categorias, fotos alternativas e complementos podem divergir conforme a tela.
- Existem dois modelos de complementos preenchidos no banco: o catálogo reutilizável (`complement_groups`, `complement_options`, `menu_item_complement_links`) e cópias por item (`menu_item_complement_groups`, `menu_item_complement_options`).
- O editor do Cardápio mantém os dois modelos, o PDV Novo lê as cópias por item e o Totem atualmente só permite quantidade e observação — não carrega nem exibe complementos.

## Resultado esperado

O Cardápio será a fonte única de produtos, categorias, marcas, disponibilidade, fotos e complementos. Uma alteração feita nele refletirá automaticamente no Totem, PDV Novo, Garçom e pedido online, respeitando a loja e a marca de cada canal.

## Implementação

### 1. Centralizar a leitura do cardápio

- Criar uma camada compartilhada para buscar o cardápio por loja física e marca.
- Aplicar nela as mesmas regras de item ativo, vínculo de marca, disponibilidade da loja, categoria, ordenação e resolução de foto.
- Substituir as consultas próprias do Totem, PDV Novo, Garçom e pedido online por essa camada.
- Manter `menu_items` como cadastro canônico; `menu_item_stores` continuará controlando onde o produto está disponível, sem duplicar o produto por loja.

### 2. Unificar os complementos

- Adotar como fonte canônica o catálogo reutilizável de grupos e opções vinculado aos itens.
- Preservar os dados já cadastrados e fazer uma compatibilização segura com as tabelas por item enquanto ainda houver consumidores legados.
- Centralizar carregamento, regras de obrigatório, mínimo/máximo de escolhas, disponibilidade e acréscimo de preço.
- Evitar que cada canal implemente novamente a mesma validação.

### 3. Adicionar seleção de complementos ao Totem

- Ao tocar em um produto, carregar os grupos vinculados antes de adicionar ao carrinho.
- Exibir uma tela grande e rolável, adequada ao Totem, com seleção única ou múltipla conforme cada grupo.
- Bloquear a inclusão enquanto grupos obrigatórios ou mínimos não forem atendidos.
- Somar os acréscimos ao preço em tempo real e permitir quantidade e observação no mesmo fluxo.
- Itens sem complementos continuarão com o fluxo simples atual.

### 4. Persistir e imprimir corretamente

- Guardar no item do carrinho os complementos selecionados, seus nomes, grupos e valores.
- Tratar combinações diferentes do mesmo produto como linhas distintas no carrinho.
- Exibir os complementos na conferência do Totem.
- Enviar os complementos no pedido para que apareçam na comanda de cozinha e componham corretamente o total e a emissão fiscal.

### 5. Alinhar os demais canais

- Fazer PDV Novo, Garçom e pedido online respeitarem a mesma loja, marca, disponibilidade e complementos do Cardápio.
- Manter diferenças apenas de apresentação; a regra comercial e os dados serão compartilhados.

## Validação

- Alterar um item no Cardápio e confirmar a atualização em todos os canais.
- Desativar um item em uma loja e confirmar que ele some apenas daquela loja.
- Testar produto sem complemento, complemento opcional, obrigatório, seleção múltipla e limite máximo.
- Testar duas combinações diferentes do mesmo produto no carrinho.
- Confirmar preço final, pedido salvo, comanda de cozinha e dados enviados ao fluxo fiscal.
- Validar o Totem em formato vertical e os demais canais em mobile e desktop.

## Limites de segurança

- Não alterar os fluxos congelados de TEF PayGo/Payer nem a configuração de impressão do Totem.
- A mudança alcança somente catálogo, carrinho, persistência dos itens e conteúdo da comanda.