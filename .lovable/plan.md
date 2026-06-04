## Objetivo
Permitir que o totem dispare pagamentos TEF via pinpad usando o **NEXA ACBr Agent** (já instalado e validado com a demo SiTef/PayGo C6), sem mexer no fluxo SiTef atual nem no iFood.

## Mudanças

### 1. Camada TEF do app (frontend)
- `src/lib/tef/types.ts` — adicionar `"acbr"` em `TefProvider`.
- `src/lib/tef/acbrAdapter.ts` (novo) — implementa `TefAdapter`:
  - `processPayment`: `POST {agentUrl}/tef/iniciar` com `{ valor, tipo: "credito"|"debito"|"pix"|"voucher", parcelas, financiamento }`.
  - Simula transições `connecting → waiting_card → processing` (agente é síncrono) e finaliza com `approved/declined` conforme resposta.
  - Parser do bloco `Resposta=` (INI da ACBrLibTEFD) para extrair `NSU`, `CodigoAutorizacao`, `RedeAdquirente`, `Bandeira`, `UltimosDigitos`, `Parcelas`.
  - `cancel`: `POST {agentUrl}/tef/cancelar`.
  - Helper `checkAcbrAgent(url)` usando `GET /health` (lê `tefAvailable`).
- `src/lib/tef/index.ts` — factory passa a retornar `createAcbrAdapter` quando `provider === "acbr"`.

### 2. Painel de configuração TEF por loja
- `src/components/pdv-novo/TefConfigPanel.tsx`:
  - Novo item no Select: **"ACBr (PayGo / C6)"**.
  - Quando provider = `acbr`, default de `agent_url` = `http://localhost:3030` e health-check chama `checkAcbrAgent`.
  - Texto auxiliar: "Requer NEXA ACBr Agent rodando na máquina do totem (porta 3030)".

### 3. Configuração da loja do totem
- Sem migration. O admin abre Configurações → TEF da loja do totem em uso, escolhe `ACBr (PayGo / C6)`, URL `http://localhost:3030`, salva (grava em `pdv_tef_config`).

## O que NÃO muda
- `electron-totem/sitef-agent.cjs` e `sitef-real.cjs` — preservados.
- `electron-acbr/` (agente que você já validou) — sem alterações de código.
- Fluxo iFood — intocado.
- TefPaymentDialog, useTefPayment — sem alteração (já são agnósticos ao provider).

## Detalhes técnicos
- Mapeamento método → tipo ACBr: `credit→credito` (parcelas>1 vira parcelado), `debit→debito`, `pix→pix`, `voucher→voucher`.
- O agente atual já valida `tefAvailable` em `/health` e responde 503 quando a `ACBrTEFD64.dll` não está disponível — o adapter trata esse caso retornando `status: "error"` com mensagem clara.
- Parser INI tolerante a chaves em maiúsculas/minúsculas (ACBrLibTEFD pode variar). Em caso de campos ausentes, devolve apenas `mensagem` e `raw`.
- Sem SSE no agente ACBr — UI usa estados simulados curtos antes do fetch para o usuário ver "Aproxime o cartão" no totem.

## Ordem de implementação
1. `types.ts` + `acbrAdapter.ts` + `index.ts`.
2. `TefConfigPanel.tsx` (novo item + default URL + health-check).
3. QA manual: abrir painel TEF da loja do totem, escolher ACBr, salvar, abrir totem, fazer uma venda de teste contra o NEXA ACBr Agent local.
