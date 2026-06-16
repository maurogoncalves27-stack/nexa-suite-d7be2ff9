## Plano: corrigir o botão "Logs" do TEF PayGo

### Problema confirmado
O botão "Logs" em `/configuracoes/tef-paygo` copia o caminho `C:\Program Files (x86)\PayGo\PGWebLib\x64\Log` para o clipboard. Essa pasta está vazia no setup atual. Os logs reais que a Setis precisa receber (`comms_*` e `ppsers_*`) ficam em `C:\PAYGOWEB\Log\` — pasta criada pelo PayGo Windows na instalação padrão.

### Mudança
Arquivo único: `src/pages/TefPaygoSetup.tsx`

- Linha 423: trocar `"C:\\Program Files (x86)\\PayGo\\PGWebLib\\x64\\Log"` por `"C:\\PAYGOWEB\\Log"`.
- Linha 422 (`title`): atualizar o tooltip para refletir o novo caminho ("Caminho oficial dos logs do PayGo Windows (`C:\PAYGOWEB\Log`) — cole no Explorer").

### O que NÃO está incluído neste plano (por escolha sua na decisão anterior)
- Não vou mudar `workDirCandidates` em `electron-acbr/acbr-tefd.cjs`. Os logs do NEXA continuam indo para `%LOCALAPPDATA%\NexaACBr\PayGo\Log\`, e os do PayGo Windows / CommTeste continuam em `C:\PAYGOWEB\Log\`.
- Se mais à frente você quiser unificar tudo em `C:\PAYGOWEB\Log\` (Fix A da auditoria anterior), abrimos um plano próprio.

### Verificação
- Build TypeScript precisa passar (mudança é só uma string).
- Em runtime, ao clicar "Logs", o toast deve mostrar o novo caminho e o clipboard deve conter `C:\PAYGOWEB\Log`.