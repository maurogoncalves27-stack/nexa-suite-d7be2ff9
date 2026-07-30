## Recomendação: adiar o RAG, resolver a causa real

### Por que não RAG agora

Verificado no código e no banco:

| Dimensão | Valor real | RAG faz sentido a partir de |
|---|---|---|
| Pratos cadastrados | 6 | ~100+ |
| FAQs | 8 | ~50+ |
| Conversas totais | 47 | ~5.000+ |
| Documentos internos | 0 indexados | qualquer volume de PDF/manual |
| pgvector | não instalado | — |

Todo o conhecimento da Giana cabe hoje dentro do system prompt. Busca vetorial adiciona latência, custo de embeddings, uma tabela nova, índice HNSW, job de reindexação e UI de manutenção — sem ganho de qualidade nessa escala.

Além disso, as duas dores citadas têm outra causa:
- **Endereços e horários das 4 lojas estão `null`** em `knowledge.ts`. É cadastro faltando, não recuperação falhando.
- **Contexto de cliente já é buscado** por `lookupReturningCustomer` (match por sufixo de telefone em `client_meta`). O gargalo é o que se injeta no prompt, não a busca.

### Proposta: Fase 0 — conhecimento dinâmico sem vetores

Entrega o mesmo benefício prático que você quer (editar sem deploy + contexto de cliente) com uma fração da complexidade.

#### 1. Migrar `knowledge.ts` para o banco

Tabelas novas:
- `giana_dishes` — id, marca, nome, descricao, tamanhos jsonb, is_active
- `giana_faq` — id, termos text[], resposta, is_active
- `giana_stores` — id, nome, endereco, horario, tem_salao bool, aceita_retirada bool

GRANTs para `authenticated` e `service_role`, RLS ativa, leitura pública via `anon` apenas onde necessário.

Seed com o conteúdo atual de `knowledge.ts` **e preenchendo endereços/horários reais das 4 lojas** — isso sozinho elimina boa parte dos "vou confirmar com a equipe".

#### 2. Busca por `pg_trgm` (já instalado)

As tools `consultar_prato` e `consultar_faq` passam a consultar o banco com similaridade trigram em vez do `includes()` atual. Tolera erro de digitação e acento sem embeddings.

```text
"parmegana de frango" → trigram → Parmegiana de Frango ✓
```

#### 3. UI de administração

Seção em Configurações: **Base de Conhecimento da Giana**.
- CRUD de pratos, FAQs e dados das lojas.
- Toggle `is_active`.
- Cache curto na edge function (60s) para não consultar o banco a cada mensagem.

Editar um prato ou FAQ passa a refletir na Giana sem deploy — que era o objetivo original.

#### 4. Enriquecer o contexto do cliente

`lookupReturningCustomer` já traz as conversas anteriores. Melhorias:
- Resumir em bloco compacto: nome conhecido, nº de atendimentos, último assunto, se houve chamado aberto não resolvido, reservas anteriores.
- Injetar esse bloco no system prompt.
- Regra explícita no prompt: não repetir perguntas já respondidas em conversas anteriores.

#### 5. Manter intacto

- Hard-guards de preço e peso (`sanitizeAssistantText`, `detectFactViolation`).
- Pesos canônicos da parmegiana permanecem hardcoded — são regra de negócio imutável, não conteúdo editável.
- Tools de reserva e problema de pedido.

### Quando revisitar o RAG

Gatilhos concretos para reabrir a discussão:
- Documentos internos longos (manuais, políticas, contratos) precisarem ser consultados pela Giana — **este é o único caso onde RAG é claramente superior desde o dia 1**.
- Cardápio ultrapassar ~100 itens com variações por loja.
- Histórico passar de alguns milhares de conversas e você quiser "casos similares resolvidos".

Nesse momento, a Fase 0 já deixa o terreno pronto: o conhecimento estará em tabelas, e adicionar uma coluna `embedding` + índice HNSW é incremental, não uma reescrita.

### Comparativo de esforço

| Abordagem | Complexidade | Resolve editar sem deploy | Resolve contexto do cliente | Resolve endereços faltando |
|---|---|---|---|---|
| Fase 0 (proposta) | Baixa | Sim | Sim | Sim |
| RAG completo | Alta | Sim | Sim | Sim, mas por tabela, não por vetor |

O RAG entrega o mesmo resultado nessa escala, com muito mais peça móvel para manter.

### Próximos passos se aprovar

1. Migration: criar as três tabelas com GRANTs, RLS e índices trigram.
2. Seed a partir de `knowledge.ts` + coletar endereços e horários reais das 4 lojas com você.
3. Refatorar as tools da edge function para ler do banco com cache.
4. Construir a UI de administração em Configurações.
5. Enriquecer o bloco de contexto do cliente no system prompt.
6. Rodar os testes de regressão existentes (`index.test.ts`) para garantir que preço e peso continuam protegidos.

Preciso de você no passo 2: os endereços e horários de funcionamento de Asa Norte, Asa Sul, Águas Claras e Lago Sul.