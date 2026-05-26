import { lazy, Suspense, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Utensils,
  Wrench,
  ClipboardList,
  AlertTriangle,
  PackageOpen,
  ArrowLeftRight,
  Boxes,
  CalendarClock,
  ArrowLeft,
  LogOut,
  Loader2,
} from "lucide-react";
import PdvNovo from "./PdvNovo";

const Nutricontrol = lazy(() => import("./Nutricontrol"));
const InventoryCounts = lazy(() => import("./InventoryCounts"));
const Occurrences = lazy(() => import("./Occurrences"));
const InventoryReceiving = lazy(() => import("./InventoryReceiving"));
const InventoryTransfers = lazy(() => import("./InventoryTransfers"));
const FactoryRequests = lazy(() => import("./FactoryRequests"));
const InventoryLots = lazy(() => import("./InventoryLots"));

type Shortcut = {
  key: string;
  label: string;
  icon: typeof Utensils;
  color: string;
  bg: string;
  Component: React.LazyExoticComponent<React.ComponentType<any>>;
};

const SHORTCUTS: Shortcut[] = [
  { key: "nutri", label: "NutriControle", icon: Utensils, color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-950/40", Component: Nutricontrol },
  { key: "manut", label: "Manutenção", icon: Wrench, color: "text-orange-600", bg: "bg-orange-100 dark:bg-orange-950/40", Component: Nutricontrol },
  { key: "contagem", label: "Contagem", icon: ClipboardList, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-950/40", Component: InventoryCounts },
  { key: "ocorrencias", label: "Ocorrências", icon: AlertTriangle, color: "text-red-600", bg: "bg-red-100 dark:bg-red-950/40", Component: Occurrences },
  { key: "recebimento", label: "Entrada de mercadorias", icon: PackageOpen, color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-950/40", Component: InventoryReceiving },
  { key: "transferencia", label: "Transferência", icon: ArrowLeftRight, color: "text-purple-600", bg: "bg-purple-100 dark:bg-purple-950/40", Component: InventoryTransfers },
  { key: "requisicao", label: "Requisição", icon: Boxes, color: "text-indigo-600", bg: "bg-indigo-100 dark:bg-indigo-950/40", Component: FactoryRequests },
  { key: "lotes", label: "Lotes / Validades", icon: CalendarClock, color: "text-pink-600", bg: "bg-pink-100 dark:bg-pink-950/40", Component: InventoryLots },
];

export default function StoreHome() {
  const [active, setActive] = useState<Shortcut | null>(null);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: "Você saiu", description: "Sessão encerrada." });
    window.location.href = "/auth";
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <nav
        className="shrink-0 border-r bg-card shadow-sm flex flex-col w-[100px]"
        aria-label="Atalhos da loja"
      >
        <ul className="flex-1 flex flex-col divide-y divide-border/40 overflow-y-auto">
          {SHORTCUTS.map((s) => {
            const Icon = s.icon;
            return (
              <li key={s.key} className="flex-1 min-h-0">
                <button
                  type="button"
                  onClick={() => setActive(s)}
                  className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-none border border-transparent px-1 py-1 text-xs font-semibold text-foreground transition-all hover:bg-muted active:scale-95"
                >
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full ${s.bg}`}>
                    <Icon className={`h-4 w-4 ${s.color}`} strokeWidth={2.2} />
                  </span>
                  <span className="text-center leading-tight text-[10px]">{s.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="shrink-0 border-t flex items-center justify-center p-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="flex flex-col h-auto gap-0.5 py-1 w-full text-muted-foreground hover:text-destructive"
            title="Sair desta sessão"
          >
            <LogOut className="h-4 w-4" />
            <span className="text-[10px] font-medium">Sair</span>
          </Button>
        </div>
      </nav>

      <div className="flex-1 min-h-0 overflow-auto">
        <PdvNovo hideHeader />
      </div>



      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent
          className="max-w-none w-screen h-screen p-0 gap-0 rounded-none border-0 sm:rounded-none flex flex-col"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <header className="shrink-0 flex items-center gap-3 border-b bg-card px-4 py-3">
            <Button variant="ghost" size="sm" onClick={() => setActive(null)} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Voltar ao PDV
            </Button>
            {active && (
              <div className="flex items-center gap-2 ml-2">
                <span className={`flex h-8 w-8 items-center justify-center rounded-full ${active.bg}`}>
                  <active.icon className={`h-4 w-4 ${active.color}`} />
                </span>
                <h2 className="text-base font-semibold">{active.label}</h2>
              </div>
            )}
          </header>
          <div className="flex-1 min-h-0 overflow-auto p-4 md:p-6">
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              }
            >
              {active && <active.Component />}
            </Suspense>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
