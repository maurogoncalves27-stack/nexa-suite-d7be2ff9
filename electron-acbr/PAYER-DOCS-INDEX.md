# Índice da Documentação Payer

> Compilado em 18/06/2026 a partir de https://docs.payer.com.br/  
> Método: varredura recursiva de links internos a partir da homepage e de `/docs/`.  
> **Páginas lidas com sucesso: 16**

---

## 1. Índice de todas as páginas

| URL | Título |
|-----|--------|
| https://docs.payer.com.br/ | Payer Docs — Solução de documentações (portal) |
| https://docs.payer.com.br/docs/ | Documentação Pública — PAYER (índice) |
| https://docs.payer.com.br/docs/integrations/api-localhost.html | Integração API Localhost |
| https://docs.payer.com.br/docs/integrations/api-gateway.html | Integração API-Gateway Payer |
| https://docs.payer.com.br/docs/integrations/checkout-web.html | Canal de Pagamento Checkout Web |
| https://docs.payer.com.br/docs/integrations/tef-dial.html | Integração TEF-Dial |
| https://docs.payer.com.br/docs/integrations/ecommerce.html | Integração com API E-Commerce |
| https://docs.payer.com.br/docs/integrations/pix-payer.html | Integração com API PIX Payer |
| https://docs.payer.com.br/docs/integrations/authentication.html | Autenticação |
| https://docs.payer.com.br/docs/integrations/convivencia-automacao-com-checkout-payer.html | Convivência Automação × Checkout Payer |
| https://docs.payer.com.br/docs/integrations/preenchimento-nfce.html | Preenchimento do Quadro de Pagamento da NFC-e (Sefaz-RS) |
| https://docs.payer.com.br/docs/integrations/sdk/index.html | Payer Checkout SDK — Guia do Integrador |
| https://docs.payer.com.br/docs/compatible-devices.html | Compatibilidade de Dispositivos Smart POS |
| https://docs.payer.com.br/docs/tutorials/liberacao-firewall.html | Liberação de Acesso à Solução Payer (Firewall) |
| https://docs.payer.com.br/docs/tutorials/gertecbox-ports.html | Guia de Liberação — Gertec Box |
| https://docs.payer.com.br/docs/tutorials/gpos780-disable-lockscreen.html | GPOS780 — Desabilitar Bloqueio de Tela |

---

## 2. Resumo por modalidade de integração

### API Localhost

**O que é:** integração local via HTTP em `http://localhost:6060` entre a automação comercial e o **Checkout Payer** instalado na mesma máquina (Windows) ou no mesmo Smart POS (Android, app-to-app).

**Quando usar:**
- PDV desktop Windows com pinpad conectado ao Checkout Payer
- Smart POS Android com app embarcado falando com o Checkout via HTTP local
- Baixa latência, sem dependência de nuvem para disparar o pagamento físico

**Fluxo:**
1. `POST /Client/login` — autenticar com e-mail/senha do integrador
2. `POST /Client/request` — iniciar comando (`PAYMENT`, `CANCELLMENT`, `ABORT`, `INPUT_CPF`, `INPUT_CNPJ`, `SERVICE`, `send_to_printer`)
3. `GET /Client/response` — polling a cada 250–500 ms até `statusTransaction` ≠ `PENDING`
4. Opcional: `POST /Client/request/abort` para abortar fluxo em andamento
5. `POST /Client/logoff` — encerrar sessão

**Comandos de pagamento:** cartão (crédito/débito/voucher), PIX, dinheiro, carteira digital, links e-commerce (`LINK`, `PIX_LINK`, `GENERIC_LINK`), split, cashback, ordem remota (`remoteOrder` SYNC/ASYNC).

**Resposta:** objeto equivalente ao Gateway (campos `idPayer`, `authorizerId`, comprovantes, `nfce`, etc.).

---

### API Gateway

**O que é:** integração REST na nuvem AWS que envia ordens para terminais com Checkout Payer conectados via WebSocket.

**Quando usar:**
- Automação web/cloud que precisa iniciar pagamento em **Checkout Desktop (Windows)** ou **Checkout POS (Android)**
- Tele-entrega / cobrança remota com fluxo **ASYNC** (ordem em fila para o operador executar no POS)
- Impressão remota, captura de CPF/CNPJ no pinpad, Multi-EC, split

**Fluxo (2 etapas + callback):**
1. Autenticar → obter `IdToken`
2. `POST .../validate-webhook` (ou `validate-print` para impressão)
3. `POST .../create` — executar ordem
4. Receber resultado em `callbackUrl` (webhook HTTPS obrigatório)
5. Complementar com `GET .../order/:correlationId?automationName=...`

**Modos de ordem:**
- `flow: SYNC` — processamento imediato no checkout
- `flow: ASYNC` — ordem em fila para execução posterior no POS

**Terminais alvo:** Desktop, POS, SDK — **não** usar terminal Desktop para Checkout Web (ver seção Checkout Web).

---

### Checkout Web

**O que é:** especialização do API Gateway para gerar **links de pagamento** (`https://web.payer.com.br/checkout/{uuid}?dealer=PAYER`) enviados ao cliente via navegador.

**Quando usar:**
- Cobrança remota por link (WhatsApp, e-mail, SMS)
- Cliente paga com PIX ou cartão de crédito no browser
- Não exige pinpad nem presença física do cliente

**Métodos (`paymentMethod`):**
| Valor | Descrição |
|-------|-----------|
| `GENERIC_LINK` | Cliente escolhe PIX ou cartão no checkout |
| `PIX_LINK` | Link exclusivo PIX |
| `LINK` | Link exclusivo cartão de crédito |

**Subtipos para `LINK`:** `FULL_PAYMENT`, `FINANCED_NO_FEES`, `FINANCED_WITH_FEES`, `RECURRENT` (com `installments`; use `"99"` para recorrência sem fim).

**Importante:**
- Pagamento fica `PENDING` até o cliente concluir
- Link **não expira** (atualmente)
- Requer **terminal Checkout Web** dedicado (`terminalId` específico)
- Adquirentes exemplificativas: Rede, Cielo, Getnet, SafraPay, PagBank

---

### TEF-Dial

**O que é:** protocolo legado por **troca de arquivos** (`C:\Tef-Dial\REQ\IntPos.001` → `C:\Tef-Dial\RESP\`), compatível com SiTef, Auttar, PayGo. **Não é proprietário da Payer** — é interoperabilidade.

**Quando usar:**
- ERP/PDV legado que já fala TEF-Dial por arquivos
- Migração gradual de SiTef/PayGo para Checkout Payer sem reescrever toda a automação

**Modos:**
- **Original:** campo `011-000` define tipo de transação (10=crédito à vista, 20=débito, 26=PIX, etc.)
- **Estendido (recomendado):** campos `730-000` (operação), `731-000` (tipo cartão), `732-000` (financiamento), `749-000` (forma de pagamento)

**Operações suportadas no Checkout Payer:** ATV, ADM, CRT, CNC. **Não suportadas:** CNF, NCN, GCD, VLG, ENF, CCT, CHQ.

**Campos NFC-e (estendido 800-xxx):** `800-000` CNPJ autorizador, `801-000` código bandeira SEFAZ, `802-805` cashback e Multi-EC.

**Dica:** criar arquivo como `IntPos.tmp` e renomear para `IntPos.001` para evitar leitura prematura. Confirmação de recebimento em até 7 s via `IntPos.Sts`.

---

### API E-Commerce

**O que é:** API REST para **cartão digitado** (card-not-present) — pagamento único, recorrente e cancelamento, sem pinpad.

**Quando usar:**
- Cobrança online com dados do cartão digitados no formulário
- Assinaturas/mensalidades com objeto `schedule`
- Cancelamento por `externalReference`

**Não é:** pagamento físico no pinpad nem link de checkout (esses usam Gateway/Checkout Web ou Localhost).

---

### API PIX Payer

**O que é:** API REST dedicada a **PIX** com QR Code Base64 e webhook de confirmação.

**Quando usar:**
- Gerar QR PIX sem passar pelo Checkout Desktop/POS
- Integração puramente server-side (backend gera QR, frontend exibe imagem Base64)

**Diferença do Checkout Web `PIX_LINK`:** PIX Payer é API direta com `paymentString` (QR Base64); Checkout Web gera link navegável.

**Liquidação:** valores creditados na conta PIX da loja; transferência diária às 21h para chave cadastrada no onboarding.

---

### SDK Embedded (adicional)

**O que é:** biblioteca nativa `libpayer_checkout_sdk.so` (Linux ARM/x86) para integração embarcada com pinpad USB, SiTef, NFC-e integrada.

**Quando usar:** terminais Linux embarcados (Raspberry, totens) sem Checkout Desktop. Pinpads Gertec PPC9xx homologados.

**Não é o caso típico do NEXA Electron/Windows** — ver seção 5.

---

## 3. Endpoints e autenticação

### 3.1 Autenticação OAuth (compartilhada: Gateway, E-Commerce, PIX, Checkout Web)

| Finalidade | Método | URL |
|------------|--------|-----|
| Login | `POST` | `https://bk07exvx19.execute-api.us-east-1.amazonaws.com/dev-stage/oauth/login` |

**Body:**
```json
{
  "clientId": "token-id",
  "username": "username@domain.com",
  "password": "user-password"
}
```

**Resposta:** `AuthenticationResult.IdToken` (usar **IdToken**, não AccessToken). Validade: 86400 s (24 h).

**Header obrigatório nas APIs cloud:**
```
Authorization: Bearer <IdToken>
Content-Type: application/json
```

---

### 3.2 API Gateway / Checkout Web

| Finalidade | Método | Endpoint |
|------------|--------|----------|
| Validar ordem de pagamento | `POST` | `https://ms7bi3gsxk.execute-api.us-east-1.amazonaws.com/prod-stage/cloud-notification/validate-webhook` |
| Validar ordem de impressão | `POST` | `https://ms7bi3gsxk.execute-api.us-east-1.amazonaws.com/prod-stage/cloud-notification/validate-print` |
| Executar ordem | `POST` | `https://ms7bi3gsxk.execute-api.us-east-1.amazonaws.com/prod-stage/cloud-notification/create` |
| Consultar status | `GET` | `https://ms7bi3gsxk.execute-api.us-east-1.amazonaws.com/prod-stage/cloud-notification/order/:correlationId?automationName=<nome>` |

**WebSocket (Checkout Desktop conectado):** `wss://44uqdvos0e.execute-api.us-east-1.amazonaws.com`

**Comandos (`data.message.command`):** `PAYMENT`, `CANCELLMENT`, `ADMIN`, `SERVICE`, `INPUT_CPF`, `INPUT_CNPJ`, `ABORT`, `SEND_TO_PRINTER`

**Campos obrigatórios da ordem:** `companyId`, `storeId`, `terminalId`, `automationName`, `correlationId` (UUID v4), `callbackUrl` (HTTPS)

---

### 3.3 API Localhost

| Finalidade | Método | Endpoint |
|------------|--------|----------|
| Login | `POST` | `http://localhost:6060/Client/login` |
| Verificar sessão | `GET` | `http://localhost:6060/Client/login` |
| Logoff | `POST` | `http://localhost:6060/Client/logoff` |
| Iniciar comando | `POST` | `http://localhost:6060/Client/request` |
| Abortar | `POST` | `http://localhost:6060/Client/request/abort` |
| Polling resposta | `GET` | `http://localhost:6060/Client/response` |

**Autenticação local:** e-mail + senha do integrador (criados no App de Gestão Payer). Sem `clientId` OAuth.

---

### 3.4 API E-Commerce

| Finalidade | Método | Endpoint |
|------------|--------|----------|
| Pagamento (único ou recorrente) | `POST` | `https://ms7bi3gsxk.execute-api.us-east-1.amazonaws.com/prod-stage/ecommerce/external/payment` |
| Cancelamento | `POST` | `https://ms7bi3gsxk.execute-api.us-east-1.amazonaws.com/prod-stage/ecommerce/external/cancellation/{externalReference}` |
| Listar agendamentos | `GET` | `https://ms7bi3gsxk.execute-api.us-east-1.amazonaws.com/prod-stage/ecommerce/external/schedules` |
| Manutenção de agendamento | `POST` | `https://ms7bi3gsxk.execute-api.us-east-1.amazonaws.com/prod-stage/ecommerce/external/schedule/{externalReference}/maintenance` |

**Campos obrigatórios:** `accountId`, `companyId`, `storeId`, `terminalId`, `value`, `installments`, `creditInstallmentType`, dados do `card`

---

### 3.5 API PIX Payer

| Finalidade | Método | Endpoint |
|------------|--------|----------|
| Criar ordem PIX | `POST` | `https://ms7bi3gsxk.execute-api.us-east-1.amazonaws.com/prod-stage/payer-pix/external/create` |

**Campos obrigatórios:** `accountId`, `companyId`, `storeId`, `terminalId`, `value`, `callbackUrl`

**Resposta:** `paymentString` (QR Base64), `externalReference`, `idPayer`

**Status webhook:** `PENDING`, `APPROVED`, `EXPIRED`

---

### 3.6 TEF-Dial (arquivos locais)

| Direção | Caminho |
|---------|---------|
| Automação → Checkout | `C:\Tef-Dial\REQ\IntPos.001` |
| Checkout → Automação (resposta) | `C:\Tef-Dial\RESP\IntPos.001` |
| Status de recebimento | `C:\Tef-Dial\RESP\IntPos.Sts` |

Sem HTTP. Sem autenticação OAuth.

---

### 3.7 Status de transação (comum)

| `statusTransaction` | Significado |
|---------------------|-------------|
| `PENDING` | Em processamento / aguardando cliente |
| `APPROVED` | Aprovado |
| `REJECTED` | Recusado |
| `ABORTED` | Cancelado/interrompido |
| `EXPIRED` | Expirado (PIX API) |

---

## 4. Pré-requisitos e onboarding por modalidade

| Modalidade | Pré-requisitos |
|------------|----------------|
| **Todas (cloud)** | NDA assinado; cadastro no **App de Gestão Payer** (Android/iOS); credenciais `clientId`, `username`, `password`; ambiente homologado pela Payer |
| **Gateway / Checkout Web** | `automationName`, `companyId`, `storeId`, `terminalId`; `callbackUrl` HTTPS pública; terminal conectado via WebSocket; para Checkout Web: terminal **Web** dedicado |
| **Localhost** | Checkout Payer instalado e logado na mesma máquina; servidor local na porta **6060**; e-mail/senha do integrador; pinpad (ou modo simulador no Desktop) |
| **TEF-Dial** | Checkout Payer com TEF-Dial habilitado; diretórios `C:\Tef-Dial\REQ` e `RESP`; pinpad configurado |
| **E-Commerce** | Terminal configurado pelo time de implantação para transações digitadas; `accountId` (6 dígitos) |
| **PIX Payer** | Onboarding PIX no App de Gestão; cadastro aprovado (até 72 h úteis); conta PIX ativa vinculada ao CNPJ; chave PIX de liquidação cadastrada |
| **SDK** | Linux ARM/x86; pinpad homologado; `checkout_install(cnpj, token)`; regras udev para USB |
| **Smart POS** | Equipamento da lista de compatibilidade; Gertec Box com portas liberadas (se aplicável) |

### Onboarding comum (passos)

1. Assinar NDA com a Payer
2. Cadastrar integrador no App de Gestão Payer
3. Receber credenciais e IDs (`companyId`, `storeId`, `terminalId`, `automationName`, `accountId`)
4. Instalar Checkout Payer Desktop (Windows) ou POS (Android) no ambiente de teste
5. Liberar firewall conforme tutorial (`*.payer.com.br`, APIs AWS, faixas de IP de adquirente)
6. Homologar fluxo ponta-a-ponta antes de produção

### App de Gestão Payer

Obrigatório para cadastro inicial, onboarding PIX e gestão de usuários/integração.

---

## 5. Qual modalidade usar no NEXA

Contexto do projeto: **NEXA Suite** com agente Electron (`electron-acbr/payer-localhost.cjs`) e adapter web (`src/lib/tef/payerAdapter.ts`).

### PDV desktop Windows + pinpad Gertec

| Cenário | Modalidade recomendada | Motivo |
|---------|------------------------|--------|
| **Caixa físico no balcão** (operador + pinpad na mesma máquina do ERP) | **API Localhost** ✅ | Já implementado no NEXA; HTTP local `:6060`; menor latência; mesmo padrão de resposta do Gateway; pinpad gerenciado pelo Checkout Payer |
| ERP legado com TEF-Dial/PayGo | **TEF-Dial** (alternativa) | Se o NEXA precisar conviver com protocolo por arquivos sem reescrever o fluxo TEF existente |
| PDV web na nuvem disparando pagamento no caixa remoto | **API Gateway** (`flow: SYNC`) | Automação web envia ordem; Checkout Desktop no PC do operador executa no pinpad |
| Tele-entrega / cobrança posterior no POS | **API Gateway** (`flow: ASYNC`) | Ordem em fila no monitor do Checkout |

**Recomendação principal:** manter **API Localhost** como integração padrão do NEXA PDV desktop. O adapter `payer-localhost.cjs` já cobre login, `PAYMENT`, polling e abort.

**Convivência de janelas:** seguir guia de convivência — **não usar `alwaysOnTop`** no Electron do NEXA para permitir que o Checkout Payer sobreponha a tela durante o pagamento.

### Links de pagamento web (sem pinpad)

| Cenário | Modalidade recomendada |
|---------|------------------------|
| Enviar link PIX/cartão por WhatsApp, e-mail ou portal do cliente | **Checkout Web** (via API Gateway, terminal Web) |
| Gerar QR PIX no backend e exibir na tela web | **API PIX Payer** |
| Formulário com cartão digitado (e-commerce puro) | **API E-Commerce** |

**Checkout Web vs PIX Payer:** use Checkout Web quando quiser uma **página pronta** (`web.payer.com.br/checkout/...`); use PIX Payer quando quiser **controlar a UI** e apenas renderizar o QR Base64.

### O que NÃO usar no NEXA desktop

| Modalidade | Por quê |
|------------|---------|
| **SDK .so Linux** | NEXA roda em Electron/Windows; SDK é para Linux embarcado |
| **API E-Commerce** | Cartão digitado server-side — não substitui pinpad físico |
| **Checkout Web** | Não aciona pinpad local; é para pagamento remoto no browser |

### Matriz resumida NEXA

```
┌─────────────────────────────┬──────────────────────┬─────────────────────────┐
│ Caso de uso                 │ Modalidade           │ Já no repo NEXA?        │
├─────────────────────────────┼──────────────────────┼─────────────────────────┤
│ PDV balcão + pinpad Gertec  │ API Localhost        │ Sim (payer-localhost)   │
│ PDV legado TEF arquivos     │ TEF-Dial             │ Parcial (acbr-tefd)     │
│ Cobrança remota link        │ Checkout Web         │ Não (futuro Gateway)    │
│ QR PIX server-side          │ PIX Payer API        │ Não                     │
│ Cartão digitado online      │ E-Commerce API       │ Não                     │
│ Cloud → caixa remoto        │ API Gateway          │ Não                     │
└─────────────────────────────┴──────────────────────┴─────────────────────────┘
```

---

## 6. Gaps — páginas não alcançadas ou caminhos incorretos

### Caminhos testados que falharam (aliases incorretos)

Estes caminhos **não existem** ou redirecionam para a homepage. Os caminhos corretos estão na coluna "Alternativa".

| URL tentada | Resultado | Alternativa correta |
|-------------|-----------|---------------------|
| `/docs/sitemap.xml` | Retorna HTML da homepage (sem sitemap XML) | Usar extração de links do HTML de `/docs/` |
| `/docs/autenticacao.html` | 404 | `/docs/integrations/authentication.html` |
| `/docs/authentication.html` | Homepage | `/docs/integrations/authentication.html` |
| `/docs/guides/` | 404 | Tutoriais em `/docs/tutorials/` |
| `/docs/guides/liberacao-portas.html` | Homepage | `/docs/tutorials/liberacao-firewall.html` |
| `/docs/guides/checkout-desktop-convivencia.html` | Homepage | `/docs/integrations/convivencia-automacao-com-checkout-payer.html` |
| `/docs/guides/nfce-quadro-pagamento.html` | Homepage | `/docs/integrations/preenchimento-nfce.html` |
| `/docs/guides/gertec-gpos780-desbloqueio.html` | Homepage | `/docs/tutorials/gpos780-disable-lockscreen.html` |
| `/docs/integrations/e-commerce.html` | Homepage | `/docs/integrations/ecommerce.html` |
| `/docs/integrations/pix.html` | Homepage | `/docs/integrations/pix-payer.html` |
| `/docs/integrations/api-e-commerce.html` | Homepage | `/docs/integrations/ecommerce.html` |
| `/docs/integrations/api-pix.html` | 404 | `/docs/integrations/pix-payer.html` |

### Subpáginas inexistentes

- O SDK (`/docs/integrations/sdk/index.html`) **não possui subpáginas** — todo o conteúdo está em uma única página.
- Não há documentação separada de OpenAPI/Swagger publicada no site.
- Imagens e diagramas referenciados nas páginas (sequência Gateway, capturas GPOS780) não foram extraídos — apenas o texto.

### Observações de cobertura

- Toda a árvore de links internos descoberta a partir de `/docs/` foi percorrida (16 páginas únicas).
- Conteúdo "Novidades" do índice aponta para as mesmas páginas já listadas.
- Licenciamento: documentação distribuída apenas para integradores homologados; redistribuição proibida.

---

## Referências rápidas

- Portal: https://docs.payer.com.br/
- Índice: https://docs.payer.com.br/docs/
- Localhost (NEXA): https://docs.payer.com.br/docs/integrations/api-localhost.html
- Implementação NEXA: `electron-acbr/payer-localhost.cjs`
- Webhook de teste: https://webhook.site
- Checkout Web (exemplo de link): `https://web.payer.com.br/checkout/{uuid}?dealer=PAYER`

---

*Documento gerado automaticamente para apoio à integração NEXA × Payer. Consulte sempre a documentação oficial para versões e endpoints atualizados.*
