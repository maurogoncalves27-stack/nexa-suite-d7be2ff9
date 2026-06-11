import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import EmployeeArea from "./EmployeeArea";
import { isRestorableRouteSnapshot, readLastAppRoute } from "@/lib/pwaRouteState";
import { useViewMode } from "@/hooks/useViewMode";

const Index = () => {
  const { loading, user, isSupplier, isOutsourced, isContabilidade, isAdmin, isManager, isPartner, isSuperUser, isStoreLogin, hasRole } = useAuth();
  const isNutritionist = hasRole("nutritionist");
  const { mode } = useViewMode();

  // Apenas este usuário vê a tela de seleção de perfil (Gestor / Sócio / Colaborador).
  const MULTI_PROFILE_USER_ID = "ec5e52b2-a4c3-46c7-8d11-a5b6cf406866"; // maurogoncalves27@gmail.com
  const canChooseProfile = user?.id === MULTI_PROFILE_USER_ID;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Quando rodando dentro do app Electron Totem, ir direto para /totem
  if (typeof window !== "undefined" && (window as any).electron?.isTotem) {
    return <Navigate to="/totem" replace />;
  }

  // Login fixo de PC de loja: vai direto para /loja (sidebar próprio, sem sidebar do sistema).
  if (isStoreLogin) {
    return <Navigate to="/loja" replace />;
  }

  // Nutricionista tem prioridade sobre supplier/outsourced — toda nutricionista
  // vinculada deve cair no painel da nutricionista, mesmo se também marcada como terceirizada.
  if (isNutritionist && !isAdmin && !isManager) {
    return <Navigate to="/nutricionista/painel" replace />;
  }

  if (isSupplier) {
    return <Navigate to="/fornecedor/painel" replace />;
  }

  if (isOutsourced) {
    return <Navigate to="/terceirizado/painel" replace />;
  }

  if (isContabilidade && !isAdmin && !isManager) {
    try { sessionStorage.removeItem("rh:viewMode"); } catch {}
    return <Navigate to="/contabilidade" replace />;
  }


  // Quantos perfis o usuário pode escolher?
  const canGestor = isAdmin || isManager || isSuperUser;
  const canSocio = isPartner || isSuperUser;
  const profilesCount = (canGestor ? 1 : 0) + (canSocio ? 1 : 0) + 1; // +1 colaborador (sempre)

  // Apenas o usuário autorizado vê a tela de escolha de perfil.
  if (canChooseProfile && profilesCount > 1 && !mode) {
    return <Navigate to="/selecionar-acesso" replace />;
  }

  // Respeita modo escolhido na sessão (apenas para o usuário autorizado)
  if (canChooseProfile && mode === "gestor" && canGestor) {
    return <Navigate to="/dashboard" replace />;
  }
  if (canChooseProfile && mode === "socio" && canSocio) {
    return <Navigate to="/painel-socio" replace />;
  }
  if (canChooseProfile && mode === "colaborador") {
    return <Navigate to="/area-colaborador" replace />;
  }

  // Demais usuários: comportamento direto, sem tela de seleção.
  if (!canChooseProfile && (isAdmin || isManager || isSuperUser)) {
    return <Navigate to="/dashboard" replace />;
  }
  if (!canChooseProfile && isPartner && !isAdmin && !isManager) {
    return <Navigate to="/painel-socio" replace />;
  }
  // Sócio puro (legado) — mantido para o usuário autorizado quando ainda não escolheu.
  if (canChooseProfile && isPartner && !isAdmin && !isManager && !mode) {
    return <Navigate to="/painel-socio" replace />;
  }

  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const launchedFromPwa = params.get("source") === "pwa";
    const lastRoute = readLastAppRoute();

    if (launchedFromPwa && isRestorableRouteSnapshot(lastRoute)) {
      return <Navigate to={lastRoute!} replace />;
    }
  }

  return (
    <AppLayout>
      <EmployeeArea />
    </AppLayout>
  );
};

export default Index;
