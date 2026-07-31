# Nexa Totem — Instalador de produção (Payer + Epson TM-T20X)

Versão: **1.1.0**

## O que o instalador entrega

- App do Totem em modo kiosk (auto-start com o Windows).
- **Agente Payer local** em `https://127.0.0.1:3031`, que faz proxy para o **Checkout Payer** já instalado na máquina (`http://127.0.0.1:6060`).
- Impressão de senha (ESC/POS) e do DANFE NFC-e (HTML) na **Epson TM-T20X**.
- Certificado auto-assinado gerado no primeiro boot em `%APPDATA%\nexa-totem\certs\` e aceito pelo app.

Não há credenciais Payer embutidas: o Checkout do totem já fica logado. `POST /payer/login` existe só como fallback manual.

## Build (máquina do desenvolvedor)

```bat
cd C:\Users\Mauro\Documents\GitHub\nexa-suite\electron-totem
npm install
npm run dist:win
```

Saída: `electron-totem\release\Nexa Totem Setup 1.1.0.exe`

## Instalação no totem

1. Fechar o Nexa Totem antigo e desinstalar pelo Painel de Controle (opcional — o `appId` é o mesmo e atualiza por cima).
2. Rodar o `.exe` **como administrador**.
3. Confirmar que a **Epson TM-T20X** está instalada no Windows e imprimindo pelo teste do driver.
4. Abrir o Checkout Payer e deixá-lo logado (ele precisa estar rodando na porta 6060).
5. Reiniciar a máquina — o Totem sobe sozinho no login.

## Configuração da impressora no sistema

Em Configurações → Impressoras, cadastrar para a loja:

| Campo | Valor |
| --- | --- |
| `connection_type` | `usb` |
| `usb_device_name` | nome exato da fila do Windows (ex.: `EPSON TM-T20X Receipt`) |
| `printer_model` | Epson TM-T20X |
| `print_role` | `totem` |

Se o campo ficar vazio, o app escolhe automaticamente: TM-T20X → Epson → Gertec/POS → impressora padrão.

## Validação antes de liberar ao cliente

- `https://127.0.0.1:3031/health` responde `{ ok: true }`.
- `https://127.0.0.1:3031/payer/diagnostics` mostra `checkoutReachable: true`.
- Teste de impressão pela tela de Impressoras sai na TM-T20X.
- Venda de R$ 1,00 no crédito: pinpad → aprovação → senha + cupom NFC-e impressos → linha em `pdv_tef_transactions`.
- Cancelamento no meio da transação (`abort`) volta o pinpad ao repouso.

## Variáveis de ambiente (opcionais)

| Variável | Padrão | Uso |
| --- | --- | --- |
| `NEXA_PAYER_PORT` | `3031` | Porta do agente Payer |
| `PAYER_BASE_URL` | `http://127.0.0.1:6060` | Endereço do Checkout Payer |
| `PAYER_EMAIL` / `PAYER_PASSWORD` | — | Só para login manual de fallback |

## Configuração TEF por loja (banco)

`pdv_tef_config`: Asa Norte, Águas Claras e Lago Sul estão com `provider = 'payer'` e `agent_url = 'https://127.0.0.1:3031'`.
**Asa Sul** segue com `provider = 'paygo'` (testes do PDV) — a configuração é por loja, então trocar essa linha afeta também o PDV. Avisar antes de virar.

## Observação

Nada em `electron-acbr/` (PayGo/ACBr) é usado por este instalador. Os dois agentes são independentes; se a porta 3031 já estiver ocupada por outro agente, o Totem reutiliza o que estiver respondendo.

---

## Chaveamento PayGo ⇄ Payer (nunca simultâneos)

Os dois TEFs podem ficar **instalados juntos** na mesma máquina. O que **não** pode
é os dois abrirem o pinpad ao mesmo tempo — a porta do pinpad é exclusiva.

### Onde fica o número lógico

| TEF | Número lógico | Guardado em |
| --- | --- | --- |
| PayGo | Ponto de Captura (PdC) | Instalação do PayGo na máquina (`C:\Program Files (x86)\PayGo\`) |
| Payer | Terminal / login | Instalação do Checkout Payer local (`:6060`) |

**Nunca no pinpad.** O pinpad guarda apenas tabelas e chaves das adquirentes.
Trocar o pinpad não perde o número lógico; formatar/reinstalar o totem perde.

### DLL PayGo em produção

O agente resolve a DLL nesta ordem:

1. `PAYGO_DLL_PATH` (env — usar só na máquina de desenvolvimento)
2. `C:\Program Files (x86)\PayGo\PGWebLib\x64\PGWebLib.dll` ← **produção, instalada pelo SetupPayGo**
3. `C:\Program Files (x86)\PayGo\PGWebLib\PGWebLib.dll`
4. `C:\PayGo\PGWebLib\x64\PGWebLib.dll` / `C:\PayGo\PGWebLib\PGWebLib.dll`
5. caminho de desenvolvimento (`C:\ProjetoMauro\...`) — último recurso

O diretório de trabalho é sempre a pasta da DLL (a PGWebLib grava `comms_*.log` ali).
O caminho realmente carregado aparece no card **Chaveamento de TEF** em
`/configuracoes/tef-payer`.

### Como trocar de provider

1. Fechar qualquer venda em aberto no totem.
2. Em `/configuracoes/tef-payer`, card **Chaveamento de TEF**: selecionar a loja,
   escolher `PayGo` ou `Payer` e clicar em **Aplicar chaveamento**.
   O agente encerra a sessão do provider anterior **antes** de assumir o novo e só
   depois `pdv_tef_config.provider` é gravado.
3. Clicar em **Atualizar** e conferir: agente online, provider ativo = o escolhido,
   DLL PayGo encontrada (se PayGo) ou Checkout acessível (se Payer).
4. Fazer **uma venda de teste de R$ 0,01 e cancelar**. Isso força o download das
   tabelas do novo TEF fora do horário de pico — a primeira transação após a troca
   é sempre mais lenta.

### Exclusividade no agente

- O agente guarda o provider ativo em `%APPDATA%\nexa-totem\tef-active-provider.json`.
- Requisição de outro provider → o agente libera o anterior e assume o novo (troca serializada).
- Duas trocas concorrentes → a segunda recebe HTTP `409` com "pinpad em uso", em vez de travar o equipamento.
- Endpoints: `GET/POST /tef/active-provider`, `POST /tef/release`, e `GET /health` (mostra provider ativo + o que está instalado).

### Porta 3031

- Se a porta já responde `/health` de um agente **NEXA** (ACBr ou Totem), o Totem cede e reutiliza.
- Se responde algo que **não** é NEXA, o agente falha com erro explícito no log em vez de seguir em silêncio.
