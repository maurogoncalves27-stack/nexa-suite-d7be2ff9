import { Navigate, useLocation } from "react-router-dom";
import { useAuth, AppRole } from "@/hooks/useAuth";
import { usePartnerPermissions } from "@/hooks/usePartnerPermissions";
import { useViewMode } from "@/hooks/useViewMode";
import { Loader2 } from "lucide-react";
import type { ExternalModuleKey } from "@/lib/externalModules";

interface Props {
  children: React.ReactNode;
  requireRoles?: AppRole[];
  redirectTo?: string;
  /**
   * Se informado, parceiros externos (supplier/outsourced) só podem acessar
   * quando tiverem este módulo liberado em external_partner_permissions.
   * Staff (admin/manager) sempre tem acesso.
   */
  requireModule?: ExternalModuleKey;
}

/**
 * Rotas que sócios (role 'partner') podem acessar (sem ser admin/manager).
 * Mantém em sincronia com src/pages/PartnerDashboard.tsx (links rápidos).
 */
const PARTNER_ALLOWED_PREFIXES = [
  "/painel-socio",
  "/dashboard",
  "/faturamento",
  "/financeiro",          // cobre /financeiro, /financeiro/dre, /financeiro/cmv, etc.
  "/conciliacao",
  "/ranking",
  "/ocorrencias/relatorio",
  "/avaliacoes-clientes",
  "/selecionar-acesso",
];

const isPartnerAllowedPath = (pathname: string) => {
  if (pathname === "/") return true;
  return PARTNER_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname === p);
};

/** Rotas acessíveis em modo "colaborador" (área pessoal). */
const EMPLOYEE_ALLOWED_PREFIXES = [
  "/area-colaborador",
  "/meus-holerites",
  "/checklists",
  "/ponto",
  "/recebimento",
  "/produtos",
  "/estoque",
  "/inventario",
  "/transferencias",
  "/envio-itens",
  "/solicitacoes-fabrica",
  "/sugestao-transferencia",
  "/nutricontrol",
  "/selecionar-acesso",
];

/** Rotas acessíveis em modo "nutricionista". */
const NUTRITIONIST_ALLOWED_PREFIXES = [
  "/nutricionista",
  "/nutricontrol",
  "/nutri-visita",
  "/nutri-relatorios",
  "/checklists",
  "/selecionar-acesso",
];

/** Rotas acessíveis em modo "fornecedor". */
const SUPPLIER_ALLOWED_PREFIXES = [
  "/fornecedor",
  "/parceiro",
  "/selecionar-acesso",
];

const matchPrefix = (pathname: string, list: string[]) => {
  if (pathname === "/") return true;
  return list.some((p) => pathname === p || pathname.startsWith(p + "/"));
};

const isEmployeeAllowedPath = (pathname: string) => matchPrefix(pathname, EMPLOYEE_ALLOWED_PREFIXES);
const isNutritionistAllowedPath = (pathname: string) => matchPrefix(pathname, NUTRITIONIST_ALLOWED_PREFIXES);
const isSupplierAllowedPath = (pathname: string) => matchPrefix(pathname, SUPPLIER_ALLOWED_PREFIXES);

export const ProtectedRoute = ({ children, requireRoles, redirectTo = "/auth", requireModule }: Props) => {
  const { user, loading, roles: rolesRaw, isExternalPartner, isAdmin: isAdminRaw, isManager: isManagerRaw, isContabilidade, isPartner: isPartnerRaw, isSuperUser, isStoreLogin } = useAuth();
  const { modules, loading: modLoading } = usePartnerPermissions();
  const { mode: viewMode } = useViewMode();
  const location = useLocation();
  const isTotemLogin = Boolean((user?.user_metadata as { totem_login?: boolean } | undefined)?.totem_login);

  // O modo escolhido em /selecionar-acesso vira o perfil efetivo da sessão.
  const suppressStaff = viewMode === "socio" || viewMode === "colaborador" || viewMode === "nutricionista" || viewMode === "fornecedor";
  const suppressPartner = viewMode === "colaborador" || viewMode === "nutricionista" || viewMode === "fornecedor";
  const isAdmin = suppressStaff ? false : isAdminRaw;
  const isManager = suppressStaff ? false : isManagerRaw;
  const isPartner = suppressPartner ? false : isPartnerRaw;
  const effectivePartner = viewMode === "socio" ? (isPartnerRaw || isSuperUser) : isPartner;
  const roles = suppressStaff
    ? rolesRaw.filter((r) => r !== "admin" && r !== "manager" && (suppressPartner ? r !== "partner" : true))
    : rolesRaw;

  if (loading || (requireModule && isExternalPartner && modLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to={redirectTo} replace state={{ from: location }} />;

  // Login dedicado de TOTEM: ignora viewMode/roles comuns e fica restrito ao /totem.
  if (isTotemLogin) {
    const p = location.pathname;
    const allowed = p === "/totem" || p.startsWith("/totem/");
    if (!allowed) return <Navigate to="/totem" replace />;
    return <>{children}</>;
  }

  // Login fixo de PC de loja (store_login): só pode acessar /loja e o PDV.
  if (isStoreLogin) {
    const p = location.pathname;
    const allowed =
      p === "/loja" || p.startsWith("/loja/") ||
      p === "/balcao" || p.startsWith("/balcao/") ||
      p === "/pdv-novo" || p.startsWith("/pdv-novo/");
    if (!allowed) return <Navigate to="/loja" replace />;
    return <>{children}</>;
  }

  // Contabilidade: só pode acessar rotas que liberam essa role.
  // Quando a rota libera, passa direto — ignora viewMode antigo (ex.: "colaborador")
  // que ficou em sessionStorage e bloquearia o acesso logo abaixo.
  if (isContabilidade && !isAdminRaw && !isManagerRaw) {
    const allowsContabilidade = requireRoles?.includes("contabilidade");
    if (!allowsContabilidade) {
      return <Navigate to="/contabilidade" replace />;
    }
    return <>{children}</>;
  }


  // Modo "nutricionista": só permite rotas da nutricionista.
  if (viewMode === "nutricionista" && !isAdmin && !isManager) {
    if (!isNutritionistAllowedPath(location.pathname)) {
      return <Navigate to="/nutricionista/painel" replace />;
    }
  }

  // Modo "fornecedor": só permite rotas do fornecedor.
  if (viewMode === "fornecedor" && !isAdmin && !isManager) {
    if (!isSupplierAllowedPath(location.pathname)) {
      return <Navigate to="/fornecedor/painel" replace />;
    }
  }

  // Modo "colaborador": restringe a área pessoal (independente de roles reais).
  if (viewMode === "colaborador" && !isAdmin && !isManager && !effectivePartner) {
    if (!isEmployeeAllowedPath(location.pathname)) {
      return <Navigate to="/area-colaborador" replace />;
    }
  }

  // Sócio (partner): só pode visitar rotas da whitelist.
  // Staff (admin/manager) ignora essa restrição (mesmo que também tenha role partner).
  if (effectivePartner && !isAdmin && !isManager) {
    if (!isPartnerAllowedPath(location.pathname)) {
      return <Navigate to="/painel-socio" replace />;
    }
  }

  if (requireRoles && requireRoles.length > 0) {
    const ok = requireRoles.some((r) => roles.includes(r));
    if (!ok) return <Navigate to="/" replace />;
  }

  // Para parceiros externos, exige módulo liberado.
  // Staff sempre passa (não é parceiro externo).
  if (requireModule && isExternalPartner && !isAdmin && !isManager) {
    if (!modules.has(requireModule)) {
      // Sem permissão — manda para painel apropriado
      const fallback = roles.includes("supplier") ? "/fornecedor/painel" : "/terceirizado/painel";
      return <Navigate to={fallback} replace />;
    }
  }

  return <>{children}</>;
};
