# Status da migração NEXA original → NEXA Suite

## Diagnóstico

Acabei de testar a edge function `migrate-to-nexa` no modo `plan` e ela **conecta com sucesso no NEXA original**:

- 233 tabelas listadas
- Dados reais detectados: `employees=42`, `stores=?`, `brands=7`, `employee_documents=543`, `accounts_payable=732`, `inventory_count_items=3457`, etc.
- Conexão com o `SOURCE_NEXA_SERVICE_ROLE_KEY` está OK
- Destino (este projeto): `employees=0`, `stores=0`, `brands=0` — confirmado vazio

**Ou seja: a função está pronta e funcionando, mas a migração de fato ainda não foi disparada** (nenhum log de execução `mode=full` desde o último deploy).

## O que falta

Você precisa abrir a página e clicar o botão. Provavelmente o que aconteceu é que o botão ainda não foi clicado, ou foi clicado mas a página dava erro de JSX que eu corrigi agora há pouco.

### Passos manuais
1. Abrir **/admin/migrate-nexa**
2. Clicar **"Listar tabelas e contagens"** — confirma 233 tabelas
3. Clicar **"Migração completa"** — vai processar lotes de 8 tabelas; ~3-5 min total
4. Acompanhar progresso no painel

## Plano caso queira que eu dispare via curl

Posso disparar a migração inteira via `curl_edge_functions` em loop (lotes de 8) sem você precisar clicar nada, e te mostrar o resumo final com:
- Quantas linhas foram gravadas por tabela
- Quais tabelas falharam (esperado: as que têm FK pra `auth.users` — tipo `user_roles`, `user_signatures`)

Se quiser que eu rode agora, me confirma. Senão, é só clicar o botão da página.