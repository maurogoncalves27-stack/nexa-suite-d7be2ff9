import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Users, GraduationCap, Award, Wallet, BookOpen, Briefcase, LogOut, CalendarClock, UserCircle, HeartHandshake, Plane, Shirt, Clock, FolderOpen, Fingerprint, UserSearch, Settings, ChevronRight, Megaphone, ShieldAlert, FileText, Stethoscope, ClipboardCheck, Gift, ReceiptText, Bus, ListChecks, FileSignature, Wrench, RefreshCw, Package, ShoppingCart, DollarSign, Truck, ShoppingBag, TrendingUp, FileBarChart, Landmark, Lock, ChefHat, ScanText, Layers, Send, UsersRound, AlertTriangle, Monitor, ShieldCheck, Factory, Search, Siren, Boxes, PackageCheck, CalendarDays, ClipboardList, Tags, ScrollText, BadgePercent, Coins, Building2, Scale, BookMarked, Archive, FolderLock, ArrowLeftRight, Calculator, Flame, Hourglass, Trophy, Star, Percent, HandCoins, UserX, Sparkles, Activity , BarChart2 , History , CalendarRange , Receipt , Building , FileSpreadsheet , PiggyBank , BadgeCheck , Banknote , XCircle, MessageCircle, Smartphone, Bike, CreditCard, Headset } from "lucide-react";
import { openCommandPalette } from "@/components/CommandPalette";
import { toast } from "@/hooks/use-toast";

import LabCoatIcon from "@/components/icons/LabCoatIcon";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import BiometricSettings from "@/components/auth/BiometricSettings";

type Item = { title: string; url: string; icon: any; staffOnly?: boolean; disabled?: boolean; requiredForPayroll?: boolean };
type Group = { label: string; icon: any; items: Item[]; disabled?: boolean };

// Dashboard fica fixo no topo (acima dos botões de módulo)
const buildTopItems = (isStaff: boolean): Item[] => [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, staffOnly: true },
];

// Grupos do RH — mantidos para compatibilidade (getFirstItemUrl), renderizados como Sections rotuladas
const rhGroups: Group[] = [
  {
    label: "Pessoas",
    icon: Users,
    items: [
      { title: "Cadastros", url: "/colaboradores", icon: Users, staffOnly: true },
      { title: "Desligados", url: "/colaboradores/desligados", icon: UserX, staffOnly: true },
      { title: "Recrutamento", url: "/recrutamento", icon: UserSearch, staffOnly: true },
      { title: "Vagas de diária", url: "/vagas-diaria", icon: Megaphone, staffOnly: true },
      { title: "Estágio", url: "/estagio", icon: GraduationCap, staffOnly: true },
    ],
  },
  {
    label: "Jornada",
    icon: Clock,
    items: [
      { title: "Ponto", url: "/ponto", icon: Clock, staffOnly: true },
      { title: "Escalas", url: "/escalas", icon: CalendarClock, staffOnly: true },
      { title: "Férias", url: "/ferias", icon: Plane, staffOnly: true },
      { title: "Atestados Médicos", url: "/atestados", icon: Stethoscope, staffOnly: true },
      { title: "Uniformes", url: "/uniformes", icon: Shirt, staffOnly: true },
    ],
  },
  {
    label: "Desempenho",
    icon: Award,
    items: [
      { title: "Avaliações", url: "/avaliacoes", icon: Award, staffOnly: true },
      { title: "Infrações e Advertências", url: "/infracoes", icon: ShieldAlert, staffOnly: true },
      { title: "Regras automáticas", url: "/regras-automaticas", icon: Settings, staffOnly: true },
      { title: "Clima", url: "/clima", icon: HeartHandshake, staffOnly: true },
    ],
  },
];

// Seções de submenu — separadas visualmente com rótulo em CAIXA ALTA
type Section = { items: Item[]; label?: string };

// RH renderizado como Sections rotuladas (espelho do rhGroups)
const rhSections: Section[] = [
  { label: "Pessoas", items: rhGroups[0].items },
  { label: "Jornada", items: rhGroups[1].items },
  { label: "Desempenho", items: rhGroups[2].items },
];

// Documentos (flat) — mantido para fallback
const documentosItems: Item[] = [
  { title: "Contratos", url: "/contratos", icon: FileText, staffOnly: true },
  { title: "Termos e circulares", url: "/documentos-personalizados", icon: FileSpreadsheet, staffOnly: true },
  { title: "Pasta do Colaborador", url: "/pasta-colaborador", icon: FolderOpen, staffOnly: true },
  { title: "Cofre (logins e contatos)", url: "/cofre", icon: Lock, staffOnly: true },
];

// Estoque: Movimentação | Controle | Cadastros
const estoqueSections: Section[] = [
  { label: "Movimentação", items: [
    { title: "Entrada de mercadorias", url: "/recebimento", icon: PackageCheck },
    { title: "Transferências", url: "/transferencias", icon: ArrowLeftRight, staffOnly: true },
    { title: "Requisições de urgência", url: "/solicitacoes-fabrica", icon: AlertTriangle },
    { title: "Plano semanal da fábrica", url: "/plano-fabrica", icon: CalendarRange, staffOnly: true },
    { title: "Checklist de separação", url: "/separacao", icon: ClipboardList, staffOnly: true },
  ]},
  { label: "Controle", items: [
    { title: "Saldo de estoque", url: "/estoque", icon: BarChart2 },
    { title: "Contagem", url: "/inventario", icon: Boxes },
    { title: "Lotes, validades e perdas", url: "/lotes", icon: History },
  ]},
  { label: "Cadastros", items: [
    { title: "Produtos", url: "/produtos", icon: Package },
  ]},
];

// Compras: Operação | Cadastros
const comprasSections: Section[] = [
  { label: "Operação", items: [
    { title: "Sugestão de compra", url: "/sugestao-compra", icon: ShoppingCart, staffOnly: true },
    { title: "Cotações", url: "/cotacoes", icon: Scale, staffOnly: true },
  ]},
  { label: "Cadastros", items: [
    { title: "Fornecedores", url: "/fornecedores", icon: Truck, staffOnly: true },
  ]},
];

// Financeiro: Visão geral | Caixa & Contas | Cadastros
const financeiroSections: Section[] = [
  { label: "Visão geral", items: [
    { title: "Extrato / +pagtos", url: "/financeiro", icon: DollarSign, staffOnly: true },
    { title: "Extrato da conta", url: "/financeiro/extrato-conta", icon: Landmark, staffOnly: true },
    { title: "DRE", url: "/financeiro/dre", icon: FileBarChart, staffOnly: true },
    { title: "Faturamento bruto", url: "/faturamento", icon: TrendingUp, staffOnly: true },
    { title: "CMV", url: "/financeiro/cmv", icon: Percent, staffOnly: true },
    { title: "Precificação", url: "/financeiro/precificacao", icon: Calculator, staffOnly: true },
  ]},
  { label: "Caixa & Contas", items: [
    { title: "Caixinha da loja", url: "/caixinha", icon: PiggyBank, staffOnly: false },
    { title: "Incluir NF/boleto", url: "/recebimento#boletos", icon: ReceiptText, staffOnly: true },
    { title: "Contas bancárias", url: "/financeiro/contas", icon: Building2, staffOnly: true },
    { title: "Conciliação", url: "/conciliacao", icon: Receipt, staffOnly: true },
  ]},
  { label: "Cadastros", items: [
    { title: "Categorias", url: "/financeiro/categorias", icon: Tags, staffOnly: true },
    { title: "Patrimônio", url: "/patrimonio", icon: Building, staffOnly: true },
  ]},
];

// Operação: Rotina diária | NutriControle | Atendimento
const operacaoSections: Section[] = [
  { label: "Rotina diária", items: [
    { title: "Check-lists", url: "/checklists-gerenciar", icon: ClipboardCheck, staffOnly: true },
    { title: "Tarefas", url: "/tarefas", icon: ListChecks, staffOnly: true },
  ]},
  { label: "NutriControle", items: [
    { title: "NutriControle", url: "/nutricontrol", icon: LabCoatIcon, staffOnly: true },
    { title: "Visita técnica", url: "/nutri-visita", icon: ClipboardCheck, staffOnly: true },
    { title: "Relatórios NutriControle", url: "/nutri-relatorios", icon: FileBarChart, staffOnly: true },
    { title: "Manutenções", url: "/nutricontrol?tab=manutencao", icon: Wrench, staffOnly: true },
    { title: "Vale Gás", url: "/financeiro/vale-gas", icon: Flame, staffOnly: false },
  ]},
  { label: "Atendimento", items: [
    { title: "Central de Ocorrências", url: "/ocorrencias", icon: Siren },
  ]},
];

// Documentos: Formais | Arquivos | Acessos
const documentosSections: Section[] = [
  { label: "Documentos formais", items: [
    { title: "Contratos", url: "/contratos", icon: ScrollText, staffOnly: true },
    { title: "Termos e circulares", url: "/documentos-personalizados", icon: FileSpreadsheet, staffOnly: true },
  ]},
  { label: "Arquivos", items: [
    { title: "Pasta do Colaborador", url: "/pasta-colaborador", icon: Archive, staffOnly: true },
    { title: "Garantias de equipamentos", url: "/garantias", icon: ShieldCheck },
  ]},
  { label: "Acessos", items: [
    { title: "Cofre (logins e contatos)", url: "/cofre", icon: FolderLock, staffOnly: true },
  ]},
];

// Pagamentos: Folha | Variáveis da folha | Outros pagamentos
const pagamentosSections: Section[] = [
  { label: "Folha", items: [
    { title: "Folha de pagamento", url: "/folha", icon: ReceiptText, staffOnly: true },
    { title: "Rescisões", url: "/rescisoes", icon: FileSignature, staffOnly: true },
  ]},
  { label: "Variáveis da folha", items: [
    { title: "Vale Transporte", url: "/vale-transporte", icon: Bus, staffOnly: true, requiredForPayroll: true },
    { title: "Adicional Noturno", url: "/adicional-noturno", icon: Hourglass, staffOnly: true, requiredForPayroll: true },
    { title: "Feriados trabalhados", url: "/feriados-trabalhados", icon: CalendarDays, staffOnly: true, requiredForPayroll: true },
    { title: "Acréscimos/descontos", url: "/adiantamentos", icon: Wallet, staffOnly: true, requiredForPayroll: true },
  ]},
  { label: "Outros pagamentos", items: [
    { title: "Bonificações", url: "/bonificacoes", icon: BadgePercent, staffOnly: true },
    { title: "Bônus por cargo", url: "/bonus-cargo", icon: Coins, staffOnly: true },
    { title: "Recibos de treinamento", url: "/recibos-treinamento", icon: BadgeCheck, staffOnly: true },
    { title: "Bolsa Estágio", url: "/estagio/pagamentos", icon: HandCoins, staffOnly: true },
    { title: "Diárias de freelancers", url: "/diarias-freelancers", icon: Banknote, staffOnly: true },
  ]},
];

// PDV: Operação | Cardápio
const pdvSections: Section[] = [
  { label: "Operação", items: [
    { title: "PDV (gestor)", url: "/pdv-novo", icon: ShoppingBag, staffOnly: true },
    { title: "Smart POS", url: "/smartpos", icon: Smartphone, staffOnly: true },
    { title: "Cancelamentos", url: "/pdv-cancelamentos", icon: XCircle, staffOnly: true },
    { title: "TEF", url: "/configuracoes/tef-paygo", icon: CreditCard, staffOnly: true },
    { title: "Totem", url: "/configuracoes/totem", icon: Monitor, staffOnly: true },
    { title: "WhatsApp", url: "/whatsapp", icon: MessageCircle, staffOnly: true },
    { title: "Entregas", url: "/configuracoes/entregas", icon: Bike, staffOnly: true },
    { title: "CRM", url: "/crm", icon: Headset, staffOnly: true },
  ]},
  { label: "Cardápio", items: [
    { title: "Cardápio", url: "/cardapio", icon: ScanText, staffOnly: true },
    { title: "Receituário", url: "/receituario", icon: BookMarked, staffOnly: true },
    { title: "Fichas técnicas", url: "/fichas-tecnicas", icon: ChefHat, staffOnly: true },
  ]},
];

// Fábrica: produção (sem rótulos — conforme print)
const fabricaSections: Section[] = [
  { items: [
    { title: "Plano semanal", url: "/plano-fabrica", icon: CalendarRange, staffOnly: true },
    { title: "Requisições de urgência", url: "/solicitacoes-fabrica", icon: AlertTriangle, staffOnly: true },
    { title: "Checklist de separação", url: "/separacao", icon: ClipboardList, staffOnly: true },
  ]},
];

// Versões flat (mantidas para getFirstItemUrl)
const estoqueItems: Item[] = estoqueSections.flatMap((s) => s.items);
const comprasItems: Item[] = comprasSections.flatMap((s) => s.items);
const financeiroItems: Item[] = financeiroSections.flatMap((s) => s.items);
const operacaoItems: Item[] = operacaoSections.flatMap((s) => s.items);
const pagamentosItems: Item[] = pagamentosSections.flatMap((s) => s.items);
const pdvItems: Item[] = pdvSections.flatMap((s) => s.items);
const fabricaItems: Item[] = fabricaSections.flatMap((s) => s.items);

export function AppSidebar() {
  const { state, isMobile, setOpen, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin: isAdminRaw, isManager: isManagerRaw, isContabilidade, isPartner: isPartnerRaw, isSuperUser, signOut, user } = useAuth();
  const { mode: viewMode } = useViewMode();
  // O modo escolhido em /selecionar-acesso vira o perfil efetivo da sessão.
  const suppressStaff = viewMode === "socio" || viewMode === "colaborador";
  const suppressPartner = viewMode === "colaborador";
  const isAdmin = suppressStaff ? false : isAdminRaw;
  const isManager = suppressStaff ? false : isManagerRaw;
  const isPartner = suppressPartner ? false : isPartnerRaw;
  // Mantém botão "Trocar perfil" quando o usuário tem mais de uma opção real.
  const profileCount =
    ((isAdminRaw || isManagerRaw || isSuperUser) ? 1 : 0) +
    ((isPartnerRaw || isSuperUser) ? 1 : 0) +
    1; // colaborador sempre disponível
  const hasMultipleProfiles = profileCount > 1;
  const goSelectAccess = () => navigate("/selecionar-acesso");
  const logoUrl = typeof window !== "undefined" ? localStorage.getItem("app.theme.logo") : null;
  const isStaff = isAdmin || isManager;
  // Itens que o contador pode ver mesmo não sendo staff
  const ACCOUNTANT_URLS = new Set<string>(["/folha", "/pasta-colaborador", "/contabilidade", "/colaboradores", "/atestados", "/infracoes"]);
  const canSeeItem = (item: Item) => {
    if (!item.staffOnly) return true;
    if (isStaff) return true;
    if (isContabilidade && ACCOUNTANT_URLS.has(item.url.split("?")[0])) return true;
    return false;
  };
  const [securityOpen, setSecurityOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  type FocusMode = "rh" | "pagamentos" | "estoque" | "compras" | "financeiro" | "operacao" | "pdv" | "fabrica" | "docs";
  const FOCUS_MODES: FocusMode[] = ["rh", "pagamentos", "estoque", "compras", "financeiro", "operacao", "pdv", "fabrica", "docs"];
  const [focusMode, setFocusMode] = useState<FocusMode>(() => {
    if (typeof window === "undefined") return "rh";
    const v = localStorage.getItem("sidebar-focus-mode") as FocusMode | null;
    return v && FOCUS_MODES.includes(v) ? v : "rh";
  });

  // Identifica qual botão da grade está "apertado" (baixo relevo). Único entre todos os botões.
  // Para modos: `mode:<modo>`. Para links: `link:<url>`.
  type ActiveGridKey = `mode:${FocusMode}` | `link:${string}`;
  const [activeGridButton, setActiveGridButton] = useState<ActiveGridKey>(() => {
    if (typeof window === "undefined") return "mode:rh";
    const v = localStorage.getItem("sidebar-active-grid") as ActiveGridKey | null;
    return v ?? "mode:rh";
  });

  // Status de aprovação mensal dos itens "requiredForPayroll" (cor da bolinha)
  const [approvalByUrl, setApprovalByUrl] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let cancelled = false;
    // Folha vigente refere-se sempre ao MÊS ANTERIOR (ex: em maio fechamos abril)
    const now = new Date();
    const ref = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const y = ref.getFullYear();
    const m = ref.getMonth() + 1;
    const checks: Array<[string, string]> = [
      ["/adiantamentos", "payroll_advances_review"],
      ["/vale-transporte", "payroll_vt_review"],
      ["/adicional-noturno", "payroll_night_addition_review"],
      ["/feriados-trabalhados", "payroll_holiday_worked_review"],
    ];
    (async () => {
      const result: Record<string, boolean> = {};
      for (const [url, table] of checks) {
        const { data } = await (supabase as any)
          .from(table)
          .select("id")
          .eq("reference_year", y)
          .eq("reference_month", m)
          .maybeSingle();
        result[url] = !!data;
      }
      if (!cancelled) setApprovalByUrl(result);
    })();
    return () => { cancelled = true; };
  }, [location.pathname]);

  const setActiveGrid = (key: ActiveGridKey) => {
    setActiveGridButton(key);
    try { localStorage.setItem("sidebar-active-grid", key); } catch {}
  };

  const getFirstItemUrl = (mode: FocusMode): string | null => {
    const pickFirst = (items: Item[]) => {
      const it = items.find((i) => canSeeItem(i) && !i.disabled && i.url && i.url !== "#");
      return it?.url ?? null;
    };
    if (mode === "rh") {
      for (const g of rhGroups) {
        const url = pickFirst(g.items);
        if (url) return url;
      }
      return null;
    }
    if (mode === "estoque") return pickFirst(estoqueItems);
    if (mode === "compras") return pickFirst(comprasItems);
    if (mode === "financeiro") return pickFirst(financeiroItems);
    if (mode === "operacao") return pickFirst(operacaoItems);
    if (mode === "docs") return pickFirst(documentosItems);
    if (mode === "pagamentos") return pickFirst(pagamentosItems);
    if (mode === "pdv") return pickFirst(pdvItems);
    if (mode === "fabrica") return pickFirst(fabricaItems);
    return null;
  };

  const setFocus = (mode: FocusMode) => {
    setFocusMode(mode);
    setActiveGrid(`mode:${mode}`);
    try { localStorage.setItem("sidebar-focus-mode", mode); } catch {}
    // No mobile: apenas troca o módulo ativo (mantém o sidebar aberto para o usuário escolher um item).
    // No desktop: navega para o primeiro item do módulo, como antes.
    if (isMobile) return;
    const url = getFirstItemUrl(mode);
    if (url) navigate(url);
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    toast({ title: "Atualizando...", description: "Buscando a versão mais recente do sistema." });
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.update().catch(() => undefined)));
      }
    } catch {
      // segue para o reload mesmo em caso de erro
    } finally {
      setTimeout(() => window.location.reload(), 300);
    }
  };

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    // Para /financeiro evitamos casar com /financeiro/dre, /financeiro/contas etc.
    if (path === "/financeiro") return location.pathname === "/financeiro";
    return location.pathname.startsWith(path);
  };

  const closeSidebar = () => {
    // Fecha imediatamente para resposta visual instantânea.
    // O NavLink já disparou a navegação no mesmo evento de clique.
    if (isMobile) {
      setOpenMobile(false);
    } else {
      setOpen(false);
    }
  };

  const renderItem = (item: Item) => {
    if (!canSeeItem(item)) return null;
    if (item.disabled) {
      return (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton
            disabled
            className="text-[19px] py-4 font-normal whitespace-normal break-words leading-snug data-[active=true]:font-normal opacity-50 cursor-not-allowed"
            title="Em breve"
          >
            <item.icon className="h-6 w-6 shrink-0" />
            {!collapsed && <span>{item.title}</span>}
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    }
    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild isActive={isActive(item.url)} className="text-[19px] py-4 font-normal whitespace-normal break-words leading-snug data-[active=true]:font-normal">
          <NavLink
            to={item.url}
            end={item.url === "/"}
            onClick={closeSidebar}
            className={collapsed ? "flex items-center justify-center w-full" : "flex items-center gap-2"}
            title={item.requiredForPayroll ? (approvalByUrl[item.url] ? "Aprovado para a folha vigente (mês anterior)" : "Aprovação obrigatória para gerar a folha (mês anterior)") : undefined}
          >
            <item.icon className="h-6 w-6 shrink-0" />
            {!collapsed && (
              <span className="flex items-center gap-1.5 flex-1 min-w-0">
                <span className="truncate">{item.title}</span>
                {item.requiredForPayroll && (
                  <span
                    aria-label={approvalByUrl[item.url] ? "Aprovado para o mês atual" : "Obrigatório para gerar a folha"}
                    className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${approvalByUrl[item.url] ? "bg-emerald-500" : "bg-amber-500"}`}
                  />
                )}
              </span>
            )}
            {collapsed && item.requiredForPayroll && (
              <span className={`absolute top-1 right-1 h-1.5 w-1.5 rounded-full ${approvalByUrl[item.url] ? "bg-emerald-500" : "bg-amber-500"}`} />
            )}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  const renderGroup = (group: Group) => {
    const visibleItems = group.items.filter(canSeeItem);
    if (visibleItems.length === 0) return null;
    const hasActive = visibleItems.some((it) => !it.disabled && isActive(it.url));

    // Grupo inteiro desabilitado: renderiza como item único, esmaecido
    if (group.disabled) {
      if (collapsed) {
        return (
          <SidebarMenuItem key={group.label}>
            <SidebarMenuButton
              disabled
              className="text-[19px] py-4 font-normal whitespace-normal break-words leading-snug data-[active=true]:font-normal opacity-50 cursor-not-allowed"
              title={`${group.label} — Em breve`}
            >
              <group.icon className="h-5 w-5 shrink-0" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      }
      return (
        <Collapsible key={group.label} className="group/collapsible">
          <SidebarMenuItem>
            <CollapsibleTrigger asChild>
              <SidebarMenuButton className="text-[19px] py-4 font-normal whitespace-normal break-words leading-snug data-[active=true]:font-normal opacity-60">
                <group.icon className="h-5 w-5 shrink-0" />
                <span>{group.label}</span>
                <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
              </SidebarMenuButton>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenuSub>
                {visibleItems.map((item) => (
                  <SidebarMenuSubItem key={item.title}>
                    <SidebarMenuSubButton
                      asChild
                      className="text-sm py-4 opacity-50 cursor-not-allowed pointer-events-none"
                      title="Em breve"
                    >
                      <span className="flex items-center gap-2">
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span>{item.title}</span>
                      </span>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            </CollapsibleContent>
          </SidebarMenuItem>
        </Collapsible>
      );
    }

    // Grupos com apenas 1 item: renderiza flat (não colapsa)
    if (visibleItems.length === 1) {
      const item = visibleItems[0];
      return (
        <SidebarMenuItem key={group.label}>
          <SidebarMenuButton asChild isActive={isActive(item.url)} className="text-[19px] py-4 font-normal whitespace-normal break-words leading-snug data-[active=true]:font-normal">
            <NavLink
              to={item.url}
              end={item.url === "/"}
              onClick={closeSidebar}
              className={collapsed ? "flex items-center justify-center w-full" : "flex items-center gap-2"}
            >
              <group.icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{item.title}</span>}
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    }

    // Quando colapsado, renderiza itens flat (só ícones)
    if (collapsed) {
      return <div key={group.label}>{visibleItems.map(renderItem)}</div>;
    }

    return (
      <div key={group.label} className="mt-3 first:mt-0">
        <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
          {group.label}
        </div>
        {visibleItems.map((item) => (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton asChild isActive={isActive(item.url)} className="text-[19px] py-4 font-normal whitespace-normal break-words leading-snug data-[active=true]:font-normal">
              <NavLink
                to={item.url}
                end={item.url === "/"}
                onClick={closeSidebar}
                className="flex items-center gap-2"
              >
                <item.icon className="h-6 w-6 shrink-0" />
                <span>{item.title}</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </div>
    );
  };

  // Renderiza várias seções de itens com linha sutil entre elas
  const renderSections = (sections: Section[]) => {
    const visibleSections = sections
      .map((s) => ({ label: s.label, items: s.items.filter(canSeeItem) }))
      .filter((s) => s.items.length > 0);
    if (visibleSections.length === 0) return null;
    return visibleSections.map((section, idx) => (
      <div
        key={`section-${idx}`}
        className={collapsed ? "" : "mt-3 first:mt-0"}
      >
        {!collapsed && section.label && (
          <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
            {section.label}
          </div>
        )}
        {section.items.map(renderItem)}
      </div>
    ));
  };

  // Sidebar simplificada para sócios (somente leitura)
  if (isPartner && !isAdmin && !isManager) {
    const partnerLinks = [
      { url: "/painel-socio", label: "Painel do Sócio", icon: LayoutDashboard },
      { url: "/dashboard", label: "Dashboard", icon: TrendingUp },
      { url: "/faturamento", label: "Faturamento", icon: TrendingUp },
      { url: "/financeiro/dre", label: "DRE", icon: FileBarChart },
      { url: "/financeiro", label: "Extrato financeiro", icon: DollarSign },
      { url: "/financeiro/cmv", label: "CMV", icon: Percent },
      { url: "/financeiro/precificacao", label: "Precificação", icon: Calculator },
      { url: "/conciliacao", label: "Conciliação", icon: Landmark },
      { url: "/ranking", label: "Ranking", icon: Trophy },
    ];
    return (
      <Sidebar collapsible="icon" className="dark:[--sidebar-background:222_20%_9%] dark:[--sidebar-foreground:210_20%_92%] dark:[--sidebar-primary:217_91%_55%] dark:[--sidebar-primary-foreground:0_0%_100%] dark:[--sidebar-accent:222_16%_16%] dark:[--sidebar-accent-foreground:0_0%_100%] dark:[--sidebar-border:222_15%_20%] dark:[--sidebar-ring:217_91%_60%] [--sidebar-background:222_22%_11%] [--sidebar-foreground:210_20%_92%] [--sidebar-primary:217_91%_55%] [--sidebar-primary-foreground:0_0%_100%] [--sidebar-accent:222_18%_18%] [--sidebar-accent-foreground:0_0%_100%] [--sidebar-border:222_15%_22%] [--sidebar-ring:217_91%_60%]">
        <SidebarHeader className="border-b border-b-border border-t border-t-border bg-white p-0">
          <div className={`flex items-center gap-3 ${collapsed ? "justify-center px-0 py-1" : "px-2 py-0"}`}>
            {collapsed ? (
              <div className="h-14 w-14 flex items-center justify-center shrink-0 overflow-hidden bg-white rounded-md">
                <img src={logoUrl || "/logo-nexa.png"} alt="Nexa" className="max-h-full max-w-full object-contain" />
              </div>
            ) : (
              <div className="flex-1 min-w-0 flex items-center gap-2 bg-white rounded-md py-1 px-2">
                <div className="shrink-0 flex items-center justify-center">
                  <img
                    src={logoUrl || "/logo-nexa.png"}
                    alt="Nexa - Gestão Inteligente"
                    className="max-h-10 md:max-h-12 w-auto object-contain"
                  />
                </div>
              </div>
            )}
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {partnerLinks.map((l) => (
                  <SidebarMenuItem key={l.url}>
                    <SidebarMenuButton asChild isActive={isActive(l.url)} className="text-[15px] py-3">
                      <NavLink to={l.url} onClick={closeSidebar} className="flex items-center gap-2">
                        <l.icon className="h-5 w-5 shrink-0" />
                        {!collapsed && <span>{l.label}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t p-2 space-y-1">
          {hasMultipleProfiles && (
            <Button variant="ghost" size="sm" onClick={goSelectAccess} className="w-full justify-start">
              <RefreshCw className="h-4 w-4" />
              {!collapsed && <span className="ml-2">Trocar acesso</span>}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start">
            <LogOut className="h-4 w-4" />
            {!collapsed && <span className="ml-2">Sair</span>}
          </Button>
        </SidebarFooter>
      </Sidebar>
    );
  }

  return (
    <Sidebar collapsible="icon" className="dark:[--sidebar-background:222_20%_9%] dark:[--sidebar-foreground:210_20%_92%] dark:[--sidebar-primary:217_91%_55%] dark:[--sidebar-primary-foreground:0_0%_100%] dark:[--sidebar-accent:222_16%_16%] dark:[--sidebar-accent-foreground:0_0%_100%] dark:[--sidebar-border:222_15%_20%] dark:[--sidebar-ring:217_91%_60%] [--sidebar-background:222_22%_11%] [--sidebar-foreground:210_20%_92%] [--sidebar-primary:217_91%_55%] [--sidebar-primary-foreground:0_0%_100%] [--sidebar-accent:222_18%_18%] [--sidebar-accent-foreground:0_0%_100%] [--sidebar-border:222_15%_22%] [--sidebar-ring:217_91%_60%]">
      <SidebarHeader className="border-b border-b-border border-t border-t-border bg-white p-0">
        <div className={`flex items-center gap-3 ${collapsed ? "justify-center px-0 py-1" : "px-2 py-0"}`}>
          {collapsed ? (
            <div className="h-14 w-14 flex items-center justify-center shrink-0 overflow-hidden bg-white rounded-md">
              <img
                src={logoUrl || "/logo-nexa.png"}
                alt="Nexa"
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ) : (
            <div className="flex-1 min-w-0 flex items-center gap-2 bg-white rounded-md py-1 px-2">
              {/* Logo compacta à esquerda (mesmo tamanho em mobile e desktop, agora que há atalhos ao lado) */}
              <div className="shrink-0 flex items-center justify-center">
                <img
                  src={logoUrl || "/logo-nexa.png"}
                  alt="Nexa - Gestão Inteligente"
                  className="max-h-10 md:max-h-12 w-auto object-contain"
                />
              </div>
              {/* Atalhos compactos ao lado da logo (Dashboard / Configurações / Perfil) — mobile e desktop */}
              {isStaff && (
                <div className="flex-1 min-w-0 flex items-center justify-end gap-1">
                  <NavLink
                    to="/dashboard"
                    end
                    onClick={() => { setActiveGrid("link:/dashboard"); closeSidebar(); }}
                    title="Dashboard"
                    aria-label="Dashboard"
                    className={`flex h-9 w-9 items-center justify-center rounded-md border transition-colors ${
                      activeGridButton === "link:/dashboard"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-card-foreground border-border hover:bg-muted"
                    }`}
                  >
                    <LayoutDashboard className="h-4 w-4" />
                  </NavLink>
                  <NavLink
                    to="/configuracoes"
                    end
                    onClick={() => { setActiveGrid("link:/configuracoes"); closeSidebar(); }}
                    title="Configurações"
                    aria-label="Configurações"
                    className={`flex h-9 w-9 items-center justify-center rounded-md border transition-colors ${
                      activeGridButton === "link:/configuracoes"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-card-foreground border-border hover:bg-muted"
                    }`}
                  >
                    <Settings className="h-4 w-4" />
                  </NavLink>
                  <NavLink
                    to={isStaff ? "/area-gestor" : "/area-colaborador"}
                    end
                    onClick={() => { setActiveGrid(isStaff ? "link:/area-gestor" : "link:/area-colaborador"); closeSidebar(); }}
                    title="Perfil"
                    aria-label="Perfil"
                    className={`flex h-9 w-9 items-center justify-center rounded-md border transition-colors ${
                      activeGridButton === (isStaff ? "link:/area-gestor" : "link:/area-colaborador")
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-card-foreground border-border hover:bg-muted"
                    }`}
                  >
                    <UserCircle className="h-4 w-4" />
                  </NavLink>
                </div>
              )}
            </div>
          )}
        </div>
      </SidebarHeader>

      {/* Grade de botões fixa no topo (não rola junto com o menu) */}
      {isStaff && (() => {
        type GridButton =
          | { kind: "mode"; mode: FocusMode; label: string; icon: any }
          | { kind: "link"; to: string; label: string; icon: any }
          | { kind: "disabled"; label: string; icon: any };

        const buttons: GridButton[] = [
          { kind: "mode", mode: "rh", label: "RH", icon: UsersRound },
          { kind: "mode", mode: "pagamentos", label: "Pagamentos", icon: DollarSign },
          { kind: "mode", mode: "financeiro", label: "Financeiro", icon: Landmark },
          { kind: "mode", mode: "estoque", label: "Estoque", icon: Package },
          { kind: "mode", mode: "compras", label: "Compras", icon: ShoppingCart },
          { kind: "mode", mode: "pdv", label: "PDV", icon: Monitor },
          { kind: "mode", mode: "fabrica", label: "Fábrica", icon: Factory },
          { kind: "mode", mode: "operacao", label: "Operação", icon: ChefHat },
          { kind: "mode", mode: "docs", label: "Docs", icon: FolderOpen },
        ];

        if (collapsed) {
          return (
            <div className="shrink-0 border-b border-sidebar-border" style={{ background: "hsl(var(--sidebar-background))" }}>
              <SidebarMenu className="p-2">
                {buttons.map((b, idx) => {
                  const Icon = b.icon;
                  if (b.kind === "mode") {
                    const active = activeGridButton === `mode:${b.mode}`;
                    return (
                      <SidebarMenuItem key={`${b.kind}-${idx}`}>
                        <SidebarMenuButton onClick={() => setFocus(b.mode)} isActive={active} className="py-5" title={b.label}>
                          <Icon className="h-5 w-5 shrink-0" />
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  }
                  if (b.kind === "link") {
                    const active = activeGridButton === `link:${b.to}`;
                    return (
                      <SidebarMenuItem key={`${b.kind}-${idx}`}>
                        <SidebarMenuButton asChild isActive={active} className="py-5">
                          <NavLink to={b.to} end onClick={() => { setActiveGrid(`link:${b.to}`); closeSidebar(); }} className="flex items-center justify-center w-full" title={b.label}>
                            <Icon className="h-5 w-5 shrink-0" />
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  }
                  return (
                    <SidebarMenuItem key={`${b.kind}-${idx}`}>
                      <SidebarMenuButton disabled className="py-5 opacity-50 cursor-not-allowed" title={`${b.label} — Em breve`}>
                        <Icon className="h-5 w-5 shrink-0" />
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </div>
          );
        }

        return (
          <div className="shrink-0 border-b border-sidebar-border" style={{ background: "hsl(var(--sidebar-background))" }}>
            <div className="grid grid-cols-3 gap-1 px-2 py-2">
              {buttons.map((b, idx) => {
                const Icon = b.icon;
                const baseClass = "flex flex-col items-center justify-center gap-0.5 rounded-md py-2 px-1 transition-colors font-medium text-[11px] text-center leading-tight min-h-[56px] border break-words hyphens-auto";
                if (b.kind === "mode") {
                  const active = activeGridButton === `mode:${b.mode}`;
                  return (
                    <button
                      key={`${b.kind}-${idx}`}
                      type="button"
                      onClick={() => setFocus(b.mode)}
                      title={`Mostrar ${b.label}`}
                      className={`${baseClass} ${
                        active
                          ? "bg-sidebar-primary text-sidebar-primary-foreground border-sidebar-primary"
                          : "bg-sidebar-accent/60 text-sidebar-foreground border-sidebar-border hover:bg-sidebar-accent"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span>{b.label}</span>
                    </button>
                  );
                }
                if (b.kind === "link") {
                  const active = activeGridButton === `link:${b.to}`;
                  return (
                    <NavLink
                      key={`${b.kind}-${idx}`}
                      to={b.to}
                      end
                      onClick={() => { setActiveGrid(`link:${b.to}`); closeSidebar(); }}
                      title={b.label}
                      className={`${baseClass} ${
                        active
                          ? "bg-sidebar-primary text-sidebar-primary-foreground border-sidebar-primary"
                          : "bg-sidebar-accent/60 text-sidebar-foreground border-sidebar-border hover:bg-sidebar-accent"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span>{b.label}</span>
                    </NavLink>
                  );
                }
                return (
                  <button
                    key={`${b.kind}-${idx}`}
                    type="button"
                    disabled
                    title={`${b.label} — Em breve`}
                    className={`${baseClass} bg-sidebar-accent/30 text-sidebar-foreground/40 border-sidebar-border/60 cursor-not-allowed`}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{b.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Para contabilidade: acesso direto às telas autorizadas, sem Área do Colaborador */}
              {!isStaff && isContabilidade && (
                <>
                  {renderItem({ title: "Contabilidade", url: "/contabilidade", icon: Calculator, staffOnly: true })}
                  {renderItem({ title: "Folha de pagamento", url: "/folha", icon: ReceiptText, staffOnly: true })}
                  {renderItem({ title: "Cadastros", url: "/colaboradores", icon: Users, staffOnly: true })}
                </>
              )}

              {/* Para colaboradores: link direto para a área */}
              {!isStaff && !isContabilidade && renderItem({ title: "Área do Colaborador", url: "/area-colaborador", icon: UserCircle })}

              {/* Para staff (gestores/admin): atalho para a Área do Gestor */}
              {isStaff && renderItem({ title: "Área do Gestor", url: "/area-gestor", icon: Briefcase, staffOnly: true })}

              {/* Conteúdo do módulo ativo (rolável) */}
              {isStaff && (() => {
                if (focusMode === "rh") return renderSections(rhSections);
                if (focusMode === "pagamentos") return renderSections(pagamentosSections);
                if (focusMode === "estoque") return renderSections(estoqueSections);
                if (focusMode === "compras") return renderSections(comprasSections);
                if (focusMode === "financeiro") return renderSections(financeiroSections);
                if (focusMode === "operacao") return renderSections(operacaoSections);
                if (focusMode === "pdv") return renderSections(pdvSections);
                if (focusMode === "fabrica") return renderSections(fabricaSections);
                if (focusMode === "docs") return renderSections(documentosSections);
                return null;
              })()}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-1 bg-sidebar">
        <div className={collapsed ? "flex flex-col items-center gap-0.5" : "flex items-center gap-1"}>
          <Button
            variant="ghost"
            size="sm"
            className={collapsed ? "w-full justify-center py-2 text-sidebar-foreground hover:bg-sidebar-accent" : "flex-1 justify-start text-sm py-2 text-sidebar-foreground hover:bg-sidebar-accent"}
            onClick={signOut}
            title="Sair"
          >
            <LogOut className="h-5 w-5" />
            {!collapsed && <span className="ml-2">Sair</span>}
          </Button>
          {hasMultipleProfiles && (
            <Button
              variant="ghost"
              size="sm"
              className={collapsed ? "w-full justify-center py-2 text-sidebar-foreground hover:bg-sidebar-accent" : "py-2 text-sidebar-foreground hover:bg-sidebar-accent shrink-0"}
              onClick={goSelectAccess}
              title="Trocar acesso"
            >
              <ArrowLeftRight className="h-5 w-5" />
              {collapsed && <span className="sr-only">Trocar acesso</span>}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className={collapsed ? "w-full justify-center py-2 text-sidebar-foreground hover:bg-sidebar-accent" : "py-2 text-sidebar-foreground hover:bg-sidebar-accent shrink-0"}
            onClick={() => setSecurityOpen(true)}
            title="Segurança"
          >
            <Fingerprint className="h-5 w-5" />
            {collapsed && <span className="sr-only">Segurança</span>}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={collapsed ? "w-full justify-center py-2 text-sidebar-foreground hover:bg-sidebar-accent" : "py-2 text-sidebar-foreground hover:bg-sidebar-accent shrink-0"}
            onClick={handleRefresh}
            disabled={refreshing}
            title="Atualizar sistema"
            aria-label="Atualizar sistema"
          >
            <RefreshCw className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} />
            {collapsed && <span className="sr-only">Atualizar</span>}
          </Button>
        </div>
      </SidebarFooter>

      <Dialog open={securityOpen} onOpenChange={setSecurityOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fingerprint className="h-5 w-5" />
              Segurança e Biometria
            </DialogTitle>
            <DialogDescription>
              Gerencie seus métodos de login biométrico (Passkey e reconhecimento facial).
            </DialogDescription>
          </DialogHeader>
          <BiometricSettings />
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
}
