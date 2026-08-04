# Mapa de hardcodes no sistema

Transformar o inventário que hoje vive só no documento `docs/HARDCODES.md` numa página viva dentro de Configurações, com solução sugerida e status salvo no banco.

## O que será feito

### 1. Reescanear o código
Varredura atualizada (o documento é de jun/2026 e várias coisas mudaram: CD, Payer em produção, Focus NFe, Totem). Cada item terá: área, arquivo, trecho hardcoded, prioridade (P0–P3) e **solução sugerida** (tabela/config/env alvo).

### 2. Guardar o inventário no banco
Nova tabela `system_hardcodes` com:
- área (Agente TEF, PayGo, Payer, Totem/Lojas, Canais PDV, Infra, Domínios, Listas de lojas, Marcas, Fiscal, Seeds)
- código do item (H1.01…), arquivo, descrição do hardcode
- prioridade, solução sugerida
- status: pendente / em andamento / resolvido / ignorado
- responsável, observação, data de resolução

Acesso: admins e gestores leem; admins editam status/observação.

### 3. Página `/configuracoes/hardcodes`
- Cabeçalho padrão + ícone igual ao item do sidebar.
- Barra de progresso geral e por prioridade (ex.: “P0: 3 de 26 resolvidos”).
- Filtros: área, prioridade, status, busca por arquivo/texto.
- Lista agrupada por área, cada item em card mobile-first mostrando arquivo, o que está fixo, **solução sugerida** e badge de prioridade.
- Clicar abre painel para mudar status, atribuir responsável e escrever nota — salvo no banco na hora.
- Botão “Exportar PDF” do mapa atual (mesmo padrão dos outros relatórios).

### 4. Sincronização com o código
Botão “Recarregar inventário” apenas reaplica a lista-base (seed) sem apagar status já marcados: itens novos entram como pendentes, itens já resolvidos permanecem.

## Detalhes técnicos
- Tabela `public.system_hardcodes` (migration com GRANTs + RLS via `has_role`), seed com os itens do scan.
- Página nova em `src/pages/HardcodesMap.tsx`, rota registrada em `App.tsx`, item no `AppSidebar` (grupo Configurações) e entrada em `PAGE_TITLES` do `AppLayout`.
- Somente tokens do design system para cores/badges.
- `docs/HARDCODES.md` continua existindo como referência e passa a apontar para a página.

## Fora do escopo
Nenhum hardcode será corrigido nesta etapa — o objetivo é mapear e acompanhar. As correções vêm depois, item a item, respeitando os módulos congelados (TEF, iFood, folha/financeiro).
