# Totem com PayGo e Payer chaveáveis (nunca simultâneos)

## Respostas às dúvidas (verificado no código)

**1. Dá para ter os dois sem conflito?** Sim, desde que **só um tenha o pinpad aberto por vez**. Instalados juntos não brigam; o que é exclusivo é a **posse da porta do pinpad** e a **porta de rede do agente local**.

Dois pontos de choque hoje:
- `electron-acbr/server.cjs` já serve **as duas famílias de rotas no mesmo agente** (PayGo via `acbr-tefd.cjs` e `/payer/*` via `payer/routes.cjs`), em HTTP 3030 / HTTPS 3031.
- `electron-totem/payer/agent.cjs` sobe **outro** agente Payer também na **3031**. Ele cede quando a porta já está ocupada (`portInUse`), mas isso depende da ordem de boot — não é regra explícita.

**2. Número lógico fica no pinpad ou no sistema?** **No sistema, nos dois casos.**
- **PayGo:** o ponto de captura (PdC) fica gravado na instalação do PayGo na máquina, não no pinpad. O pinpad guarda só tabelas e chaves das adquirentes. Trocar pinpad não perde o PdC; formatar/reinstalar o totem perde.
- **Payer:** idem — o cadastro/login de terminal vive no Checkout Payer local (:6060).
- Consequência: os dois números lógicos convivem no mesmo totem sem se sobrescrever. O que não convive é o pinpad aberto pelos dois ao mesmo tempo — e, ao chavear, o novo TEF baixa suas tabelas na primeira transação (primeira venda depois da troca é mais lenta).

**3. DLL PayGo em produção no totem.** Confirmado e é um problema hoje: `electron-acbr/acbr-tefd.cjs:43` tem `FORCED_PAYGO_DLL_PATH` apontando para o caminho de desenvolvimento `C:\ProjetoMauro\...\x64\PGWebLib.dll`. O caminho de produção `C:\Program Files (x86)\PayGo\PGWebLib\x64\PGWebLib.dll` existe na lista de candidatos (linha 46) e já é o default do bridge (`paygo-bridge.ps1:6-7`), mas o forçado tem precedência. No totem de produção, o forçado precisa sair do caminho.

**4. Recomendação assertiva:** chaveamento **por configuração de loja no banco**, com **encerramento explícito da sessão do provider anterior** antes de abrir a do novo. Nunca decidir por tentativa/erro em runtime.

## O que será feito

### 1. Um agente só, duas famílias de rotas
- `electron-totem/payer/agent.cjs`: se a 3031 já responde `/health` de um agente NEXA, não sobe nada e registra quem é o dono; se responde algo que não é NEXA, falha com erro claro no diagnóstico em vez de seguir silencioso.
- `/health` passa a informar qual provider está **ativo** e quais estão **instalados**.

### 2. Resolução da DLL PayGo pronta para produção
- `FORCED_PAYGO_DLL_PATH` deixa de ser constante fixa: vira opt-in por variável de ambiente (`PAYGO_DLL_PATH`), usada só na máquina de desenvolvimento.
- Sem essa variável, vale a ordem de candidatos, com `C:\Program Files (x86)\PayGo\PGWebLib\x64\PGWebLib.dll` em primeiro lugar, e `WorkingDir` sempre na pasta da DLL (comportamento já esperado pela PGWebLib).
- O diagnóstico mostra **qual DLL foi carregada** e de onde, para conferir no totem em 2 segundos.
- Isso toca `electron-acbr/**`, que está congelado: é só **resolução de caminho**, sem mexer no fluxo transacional homologado — peço sua confirmação expressa antes de aplicar.

### 3. Provider ativo é decisão do banco
`pdv_tef_config.provider` (já lido por `src/lib/tef/index.ts`) segue como fonte única. Troca sem reinstalar nada:
- Tela de TEF do totem/loja com seletor **PayGo / Payer / Mock**, badge do provider em uso e último diagnóstico.
- Ao salvar, o front manda o agente **encerrar a sessão do provider anterior** (logoff Payer / finalizar sessão PayGo) e só então marca o novo como ativo.

### 4. Trava de exclusividade no agente
Estado `activeProvider` persistido em disco:
- Pagamento com provider diferente do ativo → o agente desliga o anterior, assume o novo e responde (troca serializada, uma por vez).
- Duas requisições concorrentes de providers diferentes → a segunda recebe erro explícito "pinpad em uso por PayGo/Payer" em vez de travar o equipamento.

### 5. Diagnóstico antes de vender
Um botão por provider mostrando: agente respondendo, DLL PayGo encontrada (caminho) + PdC ativado, Payer respondendo em :6060 e logado, pinpad detectado e de quem é a posse agora.

### 6. Procedimento operacional de troca (documentado)
Seção nova em `electron-totem/INSTALL-PAYER.md`: fechar venda em aberto → trocar provider na tela → rodar diagnóstico → fazer **uma venda de teste de R$ 0,01 e cancelar** (força o download de tabelas do novo TEF fora do pico).

## Restrições respeitadas
Nada que altere o **fluxo de transação** homologado de PayGo ou Payer. As mudanças ficam em: orquestração do agente (start/stop, porta, provider ativo), resolução do caminho da DLL, UI de configuração/diagnóstico e documentação. Qualquer necessidade de tocar no fluxo homologado, eu paro e peço confirmação expressa.

## Detalhes técnicos
- Arquivos previstos: `electron-totem/payer/agent.cjs`, `electron-totem/main.cjs`, `electron-acbr/acbr-tefd.cjs` (só a resolução de DLL, linhas 43-49), UI de chaveamento reaproveitando `src/pages/TefPayerSetup.tsx`, `electron-totem/INSTALL-PAYER.md`.
- Sem migração de schema: `pdv_tef_config.provider` já aceita `paygo` / `payer` / `mock`.
- Bitness: com o bridge PowerShell + C# (`paygo-bridge.ps1`), a PGWebLib x64 é carregada pelo host C#, então o empacotamento do Electron não precisa acompanhar a arquitetura da DLL.
