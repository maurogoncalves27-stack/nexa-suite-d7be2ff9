# Migrar dados do NEXA original → NEXA Suite (este remix)

## Direção

```
ORIGEM (leitura):  Projeto "NEXA"          → Supabase xmswsrhfofwhwtykjqef
DESTINO (escrita): Este remix "NEXA Suite" → Supabase ixjgmerxxakdkfdzgumy
```

A edge function `migrate-to-nexa` que já existe aqui está **invertida** (lê deste projeto, escreve no outro). Vou virar a direção: ela passa a ler do NEXA original e escrever aqui.

## Passos

### 1. Pedir 1 secret novo
Preciso da `service_role key` do projeto NEXA original (Settings → API do projeto NEXA na sua conta Lovable). Vou guardá-la como **`SOURCE_NEXA_SERVICE_ROLE_KEY`**. A URL de origem fica fixa no código (`https://xmswsrhfofwhwtykjqef.supabase.co`).

### 2. Reescrever o edge function `migrate-to-nexa`
- `sourceClient` aponta pra `SOURCE_NEXA_URL` + `SOURCE_NEXA_SERVICE_ROLE_KEY`.
- `destClient` usa `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` locais (injetados aqui).
- Mantém: descoberta via `information_schema`, ordenação topológica por FK, `SKIP_PREFIXES` (pdv_, pos_, saipos_…), batch por `startIdx`/`count`, modos `plan`/`triggers`/`full`/`dryRun`.
- Mantém: triggers off no destino antes de escrever, on no final.

### 3. Ajustar `/admin/migrate-nexa`
- Textos atualizados (puxa do NEXA original).
- Fluxo: **Plan → Dry-run → Migração completa em lotes** com progresso por tabela.

### 4. Tabelas que NÃO migram
- Prefixos: `pdv_`, `pos_`, `saipos_`, `_migration`, `migration_`
- Exatas: `payroll_xml_history`, `schema_migrations`
- Schemas do Supabase (`auth.*`, `storage.*`) — fora de escopo.

### 5. FKs pra `auth.users`
`user_roles`, `user_signatures`, `payroll_edit_locks`, `employees.user_id` etc. dependem de users existirem aqui. Como auth **não migra automaticamente** entre projetos:
- Migro as linhas mesmo assim; falhas de FK são reportadas por tabela.
- Gero uma lista de e-mails do NEXA original que precisam recriação aqui → **fase separada**, depois desta.

### 6. Execução
1. Você adiciona o secret quando eu pedir.
2. Deploy automático.
3. Você abre `/admin/migrate-nexa` → **Plan** (lista 233 tabelas) → **Migração completa** (lotes ~8/chamada, ~5 min).
4. Painel mostra `read/written/errors` por tabela.

### 7. Fora deste plano
- Migrar `auth.users` (usuários/senhas) → fase separada.
- Migrar arquivos de Storage (PDFs em `employee_documents`) → fase separada.
- Secrets/edge functions do projeto antigo → manual.

## Detalhes técnicos
- Arquivos: `supabase/functions/migrate-to-nexa/index.ts` e `src/pages/admin/MigrateNexa.tsx`.
- Leitura paginada 1000 em 1000 com `range()`.
- Escrita `upsert(rows, { onConflict: 'id' })` em chunks de 500.
- Triggers controladas via RPC `_migration_set_triggers(state text)` (já existe aqui).

Confirma que pode prosseguir e eu já peço o secret.