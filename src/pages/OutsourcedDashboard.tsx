import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useOutsourced } from "@/hooks/useOutsourced";
import { usePartnerPermissions } from "@/hooks/usePartnerPermissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut, Stethoscope, ArrowRight, ShieldAlert } from "lucide-react";
import { EXTERNAL_MODULES } from "@/lib/externalModules";

/**
 * Painel inicial do profissional terceirizado.
 * Lista os módulos liberados pelo admin, com link rápido.
 */
export default function OutsourcedDashboard() {
  const navigate = useNavigate();
  const { user, isOutsourced, signOut, loading: authLoading } = useAuth();
  const { record, loading: outLoading } = useOutsourced();
  const { modules, loading: permLoading } = usePartnerPermissions();

  if (!authLoading && !user) return <Navigate to="/parceiro/login" replace />;
  if (!authLoading && !outLoading && !isOutsourced && record?.approval_status !== "approved") {
    return <Navigate to="/parceiro/aguardando" replace />;
  }

  const loading = authLoading || outLoading || permLoading;
  const allowedModules = EXTERNAL_MODULES.filter((m) => modules.has(m.key));

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-background border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Stethoscope className="h-6 w-6 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold truncate">{record?.full_name ?? "Profissional terceirizado"}</div>
              <div className="text-xs text-muted-foreground">
                {record?.specialty || record?.role_title || "Acesso de parceiro"}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline ml-2">Sair</span>
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Meus módulos</CardTitle>
            <CardDescription>
              Acesse abaixo as áreas do sistema que o administrador liberou para você.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center p-6">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : allowedModules.length === 0 ? (
              <div className="text-center p-6 space-y-3">
                <div className="mx-auto h-12 w-12 rounded-full bg-warning/10 flex items-center justify-center">
                  <ShieldAlert className="h-6 w-6 text-warning" />
                </div>
                <div className="font-medium">Nenhum módulo liberado ainda</div>
                <p className="text-sm text-muted-foreground">
                  Seu cadastro está aprovado, mas o administrador ainda não liberou nenhum módulo.
                  Entre em contato para solicitar acesso.
                </p>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {allowedModules.map((m) => (
                  <Button
                    key={m.key}
                    variant="outline"
                    className="justify-between h-auto py-4"
                    onClick={() => navigate(m.route)}
                  >
                    <span className="font-medium">{m.label}</span>
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
