import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";

import { useInactivityLogout } from "@/hooks/useInactivityLogout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";

// Eager: rotas críticas de boot (auth + landing)
import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";

// Lazy: demais páginas só carregam ao acessar a rota
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const ResetPassword = lazy(() => import("./pages/ResetPassword.tsx"));
const Stores = lazy(() => import("./pages/Stores.tsx"));
const Employees = lazy(() => import("./pages/Employees.tsx"));
const TerminatedEmployees = lazy(() => import("./pages/TerminatedEmployees.tsx"));
const EmployeeForm = lazy(() => import("./pages/EmployeeForm.tsx"));
const Evaluations = lazy(() => import("./pages/Evaluations.tsx"));
const WeeklyPayments = lazy(() => import("./pages/WeeklyPayments.tsx"));
const EmployeeRanking = lazy(() => import("./pages/EmployeeRanking.tsx"));
const Gratifications = lazy(() => import("./pages/Gratifications.tsx"));
const Payroll = lazy(() => import("./pages/Payroll.tsx"));
const Contabilidade = lazy(() => import("./pages/Contabilidade.tsx"));
const PayrollAdvances = lazy(() => import("./pages/PayrollAdvances.tsx"));
const FreelancerDailyPayments = lazy(() => import("./pages/FreelancerDailyPayments.tsx"));
const FreelancerJobs = lazy(() => import("./pages/FreelancerJobs.tsx"));
const FreelancerAuth = lazy(() => import("./pages/FreelancerAuth.tsx"));
const FreelancerPortal = lazy(() => import("./pages/FreelancerPortal.tsx"));
const TrainingReceipts = lazy(() => import("./pages/TrainingReceipts.tsx"));
const TransportVoucher = lazy(() => import("./pages/TransportVoucher.tsx"));
const HolidaysWorked = lazy(() => import("./pages/HolidaysWorked.tsx"));
const NightAddition = lazy(() => import("./pages/NightAddition.tsx"));
const Trainings = lazy(() => import("./pages/Trainings.tsx"));
const Climate = lazy(() => import("./pages/Climate.tsx"));
const Vacations = lazy(() => import("./pages/Vacations.tsx"));
const Uniforms = lazy(() => import("./pages/Uniforms.tsx"));
const EmployeeArea = lazy(() => import("./pages/EmployeeArea.tsx"));
const ManagerArea = lazy(() => import("./pages/ManagerArea.tsx"));
const MyPayslips = lazy(() => import("./pages/MyPayslips.tsx"));
const ViewEmployee = lazy(() => import("./pages/ViewEmployee.tsx"));
const Schedules = lazy(() => import("./pages/Schedules.tsx"));

const Internships = lazy(() => import("./pages/Internships.tsx"));
const InternshipPaymentsPage = lazy(() => import("./pages/InternshipPaymentsPage.tsx"));
const Rescissions = lazy(() => import("./pages/Rescissions.tsx"));
const TimeClock = lazy(() => import("./pages/TimeClock.tsx"));
const BancoHoras = lazy(() => import("./pages/BancoHoras.tsx"));
const Announcements = lazy(() => import("./pages/Announcements.tsx"));
const Tasks = lazy(() => import("./pages/Tasks.tsx"));
const ChecklistsManage = lazy(() => import("./pages/ChecklistsManage.tsx"));
const CustomDocuments = lazy(() => import("./pages/CustomDocuments.tsx"));
const Responsibilities = lazy(() => import("./pages/Responsibilities.tsx"));
const Contracts = lazy(() => import("./pages/Contracts.tsx"));
const Infractions = lazy(() => import("./pages/Infractions.tsx"));
const AutomationRules = lazy(() => import("./pages/AutomationRules.tsx"));
const PositionBonuses = lazy(() => import("./pages/PositionBonuses.tsx"));
const MedicalCertificates = lazy(() => import("./pages/MedicalCertificates.tsx"));
const NutriReports = lazy(() => import("./pages/NutriReports.tsx"));
const NutriVisit = lazy(() => import("./pages/NutriVisit.tsx"));
const NutriVisitHistorico = lazy(() => import("./pages/NutriVisitHistorico.tsx"));
const Checklists = lazy(() => import("./pages/Checklists.tsx"));
const Nutricontrol = lazy(() => import("./pages/Nutricontrol.tsx"));
const NutritionistPanel = lazy(() => import("./pages/NutritionistPanel.tsx"));

const EmployeeFolders = lazy(() => import("./pages/EmployeeFolders.tsx"));
const Recruitment = lazy(() => import("./pages/Recruitment.tsx"));
const Settings = lazy(() => import("./pages/Settings.tsx"));
const WhatsAppAdmin = lazy(() => import("./pages/WhatsAppAdmin.tsx"));
const WhatsAppCustomerAdmin = lazy(() => import("./pages/WhatsAppCustomerAdmin.tsx"));
const WhatsApp = lazy(() => import("./pages/WhatsApp.tsx"));
const DeliverySettings = lazy(() => import("./pages/DeliverySettings.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const VerifySignature = lazy(() => import("./pages/VerifySignature.tsx"));
const InventoryReceiving = lazy(() => import("./pages/InventoryReceiving.tsx"));
const NfArchived = lazy(() => import("./pages/NfArchived.tsx"));
const InventoryProducts = lazy(() => import("./pages/InventoryProducts.tsx"));
const InventoryStock = lazy(() => import("./pages/InventoryStock.tsx"));
const InventoryCounts = lazy(() => import("./pages/InventoryCounts.tsx"));
const InventoryTransfers = lazy(() => import("./pages/InventoryTransfers.tsx"));
const PurchaseSuggestions = lazy(() => import("./pages/PurchaseSuggestions.tsx"));
const InventoryLots = lazy(() => import("./pages/InventoryLots.tsx"));
const Recipes = lazy(() => import("./pages/Recipes.tsx"));
const RecipeBook = lazy(() => import("./pages/RecipeBook.tsx"));
const BankReconciliation = lazy(() => import("./pages/BankReconciliation.tsx"));
const FactoryRequests = lazy(() => import("./pages/FactoryRequests.tsx"));
const FactoryWeeklyPlan = lazy(() => import("./pages/FactoryWeeklyPlan.tsx"));
const PettyCash = lazy(() => import("./pages/PettyCash.tsx"));
const Faturamento = lazy(() => import("./pages/Faturamento.tsx"));
const CustomerReviews = lazy(() => import("./pages/CustomerReviews.tsx"));
const SeparationChecklist = lazy(() => import("./pages/SeparationChecklist.tsx"));
const Finance = lazy(() => import("./pages/Finance.tsx"));
const FinanceDre = lazy(() => import("./pages/FinanceDre.tsx"));
const FinanceAccounts = lazy(() => import("./pages/FinanceAccounts.tsx"));
const FinanceCategories = lazy(() => import("./pages/FinanceCategories.tsx"));
const FinanceCmv = lazy(() => import("./pages/FinanceCmv.tsx"));
const FinancePricing = lazy(() => import("./pages/FinancePricing.tsx"));
const FinanceGasVouchers = lazy(() => import("./pages/FinanceGasVouchers.tsx"));
const FinanceGasVouchersDashboard = lazy(() => import("./pages/FinanceGasVouchersDashboard.tsx"));
const FinanceAccountStatement = lazy(() => import("./pages/FinanceAccountStatement.tsx"));
const SupplierAuth = lazy(() => import("./pages/SupplierAuth.tsx"));
const SupplierRegister = lazy(() => import("./pages/SupplierRegister.tsx"));
const SupplierPending = lazy(() => import("./pages/SupplierPending.tsx"));
const SupplierDashboard = lazy(() => import("./pages/SupplierDashboard.tsx"));
const Suppliers = lazy(() => import("./pages/Suppliers.tsx"));
const Quotations = lazy(() => import("./pages/Quotations.tsx"));

const PdvNovo = lazy(() => import("./pages/PdvNovo.tsx"));

const TefPaygoSetup = lazy(() => import("./pages/TefPaygoSetup.tsx"));
const PdvCancellations = lazy(() => import("./pages/PdvCancellations.tsx"));
const StoreHome = lazy(() => import("./pages/StoreHome.tsx"));
const SmartPos = lazy(() => import("./pages/SmartPos.tsx"));
const SmartPosLogin = lazy(() => import("./pages/SmartPosLogin.tsx"));
const Garcom = lazy(() => import("./pages/Garcom.tsx"));
const Totem = lazy(() => import("./pages/Totem.tsx"));
const TotemConfig = lazy(() => import("./pages/TotemConfig.tsx"));
const NfceTester = lazy(() => import("./pages/NfceTester.tsx"));

const Menu = lazy(() => import("./pages/Menu.tsx"));
const ComplementsCatalog = lazy(() => import("./pages/ComplementsCatalog.tsx"));
const Occurrences = lazy(() => import("./pages/Occurrences.tsx"));
const OccurrencesReport = lazy(() => import("./pages/OccurrencesReport.tsx"));

const Vault = lazy(() => import("./pages/Vault.tsx"));
const EquipmentWarranties = lazy(() => import("./pages/EquipmentWarranties.tsx"));
const AssetInventory = lazy(() => import("./pages/AssetInventory.tsx"));
const PartnerAuth = lazy(() => import("./pages/PartnerAuth.tsx"));
const PartnerRegister = lazy(() => import("./pages/PartnerRegister.tsx"));
const PartnerPending = lazy(() => import("./pages/PartnerPending.tsx"));
const OutsourcedDashboard = lazy(() => import("./pages/OutsourcedDashboard.tsx"));
const ExternalAccess = lazy(() => import("./pages/ExternalAccess.tsx"));
const PartnerPreview = lazy(() => import("./pages/PartnerPreview.tsx"));
const PublicJobs = lazy(() => import("./pages/PublicJobs.tsx"));
const PublicJobDetail = lazy(() => import("./pages/PublicJobDetail.tsx"));
const CandidateDocumentUpload = lazy(() => import("./pages/CandidateDocumentUpload.tsx"));
const LegalPage = lazy(() => import("./pages/LegalPage.tsx"));
const PartnerDashboard = lazy(() => import("./pages/PartnerDashboard.tsx"));
const SelectAccess = lazy(() => import("./pages/SelectAccess.tsx"));
const MigrateNexa = lazy(() => import("./pages/admin/MigrateNexa.tsx"));

const queryClient = new QueryClient();

const STAFF = ["admin", "manager"] as const;

const InactivityWatcher = () => {
  useInactivityLogout();
  return null;
};

const RouteFallback = () => (
  <div className="flex min-h-[40vh] items-center justify-center">
    <Loader2 className="h-6 w-6 animate-spin text-primary" />
  </div>
);

/**
 * Wrapper de rota interna: aplica ProtectedRoute (com role opcional) sobre
 * cada página filha, enquanto o AppLayout permanece montado no nível pai.
 */
const Guarded = ({
  staff = false,
  accountant = false,
  partner = false,
  module: requireModule,
  children,
}: {
  staff?: boolean;
  accountant?: boolean;
  /** Se true, sócios (role 'partner') também podem acessar essa rota (somente leitura). */
  partner?: boolean;
  module?: import("@/lib/externalModules").ExternalModuleKey;
  children: React.ReactNode;
}) => {
  const roles: import("@/hooks/useAuth").AppRole[] | undefined = staff
    ? (accountant
        ? (partner ? ["admin", "manager", "contabilidade", "partner"] : ["admin", "manager", "contabilidade"])
        : (partner ? ["admin", "manager", "partner"] : ["admin", "manager"]))
    : undefined;
  return (
    <ProtectedRoute requireRoles={roles} requireModule={requireModule}>
      {children}
    </ProtectedRoute>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ThemeProvider>
        <AuthProvider>
          
          <InactivityWatcher />
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verificar/:type/:id" element={<VerifySignature />} />
            <Route path="/termos" element={<LegalPage variant="terms" />} />
            <Route path="/privacidade" element={<LegalPage variant="privacy" />} />

            {/* Página pública de vagas */}
            <Route path="/vagas" element={<PublicJobs />} />
            <Route path="/vagas/:id" element={<PublicJobDetail />} />
            <Route path="/enviar-documentos/:token" element={<CandidateDocumentUpload />} />

            {/* Área do freelancer (login próprio) */}
            <Route path="/freelancer/login" element={<FreelancerAuth />} />
            <Route path="/freelancer/painel" element={
              <ProtectedRoute redirectTo="/freelancer/login"><FreelancerPortal /></ProtectedRoute>
            } />

            {/* Área pública do fornecedor */}
            <Route path="/fornecedor/login" element={<SupplierAuth />} />
            <Route path="/fornecedor/cadastro" element={<SupplierRegister />} />
            <Route path="/fornecedor/aguardando" element={
              <ProtectedRoute redirectTo="/fornecedor/login"><SupplierPending /></ProtectedRoute>
            } />
            <Route path="/fornecedor/painel" element={
              <ProtectedRoute redirectTo="/fornecedor/login"><SupplierDashboard /></ProtectedRoute>
            } />

            {/* Área pública unificada para parceiros (fornecedor + terceirizado) */}
            <Route path="/parceiro/login" element={<PartnerAuth />} />
            <Route path="/parceiro/cadastro" element={<PartnerRegister />} />
            <Route path="/parceiro/aguardando" element={
              <ProtectedRoute redirectTo="/parceiro/login"><PartnerPending /></ProtectedRoute>
            } />
            <Route path="/terceirizado/painel" element={
              <ProtectedRoute redirectTo="/parceiro/login"><OutsourcedDashboard /></ProtectedRoute>
            } />

            {/* Preview admin: visualizar painel de parceiro como gestor */}
            <Route path="/preview-parceiro/:userId" element={
              <ProtectedRoute requireRoles={[...STAFF]}><PartnerPreview /></ProtectedRoute>
            } />

            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/selecionar-acesso" element={<ProtectedRoute><SelectAccess /></ProtectedRoute>} />
            <Route path="/nutricionista/painel" element={<ProtectedRoute><NutritionistPanel /></ProtectedRoute>} />

            {/* /balcao foi unificado em /loja */}
            <Route path="/balcao" element={<Navigate to="/loja" replace />} />
            {/* Totem fullscreen kiosk - fora do AppLayout */}
            <Route path="/totem" element={
              <ProtectedRoute requireRoles={[...STAFF]}><Totem /></ProtectedRoute>
            } />
            {/* Loja (PDV + atalhos) — fullscreen sem sidebar/breadcrumb */}
            <Route path="/loja" element={
              <ProtectedRoute requireRoles={[...STAFF]}><StoreHome /></ProtectedRoute>
            } />
            {/* Smart POS — fullscreen mobile (Cielo LIO / Stone / qualquer Android) */}
            <Route path="/smartpos/login" element={<SmartPosLogin />} />
            <Route path="/smartpos" element={
              <ProtectedRoute requireRoles={[...STAFF]}><SmartPos /></ProtectedRoute>
            } />
            {/* NEXA Garçom — Gertec GPOS780 + PayGo (Fase 1: TEF mock) */}
            <Route path="/garcom" element={
              <ProtectedRoute requireRoles={[...STAFF]}><Garcom /></ProtectedRoute>
            } />



            {/*
              Rotas internas do app: o AppLayout é montado UMA VEZ aqui no
              pai. Ao trocar entre as filhas, apenas o <Outlet /> dentro do
              layout é re-renderizado — sidebar, sino de notificações e
              providers permanecem vivos, evitando o "refresh" do sistema.
            */}
            <Route element={<AppLayout />}>
              <Route path="/admin/migrate-nexa" element={<Guarded staff><MigrateNexa /></Guarded>} />
              <Route path="/dashboard" element={<Guarded staff partner><Dashboard /></Guarded>} />
              <Route path="/painel-socio" element={<ProtectedRoute><PartnerDashboard /></ProtectedRoute>} />
              <Route path="/ranking" element={<Guarded staff partner><EmployeeRanking /></Guarded>} />
              <Route path="/area-colaborador" element={<Guarded><EmployeeArea /></Guarded>} />
              <Route path="/area-gestor" element={<Guarded staff><ManagerArea /></Guarded>} />
              <Route path="/meus-holerites" element={<Guarded><MyPayslips /></Guarded>} />
              <Route path="/visualizar-colaborador" element={<Guarded staff><ViewEmployee /></Guarded>} />

              <Route path="/lojas" element={<Guarded staff><Stores /></Guarded>} />
              <Route path="/avisos" element={<Guarded staff><Announcements /></Guarded>} />
              <Route path="/tarefas" element={<Guarded staff><Tasks /></Guarded>} />
              <Route path="/checklists-gerenciar" element={<Guarded staff><ChecklistsManage /></Guarded>} />
              <Route path="/documentos-personalizados" element={<Guarded staff><CustomDocuments /></Guarded>} />
              <Route path="/atribuicoes" element={<Guarded staff><Responsibilities /></Guarded>} />
              <Route path="/contratos" element={<Guarded staff><Contracts /></Guarded>} />
              <Route path="/infracoes" element={<Guarded staff accountant><Infractions /></Guarded>} />
              <Route path="/regras-automaticas" element={<Guarded staff><AutomationRules /></Guarded>} />
              <Route path="/bonus-cargo" element={<Guarded staff><PositionBonuses /></Guarded>} />
              <Route path="/atestados" element={<Guarded staff accountant><MedicalCertificates /></Guarded>} />
              <Route path="/nutri-relatorios" element={<Guarded module="nutri_relatorios"><NutriReports /></Guarded>} />
              <Route path="/nutri-visita" element={<Guarded module="nutri_visita"><NutriVisit /></Guarded>} />
              <Route path="/nutri-visita/historico" element={<Guarded module="nutri_visita"><NutriVisitHistorico /></Guarded>} />
              <Route path="/colaboradores" element={<Guarded staff accountant><Employees /></Guarded>} />
              <Route path="/colaboradores/desligados" element={<Guarded staff accountant><TerminatedEmployees /></Guarded>} />
              <Route path="/colaboradores/:id" element={<Guarded staff accountant><EmployeeForm /></Guarded>} />
              <Route path="/avaliacoes" element={<Guarded staff><Evaluations /></Guarded>} />
              <Route path="/bonificacoes" element={<Guarded staff><WeeklyPayments /></Guarded>} />
              {/* /ranking definido acima com partner */}
              <Route path="/gratificacoes" element={<Guarded staff><Gratifications /></Guarded>} />
              <Route path="/folha" element={<Guarded staff accountant><Payroll /></Guarded>} />
              <Route path="/contabilidade" element={<ProtectedRoute requireRoles={["admin","manager","contabilidade"]}><Contabilidade /></ProtectedRoute>} />
              <Route path="/adiantamentos" element={<Guarded staff><PayrollAdvances /></Guarded>} />
              <Route path="/diarias-freelancers" element={<Guarded staff><FreelancerDailyPayments /></Guarded>} />
              <Route path="/vagas-diaria" element={<Guarded staff><FreelancerJobs /></Guarded>} />
              <Route path="/recibos-treinamento" element={<Guarded staff><TrainingReceipts /></Guarded>} />
              <Route path="/vale-transporte" element={<Guarded staff><TransportVoucher /></Guarded>} />
              <Route path="/feriados-trabalhados" element={<Guarded staff><HolidaysWorked /></Guarded>} />
              <Route path="/adicional-noturno" element={<Guarded staff><NightAddition /></Guarded>} />
              <Route path="/treinamentos" element={<Guarded staff><Trainings /></Guarded>} />
              <Route path="/clima" element={<Guarded staff><Climate /></Guarded>} />
              <Route path="/ferias" element={<Guarded staff><Vacations /></Guarded>} />
              <Route path="/uniformes" element={<Guarded staff><Uniforms /></Guarded>} />
              <Route path="/escalas" element={<Guarded staff><Schedules /></Guarded>} />
              
              <Route path="/estagio" element={<Guarded staff><Internships /></Guarded>} />
              <Route path="/estagio/pagamentos" element={<Guarded staff><InternshipPaymentsPage /></Guarded>} />
              <Route path="/rescisoes" element={<Guarded staff><Rescissions /></Guarded>} />
              <Route path="/checklists" element={<Guarded><Checklists /></Guarded>} />
              <Route path="/nutricontrol" element={<Guarded module="nutricontrol"><Nutricontrol /></Guarded>} />
              
              <Route path="/ponto" element={<Guarded staff><TimeClock /></Guarded>} />
              <Route path="/banco-horas" element={<Guarded staff><BancoHoras /></Guarded>} />
              
              <Route path="/pasta-colaborador" element={<Guarded staff accountant><EmployeeFolders /></Guarded>} />
              <Route path="/recrutamento" element={<Guarded staff><Recruitment /></Guarded>} />
              <Route path="/configuracoes" element={<Guarded staff><Settings /></Guarded>} />
              <Route path="/configuracoes/acessos-externos" element={<Guarded staff><ExternalAccess /></Guarded>} />
              <Route path="/configuracoes/whatsapp-cliente" element={<Guarded staff><WhatsAppCustomerAdmin /></Guarded>} />
              <Route path="/configuracoes/entregas" element={<Guarded staff><DeliverySettings /></Guarded>} />
              <Route path="/configuracoes/whatsapp" element={<Guarded staff><WhatsAppAdmin /></Guarded>} />
              <Route path="/whatsapp" element={<Guarded staff><WhatsApp /></Guarded>} />
              <Route path="/configuracoes/totem" element={<Guarded staff><TotemConfig /></Guarded>} />
              <Route path="/configuracoes/nfce-tester" element={<Guarded staff><NfceTester /></Guarded>} />
              <Route path="/configuracoes/tef-paygo" element={<Guarded staff><TefPaygoSetup /></Guarded>} />
              <Route path="/recebimento" element={<Guarded><InventoryReceiving /></Guarded>} />
              <Route path="/nf-arquivadas" element={<Guarded><NfArchived /></Guarded>} />
              <Route path="/produtos" element={<Guarded><InventoryProducts /></Guarded>} />
              <Route path="/estoque" element={<Guarded><InventoryStock /></Guarded>} />
              <Route path="/inventario" element={<Guarded><InventoryCounts /></Guarded>} />
              <Route path="/transferencias" element={<Guarded><InventoryTransfers /></Guarded>} />
              <Route path="/envio-itens" element={<Guarded><InventoryTransfers /></Guarded>} />
              <Route path="/solicitacoes-fabrica" element={<Guarded><FactoryRequests /></Guarded>} />
              <Route path="/plano-fabrica" element={<Guarded staff><FactoryWeeklyPlan /></Guarded>} />
              <Route path="/separacao" element={<Guarded staff><SeparationChecklist /></Guarded>} />
              <Route path="/sugestao-transferencia" element={<Guarded><InventoryTransfers /></Guarded>} />
              <Route path="/sugestao-compra" element={<Guarded staff><PurchaseSuggestions /></Guarded>} />
              <Route path="/lotes" element={<Guarded><InventoryLots /></Guarded>} />
              <Route path="/perdas" element={<Guarded><InventoryLots /></Guarded>} />
              <Route path="/fichas-tecnicas" element={<Guarded module="fichas_tecnicas"><Recipes /></Guarded>} />
              <Route path="/receituario" element={<Guarded module="fichas_tecnicas"><RecipeBook /></Guarded>} />
              <Route path="/conciliacao" element={<Guarded staff partner><BankReconciliation /></Guarded>} />
              <Route path="/caixinha" element={<Guarded><PettyCash /></Guarded>} />
              <Route path="/faturamento" element={<Guarded><Faturamento /></Guarded>} />
              <Route path="/avaliacoes-clientes" element={<Guarded><CustomerReviews /></Guarded>} />
              <Route path="/financeiro" element={<Guarded staff partner module="financeiro"><Finance /></Guarded>} />
              <Route path="/financeiro/dre" element={<Guarded staff partner><FinanceDre /></Guarded>} />
              <Route path="/financeiro/contas" element={<Guarded staff partner><FinanceAccounts /></Guarded>} />
              <Route path="/financeiro/extrato-conta" element={<Guarded staff partner><FinanceAccountStatement /></Guarded>} />
              <Route path="/financeiro/categorias" element={<Guarded staff partner><FinanceCategories /></Guarded>} />
              <Route path="/financeiro/cmv" element={<Guarded staff partner><FinanceCmv /></Guarded>} />
              <Route path="/financeiro/precificacao" element={<Guarded staff partner><FinancePricing /></Guarded>} />
              <Route path="/financeiro/vale-gas" element={<Guarded><FinanceGasVouchers /></Guarded>} />
              <Route path="/financeiro/vale-gas/dashboard" element={<Guarded staff><FinanceGasVouchersDashboard /></Guarded>} />
              <Route path="/fornecedores" element={<Guarded staff><Suppliers /></Guarded>} />
              <Route path="/cotacoes" element={<Guarded staff><Quotations /></Guarded>} />
              
              <Route path="/pdv-novo" element={<Guarded staff><PdvNovo /></Guarded>} />
              <Route path="/pdv-cancelamentos" element={<Guarded staff><PdvCancellations /></Guarded>} />
              

              {/* /loja movido para fora do AppLayout (fullscreen) */}
              <Route path="/cardapio" element={<Guarded staff><Menu /></Guarded>} />
              <Route path="/cardapio/complementos" element={<Guarded staff><ComplementsCatalog /></Guarded>} />
              <Route path="/ocorrencias" element={<Guarded><Occurrences /></Guarded>} />
              <Route path="/ocorrencias/relatorio" element={<Guarded staff partner><OccurrencesReport /></Guarded>} />
              
              <Route path="/cofre" element={<Guarded staff><Vault /></Guarded>} />
              <Route path="/garantias" element={<Guarded><EquipmentWarranties /></Guarded>} />
              <Route path="/patrimonio" element={<Guarded staff><AssetInventory /></Guarded>} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          
        </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
