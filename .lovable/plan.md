## Objetivo

Trocar a avaliação atual (critérios globais iguais para todo mundo, nota 0-10) por uma **avaliação por competência do cargo**, em escala 1 a 5 com níveis descritos, feita pelo gestor, que alimenta diretamente os critérios de promoção do Plano de Carreira (PCCS).

## Como funciona hoje (verificado)

- `evaluation_criteria` guarda critérios **globais** com peso (mais o critério automático "Disciplina"), lançados em `evaluation_scores` por avaliação em `evaluations` (nota final 0-10 + bônus por ponto).
- O PCCS já tem `position_competencies` (competência por cargo, tipo `technical`/`behavioral`, `is_required`) — hoje só descritivas, **sem nota**.
- `promotion_criteria` já exige `min_evaluation_score`, mas lê a nota genérica, não a competência.

Ou seja: a estrutura de competências por cargo existe e está populada, mas está desconectada da avaliação.

## O que será construído

### 1. Escala de proficiência 1-5 (fixa)

| Nota | Rótulo | Significado |
|---|---|---|
| 1 | Não atende | Não demonstra a competência |
| 2 | Em desenvolvimento | Demonstra parcialmente, precisa de suporte |
| 3 | Atende | Entrega o esperado para o cargo |
| 4 | Supera | Entrega acima do esperado |
| 5 | Referência | É referência e ensina os outros |

Cada competência pode ter descritores próprios opcionais (o que é "3" para aquela competência).

### 2. Avaliação por competência

- Ao avaliar um colaborador, o sistema carrega **as competências do cargo dele** (de `position_competencies`), separadas em Técnicas e Comportamentais.
- Gestor lança 1-5 em cada uma (ou "Não se aplica"), com campo de comentário por competência obrigatório quando a nota for 1, 2 ou 5.
- Peso por competência: `is_required` pesa mais que opcional (padrão 2x, configurável).
- Nota final = média ponderada convertida para 0-10 (para preservar bônus e históricos), exibindo também a média 1-5.
- O critério automático **Disciplina** (infrações) continua entrando na nota final.

### 3. Resultado e vínculo com o PCCS

- Tela de resultado com: média geral, radar Técnicas x Comportamentais, lista de competências abaixo de 3 (gaps).
- Botão **"Gerar PDI a partir dos gaps"**: cria itens em `development_plans` já com a competência, cargo-alvo e responsável.
- `promotion_criteria` ganha duas exigências novas: nota mínima por competência (ex.: nenhuma obrigatória abaixo de 3) e média mínima na escala 1-5. A tela "Elegíveis Agora" passa a mostrar exatamente qual competência está travando a promoção.
- Histórico: evolução da nota de cada competência ciclo a ciclo no perfil do colaborador.

### 4. Migração do modelo antigo

- Avaliações já lançadas ficam intactas e visíveis (modo legado, somente leitura).
- Critérios globais atuais são desativados; o cálculo de bônus passa a usar a nota nova convertida em 0-10, mantendo `bonus_value_per_point` como está.
- Cargos sem competências cadastradas caem num conjunto padrão (5 comportamentais) até serem configurados, com aviso na tela.

## Detalhes técnicos

Novas tabelas:
- `competency_scale_levels` — os 5 níveis com rótulo e descrição (editável).
- `evaluation_competency_scores` — `evaluation_id`, `position_competency_id`, `score` (1-5), `not_applicable`, `comment`.
- Colunas novas: `position_competencies.weight`, `.level_descriptors` (jsonb); `evaluations.competency_avg`; `promotion_criteria.min_competency_score`, `.no_required_below`.

Todas as tabelas em `public` com GRANT + RLS (leitura para o próprio colaborador e gestor/RH/admin; escrita só gestor/RH/admin).

Frontend:
- Novo `CompetencyEvaluationForm.tsx` substituindo o lançamento de notas em `PerformancePanel.tsx`.
- `CompetenciesPanel.tsx` (PCCS) ganha peso e descritores por nível.
- `EligibilityPanel.tsx` e `PromotionCriteriaPanel.tsx` passam a usar os novos campos.
- Aba de resultado por competência no perfil do colaborador e na Área do Colaborador (somente leitura da própria avaliação).
- Tudo mobile-first e com tokens do design system.

## Fora do escopo

Autoavaliação, avaliação por pares e etapa de calibração do RH — o fluxo continua sendo apenas o gestor lançando as notas.
