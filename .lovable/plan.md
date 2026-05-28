## Objetivo
Limpar do histórico do Git os binários/releases antigos sem mexer no app agora, corrigindo os erros que apareceram no Git Bash.

## Plano
1. Confirmar a ferramenta de limpeza no Windows
   - Instalar `git-filter-repo` do jeito compatível com seu ambiente Windows.
   - Validar antes com `git filter-repo --version` para não repetir o erro de comando inexistente.

2. Reexecutar o processo sem sintaxe inválida
   - Remover do terminal as linhas de comentário/copiar apenas comandos puros.
   - Evitar o texto com parênteses no meio do shell, que foi o que gerou o erro `syntax error near unexpected token '('`.

3. Rodar a limpeza do histórico
   - Fazer backup da pasta atual.
   - Executar `git filter-repo` removendo `electron-*/release`, `*.exe` e pastas empacotadas antigas.
   - Manter o commit atual com `.gitignore` preservado para impedir reincidência.

4. Reconectar remoto só se necessário
   - Verificar se o `origin` ainda existe após a limpeza.
   - Só adicionar o remoto novamente se ele tiver sido removido; no seu print ele já existia antes da limpeza falhar.

5. Publicar o histórico limpo
   - Fazer `push --force` do branch principal.
   - Validar com busca por `*.exe` e por diretórios `release` no histórico reescrito.

## Correções dos erros do print
- `pip: command not found`: no Windows, o mais provável é usar `py -m pip ...` em vez de `pip ...`.
- `git: 'filter-repo' is not a git command`: a ferramenta não estava instalada ainda.
- `remote origin already exists`: esse passo só entra depois que a limpeza realmente rodar.
- `syntax error near unexpected token '('`: veio de texto explicativo colado como se fosse comando.

## Detalhes técnicos
- Caminhos a remover do histórico:
  - `electron-totem/release/*`
  - `electron-gestor/release/*`
  - `electron/release/*`
  - `Nexa Totem-win32-*`
  - `*.exe`
- Depois da limpeza, o push precisa ser forçado porque o histórico será reescrito.
- O `.gitignore` já foi ajustado; isso protege o futuro, mas não limpa o passado sozinho.

## Resultado esperado
- Repositório menor no GitHub
- Clones futuros mais leves
- Releases/binários fora do histórico e fora de novos commits