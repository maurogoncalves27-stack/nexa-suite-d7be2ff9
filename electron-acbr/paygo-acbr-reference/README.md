# PayGo ACBr Reference

Pasta paralela para portar/testar o fluxo PayGoWeb inspirado no ACBr Delphi sem
alterar o agente principal do Nexa.

## Arquivos

- `paygo-acbr-port.ts`: port TypeScript da estrutura ACBr (`PWINFO`, `PWRET`,
  montagem de venda/cancelamento, callbacks e confirmacao).
- `runner.cjs`: runner isolado que sobe o bridge PayGo atual em modo host e
  permite testar a DLL/pinpad por linha de comando.

## Antes de testar

Instale/abra o PayGo Windows em modo DEMO e confirme que a DLL existe em um dos
caminhos padrao:

- `C:\Program Files (x86)\PayGo\PGWebLib\x64\PGWebLib.dll`
- `C:\Program Files (x86)\PayGo\PGWebLib\PGWebLib.dll`
- `C:\PayGo\PGWebLib\x64\PGWebLib.dll`
- `C:\PayGo\PGWebLib\PGWebLib.dll`

Se estiver em outro caminho, passe `--dll`.

## Comandos

Rode a partir desta pasta:

```powershell
cd electron-acbr\paygo-acbr-reference
```

UI local para teste real:

```powershell
start-paygo-panel.cmd
```

Depois abra:

```text
http://localhost:3111
```

Teste direto de comunicacao, sem depender da tela:

```powershell
test-commtest.cmd
```

Manutencao/limpeza antes da configuracao:

```powershell
01-maintenance-clean.cmd
```

Configuracao PayGo no pinpad:

```powershell
02-config-pinpad.cmd
```

Instalacao/ativacao do pinpad depois da configuracao:

```powershell
03-install-pinpad.cmd
```

Fluxo recomendado para um teste limpo:

```text
1. 01-maintenance-clean.cmd
2. 02-config-pinpad.cmd
3. 03-install-pinpad.cmd
4. test-commtest.cmd
5. start-paygo-panel.cmd
```

Use o `.cmd` acima para rodar fora do sandbox do Codex. Se o painel for iniciado
por dentro do Codex, o Windows pode bloquear a abertura do PowerShell/bridge com
`spawn EPERM`, antes de acessar a `PGWebLib.dll`.

Teste de comunicacao:

```powershell
node runner.cjs commtest
```

Manutencao PayGo, igual PWOPER_MAINTENANCE da demo:

```powershell
node runner.cjs maintenance
```

Configuracao PayGo, igual PWOPER_CONFIG da demo:

```powershell
node runner.cjs config
```

Instalacao/ativacao do pinpad:

```powershell
node runner.cjs install --cpf 44932369000108 --pdc 111476 --ambiente DEMO --senha 314159 --pinpad 5
```

Venda debito de R$ 1,00:

```powershell
node runner.cjs sale --amount 1.00 --method debit --sale-id TESTE001
```

Venda credito de R$ 1,00:

```powershell
node runner.cjs sale --amount 1.00 --method credit --installments 1 --sale-id TESTE002
```

Pix demo de R$ 3,00 exibindo QR no checkout/PC:

```powershell
node runner.cjs pix --amount 3.00 --sale-id PIX001 --qr checkout
```

Menu administrativo interativo:

```powershell
node runner.cjs admin
```

Limpar pendencia:

```powershell
node runner.cjs cleanup
```

Se o PayGo pedir uma rede/menu durante venda, informe a escolha:

```powershell
node runner.cjs sale --amount 1.00 --method debit --menu C6
```

Se o PayGo pedir capturas adicionais em fluxo nao interativo:

```powershell
node runner.cjs sale --amount 1.00 --method debit --captures "USERAUTH=314159;TYPED=123"
```

## Observacao

Este runner ainda usa o bridge PowerShell/C# existente como camada nativa. A
refatoracao TypeScript real deve trocar essa camada por uma implementacao de
`PayGoNativePort` quando o fluxo estiver validado.
