
# Plano — Migrar TEF PayGo para o fluxo oficial Setis

## Contexto

A documentação oficial ([paygodev — Kit de atualização v5.1.50.2](https://paygodev.readme.io/docs/kit-para-atualiza%C3%A7%C3%A3o-da-documenta%C3%A7%C3%A3o)) deixa claro que o caminho suportado é:

1. Baixar e instalar o **PayGo Windows** (`SetupPayGo_full_v5.1.47.2.exe`) que vem no kit.
2. Ativar o **modo DEMO** pela UI do PayGo Windows (3 cliques no logo → digitar `demo` → app fica roxo).
3. Habilitar "modo instalação da DLL" e informar **CNPJ + Ponto de Captura** pela UI.
4. A partir daí, a **PGWebLib.dll** já está pronta — nossa aplicação só faz transações (`PW_iNewTransac` com `PWOPER_SALE`, `PWOPER_REFUND`, etc.), **sem** mais precisar do `PWOPER_INSTALL`.

Isso descarta o caminho atual (agente chamando `PWOPER_INSTALL` direto), que era a causa da Setis pedir o `TSTKEY` e travar nosso atendimento.

## O que muda

- **Instalação/ativação:** deixa de ser código nosso, vira procedimento operacional manual feito 1x por loja.
- **Agente Electron (`electron-acbr/acbr-tefd.cjs`):** remove fluxo de install, mantém só transação/cancelamento/reimpressão/administrativa.
- **Configuração por loja:** CNPJ + PdC continuam em `pdv_tef_config`, mas viram **informativos** (a UI do PayGo Windows é a fonte de verdade do que está ativo na máquina).
- **Comunicação com Setis:** não precisa mais do chamado pedindo "liberação de cenários" via PWOPER_INSTALL — a Setis já libera no momento em que o operador ativa o modo DEMO na UI.

## Passos

### 1. Documentação operacional (no app)
- Nova página interna **/configuracoes/tef-paygo** (ou seção dentro de `/configuracoes`) com:
  - Botão de download do kit oficial (link Setis).
  - Passo-a-passo com os prints da doc (3 cliques no logo, digitar `demo`, etc.).
  - Campos informativos: CNPJ, PdC, host (lidos de `pdv_tef_config` da loja selecionada).
  - Checklist de validação ("PayGo Windows instalado?", "Modo DEMO ativado (app roxo)?", "PdC informado?").
- Cabeçalho padrão NEXA + tokens de design + mobile-first (memórias core).

### 2. Agente Electron (`electron-acbr/acbr-tefd.cjs`)
- **Remover:** qualquer chamada `PW_iNewTransac` com `PWOPER_INSTALL` e a lógica de leitura de `TSTKEY`/instalação.
- **Manter/garantir:** `PWOPER_SALE`, `PWOPER_REFUND` (cancelamento), `PWOPER_REPRINT`, `PWOPER_ADMIN`, confirmação (`PW_iConfirmation`).
- **Pré-flight:** ao subir o agente, fazer um `PW_iInit` simples e logar a versão; se a DLL responder erro de "não instalado", retornar uma mensagem clara dizendo "execute o PayGo Windows e ative o modo DEMO".

### 3. Adapter TEF (lado React/PDV)
- Em `pdv_tef_config`: tornar campos `cnpj` / `pdc` / `host` **somente leitura** na UI (informativos), já que a ativação real é externa.
- Mensagens de erro do adapter: se o agente disser "PayGo não inicializado", mostrar toast com link para a página /configuracoes/tef-paygo.

### 4. Memórias a atualizar
- `mem://features/tef-paygo-sandbox`: trocar "credenciais DEMO Setis via INI" por "fluxo oficial PayGo Windows + modo DEMO (UI)".
- `mem://features/prioridade-tef-acbr`: já está como "PGWebLib direto"; só reforçar que **instalação é via PayGo Windows, não programática**.
- Core: ajustar a linha de prioridade absoluta de TEF mencionando que a instalação é via PayGo Windows.

### 5. O que **NÃO** vamos fazer
- Não mexer em iFood (preservado, memória core).
- Não mexer em /pdv legado, pos_*, saipos-sync.
- Não tocar em export C6 da folha, totem print config, "iFood Homologação" etc.
- Não vamos mais perseguir Setis pelo `TSTKEY` / `PWOPER_INSTALL` — esse chamado pode ser fechado/abandonado.

## Detalhes técnicos

- Kit oficial: `https://setis.com.br/filevista/public/j563/paygodev/20260422-integracao-setuppaygowindows-v5-1-50-2.zip`
- Adquirentes sandbox disponíveis: **DEMO** (sub-adquirente), **REDE** (só valores inteiros), **PIX C6 BANK** (QrCode, aprovação automática).
- PIN-Pad: cabo USB original, porta COM ≤ 32, preferir COM mais baixa.
- A `PGWebLib.dll` continua sendo chamada pelo nosso agente Electron via FFI — nada muda no contrato de transação, só some o passo de install.

## Perguntas antes de implementar

1. Quer que eu já **remova fisicamente** o código de `PWOPER_INSTALL` do agente nesta rodada, ou só **desabilito/comento** mantendo como fallback até validarmos o PayGo Windows instalado de verdade?
2. A página de instruções deve ficar em **/configuracoes/tef-paygo** (item novo no sidebar) ou como uma **aba dentro de /configuracoes** já existente?
3. Você quer que eu monte também uma **mensagem curta encerrando** o chamado pendente com a Setis (algo tipo "vamos seguir pelo fluxo do PayGo Windows, podem desconsiderar a solicitação do TSTKEY")?
