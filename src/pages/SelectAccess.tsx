import { useEffect, useMemo } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Loader2, Briefcase, Crown, User, Apple, Truck, Calculator } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { setViewMode, type ViewMode } from "@/hooks/useViewMode";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Option {
  mode: ViewMode;
  title: string;
  description: string;
  icon: typeof Briefcase;
  to: string;
}

const SelectAccess = () => {
  const { loading, user, roles, isAdmin, isManager, isPartner, isSupplier, isSuperUser, hasRole, signOut } = useAuth();
  const isNutritionist = hasRole("nutritionist");
  const navigate = useNavigate();

  const options = useMemo<Option[]>(() => {
    const list: Option[] = [];
    if (isAdmin || isManager || isSuperUser) {
      list.push({
        mode: "gestor",
        title: "Gestor",
        description: "Acesso total ao sistema (RH, financeiro, operacional).",
        icon: Briefcase,
        to: "/dashboard",
      });
    }
    if (isPartner || isSuperUser) {
      list.push({
        mode: "socio",
        title: "Sócio",
        description: "Painel gerencial somente leitura: faturamento, financeiro e RH agregado.",
        icon: Crown,
        to: "/painel-socio",
      });
    }
    list.push({
      mode: "colaborador",
      title: "Colaborador",
      description: "Sua área pessoal: holerites, ponto, avisos e documentos.",
      icon: User,
      to: "/area-colaborador",
    });
    if (isNutritionist || isSuperUser) {
      list.push({
        mode: "nutricionista",
        title: "Nutricionista",
        description: "Visão da nutricionista: NutriControle, visitas, relatórios e check-lists.",
        icon: Apple,
        to: "/nutricionista/painel",
      });
    }
    if (isSupplier || isSuperUser) {
      list.push({
        mode: "fornecedor",
        title: "Fornecedor",
        description: "Painel do fornecedor: cotações, pedidos e documentos.",
        icon: Truck,
        to: "/fornecedor/painel",
      });
    }
    return list;
  }, [isAdmin, isManager, isPartner, isSupplier, isSuperUser, isNutritionist]);

  // Se só tem 1 opção, entra direto.
  useEffect(() => {
    if (loading || !user) return;
    if (options.length === 1) {
      setViewMode(options[0].mode);
      navigate(options[0].to, { replace: true });
    }
  }, [loading, user, options, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  const choose = (opt: Option) => {
    setViewMode(opt.mode);
    navigate(opt.to, { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold">Como você quer acessar?</h1>
          <p className="text-sm text-muted-foreground">
            Escolha o perfil para esta sessão. Você pode trocar depois pelo menu lateral.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-1">
          {options.map((opt) => {
            const Icon = opt.icon;
            return (
              <Card
                key={`${opt.title}-${opt.to}`}
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => choose(opt)}
              >
                <CardContent className="flex items-center gap-4 p-4 sm:p-5">
                  <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-base">{opt.title}</div>
                    <div className="text-sm text-muted-foreground">{opt.description}</div>
                  </div>
                  <Button size="sm" onClick={(e) => { e.stopPropagation(); choose(opt); }}>
                    Entrar
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="text-center">
          <Button variant="ghost" size="sm" onClick={() => { void signOut(); }}>
            Sair
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SelectAccess;
