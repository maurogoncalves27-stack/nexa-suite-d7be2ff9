import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSupplier } from "@/hooks/useSupplier";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Clock, CheckCircle2, XCircle, AlertTriangle, Truck } from "lucide-react";
import { NexaLogoCard } from "@/components/auth/NexaLogoCard";
import { AuthRolePill } from "@/components/auth/AuthRolePill";

const STATUS_CONFIG = {
  pending: { icon: Clock, tone: "warning", title: "Cadastro em análise", desc: "Seu cadastro foi enviado e está aguardando aprovação do administrador. Você receberá acesso assim que for aprovado." },
  approved: { icon: CheckCircle2, tone: "success", title: "Cadastro aprovado", desc: "Aguarde alguns segundos e clique em entrar." },
  rejected: { icon: XCircle, tone: "destructive", title: "Cadastro rejeitado", desc: "" },
  suspended: { icon: AlertTriangle, tone: "warning", title: "Cadastro suspenso", desc: "Seu acesso foi temporariamente suspenso. Entre em contato com o administrador." },
} as const;

const toneClass = (tone: "warning" | "success" | "destructive") =>
  ({
    warning: "bg-warning/10 text-warning",
    success: "bg-success/10 text-success",
    destructive: "bg-destructive/10 text-destructive",
  }[tone]);

export default function SupplierPending() {
  const navigate = useNavigate();
  const { user, signOut, loading: authLoading, isSupplier } = useAuth();
  const { supplier, loading } = useSupplier();

  if (!authLoading && !user) return <Navigate to="/fornecedor/login" replace />;
  if (isSupplier || supplier?.status === "approved") return <Navigate to="/fornecedor/painel" replace />;

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--gradient-subtle)" }}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8"
      style={{ background: "var(--gradient-subtle)" }}
    >
      <div className="w-full max-w-md">
        <NexaLogoCard />
        <div className="flex justify-center mb-4">
          <AuthRolePill variant="fornecedor" icon={Truck} label="Fornecedor" />
        </div>
        {children}
      </div>
    </div>
  );

  if (!supplier) {
    return (
      <Shell>
        <Card className="shadow-xl border-border/50 backdrop-blur-sm bg-card/95">
          <CardHeader className="text-center space-y-3">
            <div className={`mx-auto h-14 w-14 rounded-full flex items-center justify-center ${toneClass("warning")}`}>
              <AlertTriangle className="h-7 w-7" />
            </div>
            <CardTitle>Cadastro não encontrado</CardTitle>
            <CardDescription>Esta conta ainda não tem um cadastro de fornecedor vinculado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button className="w-full" onClick={() => navigate("/fornecedor/cadastro")}>
              Completar cadastro
            </Button>
            <Button variant="outline" className="w-full" onClick={signOut}>
              Sair
            </Button>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const cfg = STATUS_CONFIG[supplier.status];
  const Icon = cfg.icon;
  const desc = supplier.status === "rejected" ? supplier.rejection_reason || "Seu cadastro foi rejeitado." : cfg.desc;

  return (
    <Shell>
      <Card className="shadow-xl border-border/50 backdrop-blur-sm bg-card/95">
        <CardHeader className="text-center space-y-3">
          <div className={`mx-auto h-14 w-14 rounded-full flex items-center justify-center ${toneClass(cfg.tone)}`}>
            <Icon className="h-7 w-7" />
          </div>
          <CardTitle>{cfg.title}</CardTitle>
          <CardDescription>{desc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md bg-muted p-3 text-sm">
            <div className="font-semibold">{supplier.legal_name}</div>
            <div className="text-muted-foreground">CNPJ: {supplier.cnpj}</div>
            <div className="text-muted-foreground">{supplier.email}</div>
          </div>
          <Button variant="outline" className="w-full" onClick={signOut}>
            Sair
          </Button>
        </CardContent>
      </Card>
    </Shell>
  );
}

