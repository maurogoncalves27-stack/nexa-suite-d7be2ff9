import { Link, Navigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Briefcase,
  LineChart,
  Wallet,
  Receipt,
  Calculator,
  Tags,
  Landmark,
  FileBarChart2,
  LogOut,
  Home,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useOutsourced } from "@/hooks/useOutsourced";
import { usePartnerPermissions } from "@/hooks/usePartnerPermissions";
import { Loader2 } from "lucide-react";

const ITEMS = [
  {
    to: "/financeiro/dre",
    icon: LineChart,
    color: "text-primary",
    bg: "bg-primary/10",
    title: "DRE",
    desc: "Demonstrativo de resultado por período e loja.",
  },
  {
    to: "/financeiro/contas",
    icon: Wallet,
    color: "text-success",
    bg: "bg-success/10",
    title: "Contas a pagar/receber",
    desc: "Lançamentos, vencimentos e baixas.",
  },
  {
    to: "/financeiro/extrato-conta",
    icon: Receipt,
    color: "text-accent",
    bg: "bg-accent/10",
    title: "Extrato de conta",
    desc: "Movimentações bancárias detalhadas.",
  },
  {
    to: "/financeiro/cmv",
    icon: Calculator,
    color: "text-warning",
    bg: "bg-warning/10",
    title: "CMV",
    desc: "Custo da mercadoria vendida.",
  },
  {
    to: "/financeiro/precificacao",
    icon: Tags,
    color: "text-primary",
    bg: "bg-primary/10",
    title: "Precificação",
    desc: "Margem e formação de preço.",
  },
  {
    to: "/financeiro/categorias",
    icon: FileBarChart2,
    color: "text-success",
    bg: "bg-success/10",
    title: "Categorias",
    desc: "Plano de contas financeiro.",
  },
  {
    to: "/conciliacao",
    icon: Landmark,
    color: "text-accent",
    bg: "bg-accent/10",
    title: "Conciliação bancária",
    desc: "Bater extrato com lançamentos.",
  },
  {
    to: "/financeiro",
    icon: Briefcase,
    color: "text-warning",
    bg: "bg-warning/10",
    title: "Visão geral",
    desc: "Dashboard financeiro consolidado.",
  },
];

export default function ConsultorPanel() {
  const { user, signOut, loading: authLoading } = useAuth();
  const { record, loading: outLoading } = useOutsourced();
  const { modules, loading: permLoading } = usePartnerPermissions();

  if (!authLoading && !user) return <Navigate to="/parceiro/login" replace />;

  const loading = authLoading || outLoading || permLoading;
  const hasFinanceiro = modules.has("financeiro");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium min-w-0">
            <Home className="h-4 w-4 text-primary shrink-0" />
            <span className="truncate">
              {record?.full_name ?? "Consultor Financeiro"}
            </span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => void signOut()} aria-label="Sair">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Briefcase className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            Painel do Consultor Financeiro
          </h1>
          <p className="text-muted-foreground">
            Acesso aos módulos financeiros liberados pelo administrador.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center p-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !hasFinanceiro ? (
          <Card>
            <CardContent className="p-6 text-center space-y-2">
              <div className="font-medium">Módulo financeiro não liberado</div>
              <p className="text-sm text-muted-foreground">
                Solicite ao administrador a liberação do módulo "Financeiro" nas permissões de parceiro.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {ITEMS.map((it) => (
              <Link key={it.to} to={it.to} className="block">
                <Card className="h-full hover:border-primary/40 hover:shadow-md transition-all">
                  <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                    <div className={`h-12 w-12 rounded-full ${it.bg} ${it.color} flex items-center justify-center`}>
                      <it.icon className="h-6 w-6" />
                    </div>
                    <div className="font-semibold text-base">{it.title}</div>
                    <p className="text-xs text-muted-foreground">{it.desc}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
