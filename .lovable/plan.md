# Migração de dados para o projeto NEXA

## Objetivo
Copiar todos os dados deste projeto (origem) para o projeto NEXA (destino), preservando IDs e respeitando dependências entre tabelas.

## O que será migrado
Todas as tabelas do schema `public`, **exceto**:
- `pdv_*` (PDV novo — destino vai começar limpo)
- `pos_*`, `saipos_*` (Saipos legado descontinuado)
- `payroll_xml_history` (log local)
- Tabelas que começam com `_` ou `migration_*` (internas)

Buckets de Storage e usuários (`auth.users`) **não** são migrados — o NEXA fará seu próprio onboarding de auth.

## Como funciona

1. **Edge function `migrate-to-nexa`** (one-shot, removível depois)
   - Lê do projeto atual via service_role local
   - Escreve no NEXA via `NEXA_SUITE_URL` + `NEXA_SUITE_SERVICE_ROLE_KEY` (já configurados)
   - Faz upsert por `id` (idempotente — pode rodar várias vezes)

2. **Ordem de carga**
   - Descobre dependências FK via `pg_catalog` no destino
   - Ordena tabelas topologicamente (pais antes de filhos)
   - Fallback: lista manual de prioridades (stores, brands, employees, suppliers, products, recipes, etc.)

3. **Paginação e chunks**
   - Lê 1000 linhas por vez da origem
   - Grava em chunks de 500 no destino
   - Continua em caso de erro por tabela (não aborta tudo)

4. **Modos de execução** (via query param)
   - `?mode=plan` — só lista o que será copiado, contagens por tabela, sem escrever
   - `?mode=tables&only=stores,employees` — copia só tabelas específicas
   - `?mode=full` — copia tudo na ordem topológica
   - `?dry=1` — lê tudo mas não escreve

5. **UI mínima**
   - Página oculta `/admin/migrate-nexa` (só super-user) com:
     - Botão "Listar tabelas" (mode=plan)
     - Botão "Copiar selecionadas"
     - Botão "Migração completa"
     - Log em tempo real do retorno

## Riscos e mitigações
- **FKs faltando**: rodar em ordem topológica + retry no fim para o que falhou
- **RLS no destino**: service_role bypassa RLS, então não bloqueia
- **Triggers no destino**: vão disparar (ex: auto-gerar PDFs). Desabilitamos temporariamente via `ALTER TABLE ... DISABLE TRIGGER USER` antes da carga e reabilitamos no fim — feito via RPC no destino.
- **Volume grande**: edge functions têm timeout. Vamos dividir em chamadas por grupo de tabelas se necessário.

## Detalhes técnicos
- Cliente Supabase com `auth.persistSession: false`
- Função RPC nova no destino: `_migration_list_tables()` e `_migration_set_triggers(enable bool)`
- Tipos TS não regenerados (função one-shot, será deletada)

## Entregáveis
- `supabase/functions/migrate-to-nexa/index.ts`
- Migration no destino com RPCs auxiliares (você roda manualmente no NEXA via chat de lá, eu te entrego o SQL)
- Página `src/pages/admin/MigrateNexa.tsx` + rota no AppLayout
- Atualização de `PAGE_TITLES`

## O que vou pedir para você fazer
1. Aprovar este plano
2. Depois que eu entregar, ir no projeto NEXA, colar um SQL pequeno (vou te mandar) que cria 2 funções auxiliares lá
3. Voltar aqui e abrir `/admin/migrate-nexa` → primeiro botão "Listar" pra confirmar contagens, depois "Migração completa"
