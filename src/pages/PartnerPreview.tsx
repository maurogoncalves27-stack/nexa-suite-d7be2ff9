import { useEffect, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, ImpersonationProvider } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Eye } from "lucide-react";
import SupplierDashboard from "./SupplierDashboard";
import OutsourcedDashboard from "./OutsourcedDashboard";

/**
 * Permite que admin/manager visualize o painel de um parceiro externo
 * (fornecedor ou terceirizado) como se estivesse logado como ele.
 * Usa ImpersonationProvider para sobrescrever o user_id no AuthContext.
 *
 * IMPORTANTE: as queries continuam rodando com a sessão real (admin),
 * então RLS do admin se aplica — é um preview visual da estrutura.
 */
export default function PartnerPreview() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { isAdmin, isManager, loading } = useAuth();
  const [kind, setKind] = useState<"supplier" | "outsourced" | "unknown" | null>(null);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const [{ data: sup }, { data: out }] = await Promise.all([
        supabase.from("suppliers").select("id").eq("user_id", userId).maybeSingle(),
        supabase.from("outsourced_professionals").select("id").eq("user_id", userId).maybeSingle(),
      ]);
      if (sup) setKind("supplier");
      else if (out) setKind("outsourced");
      else setKind("unknown");
    })();
  }, [userId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isAdmin && !isManager) return <Navigate to="/" replace />;
  if (!userId) return <Navigate to="/acesso-externo" replace />;

  if (kind === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (kind === "unknown") {
    return (
      <div className="p-6 max-w-md mx-auto text-center space-y-3">
        <p className="text-muted-foreground">Esse usuário não é fornecedor nem terceirizado.</p>
        <Button onClick={() => navigate(-1)}>Voltar</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Banner de preview */}
      <div className="bg-warning text-warning-foreground px-4 py-2 flex items-center justify-between gap-3 sticky top-0 z-50 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <Eye className="h-4 w-4 shrink-0" />
          <span className="truncate">
            <strong>Modo preview</strong> — visualizando como{" "}
            {kind === "supplier" ? "fornecedor" : "terceirizado"} (somente leitura visual).
          </span>
        </div>
        <Button size="sm" variant="secondary" onClick={() => navigate("/acesso-externo")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Sair do preview
        </Button>
      </div>

      <ImpersonationProvider key={userId} userId={userId}>
        {kind === "supplier" ? <SupplierDashboard /> : <OutsourcedDashboard />}
      </ImpersonationProvider>
    </div>
  );
}
