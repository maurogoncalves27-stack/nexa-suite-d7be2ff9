## Atualização de status do sistema (31/07/2026)

Registrar o novo status como **memória permanente do projeto** e fixar a fila completa de homologações/entregas. Nenhuma mudança de código nesta etapa.

### 1. Regras de congelamento (novas memórias)

- **PayGo: HOMOLOGADO + certificado emitido. Código CONGELADO.** Nada em `electron-acbr/` (bridge PowerShell, PGWebLib, agente TEF), `src/lib/tef/paygo*`, `useTefPayment` ou config PayGo pode ser alterado sem confirmação expressa do usuário na conversa.
- **Payer: HOMOLOGADO.** Agente do totem (`electron-totem/payer/*`) e adapter Payer congelados sob a mesma regra.
- **iFood: em produção, pré-homologado.** Código preservado intacto. Os testes de certificação oficial **não estão bloqueados** — o que depende deles é a liberação das **demais APIs iFood** (ex.: resposta a avaliações), disponíveis só após testes oficiais concluídos + merchant finalizada.

Substitui a memória "PRIORIDADE ABSOLUTA (08/06/2026) … TEF PayGo", que passa a "concluído/congelado".

### 2. Fila oficial de homologações e entregas

| # | Item | Status hoje | Dependência |
|---|------|-------------|-------------|
| 1 | **Certificação oficial iFood** (refazer cenários) | pendente, sem bloqueio | pode começar já |
| 2 | **Merchant oficial iFood** | pendente | junto de (1) libera APIs extras |
| 3 | **API de avaliações iFood** (ler + responder) | indisponível | (1) + (2) |
| 4 | **Google Business Profile** (ler + responder avaliações) | credenciais pendentes | acesso GBP/OAuth |
| 5 | **Avaliações unificadas iFood + Google** com resposta integrada nas duas plataformas | parcial (notas manuais + `google_reviews`) | (3) + (4) |
| 6 | **Lalamove** (entrega) | adapter e webhook já no código, sem homologação | credenciais de produção + secret de webhook |
| 7 | **Uber Direct** | não iniciado | depois da Lalamove; arquitetura multi-provider simultâneo |
| 8 | **C6 Bank API** (extrato + pagamentos, fim do import/export manual) | manual | credenciais/certificado mTLS C6 |
| 9 | **Meta oficial (WhatsApp Cloud API)** — acabar com bloqueios | Z-API hoje | verificação Meta/BSP |
| 10 | **NFC-e — migrar Focus NFe → ACBrLibNFe local** | roadmap | após certificação iFood; agente Electron + toggle por loja |
| 11 | **Yolo Club** | spec + tabela `yolo_store_tokens` criadas | tokens por filial e go-live |
| 12 | **Mercado Pago / Pix** | secrets configurados, sem uso | decisão: manter ou descartar (recebimento é 100% TEF) |
| 13 | **PDV próprio (`/pdv-novo`) + NEXA Garçom** | substituindo Saipos | declarar marco de "produção" |
| 14 | **LGPD / retenção de dados** | não formalizado | política de retenção + consentimentos |
| 15 | **Backup / disaster recovery** | não formalizado | rotina e teste de restauração |

### 3. Entrega desta etapa

- Reescrever o bloco **Core** de `mem://index.md`: PayGo/Payer homologados e congelados; iFood em produção com certificação pendente (sem bloqueio); ponteiro para a fila.
- Criar `mem://features/status-homologacoes-2026-07` com a tabela completa acima (itens 1–15, status e dependências).
- Criar `mem://constraints/tef-congelado`: proibição de alterar PayGo/Payer sem confirmação expressa.
- Atualizar `mem://features/prioridade-tef-acbr`, `mem://features/roadmap-pos-totem-2026`, `mem://features/integracoes-aguardando` e `mem://features/acbr-nfe-roadmap` para refletir o novo estado.

Nenhum código será tocado. Aprovado isso, o próximo passo natural é a **Lalamove** (item 6), que já tem adapter pronto e precisa de credenciais + configuração por loja.
