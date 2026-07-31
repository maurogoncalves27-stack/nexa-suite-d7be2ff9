## Objetivo

Gerar um instalador **Nexa Totem (Payer)** pronto para produção: um único `.exe` que já sobe o agente local do Payer, conversa com o Checkout Payer (`:6060`) que já está instalado nos totens, imprime na **Epson TM-T20X** e emite NFC-e pela Focus NFe (nuvem).

**Regra dura:** nada em `electron-acbr/` (PayGo/ACBr) é tocado. O Payer vive só em `electron-totem/`. Os dois instaladores continuam independentes — instala-se um OU outro na máquina.

## O que muda

### 1. Agente Payer dentro do Totem (`electron-totem/`)
- Novo `payer/localhost.cjs` — cópia isolada do adaptador da API Localhost do Payer (status/login, `payment`, `response`, `abort`, `diagnostics`) apontando para `http://127.0.0.1:6060`. Cópia, não import do `electron-acbr` (mantém os projetos desacoplados).
- Novo `payer/agent.cjs` — servidor HTTPS local em `127.0.0.1:3031` (certificado autoassinado gerado no primeiro boot, via `selfsigned`) expondo `/health` e `/payer/*`, exatamente o contrato que o app já consome em `src/lib/tef/payer/`.
- Se a porta 3031 já estiver ocupada, o Totem detecta, não sobe o próprio agente e usa o que já responde. Porta configurável por `NEXA_PAYER_PORT`.
- Sem credenciais no instalador: o Checkout Payer da máquina já fica logado. `diagnostics` só reporta se o Checkout responde; `login` fica como fallback manual.

### 2. Certificado local (`electron-totem/main.cjs`)
- Handler `certificate-error` restrito a `127.0.0.1:3031` — sem isso o `fetch` do renderer para o agente falha pelo certificado autoassinado.
- Iniciar/parar o agente Payer no ciclo de vida do app (junto de `startSitefAgent`, que fica intacto e sem uso quando a loja usa provider `payer`).

### 3. Impressão — Epson TM-T20X
- Ajustar a escolha automática de impressora em `printer:silentPrint` e `printer:printUrl` para priorizar **`TM-T20`/`TM-T20X`**, depois Epson genérica, depois G250/POS, depois a padrão do Windows.
- ESC/POS: a TM-T20X é Epson nativa, então `PrinterTypes.EPSON` e largura 48 colunas (80 mm) já estão corretos em `printer:print` — sem mudança de protocolo.
- CSS do DANFE NFC-e (`printer:printUrl`) permanece **inalterado** (config validada v1.0.17).
- Cadastro em `pdv_printers` de cada loja: `connection_type = usb`, `usb_device_name` = o nome exato da fila do Windows (ex.: `EPSON TM-T20X Receipt`), `printer_model` Epson, `print_role = 'totem'`.

### 4. Empacotamento
- `package.json` do totem: bump para `1.1.0`, `payer/**` em `build.files`, dependência `selfsigned`, mesmo `appId`/`productName` (atualiza a instalação existente sem duplicar).
- Garantir `build/icon.ico` + `build/icon.png` a partir de `icones/nexa_icone.png`.

### 5. Configuração por loja (banco)
- Em `pdv_tef_config`, para as lojas com totem (Asa Sul, Asa Norte, Águas Claras, Lago Sul): `provider = 'payer'`, `agent_url = 'https://127.0.0.1:3031'`, `is_active = true`.
- Fluxo de venda do Totem não muda — ele já roteia pelo `provider`.

### 6. NFC-e
- Nada a fazer: lojas com `nfce_emission_provider = 'focus_nfe'`; o cupom sai da nuvem e é impresso na TM-T20X via `printer:printUrl`.

## Passos para você (build e produção)

1. Eu implemento os itens 1–5 aqui.
2. `git pull` em `C:\Users\Mauro\Documents\GitHub\nexa-suite`.
3. `cd electron-totem && npm install && npm run dist:win` → `release/Nexa Totem Setup 1.1.0.exe`.
4. No totem: desinstalar a versão antiga, instalar a nova como administrador.
5. Validar antes de abrir pro cliente:
   - Checkout Payer aberto e logado; `https://127.0.0.1:3031/health` responde e `/payer/diagnostics` mostra `checkoutReachable: true`.
   - Teste de impressão pela tela de Impressoras (deve sair na TM-T20X).
   - Venda de teste R$ 1,00 no crédito → pinpad → aprovação → senha + cupom fiscal impressos → linha em `pdv_tef_transactions`.
   - Teste de cancelamento/abort no meio da transação.

## Detalhes técnicos

- Contrato do agente (já implementado no front): `GET /health`, `GET /payer/diagnostics`, `POST /payer/login`, `POST /payer/payment` (`wait:false`), `GET /payer/response` (polling 400 ms, timeout 10 min), `POST /payer/abort`.
- Nenhum arquivo de `src/lib/tef/paygo*`, `electron-acbr/**` ou dos scripts PayGo é modificado.
- O agente escuta só em loopback; nada exposto na rede da loja.
