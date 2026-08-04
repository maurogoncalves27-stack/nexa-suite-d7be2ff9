# Diagnóstico e roteiro: transformar o NEXA Suite em SaaS modular ("lego")

Objetivo: vender o sistema para outras empresas (foco em restaurantes/lanchonetes), em módulos contratáveis — de um pacote básico até o 360.

Nada será implementado agora. Este documento é o mapa do caminho.

## 1. Onde o sistema está hoje

Levantamento feito no código e no banco:

- **436 tabelas**, 175 rotas, 154 páginas, ~261 mil linhas.
- **Não existe nenhuma noção de "cliente/empresa contratante"** no banco. Nenhuma tabela tem `tenant_id`/`company_id` de assinante. O isolamento existente é apenas por **loja** (`store_id`), que hoje representa unidades da mesma empresa.
- **Identidade da empresa está fixa no código**: `src/lib/companyIdentity.ts` traz CNPJ `44.932.369/0001-08` e razão social "NEXA Gestão Inteligente" como constantes.
- **Papéis são globais**: enum `app_role` com `admin`, `manager`, `employee`, `trainee` (+ papéis de portais). Um `admin` é admin de tudo, não de uma empresa.
- **Não existe controle de módulos contratados**: todos os itens do menu aparecem para todos, sem verificação de plano.
- Já existe o **Mapa de Hardcodes** (`/configuracoes/hardcodes`, 87 pontos catalogados) — ele é a espinha dorsal do trabalho de "despersonalizar" o produto.

Conclusão: o sistema é hoje **mono-empresa**. Vender para terceiros exige criar a camada de cliente antes de qualquer coisa.

## 2. Arquitetura recomendada

**SaaS multiempresa com módulos por assinatura** (uma base, vários clientes) — é o único formato compatível com a ideia de "lego" e com atualizações contínuas sem replicar trabalho.

Três conceitos novos:

```text
TENANT (empresa cliente)
  └── UNIDADES (lojas, o que hoje é "stores")
  └── USUÁRIOS + papéis (sempre dentro do tenant)
  └── ASSINATURA → PLANO → MÓDULOS liberados
```

Módulos propostos como pacotes vendáveis:

| Pacote | Conteúdo |
| --- | --- |
| Core (obrigatório) | Empresa, unidades, usuários, permissões, notificações, dashboard |
| Operação PDV | PDV, Garçom, TEF, NFC-e, canais de venda |
| Totem de Autoatendimento | Totem em modo quiosque, cardápio/marcas, comer no local ou levar, TEF no pinpad, NFC-e, comanda de cozinha, vídeo/slideshow de atrair e página de configuração |
| RH | Colaboradores, ponto, escala, folha, rescisões, bonificações, portal do colaborador |
| Saúde Ocupacional | Painel NR-1, riscos psicossociais, atestados, ASO/PCMSO, documentos SST, saúde mental, clima organizacional |
| Monitoramento de Temperatura | Sensores de câmara fria/freezer, leituras automáticas, faixas por equipamento, alertas de fora-da-faixa e de sensor offline (WhatsApp/SMS), histórico e relatórios |
| Financeiro | Contas, DRE, faturamento, conciliação, portal contabilidade |
| Suprimentos | Estoque, fichas técnicas, compras, fornecedores, fábrica |
| Qualidade | NutriControle, check-lists, ocorrências, controle de pragas, óleo, caixa d'água |
| Inteligência | Giana/IA, CRM, avaliações, painel de saúde operacional |

Três pontos sobre o recorte:

- **Monitoramento de Temperatura** vira módulo independente e é o melhor "produto de entrada": vende sozinho para qualquer cozinha, mercado, farmácia ou laboratório, mesmo para quem não quer o resto do sistema. Hoje ele já existe (sensores EMS-A + alertas) mas está amarrado dentro do NutriControle e com o sensor da Asa Sul fixo no código — precisa virar cadastro livre de sensores por unidade.
- **Saúde Ocupacional** vira módulo próprio, vendável de duas formas: avulso (para RH terceirizado, clínicas de medicina do trabalho e consultorias de SST) ou como parte do pacote RH completo. Tecnicamente ele já está isolado numa área única com abas, o que facilita o desmembramento.
- **Totem de Autoatendimento** sai do pacote PDV e vira módulo próprio, cobrado por totem ativo. Muito restaurante quer só o totem sem trocar o PDV existente — por isso ele precisa funcionar com catálogo e emissão fiscal próprios, sem exigir o módulo PDV contratado.



## 3. Roteiro por fases

### Fase 0 — Decisões comerciais (antes do código)
Definir preço por módulo, limites por plano (usuários/unidades), política de suporte e o que entra no pacote básico. Sem isso o modelo de dados de plano nasce errado.

### Fase 1 — Fundação multiempresa
Criar `tenants`, `tenant_users`, vincular `stores` a um tenant, migrar todos os dados atuais para o tenant "Aquela Parmê". Reescrever as políticas de acesso para que cada consulta seja obrigatoriamente filtrada por empresa. **É a fase mais crítica e mais cara** — toca as 436 tabelas.

### Fase 2 — Catálogo de módulos e assinatura
Tabelas `modules`, `plans`, `plan_modules`, `tenant_subscriptions`. Menu, rotas e funções de backend passam a checar "este tenant tem esse módulo?". Módulo não contratado some do menu e é bloqueado no servidor.

### Fase 3 — Despersonalização (whitelabel)
Eliminar os hardcodes do mapa: CNPJ, razão social, lojas, marcas, cores, cargos, alíquotas, tokens fiscais, regras de bonificação/CCT. Tudo vira configuração por empresa. Logo, cores e nome do produto configuráveis por cliente.

### Fase 4 — Onboarding self-service
Cadastro da empresa, criação do primeiro admin, assistente de configuração inicial (unidades, cargos, impostos), dados de exemplo e período de teste.

### Fase 5 — Cobrança
Integração de assinatura recorrente, upgrade/downgrade de módulos, bloqueio por inadimplência, painel do assinante.

### Fase 6 — Operação como fornecedor de software
Painel interno de administração (ver clientes, uso, erros), rotina de suporte, versionamento e comunicação de novidades, backup e trilha de auditoria por empresa.

## 4. Riscos e pontos de atenção

- **Vazamento entre empresas** é o risco número um. A Fase 1 precisa de teste automatizado provando que a empresa A nunca enxerga dado da B.
- **Áreas em produção e congeladas** (TEF PayGo/Payer, RH, Financeiro, exportação C6) serão afetadas pela Fase 1. Precisam de janela e autorização explícita.
- **Fiscal por cliente**: cada empresa tem CNPJ, CSC, série, regime tributário e alíquotas próprias — a emissão fiscal precisa deixar de assumir a Aquela Parmê.
- **Regras trabalhistas hardcoded** (produtividade 5%, VT 6%/3%, bonificações) são da CCT do seu setor/estado; outro cliente pode ter regras diferentes.
- **Custo de infraestrutura** cresce por cliente; precisa ser considerado no preço.

## 5. Esforço estimado

| Fase | Peso relativo |
| --- | --- |
| 1 — Fundação multiempresa | Muito alto (o maior bloco de todos) |
| 3 — Despersonalização | Alto (87 hardcodes mapeados) |
| 2 — Módulos e planos | Médio |
| 4 — Onboarding | Médio |
| 5 — Cobrança | Médio-baixo |
| 6 — Operação | Contínuo |

Caminho mais seguro na prática: fazer a Fase 1 completa, depois vender **um módulo piloto** para um cliente real e só então abrir o catálogo completo. O candidato mais forte a piloto é o **Monitoramento de Temperatura** — poucas tabelas, sem dependência de folha/fiscal, ciclo de venda curto e público muito maior que restaurantes. Saúde Ocupacional é o segundo mais fácil, por já estar isolado em uma área própria.

## 6. O que eu preciso de você para seguir

1. Aprovar o modelo SaaS multiempresa como arquitetura-alvo.
2. Confirmar o recorte dos módulos vendáveis da tabela acima.
3. Confirmar se Saúde Ocupacional será vendida também avulsa (fora do RH) ou apenas dentro do pacote RH.
4. Dizer qual módulo seria o piloto comercial.


Quando decidir, eu monto o plano técnico detalhado da Fase 1 (modelo de dados, ordem de migração das 436 tabelas e plano de testes de isolamento).
