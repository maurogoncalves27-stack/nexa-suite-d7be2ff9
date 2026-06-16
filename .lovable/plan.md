## O que descobri comparando com a demo oficial

Repo correto: `adminti2/Integracao-PayGoWeb-CSharp` (referência Setis em C#/WPF, é o que a Setis manda pro processo de homologação).

Olhei `PDV/MainWindow.xaml.cs`, `Muxx.Lib/Services/Fluxos.cs` e `Muxx.UI/Controls/Captura*Control.xaml`. A diferença de filosofia entre a demo e a nossa implementação é grande — não é só ajuste de parâmetro:

### 1) ADMIN é IGUAL a uma venda — não recebe configuração

```csharp
private async void Admin_Click(...) => await NewTransacExecute(PWOPER.PWOPER_ADMIN);
```

E `NewTransacExecute` para ADMIN ou SALE **manda exatamente os mesmos parâmetros**:

```csharp
Fluxos.ParamsAdd(PWINFO_AUTNAME, "PDV");
Fluxos.ParamsAdd(PWINFO_AUTVER, "1.0.0.0");
Fluxos.ParamsAdd(PWINFO_AUTDEV, "PayGo");
Fluxos.ParamsAdd(PWINFO_AUTCAP, DSP_CHECKOUT + DSP_QRCODE);
Fluxos.ParamsAdd(PWINFO_DSPQRPREF, EXIBE_CHECKOUT);
// SEM cpfCnpj, SEM pontoDeCaptura, SEM ambiente, SEM pinpadPort, SEM senhaTecnica.
```

CPFCNPJ/PontoDeCaptura/AmbienteCPAY são **environment variables** lidas pela DLL no `PW_iInit` — não vão como params da transação.

### 2) Fluxo de captura interativo é OBRIGATÓRIO

Quando a DLL emite `PWDAT_MENU`, `PWDAT_TYPED` ou `PWDAT_USERAUTH` (senha técnica), a demo abre uma **janela WPF na tela do PC** (`CapturaMenuControl`, `CapturaDigitadaControl`) e **o operador escolhe/digita ali**. Nada é pré-preenchido.

Na nossa bridge (`electron-acbr/scripts/paygo-bridge.ps1`):
- `_paygoMenuChoice` é pré-setado pelo payload → ninguém vê o menu na tela
- `_senhaTecnica = "314159"` é injetado automaticamente em `AddTypedValue` → operador nunca vê o prompt "Digite a senha técnica"
- `respondAdm()` no agente literalmente **lança erro** dizendo "fluxo interativo não suportado"

Por isso o passo 12 "Teste de Comunicação" termina com "Operação cancelada" — a DLL pede um prompt que o operador deveria responder na tela e nossa bridge ou responde com valor errado ou já abortou.

### 3) Não existe `PWOPER_INSTALL` na demo oficial

O botão "Instal" da demo só **roda o instalador do PayGo Windows** (`SetupPayGo005.001.030.000_Update.exe`) com env vars setadas. Não chama `PW_iNewTransac(PWOPER_INSTALL)`. Nossa rota `/tef/install` e a função `instalarPdc()` estão fora do contrato oficial — por isso "Configuração" parece não funcionar: estamos chamando uma operação que a Setis não documenta nesse formato.

### 4) Tratamento de pendência

Demo, logo após `FluxoPrincipal`:
```csharp
if (Fluxos.PossuiPendencia()) Fluxos.FluxoConfirmacaoPendencia(PWCNF_CNF_AUTO);
```
Nosso bridge não faz esse passo no admin → pendência fica presa → próxima operação dá "ERRO DE AUTENTICACAO DO PONTO DE CAPTURA".

---

## Plano de correção (alinhar à demo oficial)

### A. `electron-acbr/scripts/paygo-bridge.ps1` — refatorar fluxo ADMIN

1. **Tirar pré-preenchimento de menu/senha no ADMIN.** Para `PWOPER_ADMIN`, **não** consumir `_paygoMenuChoice` nem `_senhaTecnica`. Esses só servem ao SALE (onde o menu da adquirente é decidido pela automação).
2. **Implementar captura interativa real.** Quando recebermos `PWDAT_MENU`, `PWDAT_TYPED`, `PWDAT_BARCODE` ou `PWDAT_USERAUTH` durante o admin:
   - Emitir evento `CAPTURE_REQUEST` via stdout (`{ id, event: { type:"CAPTURE", identificador, tipo, prompt, options, tamMin, tamMax, mascara, ocultar } }`).
   - **Bloquear** o loop C# até receber `CAPTURE_RESPONSE` (linha extra via stdin: `{ id, action:"capture_response", identificador, value }`).
   - Chamar `PW_iAddParam` com o valor que o operador digitou e seguir.
3. **Confirmar pendência após admin.** Antes de chamar `collectReceipts`, se `PW_iGetResult(PWINFO_CNFREQ) != 0`, chamar `PW_iConfirmation(PWCNF_CNF_AUTO)` — exatamente o que o `FluxoConfirmacaoPendencia` da demo faz.
4. **Manter SALE como está** (não pede senha técnica, fluxo automático). Só ADMIN precisa do modo interativo.

### B. `electron-acbr/acbr-tefd.cjs` — habilitar respond/canal interativo

1. `administrativoAsync({ ... })`:
   - **Parar de mandar** `cpfCnpj`, `pontoDeCaptura`, `ambiente`, `usePinpad`, `pinpadPort`, `senhaTecnica`, `paygoMenuChoice` (admin não usa nenhum).
   - Quando o bridge emitir um evento `CAPTURE`, gravar em `admStatus.pendingCaptures` (formato que o front já espera — esse pedaço já existe na UI, vide `PaygoAdmCapture` em `paygoAdapter.ts`).
2. `respondAdm(responses)`: parar de lançar erro. Enviar uma linha `{ id: pendingSaleId, action:"capture_response", identificador, value }` no stdin do host, que o bridge consome e injeta no `PW_iAddParam`.
3. Garantir confirmação automática de pendência ao final do admin (espelhar item A3 acima — caso a confirmação seja feita no bridge, aqui basta logar).

### C. `src/components/tef-paygo/TefPinpadSetupCard.tsx` — UI

A UI já está quase pronta para o fluxo interativo (variáveis `captures`, `submitMenuOption`, `submitTypedAll`, `cancelCapture`, modal de captura). Mexer no mínimo:
1. Remover botão/lógica que dispara `paygoInstalarPdc` ("Configurar (Instalar PdC)") — não existe na demo oficial. No lugar, manter só "**Abrir menu ADM**" e adicionar texto curto: *"Instalação do PdC é feita uma única vez pelo instalador do PayGo Windows (modo DEMO). Aqui você só roda o menu administrativo do pinpad."*
2. Garantir que o polling de `/tef/admin/status` reage a `pendingCaptures` (já reage — confirmar que continua funcionando após a refatoração do bridge).

### D. `src/lib/tef/paygoAdapter.ts` + `electron-acbr/server.cjs`

1. `paygoInstalarPdc`, rota `/tef/install`, função `instalarPdc()` → marcar como **deprecated** (não remover ainda pra não quebrar nada que talvez chame; mas parar de usar na UI).
2. Nenhuma mudança de schema na rota `/tef/admin/respond` (a UI já chama `paygoAdmRespond(url, [{ identificador, value }])`).

### E. Versão

`electron-acbr/package.json` → `1.5.12`. `src/pages/TefPaygoSetup.tsx` → `AGENT_VERSION`/`AGENT_EXE_URL` → `1.5.12`.

### F. Memória

Atualizar `.lovable/memories/features/tef-paygo-csharp-alignment.md` (se existir) ou criar uma nota curta lembrando: "ADMIN não recebe params de configuração; fluxo PWDAT_MENU/TYPED/USERAUTH é sempre interativo via UI no PC; install programático foi removido — usar PayGo Windows + env vars".

---

## Fora de escopo

- Bridge para SALE (PIX/crédito/débito) — segue funcionando com auto-resposta como hoje.
- iFood, NFC-e, Totem, qualquer coisa não-TEF.
- Tradução do Fluxos.cs inteiro pra PowerShell — só portamos as 3 funções de captura interativa que faltam (Menu/Typed/UserAuth).

## Como validar depois do rebuild

1. `git pull` + `npm run dist` em `electron-acbr/` → reinstalar 1.5.12.
2. Em `/configuracoes/tef-paygo`, clicar "Abrir menu ADM". O pinpad mostra o menu. Escolher manualmente "1 Manutenção" → "2 Teste de Comunicação".
3. **Na tela do PC** deve aparecer um modal pedindo a senha técnica (não mais auto-preenchida). Operador digita `314159` → enviar.
4. Pinpad conclui o teste e a UI mostra resultado/comprovante. Sem mais "operação cancelada" silenciosa.
