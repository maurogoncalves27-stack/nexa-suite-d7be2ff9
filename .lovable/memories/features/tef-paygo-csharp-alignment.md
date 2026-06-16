---
name: TEF PayGo — alinhamento com demo oficial Setis
description: Como ADMIN/SALE devem chamar PGWebLib espelhando adminti2/Integracao-PayGoWeb-CSharp
type: feature
---

Demo oficial: `https://github.com/adminti2/Integracao-PayGoWeb-CSharp` (PDV/MainWindow.xaml.cs + Muxx.Lib/Services/Fluxos.cs).

Regras obrigatórias:

1) **ADMIN não recebe parâmetros de configuração.** `PW_iNewTransac(PWOPER_ADMIN)` seguido apenas de `AUTNAME/AUTVER/AUTDEV/AUTCAP/DSPQRPREF`. Nada de `MERCHCNPJCPF`, `POSID`, `USINGPINPAD`, `PPCOMMPORT`, `DESTTCPIP`. Esses vêm das env vars `CPFCNPJ`/`PontoDeCaptura`/`AmbienteCPAY` setadas pelo instalador do PayGo Windows.

2) **Captura interativa é obrigatória.** Quando a DLL emite `PWDAT_MENU`/`PWDAT_TYPED`/`PWDAT_USERAUTH` durante ADMIN, o bridge deve emitir evento `CAPTURE` via stdout e BLOQUEAR em `Console.In.ReadLine()` até o agente JS enviar `{ action:"capture_response", identificador, value }` no stdin. Nunca pré-preencher senha técnica nem `paygoMenuChoice` no ADMIN — o operador responde na tela do PC.

3) **Confirmação de pendência.** Após `FluxoExecTransac` no ADMIN, se `PWINFO_PNDREQNUM` está preenchido, chamar `PW_iConfirmation(PWCNF_CNF_AUTO, pndReqNum, pndLocRef, pndExtRef, pndVirtMerch, pndAuthSyst)` para liberar a próxima operação. Sem isso a próxima operação dá "ERRO DE AUTENTICACAO DO PONTO DE CAPTURA".

4) **`PWOPER_INSTALL` programático está fora do contrato Setis.** Instalação do PdC é via instalador do PayGo Windows (modo DEMO) + env vars. `instalarPdc()` e rota `/tef/install` ficaram deprecated; não usar em UI nova.

SALE continua com lógica auto-resposta atual (não interativa) — escopo só do ADMIN.
