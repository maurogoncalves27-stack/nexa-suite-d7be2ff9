
## Auditoria concluída — 70 páginas analisadas

**Resultado:** 7 ✅ corretas · 52 ⚠️ divergentes · 11 ❌ sem cabeçalho padrão.
Exceções (PDV, Totem, Garçom, painéis Sócio/Nutricionista/Fornecedor/Freelancer/Terceirizado, Auth, públicas) foram ignoradas.

---

## Padrão oficial reforçado

```tsx
<div className="space-y-6">
  <div>
    <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
      <Icon className="h-6 w-6 md:h-7 md:w-7 text-primary" />
      Título
    </h1>
    <p className="text-muted-foreground">Descrição.</p>
  </div>
  …conteúdo…
</div>
```

Regras:
- Tamanho do h1 **fixo** em `text-xl md:text-2xl` (nunca `text-3xl`).
- Ícone **sempre** `h-6 w-6 md:h-7 md:w-7 text-primary` (sem `text-red-*`, `text-destructive`, hardcode).
- O ícone do h1 deve ser **idêntico** ao ícone do item correspondente no `AppSidebar`.
- Sem CardTitle/Header duplicando o título da página logo abaixo do h1.

---

## Etapa 1 — Corrigir tamanhos e cor do ícone (52 páginas ⚠️)

Aplicar substituição mecânica nas páginas listadas para deixar h1 em `text-xl md:text-2xl font-bold flex items-center gap-2` e ícone em `h-6 w-6 md:h-7 md:w-7 text-primary`.

Grupos:
- **`text-2xl md:text-3xl` → `text-xl md:text-2xl`** (~40 páginas): Announcements, AutomationRules, BankReconciliation, Checklists, ChecklistsManage, Climate, Contracts, CustomDocuments, Dashboard, Employees, EquipmentWarranties, Evaluations, FactoryRequests, FactoryWeeklyPlan, Infractions, Internships, InventoryCounts, InventoryLots, InventoryStock, InventoryTransfers, MedicalCertificates, Occurrences, OccurrencesReport, PettyCash, PositionBonuses, PurchaseSuggestions, RecipeBook, Recipes, Recruitment, Responsibilities, Schedules, SeparationChecklist, Settings, Stores, Tasks, TerminatedEmployees, TimeClock, Trainings, Uniforms, Vacations, Vault.
- **`text-xl md:text-3xl` → `text-xl md:text-2xl`** (md errado): Contabilidade, Gratifications, HolidaysWorked, InternshipPaymentsPage, MyPayslips, NightAddition, PayrollAdvances, Rescissions, TrainingReceipts, TransportVoucher, WeeklyPayments.
- **Casos especiais de h1**: Payroll (`text-lg md:text-3xl`), FinanceCmv, FinanceGasVouchers, FinancePricing, Menu, Quotations, EmployeeRanking, EmployeeForm, EmployeeFolders — reescrever bloco do cabeçalho inteiro.
- **Ícone sem `text-primary` / com cor errada**: Infractions (`text-destructive`), Occurrences (`text-red-600`), RecipeBook, Recipes, InventoryTransfers, FinancePricing → trocar para `text-primary`.

---

## Etapa 2 — Adicionar cabeçalho padrão onde falta (11 páginas ❌)

Inserir o bloco padrão (h1 + descrição) com o ícone do sidebar:

| Página | Ícone (do sidebar) | Título |
|---|---|---|
| AssetInventory | `Landmark` | Patrimônio |
| CustomerReviews | `Star` | Avaliações de clientes |
| Faturamento | `TrendingUp` | Faturamento |
| Finance | `DollarSign` | Financeiro |
| FinanceAccounts | `Building2` | Contas bancárias |
| FinanceCategories | `Tags` | Categorias financeiras |
| FinanceDre | `FileBarChart` | DRE |
| ExternalAccess | `Link2` | Acessos externos |
| BancoHoras | `Hourglass` | Banco de horas |
| EmployeeArea | `User` | Minha área |
| ViewEmployee | `User` | Visualizar colaborador |

Balcao e SupplierDashboard ficam fora (exceções — kitchen display / portal fornecedor).

---

## Etapa 3 — Alinhar ícones página ↔ sidebar (9 divergências)

Trocar **na página** para casar com o sidebar (mantém memória visual do menu):

| Página | Trocar `Icon da página` por | Motivo |
|---|---|---|
| AutomationRules | `Settings2` → `Settings` | igual ao sidebar |
| EmployeeFolders | `FolderOpen` → `Archive` | igual ao sidebar |
| Gratifications | `Gift` → `BadgePercent` | igual ao sidebar |
| InventoryReceiving | `Package` → `PackageCheck` | igual ao sidebar |
| InventoryTransfers | `Truck` → `ArrowLeftRight` | igual ao sidebar |
| NightAddition | `Moon` → `Hourglass` | igual ao sidebar |
| RecipeBook | `BookOpen` → `BookMarked` | igual ao sidebar |
| Rescissions | `FileText` → `FileSignature` | igual ao sidebar |
| WeeklyPayments | `Wallet` → `HandCoins` | igual ao sidebar |

---

## Etapa 4 — Resolver ícones duplicados no sidebar

10 colisões detectadas. Proposta de troca **no sidebar** (e refletir na página correspondente):

| Item afetado | Ícone atual | Novo ícone | Conflito que resolve |
|---|---|---|---|
| Lotes, validades e perdas | `CalendarClock` | `PackageCheck` (ou `ClipboardX`) | conflito com Escalas |
| Plano semanal (Fábrica) | `CalendarDays` | `CalendarRange` | conflito com Feriados trabalhados |
| Faturamento bruto | `TrendingUp` | `BarChart2` | conflito com Saldo de estoque |
| Conciliação | `Landmark` | `Scale` | conflito com Extrato |
| Patrimônio | `Landmark` | `Building` | conflito com Extrato |
| Termos e circulares | `FileSignature` | `FileText` | conflito com Rescisões |
| Diárias de freelancers | `HandCoins` | `Banknote` | conflito com Bolsa Estágio |
| Caixinha da loja | `Wallet` | `PiggyBank` | conflito com Acréscimos/Descontos |
| Recibos de treinamento | `GraduationCap` | `FileBadge` | conflito com Estágio |

Após trocar no sidebar, alinhar o h1 das páginas (`AssetInventory`, `BankReconciliation`, `FactoryWeeklyPlan`, `InventoryLots`, `Faturamento`, `CustomDocuments`, `FreelancerDailyPayments` *(exceção, ignorar)*, `PettyCash`, `TrainingReceipts`).

---

## Etapa 5 — Memória do projeto

Atualizar `mem://preferences/header-pattern` (criar se não existir) com:
- Snippet do padrão completo.
- Regra: ícone do h1 = ícone do sidebar.
- Lista de exceções permanentes (PDV, Totem, Garçom, painéis Sócio/Nutricionista/Fornecedor/Freelancer/Terceirizado, Auth/públicas).

Indexar no `mem://index.md`.

---

## Detalhes técnicos

- Edits 100% mecânicos via `code--line_replace` por arquivo; sem mudança de lógica.
- Verificar ausência de `CardHeader > CardTitle` duplicando o título do h1; quando houver, remover esse CardHeader.
- Para páginas em `❌ Sem cabeçalho`, embrulhar o conteúdo atual num `<div className="space-y-6">` se ainda não estiver.
- Total estimado: ~70 arquivos tocados, sem migrações, sem mudanças de rota, sem alteração de comportamento.
