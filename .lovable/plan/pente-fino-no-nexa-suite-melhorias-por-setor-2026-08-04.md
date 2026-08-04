# Pente fino no NEXA Suite — melhorias por setor

Levantamento feito agora sobre o sistema real: 152 páginas, 131 edge functions, ~9 MB de código em `src`, 176 rotas (157 já com lazy loading), 367 apontamentos do linter do banco, 1 achado de segurança crítico e 2 avisos, e as consultas mais lentas do banco em produção.

Abaixo, o que encontrei e o que proponho — segmentado por setor. Nada é executado antes da sua aprovação; você pode aprovar tudo ou escolher só alguns blocos.

---

## 1. Segurança e acesso (prioridade alta)

O que está confirmado hoje:

- **Tabela `yolo_vouchers_used` gravável por qualquer um.** As políticas de INSERT/UPDATE estão como "sempre verdadeiro" e abertas ao público, ou seja, é possível forjar resgate de voucher/desconto por fora da edge function. Correção: restringir escrita a `service_role`.
- **View com SECURITY DEFINER** (erro do linter): roda com permissão do criador e ignora RLS de quem consulta. Precisa ser identificada e convertida para `security_invoker`.
- **Servidor MCP público sem autenticação**: qualquer pessoa com a URL pode chamar as ferramentas do app. Correção: exigir OAuth ou desativar se não estiver em uso.
- **367 apontamentos do linter**, a maioria "Function Search Path Mutable" (funções sem `search_path` fixo, risco de sequestro de schema) e algumas políticas RLS "sempre verdadeiro" em UPDATE/DELETE/INSERT.

Proposta: uma varredura em lote — corrigir search_path de todas as funções, revisar uma a uma as políticas permissivas (mantendo as intencionais, como catálogo público) e fechar Yolo e MCP.

## 2. Performance (ganho imediato, baixo risco)

Medido no banco de produção:

- `monthly_revenue` filtrado por ano: **4.058 chamadas, 610 ms de média, pico de 2,5 s — 41 minutos acumulados de banco**. É a consulta mais cara do sistema. O problema não é falta de índice (existem 8), é o volume: busca o ano inteiro sem filtro de loja, repetidamente, sem cache.
- `time_clock_entries` por colaborador: 4.106 chamadas, picos de 1,9 s.
- `timesheet_closures` por colaborador: 4.114 chamadas.

Proposta: centralizar faturamento em um hook com cache (React Query com `staleTime`), reduzir colunas trazidas, e criar visões agregadas por loja/mês em vez de trazer linhas cruas. Mesmo tratamento para ponto e fechamentos, que hoje são recarregados a cada montagem de tela.

## 3. Financeiro

- Consolidar as telas de faturamento/DRE/fluxo de caixa sobre a mesma fonte agregada (hoje cada tela refaz a própria consulta).
- Padronizar tratamento de fuso: ainda há risco de "mês anterior aparecendo no filtro" em telas que não passaram pela correção de datas.
- Rateio de despesas compartilhadas (água/luz CD × lojas): estender o modelo de recorrentes para todas as contas rateáveis, não só as já cadastradas.

## 4. RH e folha

- Ponto e fechamento são os maiores consumidores de banco depois do faturamento — paginar e filtrar por período por padrão em vez de carregar histórico completo.
- Fechar a trilha de auditoria: registrar quem alterou rubricas manuais, adiantamentos e diferimentos de desconto (hoje o cálculo existe, o rastro não é uniforme).
- Checklists/escala: consolidar as regras de "atribuído a quem está na escala" numa função única, evitando divergência entre painel do gestor e área do colaborador.

## 5. Operação (PDV, Totem, Garçom, iFood)

- **Não tocar** em TEF, NFC-e/Focus e iFood sem pedido explícito — respeitado no plano.
- Melhorias seguras: unificar mensagens de erro fiscal e TEF numa camada comum de diagnóstico, com log consultável por loja.
- Painel único de saúde operacional: totem online/offline, última venda, última NFC-e, status do pinpad e do provedor ativo por loja.

## 6. Estoque, fichas técnicas e CD

- Área ainda fora de produção, então é o melhor momento para reestruturar: unificar unidades/fatores de conversão, custo de referência e itens de estoque infinito num só modelo.
- Sugestão de abastecimento e cardápio fábrica compartilhando a mesma base de consumo.

## 7. Qualidade de código

- **658 usos de `any`** no frontend — tipar prioritariamente os módulos financeiros e de folha, onde erro silencioso vira valor errado.
- **Praticamente nenhum teste automatizado** (2 arquivos no projeto inteiro). Proposta: começar por testes de cálculo puro (folha, rescisão, VT, CMV, rateio), que são os que mais doem quando quebram.
- ~20 arquivos acima de 40 KB (`PdvNovo.tsx`, `AppSidebar.tsx`, `EmployeeForm.tsx`, painéis de folha e conciliação). Quebrar em componentes menores reduz risco de regressão.
- Hardcodes: já existe o mapa em `/hardcodes` com os pontos catalogados — transformar em fila de execução real, começando pelos que afetam multi-loja.

---

## Ordem sugerida de execução

1. Segurança (Yolo, view SECURITY DEFINER, MCP, search_path em lote)
2. Performance de faturamento e ponto (cache + agregação)
3. Testes dos cálculos financeiros e de folha
4. Tipagem e quebra dos arquivos gigantes
5. Reestruturação de estoque/fichas técnicas
6. Painel de saúde operacional

## Detalhes técnicos

- Correções de banco via migrations: `ALTER FUNCTION ... SET search_path = public`, recriação da view com `security_invoker = true`, substituição das policies `true` por `auth.role() = 'service_role'` em `yolo_vouchers_used`.
- Cache no frontend via React Query já presente no projeto; criar `useMonthlyRevenue` como fonte única e remover consultas diretas duplicadas.
- Agregação por loja/mês em view materializada ou RPC, refrescada por trigger em `monthly_revenue`.
- Testes com Vitest (já disponível), focados em funções puras de `src/lib`.
- Todas as telas novas ou refeitas seguem tokens do design system, cabeçalho padrão e mobile-first.
