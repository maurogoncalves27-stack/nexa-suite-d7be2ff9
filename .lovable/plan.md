# NEXA Garçom na Gertec GPOS780 — APK + pagamento Payer no aparelho

## Contexto confirmado

- O totem já está finalizado e não entra neste escopo.
- A GPOS780 será usada **apenas pelo app Garçom**: lançar pedido e receber na própria maquininha.
- A Gertec informou que não é possível instalar navegador no terminal, então o PWA não serve: precisamos de **APK**.
- Com a venda rodando dentro da POS, a integração Payer correta é **API Localhost** (Gateway só serviria se o sistema de venda rodasse fora do terminal).

## Sugestão (o que eu faria)

Fechar o wrapper Capacitor do Garçom agora e, junto, resolver o único ponto técnico que hoje impede o pagamento no Android. Sem isso o APK abre e vende, mas não consegue cobrar.

### 1. Apontar o wrapper para o Garçom

O `capacitor.config.ts` hoje abre `/smartpos/login`. Como o uso é garçom vendendo e recebendo, a URL inicial passa a ser a tela de login do Garçom, mantendo `allowNavigation` para `127.0.0.1` (Checkout Payer).

### 2. Modo Payer "direto" para Android

Hoje o cliente Payer do sistema fala com o **agente NEXA (Windows, porta 3031)**, que faz proxy para o Checkout na 6060. Na GPOS780 não existe agente Electron — só o app Checkout Payer. Então:

- Adicionar um modo de transporte no cliente Payer: `agent` (Windows, como hoje) ou `direct` (Android, chama `http://127.0.0.1:6060` sem intermediário).
- Detectar automaticamente quando estiver rodando dentro do APK Capacitor e usar `direct`.
- Nenhuma mudança no fluxo de venda, no adapter TEF ou nos logs de transação — só a camada de transporte.

### 3. Configuração do terminal

Na tela de configuração do SmartPOS/Garçom, permitir informar a URL do serviço local e o número lógico do terminal, com botão de testar conexão, para o técnico validar no aparelho.

### 4. Build e distribuição

Documentar o caminho de geração do APK assinado (`npx cap add android`, `assembleRelease`) e a instalação por OTG/pendrive ou Gertec Box (MDM). O build final é feito fora do Lovable, no repositório exportado.

## O que responder para a Payer / Gertec

- Integração: **API LOCALHOST** — o PDV (NEXA Garçom) roda dentro da GPOS780.
- Precisamos do Checkout Payer instalado e logado no terminal **NS 6001072502003427**, com endereço/porta do serviço local e número lógico do terminal.
- Para o MDM da Gertec, entregaremos um **APK Android assinado** (WebView) — o app não usa navegador do sistema.

## Detalhes técnicos

- `capacitor.config.ts`: `server.url` para a rota do Garçom; `allowNavigation` mantém `127.0.0.1` e `localhost`; `allowMixedContent: true` (o Checkout Payer é HTTP local dentro de app HTTPS).
- `src/lib/tef/payer/client.ts`: novo parâmetro de transporte + resolução automática do endpoint. Os arquivos congelados de TEF (PayGo, `useTefPayment`, `pdv_tef_config`) não são alterados.
- Sem alteração de banco de dados.
