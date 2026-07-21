## Plano de Cargos, Carreira e Salários (PCCS)

Recriar o PCCS completo baseado no documento anexo, com nova rota `/pccs` no módulo RH.

### 1. Banco (uma migration só)

**Novas tabelas**

- `position_salary_levels` — níveis salariais por cargo
  - `position_id`, `level` (I/II/III/IV), `salary`, `order_index`
- `position_competencies` — matriz de competências
  - `position_id`, `name`, `type` (`technical`|`behavioral`), `is_required`, `order_index`
- `career_track_steps` — trilhas de carreira (grafo)
  - `track_name` (ex.: "Cozinha → Gestão"), `from_position_id`, `to_position_id`, `order_index`, `notes`
- `promotion_criteria` — critérios por cargo destino
  - `position_id`, `min_months_in_role`, `min_evaluation_score`, `min_attendance_pct`, `no_warnings_months`, `require_training_completion`, `require_pdi_completion`, `promotion_type` (`horizontal`|`vertical`)
- `promotion_eligibility_snapshots` — cache mensal de quem está elegível (calculado)
  - `employee_id`, `target_position_id`, `is_eligible`, `criteria_met` (jsonb), `computed_at`

**Extensão do PDI existente** (`development_plans`):
- Adicionar `competency` (text), `expected_result` (text), `responsible_employee_id` (uuid FK employees)
- Migrar `mentor_name` → tenta match por nome em employees; se não achar, mantém texto em `notes`
- Nenhum dado perdido

Todas com RLS: leitura para `hr`/`admin`/`manager`; escrita só `hr`/`admin`. Colaborador vê seu próprio PDI.

### 2. Seed inicial (do documento)

- Faixas I-IV para Supervisor (2.090 → 2.419,43)
- Salários-base sugeridos para todos os cargos do doc (Estagiário R$ 1.000 até Gerente R$ 2.500)
- Competências dos exemplos (Aux Cozinha + Supervisor)
- Trilha principal: Estagiário → Aux Cozinha → Aux Produção → Encarregado → Supervisor → Coordenador → Gerente
- Trilha alternativa: Atendente → Aux A&B → Supervisor → Coordenador
- Critérios padrão: horizontal (12m, 80%, 95% freq, 0 advertências 6m, treinamentos ok) / vertical (85%, PDI concluído)

### 3. Nova rota `/pccs` (mobile-first, padrão de header do projeto)

Ícone `TrendingUp` (adicionar em AppSidebar sob "RH" e em `PAGE_TITLES`).

Abas:
1. **Cargos & Salários** — lista de cargos com níveis editáveis inline
2. **Competências** — matriz por cargo (badges técnicas/comportamentais, checkboxes)
3. **Trilhas de Carreira** — visualização em grafo/steps + editor drag-and-drop simples
4. **Critérios de Promoção** — formulário por cargo destino
5. **Elegíveis Agora** — lista de colaboradores prontos pra promoção (roda a checagem contra ponto, advertências, avaliações, treinamentos)

### 4. Integração com o resto do sistema

- Card no Dashboard do gestor: "N colaboradores elegíveis para promoção"
- Botão "Ver PCCS do meu cargo" na `AreaColaborador` (colaborador vê caminho + o que falta pra próximo nível)
- PDI (`/pdi` ou aba existente) passa a puxar competência da matriz do cargo alvo

### 5. Fora do escopo desta entrega

- Avaliação de desempenho 360° (já existe `evaluations` — só vincular scores no cálculo de elegibilidade, sem criar módulo novo)
- Reconhecimento por mérito (certificados trimestrais) — pode virar backlog
- Aprovação eletrônica de promoção com assinatura — backlog

### Ordem de execução

1. Migration única (tabelas + extensão PDI + seed do documento)
2. Página `/pccs` com as 5 abas
3. Cálculo de elegibilidade (função SQL + RPC)
4. Card no dashboard + link na AreaColaborador

Confirma que posso seguir com isso?