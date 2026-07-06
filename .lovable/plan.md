# Repositório de Documentos Legais de SST

## Minha recomendação
Criar um **repositório central por empresa (CNPJ)** com vigência, versionamento e alertas — **sem** distribuir na pasta de cada colaborador nem forçar reassinatura. Motivos:

- PCMSO/PGR/LTCAT/LTIP/Psicossocial são documentos **da empresa/estabelecimento**, não do colaborador. A obrigação legal é mantê-los vigentes, disponíveis para fiscalização e usar como base do eSocial S-2240 — não é assinatura individual.
- Distribuir 200 PDFs iguais na pasta de cada colaborador polui a Pasta do Colaborador (que hoje é imutável e serve para docs pessoais).
- Reassinatura obrigatória a cada renovação anual travaria login da equipe toda sem ganho legal real (o que se assina é o Termo de Ciência de Riscos por cargo, não o PGR inteiro).

Se depois você quiser evoluir para S-2240 automático ou termo de ciência por cargo, o repositório já fica pronto para isso.

## O que vou construir

### 1. Nova página `/sst-documentos` (menu RH → Segurança do Trabalho)
Acesso restrito a **admin, RH e contabilidade**.

Layout:
- Cabeçalho padrão (ícone `ShieldCheck` primary + título "Documentos de SST").
- Cards de status no topo: quantos documentos vigentes, quantos vencendo em 60 dias, quantos vencidos (badges verde/amarelo/vermelho usando tokens `success/warning/destructive`).
- Lista agrupada por tipo (PCMSO, PGR, LTCAT, LTIP, Psicossocial NR-1, Relatório Psicossocial, Outros) mostrando:
  - Versão vigente destacada + botão "Baixar" e "Ver histórico".
  - Data de emissão, início e fim da vigência, dias restantes.
  - Empresa/CNPJ a que se refere.
- Botão "+ Novo documento" abre modal com: tipo, arquivo PDF, CNPJ, data de emissão, vigência início/fim (autopreenche +12 meses), observações.
- Ao subir uma nova versão do mesmo tipo/CNPJ: versão anterior recebe `superseded_at`, nova vira vigente.
- Histórico em accordion (versões antigas com badge "Substituído em dd/mm/aaaa").

### 2. Alertas automáticos
- Card na Dashboard do gestor ("Botões do gestor") mostra badge vermelho quando houver SST vencido ou vencendo em ≤30 dias.
- Sino de notificações dispara aviso 60, 30 e 7 dias antes do vencimento, e no dia do vencimento, para admin/RH.
- Edge function `sst-expiry-check` roda diariamente via cron (pg_cron) e insere em `user_notifications`.

### 3. Upload dos 6 PDFs já enviados
Após aprovação, subo os 6 PDFs do CNPJ 44.932.369/0001-08 (Aquela Parmê) já classificados por tipo, com as vigências extraídas dos nomes dos arquivos:
- PCMSO: 07/04/2026 → 06/04/2027
- PGR: emitido 16/04/2026, vigência 2 anos
- LTCAT: emitido 16/04/2026, vigência até mudança de layout/processo
- LTIP: emitido 16/04/2026
- Pesquisa Psicossocial NR-1: sem vencimento fixo
- Relatório Psicossocial: emitido 23/06/2026

### 4. O que NÃO faço agora (fica para depois se você pedir)
- Não anexo na pasta de cada colaborador.
- Não gero termo de ciência/reassinatura.
- Não integro com eSocial S-2240 (posso planejar em separado; exige mapear risco × cargo × loja).
- Não libero para o colaborador ver na área dele.

## Detalhes técnicos

**Tabelas novas** (migration):
- `sst_documents`: `id, doc_type (enum: pcmso|pgr|ltcat|ltip|psicossocial_nr1|relatorio_psicossocial|outros), cnpj, company_name, emitted_at, valid_from, valid_until (nullable), notes, current_version, is_active, created_by`.
- `sst_document_versions`: `id, document_id, version_number, file_path, file_name, emitted_at, valid_from, valid_until, superseded_at, uploaded_by, created_at`.
- Enum `sst_doc_type`.
- RLS: SELECT/INSERT/UPDATE/DELETE só para roles admin, hr, contabilidade (via `has_role`). GRANT para authenticated + service_role.
- Trigger `update_updated_at`.

**Storage**: bucket privado `sst-documents` com policies só para admin/RH/contabilidade lerem.

**Edge function** `sst-expiry-check` (cron diário via pg_cron): varre `sst_documents` vigentes, calcula `valid_until - now()` e cria notificações nos thresholds 60/30/7/0.

**Frontend**:
- `src/pages/SstDocuments.tsx` (nova rota `/sst-documentos`).
- `src/components/sst/SstDocumentsList.tsx`, `SstUploadDialog.tsx`, `SstVersionHistory.tsx`.
- Entrada no `AppSidebar` (grupo RH, ícone `ShieldCheck`) e no `PAGE_TITLES` do `AppLayout`.
- Card no Dashboard: `src/components/dashboard/SstExpiryCard.tsx` (só admin/RH).

**Fora de escopo**: pasta do colaborador, reassinatura, eSocial S-2240, visualização por colaborador, área do nutricionista/SESMT externo.
