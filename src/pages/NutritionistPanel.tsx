import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Salad, ClipboardCheck, FileBarChart2, ListChecks, Home, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";


const ITEMS = [
  {
    to: "/nutricontrol",
    icon: Salad,
    color: "text-success",
    bg: "bg-success/10",
    title: "NutriControle",
    desc: "Temperaturas, recebimentos, óleo, pragas, água, manutenção...",
  },
  {
    to: "/nutri-visita",
    icon: ClipboardCheck,
    color: "text-accent",
    bg: "bg-accent/10",
    title: "Visita técnica",
    desc: "Checklist e relatório de visita.",
  },
  {
    to: "/nutri-relatorios",
    icon: FileBarChart2,
    color: "text-primary",
    bg: "bg-primary/10",
    title: "Relatórios",
    desc: "Relatórios consolidados do NutriControle.",
  },
  {
    to: "/checklists",
    icon: ListChecks,
    color: "text-warning",
    bg: "bg-warning/10",
    title: "Check-lists",
    desc: "Check-lists operacionais das lojas.",
  },
];

export default function NutritionistPanel() {
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Home className="h-4 w-4 text-primary" />
            <span>Painel da Nutricionista</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => void signOut()} aria-label="Sair">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>


      <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Salad className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            Painel da Nutricionista
          </h1>
          <p className="text-muted-foreground">
            Acesso completo ao NutriControle em todas as lojas, visita técnica e relatórios.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {ITEMS.map((it) => (
            <Link key={it.to} to={it.to} className="block">
              <Card className="h-full hover:border-primary/40 hover:shadow-md transition-all">
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                    <it.icon className="h-6 w-6" />
                  </div>
                  <div className="font-semibold text-base">{it.title}</div>
                  <p className="text-xs text-muted-foreground">{it.desc}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
