# NEXA ACBr Agent — Setup Payer (API Localhost)

Homologação via [Checkout Payer](https://docs.payer.com.br/docs/integrations/api-localhost.html) no mesmo PC do pinpad.

Índice completo da documentação Payer (16 páginas): [PAYER-DOCS-INDEX.md](./PAYER-DOCS-INDEX.md).

## 1. Pré-requisitos

- Windows 10/11 64 bits
- **Checkout Payer** instalado e em modo **API Localhost**
- Pinpad conectado (ex.: Gertec PPC930)
- NEXA ACBr Agent rodando (`npm run start:console` ou atalho na área de trabalho)

## 2. Configurar o Checkout Payer

1. Instale o Checkout Payer (instalador fornecido pela Payer após onboarding).
2. Nos parâmetros do Checkout, ative o modo de integração **Localhost** (HTTP na porta **6060**).
3. Faça login no app com o usuário de homologação.

Documentação: https://docs.payer.com.br/docs/integrations/api-localhost.html

## 3. Credenciais no agente

Defina as variáveis de ambiente antes de subir o agente:

```powershell
$env:PAYER_BASE_URL = "http://127.0.0.1:6060"
$env:PAYER_EMAIL = "seu-email@exemplo.com"
$env:PAYER_PASSWORD = "sua-senha"
cd electron-acbr
npm run start:console
```

## 4. Endpoints do agente (proxy)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/payer/diagnostics` | Checkout acessível? logado? |
| POST | `/payer/login` | Login (body opcional: email, password) |
| POST | `/payer/logoff` | Logoff |
| POST | `/payer/payment` | Inicia pagamento (`wait: true` aguarda resultado) |
| GET | `/payer/response` | Poll do status (espelha Checkout) |
| POST | `/payer/abort` | Aborta fluxo em andamento |

Base do agente: `https://127.0.0.1:3031` (ou `http://127.0.0.1:3030`).

## 5. Testes rápidos (curl)

```powershell
# Diagnóstico
Invoke-RestMethod https://127.0.0.1:3031/payer/diagnostics

# Login
Invoke-RestMethod -Method POST https://127.0.0.1:3031/payer/login `
  -ContentType "application/json" `
  -Body '{"email":"seu@email.com","password":"senha"}'

# Débito R$ 10 (aguarda pinpad)
Invoke-RestMethod -Method POST https://127.0.0.1:3031/payer/payment `
  -ContentType "application/json" `
  -Body '{"value":10,"paymentMethod":"CARD","paymentType":"DEBIT","paymentMethodSubType":"FULL_PAYMENT","wait":true}'

# PIX R$ 1
Invoke-RestMethod -Method POST https://127.0.0.1:3031/payer/payment `
  -ContentType "application/json" `
  -Body '{"value":1,"paymentMethod":"PIX","wait":true}'

# Abortar
Invoke-RestMethod -Method POST https://127.0.0.1:3031/payer/abort
```

## 6. UI de teste no NEXA

Rota: **Configurações → TEF Payer** — `/configuracoes/tef-payer`

## 7. O que pedir à Payer (homologação)

- Ambiente de **teste/sandbox**
- Instalador do **Checkout Payer** (Windows)
- Credenciais de login (`email` / `password`)
- Confirmação de modalidade: **API Localhost** (não Gateway)
- Terminal/POS ID se aplicável

## 8. Resposta sugerida ao suporte (WhatsApp)

> Olá! Vamos homologar com **API Localhost** (Windows desktop).
> Software house: NEXA / Aquela Parme.
> Cenário: PDV no mesmo PC do pinpad Gertec PPC930, integração via HTTP local.
> Aguardo credenciais de sandbox e instalador do Checkout Payer.
