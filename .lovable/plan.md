## Diagnóstico

A Giana continua inventando porque a "base" que ela tem é praticamente vazia:

- `MENU` em `supabase/functions/parme-chat/index.ts` (linhas 25-43) tem **só 3 linhas** — um parágrafo por marca. Não há pratos, tamanhos, pesos, acompanhamentos, bebidas, sobremesas, alérgenos, horários, endereços, formas de pagamento, etc.
- A tool `consultar_cardapio` devolve esses 3 parágrafos. Ou seja, quando o cliente pergunta "quanto pesa?", "tem sem glúten?", "qual acompanhamento?", ela **não tem fonte** — e o modelo preenche o vácuo chutando.
- Os guards (preço/pessoas de parmegiana) só cobrem 3 casos. Tudo o mais passa livre.

Prompt melhor e temperatura baixa não resolvem sem base de verdade.

## O que fazer

Criar um **cardápio estruturado como fonte-única** e obrigar a Giana a responder só com o que estiver nele. Fora dele → "vou confirmar com a equipe".

### 1. Fonte-única do cardápio (arquivo JSON versionado)

Novo arquivo `supabase/functions/parme-chat/knowledge.ts` exportando um objeto tipado com:

- **Marcas**: Aquela Parmê, Aquele Estrogonofe, Box Caipira (nome, slogan, descrição curta).
- **Pratos** (lista fechada): para cada prato → `id`, `marca`, `nome`, `descricao`, `tamanhos[]` (individual/casal/família quando aplicável), `acompanhamentos`, `proteina`, `observacoes`.
- **Regras fixas de parmegiana**: 150g proteína/pessoa; Individual 1p/600g; Casal 2p/1200g; Família 4p/2400g. Um único lugar.
- **Bebidas / sobremesas**: só listar o que existir de fato (nome). Sem inventar sabor/tamanho.
- **Info institucional**: horários, endereços das 4 lojas físicas, canais (iFood, WhatsApp, telefone), formas de pagamento aceitas no salão.
- **FAQ canônica**: perguntas que costumam gerar alucinação — "tem sem glúten?", "tem vegano?", "aceita pix?", "faz entrega própria?", "tem estacionamento?", "tem opção infantil?" — com resposta oficial (mesmo que seja "não temos" ou "confirmo com a equipe").

O conteúdo real vem de você — no plano deixo os campos e valores óbvios (parmegiana), e marco `TODO_confirmar` no que precisamos que você preencha.

### 2. Novas tools que consultam essa base

Substituir/expandir as tools atuais:

- `consultar_cardapio({ marca?, prato? })` → devolve JSON estrito do que existe (nada de "sugerir").
- `consultar_prato({ termo })` → busca por nome/palavra-chave e devolve dados canônicos + tamanhos + pesos.
- `consultar_info({ topico: "horarios" | "enderecos" | "pagamento" | "delivery" | "reservas" })` → devolve texto oficial.
- `consultar_faq({ pergunta })` → matching simples contra a FAQ; se não achar, devolve `{encontrado:false}` e a Giana deve dizer "vou confirmar com a equipe".

### 3. Prompt reescrito e mais curto

- Regra #1: **"Toda resposta factual (peso, porção, ingrediente, preço, horário, endereço, entrega, pagamento, disponibilidade) DEVE vir de uma tool. Se a tool não trouxer, você NÃO responde — diz que vai confirmar com a equipe."**
- Manter só o essencial (nome, tom, fluxo de reserva/iFood/reclamação, despedida). Cortar redundâncias que hoje competem com as regras críticas.
- Manter os blocos de peso da parmegiana como reforço, mas a fonte real vira o `knowledge.ts`.

### 4. Guards ampliados (defesa em profundidade)

Manter `wrapSseWithPriceGuard` e o `sanitizeAssistantText` (já existentes), e adicionar mais 2 detectores baratos:

- Detectar afirmações sobre "sem glúten / vegano / lactose / diet / light" quando o `knowledge.ts` diz que não temos → substituir por resposta canônica.
- Detectar "entrega própria / motoboy próprio / delivery direto" → substituir pela frase "hoje a entrega é pelo iFood".

### 5. Modelo e temperatura (já feito, mantém)

`google/gemini-3.6-flash` + `temperature: 0.3`. Sem mudança.

### Fora do escopo

- Não mexer em preço, iFood, Z-API, reservas, dedup — tudo isso continua.
- Não criar UI de admin do cardápio nessa etapa (fica como próximo passo, se você quiser um painel pra editar o `knowledge.ts` via banco depois).
- Não tocar no chat SAC do WhatsApp (`whatsapp-customer-ai-reply`) — o pedido é o chat do site.

## Detalhes técnicos

Arquivos alterados/criados:

- **novo** `supabase/functions/parme-chat/knowledge.ts` — cardápio + institucional + FAQ tipado.
- `supabase/functions/parme-chat/index.ts` — importa `knowledge.ts`; substitui `MENU`; troca/adiciona tools; encurta o prompt reforçando "só responda com dado de tool"; adiciona 2 guards.

Depois do deploy, teste manual:

1. "Quanto pesa a parmegiana família?" → 2400g / 4 pessoas.
2. "Tem opção sem glúten?" → resposta da FAQ (não invenção).
3. "Vocês entregam direto?" → "hoje é pelo iFood".
4. "Qual o horário da Asa Sul?" → vem do bloco institucional.
5. "Qual o peso do estrogonofe família?" → se não estiver no knowledge, ela responde "vou confirmar com a equipe" (não chuta).

## O que preciso de você

Antes de eu escrever o `knowledge.ts` "de verdade", me passa (ou confirma):

1. Lista fechada dos pratos por marca (só nome já basta).
2. Tamanhos que existem por prato (individual/casal/família — só onde aplica).
3. Bebidas/sobremesas que existem (só nomes).
4. Horário de funcionamento das 4 lojas + endereços curtos.
5. Formas de pagamento aceitas no salão.
6. As 5-8 perguntas mais comuns que a Giana erra hoje, com a resposta oficial.

Se preferir, começo com um esqueleto usando só o que já sabemos (parmegiana + institucional básico) e marco o resto como "vou confirmar com a equipe" até você preencher — isso já corta 80% das alucinações.