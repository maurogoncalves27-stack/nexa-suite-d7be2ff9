import { ReactNode, useEffect, useState } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { AppSidebar } from "@/components/AppSidebar";
import { EmployeeSidebar } from "@/components/EmployeeSidebar";
import { NutritionistSidebar } from "@/components/NutritionistSidebar";
import WarningSignatureDialog from "@/components/warnings/WarningSignatureDialog";
import EnsureUserSignature from "@/components/auth/EnsureUserSignature";
import NotificationsBell from "@/components/notifications/NotificationsBell";
import { Button } from "@/components/ui/button";
import { PanelLeft, Search, UserSearch, ArrowLeft, Home, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useViewMode } from "@/hooks/useViewMode";
import { CommandPalette, useCommandPalette } from "@/components/CommandPalette";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { buildRouteSnapshot, isRestorableAppRoute, saveLastAppRoute } from "@/lib/pwaRouteState";

type PageMeta = { match: (p: string) => boolean; title: string; group?: string };

// Ordem importa: rotas mais específicas devem vir ANTES das mais genéricas
const PAGE_TITLES: PageMeta[] = [
  { match: (p) => p === "/", title: "Área do Colaborador" },
  { match: (p) => p === "/painel-socio", title: "Painel do Sócio" },
  { match: (p) => p === "/selecionar-acesso", title: "Selecionar acesso" },
  { match: (p) => p === "/admin/migrate-nexa", title: "Migrar para NEXA", group: "Admin" },
  { match: (p) => p === "/dashboard", title: "Dashboard" },
  { match: (p) => p.startsWith("/visualizar-colaborador"), title: "Visualizar colaborador", group: "Pessoas" },
  { match: (p) => p.startsWith("/area-colaborador"), title: "Área do Colaborador" },

  // Pessoas
  { match: (p) => p === "/colaboradores/desligados", title: "Desligados", group: "Pessoas" },
  { match: (p) => /^\/colaboradores\/[^/]+$/.test(p), title: "Editar colaborador", group: "Pessoas" },
  { match: (p) => p.startsWith("/colaboradores"), title: "Cadastros", group: "Pessoas" },
  { match: (p) => p.startsWith("/recrutamento"), title: "Recrutamento", group: "Pessoas" },
  { match: (p) => p.startsWith("/estagio/pagamentos"), title: "Bolsa Estágio", group: "Pagamentos" },
  { match: (p) => p.startsWith("/estagio"), title: "Estágio", group: "Pessoas" },
  
  { match: (p) => p.startsWith("/atribuicoes"), title: "Atribuições por cargo", group: "Pessoas" },
  { match: (p) => p.startsWith("/treinamentos"), title: "Treinamentos", group: "Pessoas" },

  // Jornada
  { match: (p) => p.startsWith("/banco-horas"), title: "Banco de Horas", group: "Jornada" },
  { match: (p) => p.startsWith("/ponto"), title: "Ponto", group: "Jornada" },
  { match: (p) => p.startsWith("/escalas"), title: "Escalas", group: "Jornada" },
  { match: (p) => p.startsWith("/ferias"), title: "Férias", group: "Jornada" },
  { match: (p) => p.startsWith("/atestados"), title: "Atestados Médicos", group: "Jornada" },
  { match: (p) => p.startsWith("/uniformes"), title: "Uniformes", group: "Jornada" },
  { match: (p) => p.startsWith("/tarefas"), title: "Tarefas", group: "Jornada" },

  // Desempenho
  { match: (p) => p.startsWith("/avaliacoes"), title: "Avaliações", group: "Desempenho" },
  { match: (p) => p.startsWith("/clima"), title: "Clima", group: "Desempenho" },
  { match: (p) => p.startsWith("/regras-automaticas"), title: "Regras automáticas", group: "Desempenho" },
  { match: (p) => p.startsWith("/infracoes"), title: "Infrações e Advertências", group: "Desempenho" },
  { match: (p) => p.startsWith("/avisos"), title: "Avisos e agenda", group: "Desempenho" },

  // Operação (mais específicas primeiro)
  { match: (p) => p.startsWith("/checklists-gerenciar"), title: "Check-lists operacionais", group: "Operação" },
  { match: (p) => p.startsWith("/checklists"), title: "Check-lists", group: "Operação" },
  { match: (p) => p.startsWith("/nutri-relatorios"), title: "Relatórios NutriControle", group: "Operação" },
  { match: (p) => p.startsWith("/nutricionista/painel"), title: "Painel da Nutricionista", group: "Operação" },
  { match: (p) => p.startsWith("/nutri-visita"), title: "Visita técnica", group: "Operação" },
  { match: (p) => p.startsWith("/nutricontrol"), title: "NutriControle", group: "Operação" },
  { match: (p) => p.startsWith("/ocorrencias/relatorio"), title: "Relatório de Ocorrências", group: "Operação" },
  { match: (p) => p.startsWith("/ocorrencias"), title: "Central de Ocorrências", group: "Operação" },
  { match: (p) => p.startsWith("/avaliacoes-clientes"), title: "Avaliações de clientes", group: "Operação" },

  // Pagamentos
  { match: (p) => p.startsWith("/adiantamentos"), title: "Acréscimos e descontos", group: "Pagamentos" },
  { match: (p) => p.startsWith("/recibos-treinamento"), title: "Recibos de treinamento", group: "Pagamentos" },
  { match: (p) => p.startsWith("/folha"), title: "Folha de pagamento", group: "Pagamentos" },
  { match: (p) => p.startsWith("/contabilidade"), title: "Contabilidade", group: "Pagamentos" },
  { match: (p) => p.startsWith("/meus-holerites"), title: "Meus holerites", group: "Pagamentos" },
  { match: (p) => p.startsWith("/bonificacoes"), title: "Bonificações", group: "Pagamentos" },
  { match: (p) => p.startsWith("/diarias-freelancers"), title: "Diárias de freelancers", group: "Pagamentos" },
  { match: (p) => p.startsWith("/vagas-diaria"), title: "Vagas de diária", group: "Pagamentos" },
  { match: (p) => p.startsWith("/ranking"), title: "Ranking de Colaboradores", group: "Pagamentos" },
  { match: (p) => p.startsWith("/gratificacoes"), title: "Gratificações", group: "Pagamentos" },
  { match: (p) => p.startsWith("/bonus-cargo"), title: "Bônus por cargo", group: "Pagamentos" },
  { match: (p) => p.startsWith("/vale-transporte"), title: "Vale Transporte", group: "Pagamentos" },
  { match: (p) => p.startsWith("/feriados-trabalhados"), title: "Feriados trabalhados", group: "Pagamentos" },
  { match: (p) => p.startsWith("/adicional-noturno"), title: "Adicional Noturno", group: "Pagamentos" },
  { match: (p) => p.startsWith("/rescisoes"), title: "Rescisões", group: "Pagamentos" },

  // Documentos
  { match: (p) => p.startsWith("/contratos"), title: "Contratos", group: "Documentos" },
  { match: (p) => p.startsWith("/documentos-personalizados"), title: "Termos e circulares", group: "Documentos" },
  
  { match: (p) => p.startsWith("/pasta-colaborador"), title: "Pasta do Colaborador", group: "Documentos" },
  { match: (p) => p.startsWith("/cofre"), title: "Cofre (logins e contatos)", group: "Documentos" },

  // Estoque
  { match: (p) => p === "/nf-arquivadas", title: "NF arquivadas", group: "Estoque" },
  { match: (p) => p.startsWith("/recebimento"), title: "Entrada de mercadorias", group: "Estoque" },
  { match: (p) => p.startsWith("/produtos"), title: "Produtos", group: "Estoque" },
  { match: (p) => p.startsWith("/estoque"), title: "Saldo de estoque", group: "Estoque" },
  { match: (p) => p.startsWith("/inventario"), title: "Contagem", group: "Estoque" },
  { match: (p) => p.startsWith("/sugestao-transferencia"), title: "Transferências", group: "Estoque" },
  { match: (p) => p.startsWith("/envio-itens"), title: "Transferências", group: "Estoque" },
  { match: (p) => p.startsWith("/plano-fabrica"), title: "Plano semanal da fábrica", group: "Estoque" },
  { match: (p) => p.startsWith("/separacao"), title: "Checklist de separação", group: "Estoque" },
  { match: (p) => p.startsWith("/solicitacoes-fabrica"), title: "Solicitações de urgência", group: "Estoque" },
  { match: (p) => p.startsWith("/transferencias"), title: "Transferências", group: "Estoque" },
  { match: (p) => p.startsWith("/perdas"), title: "Lotes, validades e perdas", group: "Estoque" },
  { match: (p) => p.startsWith("/lotes"), title: "Lotes, validades e perdas", group: "Estoque" },
  { match: (p) => p.startsWith("/fichas-tecnicas"), title: "Fichas técnicas", group: "Estoque" },
  { match: (p) => p.startsWith("/receituario"), title: "Receituário", group: "Estoque" },
  { match: (p) => p.startsWith("/garantias"), title: "Garantias de equipamentos", group: "Documentos" },
  { match: (p) => p.startsWith("/patrimonio"), title: "Patrimônio", group: "Financeiro" },

  // Compras
  { match: (p) => p.startsWith("/sugestao-compra"), title: "Sugestão de compra", group: "Compras" },
  { match: (p) => p.startsWith("/cotacoes"), title: "Cotações", group: "Compras" },
  { match: (p) => p.startsWith("/fornecedores"), title: "Fornecedores", group: "Compras" },

  // PDV (mais específicas primeiro)
  { match: (p) => p.startsWith("/totem"), title: "Totem", group: "PDV" },
  { match: (p) => p.startsWith("/balcao"), title: "Modo Balcão", group: "PDV" },
  { match: (p) => p.startsWith("/pdv-novo/simulador"), title: "Simulador iFood", group: "PDV" },
  { match: (p) => p.startsWith("/pdv-novo/monitor"), title: "Monitor iFood", group: "PDV" },
  { match: (p) => p.startsWith("/pdv-novo"), title: "PDV", group: "PDV" },
  { match: (p) => p === "/loja", title: "Loja", group: "PDV" },
  { match: (p) => p.startsWith("/smartpos"), title: "Smart POS", group: "PDV" },
  { match: (p) => p.startsWith("/garcom"), title: "Garçom", group: "PDV" },
  { match: (p) => p.startsWith("/pdv"), title: "Vendas (Saipos – arquivado)", group: "PDV" },
  { match: (p) => p.startsWith("/cardapio"), title: "Cardápio", group: "PDV" },
  

  // Financeiro (mais específicas primeiro)
  { match: (p) => p.startsWith("/faturamento"), title: "Faturamento bruto", group: "Financeiro" },
  { match: (p) => p.startsWith("/financeiro/dre"), title: "DRE", group: "Financeiro" },
  { match: (p) => p.startsWith("/financeiro/cmv"), title: "CMV", group: "Financeiro" },
  { match: (p) => p.startsWith("/financeiro/precificacao"), title: "Precificação", group: "Financeiro" },
  { match: (p) => p.startsWith("/financeiro/contas"), title: "Contas bancárias", group: "Financeiro" },
  { match: (p) => p.startsWith("/financeiro/extrato-conta"), title: "Extrato da conta", group: "Financeiro" },
  { match: (p) => p.startsWith("/financeiro/categorias"), title: "Categorias", group: "Financeiro" },
  { match: (p) => p.startsWith("/financeiro/vale-gas/dashboard"), title: "Dashboard Vale Gás", group: "Financeiro" },
  { match: (p) => p.startsWith("/financeiro/vale-gas"), title: "Vale Gás", group: "Financeiro" },
  { match: (p) => p.startsWith("/financeiro"), title: "Extrato / +pagtos", group: "Financeiro" },
  { match: (p) => p.startsWith("/caixinha"), title: "Caixinha da loja", group: "Financeiro" },
  { match: (p) => p.startsWith("/conciliacao"), title: "Conciliação bancária", group: "Financeiro" },


  // Sistema
  { match: (p) => p.startsWith("/lojas"), title: "Lojas" },
  { match: (p) => p.startsWith("/configuracoes/acessos-externos"), title: "Acessos externos", group: "Configurações" },
  { match: (p) => p.startsWith("/configuracoes/whatsapp-cliente"), title: "WhatsApp Cliente", group: "Configurações" },
  { match: (p) => p.startsWith("/configuracoes/entregas"), title: "Entregas (Motoboy)", group: "Configurações" },
  { match: (p) => p.startsWith("/configuracoes/whatsapp"), title: "Notificações WhatsApp", group: "Configurações" },
  { match: (p) => p.startsWith("/configuracoes"), title: "Configurações" },
];

const HeaderBar = ({
  title,
  group,
  pathname,
  onOpenPalette,
  partnerOnly,
}: {
  title: string;
  group?: string;
  pathname: string;
  onOpenPalette: () => void;
  partnerOnly?: boolean;
}) => {
  const { toggleSidebar, isMobile } = useSidebar();
  const { isAdmin, isManager, signOut } = useAuth();
  const navigate = useNavigate();
  const isStaff = isAdmin || isManager;
  const employeeAreaLabel = isStaff ? "Área do Gestor" : "Área do Colaborador";
  const isEmployeeArea = title === "Área do Colaborador";
  const effectiveLabel = employeeAreaLabel;

  if (partnerOnly) {
    const isPanel = pathname === "/painel-socio";
    return (
      <header className="h-12 md:h-14 flex items-center border-b border-t bg-card px-2 md:px-4 sticky top-0 z-30 gap-1">
        {!isPanel && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="h-9 w-9 shrink-0"
            aria-label="Voltar"
          >
            <ArrowLeft className="!h-5 !w-5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          asChild
          className="h-9 w-9 shrink-0"
          aria-label="Painel do Sócio"
        >
          <Link to="/painel-socio">
            <Home className="!h-5 !w-5" />
          </Link>
        </Button>
        <div className="flex items-center min-w-0 flex-1">
          <span className="text-sm md:text-base font-semibold text-foreground truncate">
            {title}
          </span>
        </div>
        <NotificationsBell />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => signOut()}
          className="h-9 w-9 shrink-0"
          aria-label="Sair"
        >
          <LogOut className="!h-5 !w-5" />
        </Button>
      </header>
    );
  }

  return (
    <header className="h-12 md:h-14 flex items-center border-b border-t bg-card px-2 md:px-4 sticky top-0 z-30 gap-2">
      {isMobile && (
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="h-12 w-12 -ml-1 shrink-0"
          aria-label="Abrir menu"
        >
          <PanelLeft className="!h-7 !w-7" />
        </Button>
      )}
      <div className="flex items-center min-w-0 flex-1">
        {isEmployeeArea ? (
          <span className="text-sm md:text-base font-semibold text-foreground truncate">
            {effectiveLabel}
          </span>
        ) : (
          <Breadcrumb>
            <BreadcrumbList className="text-sm md:text-base gap-1.5 sm:gap-2">
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/area-colaborador">Início</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              {group && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <span className="text-muted-foreground">{group}</span>
                  </BreadcrumbItem>
                </>
              )}
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="truncate font-semibold">{title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        )}
      </div>
      {isStaff && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={pathname.startsWith("/visualizar-colaborador") ? "secondary" : "ghost"}
              size="icon"
              asChild
              className="h-8 w-8 shrink-0"
              aria-label={
                pathname.startsWith("/visualizar-colaborador")
                  ? "Voltar para a Área do Gestor"
                  : "Visualizar área de um colaborador"
              }
            >
              <Link to={pathname.startsWith("/visualizar-colaborador") ? "/area-colaborador" : "/visualizar-colaborador"}>
                <UserSearch className="!h-5 !w-5" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {pathname.startsWith("/visualizar-colaborador")
              ? "Voltar para a Área do Gestor"
              : "Visualizar área de um colaborador"}
          </TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenPalette}
            className="h-8 w-8 shrink-0"
            aria-label="Buscar páginas e ações"
          >
            <Search className="!h-5 !w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Buscar (⌘K)</TooltipContent>
      </Tooltip>
      <NotificationsBell />
    </header>
  );
};

/**
 * Layout da aplicação.
 *
 * - Quando usado como layout pai com `<Outlet />` (sem `children`), o
 *   shell permanece montado entre navegações: a sidebar, o sino de
 *   notificações (com canal realtime) e os providers NÃO são desmontados/
 *   remontados a cada troca de rota — só o conteúdo da página muda.
 * - O suporte a `children` é mantido por compatibilidade.
 */
export const AppLayout = ({ children }: { children?: ReactNode }) => {
  const { pathname, search, hash } = useLocation();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useCommandPalette();
  const { isPartner, isAdmin, isManager, isSuperUser } = useAuth();
  const { mode: viewMode } = useViewMode();
  const meta = PAGE_TITLES.find((p) => p.match(pathname));
  const currentTitle = meta?.title ?? "Sistema de RH";
  const PARTNER_ROUTES = [
    "/painel-socio",
    "/faturamento",
    "/financeiro",
    "/conciliacao",
    "/ranking",
    "/dashboard",
    "/ocorrencias/relatorio",
  ];
  const isPartnerRoute = PARTNER_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));
  const showPartnerBanner =
    viewMode !== "colaborador" && (
      (viewMode === "socio" && (isPartner || isSuperUser)) ||
      (isPartner && !isAdmin && !isManager) ||
      (viewMode !== "gestor" && isPartner && isPartnerRoute)
    );
  // Modo colaborador: esconde a sidebar gerencial e usa layout simples.
  const isEmployeeMode = viewMode === "colaborador";
  const isNutritionistMode = viewMode === "nutricionista";

  // Rotas permitidas no modo colaborador (qualquer outra é redirecionada)
  const EMPLOYEE_ALLOWED_ROUTES = [
    "/area-colaborador",
    "/meus-holerites",
    "/checklists",
    "/ocorrencias",
    "/avaliacoes-clientes",
    "/caixinha",
    "/faturamento",
    "/estoque",
    "/recebimento",
    "/produtos",
    "/inventario",
    "/transferencias",
    "/envio-itens",
    "/sugestao-transferencia",
    "/lotes",
    "/perdas",
    "/garantias",
    "/nutricontrol",
    "/financeiro/vale-gas",
    "/solicitacoes-fabrica",
  ];
  const isEmployeeRouteAllowed =
    pathname === "/" ||
    EMPLOYEE_ALLOWED_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));

  // Rotas permitidas no modo nutricionista
  const NUTRITIONIST_ALLOWED_ROUTES = [
    "/nutricionista",
    "/nutricontrol",
    "/nutri-visita",
    "/nutri-relatorios",
    "/checklists",
  ];
  const isNutritionistRouteAllowed =
    pathname === "/" ||
    NUTRITIONIST_ALLOWED_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));

  useEffect(() => {
    if (!isRestorableAppRoute(pathname)) return;
    saveLastAppRoute(buildRouteSnapshot(pathname, search, hash));
  }, [pathname, search, hash]);

  if (isEmployeeMode && !isEmployeeRouteAllowed) {
    return <Navigate to="/area-colaborador" replace />;
  }
  if (isNutritionistMode && !isNutritionistRouteAllowed) {
    return <Navigate to="/nutricionista/painel" replace />;
  }

  const showNutritionistBack =
    isNutritionistMode && pathname !== "/nutricionista/painel" && pathname !== "/nutricionista";

  return (
    <SidebarProvider open={isMobile ? undefined : true} onOpenChange={isMobile ? undefined : setOpen}>
      <div className="min-h-screen flex w-full bg-background">
        {!showPartnerBanner && !isEmployeeMode && !isNutritionistMode && <AppSidebar />}
        {!showPartnerBanner && isEmployeeMode && <EmployeeSidebar />}
        <div className="flex-1 flex flex-col min-w-0">
          <HeaderBar
            title={currentTitle}
            group={meta?.group}
            pathname={pathname}
            onOpenPalette={() => setPaletteOpen(true)}
            partnerOnly={showPartnerBanner}
          />
          <main
            className={`flex-1 p-4 md:p-6 space-y-4 min-w-0 overflow-x-hidden ${
              showPartnerBanner ? "partner-readonly" : ""
            }`}
          >
            {showNutritionistBack && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/nutricionista/painel")}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar ao painel
              </Button>
            )}
            <EnsureUserSignature />
            <WarningSignatureDialog />
            {children ?? <Outlet />}
          </main>
        </div>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </div>
    </SidebarProvider>
  );
};
