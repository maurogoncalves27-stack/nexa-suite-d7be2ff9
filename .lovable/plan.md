## Objetivo

Construir, dentro de `/pdv-novo`, um painel **"Homologação PayGo"** que espelha os **54 passos** do roteiro `v20241216` da Setis, executa cada cenário via NEXA ACBr Agent, captura o **NSU (PWINFO_REQNUM)** + status + observações e gera no final um **XLSX idêntico ao template `Planilha_de_testes_v20240306`** pronto pra responder o Mateus por email.

Tipo de integração: **"Biblioteca Windows"** (ACBr usa as mesmas DLLs da PGWebLib).

---

## Escopo de cenários (do PDF)

Os 54 passos se agrupam em famílias que precisamos automatizar/semi-automatizar:

| Grupo | Passos | Como executa |
|---|---|---|
| Instalação / setup | 1 | Manual no PdC, marcar OK |
| Vendas (valor, pré-seleção, negada, crédito/débito, parcelado, QR PIX C6, contactless, msg longa) | 2, 3, 4, 6, 7, 8, 11, 30, 45, 46 | Botão dispara `acbrAdapter.processPayment` com parâmetros do passo |
| Operação cancelada / rede desconhecida | 5, 16 | Operador aborta no pinpad — capturamos retorno |
| Recibos diferenciados | 9, 10 | Venda + checkbox manual conferindo via |
| Teste de comunicação + relatórios | 12, 13, 14, 15 | Novo endpoint `/tef/admin` no agente ACBr |
| Vendas-base p/ cancelamento + cancelamentos (várias modalidades, referência local/externa) | 17–23, 41–44 | Venda → guardamos NSU → botão "Cancelar este passo" no painel |
| Queda de energia (durante venda / adm / após aprovação) | 24, 25, 51 | Semi-manual: app marca "iniciado", operador desliga, na volta validamos pendência |
| Dado genérico digitado/seleção | 26–29 | Coletor de campos genéricos no overlay TEF |
| Transação pendente / confirmação / desfazimento | 31–38 | Endpoints ACBr `ConfirmaTransacao` / `DesfazTransacao` |
| Desfazimento por falha na liberação (autoatendimento) | 39, 40 | Simulamos falha no fluxo do totem |
| ControlPay (REST) | 47–50 | Marcados como **N/A** — não usamos ControlPay nessa rodada |
| QR Code extras | 52–54 | Mesma rotina do passo 11 com variações |

Passos **OPCIONAL** ficam marcados, mas executáveis.

---

## Mudanças

### Banco

`pdv_tef_homologation_runs`
- id, store_id, started_at, finished_at, pdc_code, host_url, acquirer, integration_type, version_lib, operator_id, notes

`pdv_tef_homologation_steps`
- id, run_id, step_number (1–54), step_name, mandatory bool, status (`pending`/`ok`/`fail`/`skipped`/`na`), nsu, requnum, authorization_code, card_brand, amount, raw_response jsonb, observations, executed_at

GRANTs + RLS por loja (super-user + papéis admin/manager).

### Front

`src/pages/PdvHomologacaoPayGo.tsx` (rota `/pdv-novo/homologacao-paygo`, item em `AppSidebar` no grupo PDV, atualizar `PAGE_TITLES`).

Layout:
- Header padrão com ícone `ClipboardCheck text-primary`.
- Card "Sessão atual": loja + PdC 111476 + host sandbox + botão "Nova rodada".
- Tabela / cards mobile com os 54 passos: status badge, "▶ Executar", "📝 Observação", "Cancelar venda gerada" (quando aplicável), retorno NSU.
- Botão flutuante **"Exportar XLSX para Setis"** → gera planilha idêntica ao template (mesmas colunas: N° teste / Obrigatoriedade / Retorno do teste / Observações / Teste).

`src/lib/tef/homologation/`
- `steps.ts` — catálogo dos 54 passos (number, name, mandatory, expectedFlow, executor).
- `runner.ts` — orquestra a execução chamando `acbrAdapter` e persistindo.
- `exporter.ts` — gera XLSX via SheetJS (já no projeto).

### Agente ACBr (opcional, só se faltar endpoint)

Avaliar adicionar 2 endpoints no `electron-acbr/server.cjs`:
- `POST /tef/cancelar-venda` (cancelamento de transação já aprovada por NSU/data)
- `POST /tef/admin` (menu administrativo: teste comunicação, relatórios, desfazimento)

Sem alterar nada do iFood nem do PDV ativo.

---

## Entregáveis por fase

1. **Fase 1 (este loop)**: migração + página com catálogo dos 54 passos + execução das vendas simples (passos 1–12) + export XLSX preenchendo o que já foi rodado.
2. **Fase 2**: cancelamentos (17–23, 41–44) + endpoints novos no agente ACBr.
3. **Fase 3**: queda de energia, transação pendente, desfazimento, dado genérico (24–40).
4. **Fase 4**: QR extras (52–54) e revisão final do XLSX.

---

## Fora de escopo agora

- Passos 47–50 (ControlPay REST) — marcar N/A no XLSX.
- Trocar `acbrAdapter` por PGWebLib.
- Mexer em `/pdv`, `pos_*`, iFood ou loja "iFood Homologação".

---

## Confirmações antes de começar

1. Pode prosseguir com a **Fase 1** (banco + página + execução dos passos básicos + export XLSX) já?
2. Loja piloto da homologação: **Asa Sul** ok? (uso pra criar registro em `pdv_tef_config` apontando pro PdC 111476 / sandbox).
3. Posso adicionar os 2 endpoints novos (`/tef/cancelar-venda`, `/tef/admin`) no `electron-acbr` na Fase 2, ou prefere validar a Fase 1 antes?
