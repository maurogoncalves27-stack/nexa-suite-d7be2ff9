# Criar super-usuário MAURO SOUZA neste projeto

## Contexto

Este projeto (Supabase ref `ixjgmerxxakdkfdzgumy`) está em estado novo — o usuário `maurogoncalves27@gmail.com` ainda não existe em `auth.users`. A memória do projeto define que o **único** super-usuário é o UUID fixo `ec5e52b2-a4c3-46c7-8d11-a5b6cf406866`, já presente em:

- `src/hooks/useAuth.tsx` → `SUPER_USER_IDS`
- função SQL `public.is_super_user` (provavelmente já existe no banco daqui)

Se eu criar o login pelo fluxo normal, o Supabase gera um UUID **novo** e o usuário não vai ser reconhecido como super-usuário sem editar a memória/código em vários lugares. Solução correta: criar o auth user **com esse UUID exato**.

## Passos

1. **Edge function `bootstrap-super-user`** (one-shot, sem JWT, com guarda):
   - Aceita um token simples no body (`secret`) que eu defino e te passo — evita que qualquer um chame.
   - Usa `service_role` + `admin.auth.admin.createUser({ id: 'ec5e52b2-...', email, password, email_confirm: true })`.
   - Se o e-mail já existir, faz `updateUserById` para resetar senha e confirmar.
   - Faz `upsert` em `public.user_roles` com `role='admin'` e `role='manager'` para o mesmo `user_id` (defesa em profundidade — o super-user já bypassa, mas garante consistência caso o flag falhe).

2. **Garantir função `is_super_user` no banco** (via migration):
   - Verifico se `public.is_super_user(uuid)` já existe; se não, crio retornando `_user_id = 'ec5e52b2-a4c3-46c7-8d11-a5b6cf406866'`.
   - Garante GRANT execute para `authenticated`.

3. **Você chama a função uma vez** (eu te passo o snippet pronto pra colar no console do navegador, ou rodo via `supabase.functions.invoke` em um botão temporário). Após o sucesso, removo a edge function no próximo turno para não deixar back door.

4. **Credenciais finais:**
   - E-mail: `maurogoncalves27@gmail.com`
   - Senha: `Senha@123`
   - UUID: `ec5e52b2-a4c3-46c7-8d11-a5b6cf406866` (compatível com a memória — nada precisa ser editado em código)

## O que NÃO vou fazer

- Não vou alterar `SUPER_USER_IDS` nem `is_super_user` para adicionar novos IDs — o UUID fixo já cobre.
- Não vou habilitar auto-confirm de e-mail global (só confirmo este usuário via admin API).
- Não vou tocar em nada de iFood/PDV/folha.

## Confirma?

Posso seguir? Se sim, na execução te entrego:
- a edge function pronta;
- o comando exato pra disparar (1 linha no console do navegador em `/auth`);
- depois removo a função.
