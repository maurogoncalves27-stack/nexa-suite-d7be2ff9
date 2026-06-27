## Objetivo
Reorganizar o catálogo de ocorrências para que o relatório aponte **causa-raiz** (não desfecho), permitindo agir sobre o problema antes de virar cancelamento.

## Nova taxonomia proposta

Substituir as 5 categorias atuais (CANCELAMENTO/ENTREGA/RETIRADA/TROCA ITENS/DIVERSOS) por **7 categorias por causa-raiz** + **subcategoria** obrigatória nas genéricas:

| Categoria | O que entra | Exemplos |
|---|---|---|
| **COZINHA / PRODUÇÃO** | Falhas no preparo | Ponto errado da proteína, temperatura baixa, sabor ruim, objeto estranho, item queimado |
| **MONTAGEM / EXPEDIÇÃO** | Erros na hora de fechar o pedido | Faltou item, pouca quantidade, pedido trocado, embalagem violada |
| **ESTOQUE** | Falta de insumo / produto | Sem ingrediente, sem embalagem, item indisponível no cardápio |
| **LOGÍSTICA / ENTREGADOR** | Problemas do motoboy | Não chegou na loja, atrasou, extraviou, trocou pedidos, não encontrou cliente, veículo quebrado |
| **CLIENTE** | Ações ou pedidos do cliente | Desistiu, mudou modalidade (entrega↔retirada), quer WhatsApp, reclamação subjetiva |
| **PAGAMENTO** | Falhas financeiras | Maquininha, Pix, cartão recusado, problema no app |
| **INFRAESTRUTURA / SISTEMA** | Loja parada | Energia, água, internet, gás, totem off, falha iFood/sistema |

### Subcategoria (campo novo)
Onde a ocorrência ainda for ampla, exigir subcategoria. Exemplos:

- **COZINHA → "Problema de qualidade"** → subcategorias: `Temperatura`, `Sabor`, `Apresentação`, `Objeto estranho`, `Ponto da proteína`, `Item queimado`
- **MONTAGEM → "Faltou item"** → subcategorias: `Bebida`, `Acompanhamento`, `Sobremesa`, `Talher/molho`, `Item principal`
- **LOGÍSTICA → "Atraso"** → subcategorias: `Saída da loja`, `Trânsito`, `Entregador parado`

## Mudanças no sistema

### 1. Banco (`occurrences`)
- Adicionar coluna `subcategory text` (nullable, mas obrigatório quando o tipo exige)
- Adicionar coluna `requires_subcategory boolean default false`
- Migrar registros atuais: re-mapear cada `occurrence` existente para a nova `category` (script de migração faz o de/para)
- Manter `category` antigo num campo `legacy_category` por 60 dias para conferência

### 2. UI de registro (`/ocorrencias`)
- Quando o colaborador escolhe uma ocorrência com `requires_subcategory=true`, abre um segundo select obrigatório
- Salvar `subcategory` em `occurrence_alerts` (nova coluna)

### 3. Relatório (`/ocorrencias/relatorio`)
- Adicionar filtro de **subcategoria** ao lado de categoria/loja
- Novo gráfico: **mapa de calor categoria × subcategoria** (ou stacked bar)
- "Top 10 ocorrências" passa a mostrar `ocorrência — subcategoria`
- Card extra: "Top 5 causas-raiz por loja" (cruzamento)

### 4. Configuração
- Tela `/configuracoes/ocorrencias` (nova) para o gestor manter o catálogo: adicionar/editar ocorrência, definir categoria, marcar se exige subcategoria e listar as opções

## De/para sugerido (resumo)
- `CANCELAMENTO / PROBLEMAS COM A QUALIDADE` → COZINHA + subcategoria
- `CANCELAMENTO / FALTOU ITENS / POUCA QUANTIDADE / PEDIDO TROCADO / VIOLADO` → MONTAGEM
- `CANCELAMENTO / MOTOBOY * / ENTREGADOR *` → LOGÍSTICA
- `CANCELAMENTO / CLIENTE PEDE * / TEMPERATURA (reclamação)` → CLIENTE
- `CANCELAMENTO / PROBLEMAS COM O PAGAMENTO` → PAGAMENTO
- `DIVERSOS / LOJA SEM * / TOTEM / FALHA NOS SISTEMAS` → INFRAESTRUTURA/SISTEMA
- `DIVERSOS / NÃO TEM ESTOQUE` → ESTOQUE

## Detalhes técnicos
- Migração SQL: `ALTER TABLE occurrences ADD COLUMN subcategory_options text[], requires_subcategory bool default false, legacy_category text` + `ALTER TABLE occurrence_alerts ADD COLUMN subcategory text`
- UPDATE em lote para preencher novas categorias com base no nome da ocorrência (mapeamento explícito)
- Sem mudança de RLS necessária
- Componente `OccurrencePicker` ganha dependência condicional para mostrar select de subcategoria

## Fora do escopo (agora)
- IA sugerindo causa-raiz automaticamente (pode vir depois usando o histórico já categorizado)
- Integração com avaliações do cliente para cruzar com ocorrências internas
