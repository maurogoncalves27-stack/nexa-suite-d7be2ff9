import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import {
  ShieldAlert,
  Megaphone,
  ClipboardCheck,
  Wrench,
  ListChecks,
  ChefHat,
  Stethoscope,
  CalendarClock,
  Award,
  Users,
  Plane,
  ReceiptText,
  type LucideIcon,
} from "lucide-react";

interface Action {
  label: string;
  to: string;
  icon: LucideIcon;
  color: string;
}

const ACTIONS: Action[] = [
  { label: "Infrações", to: "/infracoes", icon: ShieldAlert, color: "text-destructive" },
  { label: "Avisos", to: "/avisos", icon: Megaphone, color: "text-primary" },
  { label: "Check-lists", to: "/checklists-gerenciar", icon: ClipboardCheck, color: "text-success" },
  { label: "Manutenção", to: "/nutri-visita", icon: Wrench, color: "text-warning" },
  { label: "NutriControle", to: "/nutricontrol", icon: ChefHat, color: "text-emerald-600" },
  { label: "Tarefas", to: "/tarefas", icon: ListChecks, color: "text-accent" },
  { label: "Atestados", to: "/atestados", icon: Stethoscope, color: "text-rose-500" },
  { label: "Escalas", to: "/escalas", icon: CalendarClock, color: "text-indigo-500" },
  { label: "Avaliações", to: "/avaliacoes", icon: Award, color: "text-amber-500" },
  { label: "Colaboradores", to: "/colaboradores", icon: Users, color: "text-primary" },
  { label: "Férias", to: "/ferias", icon: Plane, color: "text-sky-500" },
  { label: "Folha", to: "/folha", icon: ReceiptText, color: "text-violet-500" },
];

export default function ManagerQuickActions() {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {ACTIONS.map((a) => (
            <Link
              key={a.to}
              to={a.to}
              className="flex flex-col items-center justify-center gap-1.5 rounded-lg border bg-card p-3 text-center hover:bg-muted/50 hover:border-primary/40 transition-colors min-h-[78px]"
            >
              <a.icon className={`h-5 w-5 ${a.color}`} />
              <span className="text-[11px] sm:text-xs font-medium text-foreground leading-tight line-clamp-2">
                {a.label}
              </span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
