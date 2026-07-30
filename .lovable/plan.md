## Objetivo

Hoje um check-list só pode ser direcionado a **grupos de acesso** (+ lojas). Você quer poder marcar **grupo(s)**, **pessoa(s)** específicas, ou os dois ao mesmo tempo.

## Melhor caminho

Já existe no banco a tabela `checklist_template_assignments` (template + colaborador), criada no passado e hoje **vazia e sem regras de acesso**. É o encaixe natural: reaproveitamos ela como "atribuição individual", em vez de criar estrutura nova.

Regra de público passa a ser **união (OU)**:

```text
cobrado = (está em algum grupo do template)  OU  (está atribuído individualmente)
                         ↓ e então
        filtro de loja do template + filtro "só escalados" (se ligado)
```

Detalhes das regras:
- Pessoa atribuída individualmente **não precisa** estar em nenhum grupo.
- Filtro de loja do template **não se aplica** a pessoas nomeadas (se você escolheu a pessoa, é porque quer dela) — o filtro de loja continua valendo para o público vindo por grupo.
- O switch "Cobrar somente de quem está escalado" continua valendo para todos, inclusive nomeados.
- Colaborador desligado deixa de ser cobrado automaticamente (já é o comportamento atual).

## O que muda

1. **Banco (migração)**
   - Ativar segurança em `checklist_template_assignments` com permissões: leitura para autenticados, gestão para admin/gestor; conceder acessos necessários.
   - Ajustar a política de visualização de `checklist_templates` para também liberar o template a quem tem atribuição individual (senão a pessoa nomeada não enxerga o check-list).

2. **Editor de template** (`AdminTemplatesPanel.tsx`)
   - Nova seção "Público-alvo": bloco de grupos (existente) + novo bloco "Colaboradores específicos" com busca e seleção múltipla (apenas colaboradores ativos, nome do cadastro).
   - Badge no card do template: "N pessoa(s)" quando houver atribuição individual.
   - Salvar/remover atribuições junto com o template.

3. **Regra de público** (`src/lib/checklistAudience.ts`)
   - Carregar as atribuições individuais e aplicar a lógica de união descrita acima em `isExpectedForTemplate` / `expectedUsersForTemplate`.

4. **Telas que consomem a regra** — passam a refletir automaticamente:
   - Dashboard de check-lists (pendentes/conformidade)
   - Check-lists por loja
   - Área do colaborador (`EmployeeChecklists.tsx`): passa a mostrar o check-list também para quem foi nomeado individualmente.

5. **Auditoria de público**: continuar listando vínculos de grupo inválidos, mas sem marcar como inválida a pessoa que está apenas por atribuição individual.

## Observação

Nada é removido: templates que hoje usam só grupos continuam funcionando igual.
