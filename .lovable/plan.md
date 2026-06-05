
# Plano mestre — finalização NEXA Suite

Objetivo: substituir Saipos e Anota Aí, destravar canal WhatsApp, fechar conciliação C6 e homologar iFood. Uma microtarefa por vez, sem mexer no que já está em produção (iFood atual, Focus NFe, RH, exportação C6 da folha).

## Correções ao seu diagnóstico

1. **PDV próprio NEXA já existe** (`/pdv-novo` + `pdv_*`) e a camada TEF é multi-adapter (`mock`, `sitef`, `acbr`). O adapter ACBr já está implementado e o agente Electron (`electron-acbr/`) já foi validado com a demo PayGo C6. **Não é projeto novo — é ligar o cabo.**
2. **Saipos só sai do ar quando o PDV NEXA estiver operando nas 4 lojas com TEF real.** Não dá pra "eliminar Saipos antes do TEF" sem o plano B (Anota Aí), que você descartou. Então a ordem obrigatória é: TEF → piloto 1 loja → rollout → desligar Saipos.
3. **Estoque depende do PDV em produção** (correto). Mas a parte de *entrada* (recebimento, transferências, contagem) pode ser fechada e testada **antes** do PDV virar, usando dados manuais — assim ganhamos tempo.
4. **iFood já está em produção pré-homologado** e os 50/60 cenários já passaram. Falta só o cenário "Pedido Cancelado". Isso é tarefa pequena, não bloqueia nada — fica em paralelo.
5. **Google Reviews + iFood reviews unificados** depende de credenciais OAuth Google (já solicitadas, prazo ~15 dias). Não é desenvolvimento grande, é integração + tela.
6. **Cardápio**: o iFood já tem API de catálogo que podemos puxar; o Anota Aí não tem API pública estável. Recomendação: **puxar do iFood como master inicial** + reestruturar manualmente o que faltar.

## Gargalos reais (ordem de impacto)

```text
[BLOQUEADOR]   TEF ACBr/PayGo em produção           → libera tudo abaixo
[BLOQUEADOR]   PDV NEXA piloto 1 loja               → libera baixa de estoque
[DEPENDENTE]   NEXA Garçom (Smart POS GPOS780)      → reaproveita TEF ACBr da Fase 1
[DEPENDENTE]   Estoque ponta-a-ponta                → libera compras/sugestões
[DEPENDENTE]   WhatsApp vendas + entrega            → precisa cardápio + PDV
[PARALELO]     iFood cancelamento + reviews         → independente
[PARALELO]     C6 conciliação API                   → independente, melhoria
[PARALELO]     RH ajustes pontuais                  → contínuo
```

## Fases (microtarefa por vez)

### FASE 1 — TEF ACBr/PayGo em produção (BLOQUEADOR PRINCIPAL)

> Caminho escolhido: **ACBr + PayGo**. SiTef parqueado como plano B.

1.1. Checklist de homologação PayGo (planilha oficial) — mapear cenários obrigatórios vs. o que o adapter ACBr já faz.
1.2. Subir pasta `docs/paygo-demo` no repo (você está fazendo agora).
1.3. Revisar `electron-acbr/acbr-tefd.cjs` contra a planilha: confirmar que cobre crédito à vista, parcelado, débito, voucher, PIX, cancelamento, reimpressão de comprovante.
1.4. Adicionar o que faltar (provavelmente: reimpressão e relatório do dia).
1.5. Empacotar release do NEXA ACBr Agent (Electron) instalável no totem.
1.6. Configurar 1 loja piloto (sugestão: **Asa Sul**, menor volume) em `pdv_tef_config` com provider `acbr`.
1.7. Teste em bancada: pinpad PayGo real + agente local + `/pdv-novo` numa máquina de teste.
1.8. Rodar planilha de homologação completa → enviar pra PayGo.
1.9. Aguardar liberação PayGo (1-5 dias úteis após envio).

**Saída**: 1 loja com TEF ACBr homologado e funcionando.

### FASE 2 — Piloto PDV NEXA na loja Asa Sul

2.1. Importar cardápio do iFood (1x, via API) pra dentro do NEXA — usar `ifood-catalog-import` (já existe base).
2.2. Conferir e ajustar manualmente o que vier torto (preços, modificadores, fotos).
2.3. Configurar impressoras NFC-e (Gertec G250) e impressoras de cozinha da loja.
2.4. Treinar 1 colaborador da loja → rodar 1 dia em paralelo com Saipos (vendas duplicadas, só pra validar).
2.5. Corrigir bugs encontrados (parquear TEF se necessário).
2.6. Virar 100% para NEXA na Asa Sul, desligar Saipos só dessa loja.

**Saída**: 1 loja 100% NEXA (PDV + Totem + TEF + NFC-e via Focus).

### FASE 3 — Estoque ponta-a-ponta (em paralelo à Fase 2)

3.1. Validar fluxo de **recebimento** (`/recebimento` + `inventory_lots`) com 1 NF real de fornecedor.
3.2. Validar **transferências** entre lojas e fábrica.
3.3. Validar **contagem cíclica** (snapshot atual + ajustes).
3.4. Garantir que a venda no PDV NEXA (Fase 2) gera movimento de saída via ficha técnica.
3.5. Ligar **sugestões de compra** (`/sugestoes-compra`) baseadas em consumo real.
3.6. Validar CMV em `/financeiro/cmv` com 1 mês de dados reais.

**Saída**: estoque confiável → compras automáticas funcionando.

### FASE 4 — NEXA Garçom no Smart POS (Asa Norte)

> Pré-requisito: TEF ACBr homologado (Fase 1) + PDV NEXA validado em 1 loja (Fase 2). Só Asa Norte tem salão hoje, então é a única loja-alvo nesta fase.

A base já existe: `/garcom`, tabelas `pdv_tables` / `pdv_table_sessions` / `pdv_table_rounds`, role `waiter`. Falta colocar no hardware real (Gertec GPOS780 Multi com PayGo integrado).

4.1. Revisar fluxo `/garcom` no navegador desktop: abertura de mesa, rodadas, transferência, divisão de conta, fechamento.
4.2. Adaptar UI para tela do GPOS780 (~5", touch) — fontes maiores, botões 44px+, sem hover.
4.3. Empacotar como **PWA instalável** no GPOS780 (mais simples que Electron Android nessa primeira versão).
4.4. Trocar adapter TEF do `/garcom` de `mock` para `acbr` (reutiliza o agente local da Fase 1 — no GPOS780 o PayGo é integrado, então o adapter ACBr fala direto com a lib embarcada via Intent Android; validar com PayGo qual é o caminho exato no GPOS780).
4.5. Cadastrar mesas físicas da Asa Norte em `pdv_tables`.
4.6. Treinar 2 garçons → rodar 1 turno piloto em paralelo com comanda manual.
4.7. Virar 100% Garçom NEXA na Asa Norte.

**Saída**: salão Asa Norte operando 100% no GPOS780, comanda → cozinha (KDS futuro) → TEF → NFC-e tudo integrado.

### FASE 5 — Rollout PDV/TEF nas outras 3 lojas

5.1. Asa Norte (maior volume, deixar por último entre as 3).
5.2. Águas Claras.
5.3. Lago Sul.
5.4. **Desligar Saipos definitivamente** + arquivar tabelas `pos_*`.

### FASE 5 — iFood: fechar pendências (em paralelo desde já)

5.1. Rodar cenário "Pedido Cancelado" novamente, debugar com logs (memória `ifood-proxima-rodada-cancelamento`).
5.2. Submeter homologação final → aguardar selo definitivo.
5.3. Solicitar credenciais expandidas: **chat com cliente** + **reviews**.
5.4. Construir tela unificada de reviews (iFood + Google) → painel `/avaliacoes` com métricas.

### FASE 6 — Google Reviews

6.1. Aguardar credencial OAuth Google (em andamento, ~15d).
6.2. Implementar puxada de reviews por loja (Google Business Profile API).
6.3. Unificar com iFood na tela `/avaliacoes` (Fase 5.4).
6.4. Permitir resposta diretamente pela plataforma + IA de sugestão de resposta.

### FASE 7 — WhatsApp vendas + multi-cotação entrega

> Pré-requisito: cardápio NEXA estável (Fase 2.1-2.2) + PDV operando (Fase 4).

7.1. Reaproveitar instância Z-API do WhatsApp Cliente (já existe — `whatsapp-cliente-sac`).
7.2. Estender bot IA com tools de **vendas** (criar pedido, sugerir combo, calcular total).
7.3. Pagamento via Pix C6 (gerar QR Code dinâmico — pedir liberação ao C6).
7.4. Integração **Lalamove** (cotação + criação de entrega + tracking).
7.5. Integração **Uber Direct** (mesmo contrato — em 2º plano).
7.6. Componente de multi-cotação: cota nos dois, pega o melhor.
7.7. Tela operacional `/whatsapp-pedidos` (acompanhar pedidos do canal).

### FASE 8 — C6 conciliação bancária (melhoria, em paralelo)

8.1. Solicitar credencial API C6 (extrato + pagamento de títulos).
8.2. Substituir upload OFX/XLS por puxada automática diária.
8.3. Pagamento de títulos direto da tela `/financeiro` sem export.

### FASE 9 — RH (contínuo, em paralelo a tudo)

- Ajustes pontuais conforme aparecerem. Sem mexer em: exportação C6 da folha, pasta do colaborador, regras CLT calculadas. Tudo o resto pode ser tocado.

## Dependências críticas (mapa)

```text
TEF ACBr ──┬──> PDV NEXA Asa Sul ──┬──> Estoque real ──> Compras automáticas
           │                       │
           │                       └──> Rollout 3 lojas ──> Desligar Saipos
           │
           └──> WhatsApp vendas (precisa também: cardápio + Pix C6 + Lalamove)

iFood cancelamento ──> Homologação final ──> Credenciais reviews/chat ──┐
                                                                        ├──> Tela /avaliacoes unificada
Google OAuth (aguardando) ─────────────────────────────────────────────┘

C6 API ──> Conciliação automática (independente)
RH ──> Contínuo (independente)
```

## Integrações que precisam ser solicitadas/aguardadas

| Integração | Status | Prazo estimado | Bloqueia |
|---|---|---|---|
| PayGo (homologação) | Pronto pra rodar planilha | 1-5 dias após envio | Fase 1-4 |
| iFood reviews/chat | Aguardando solicitação | 30 dias | Fase 5.3 |
| Google Business OAuth | Solicitado | ~15 dias | Fase 6 |
| C6 API extrato | Não solicitado | a definir | Fase 8 |
| C6 Pix dinâmico | Não solicitado | a definir | Fase 7.3 |
| Lalamove API | Não solicitado | ~7 dias | Fase 7.4 |
| Uber Direct API | Não solicitado | ~14 dias | Fase 7.5 |

## O que NÃO vamos fazer

- Não tocar no código iFood atual (está em produção).
- Não mexer no Focus NFe (funciona; ACBrLibNFe fica pra depois).
- Não usar Anota Aí como ponte (você descartou).
- Não mexer em exportação C6 da folha, pasta do colaborador, regras CLT.
- Não iniciar Fase 7 (WhatsApp) antes do PDV NEXA virar em pelo menos 1 loja.

## Próximo passo imediato

**Fase 1.1**: pegar a planilha oficial de homologação PayGo e fazer o checklist contra o `acbr-tefd.cjs` atual pra ver exatamente o que falta implementar. É 1 hora de trabalho e destrava tudo.

Quer que eu comece por aí assim que aprovar este plano?
