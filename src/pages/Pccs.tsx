import { Navigate, useSearchParams } from "react-router-dom";
import { TrendingUp } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import SalaryLevelsPanel from "@/components/pccs/SalaryLevelsPanel";
import CompetenciesPanel from "@/components/pccs/CompetenciesPanel";
import CareerTracksPanel from "@/components/pccs/CareerTracksPanel";
import PromotionCriteriaPanel from "@/components/pccs/PromotionCriteriaPanel";
import EligibilityPanel from "@/components/pccs/EligibilityPanel";
import PromotedPanel from "@/components/pccs/PromotedPanel";

export default function Pccs() {
  const [params, setParams] = useSearchParams();
  const { roles, isAdmin, isManager } = useAuth();
  const canView = isAdmin || isManager || roles.includes("hr");

  if (!canView) return <Navigate to="/" replace />;

  const active = (params.get("tab") as string) || "cargos";
  const setActive = (v: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", v);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Plano de Carreira (PCCS)
        </h1>
        <p className="text-muted-foreground">
          Cargos, faixas salariais, competências, trilhas e critérios de promoção — a base do desenvolvimento dos colaboradores.
        </p>
      </div>

      <Tabs value={active} onValueChange={setActive}>
        <TabsList className="w-full sm:w-auto flex-wrap h-auto">
          <TabsTrigger value="cargos" className="flex-1 sm:flex-none">Cargos & Níveis</TabsTrigger>
          <TabsTrigger value="competencias" className="flex-1 sm:flex-none">Competências</TabsTrigger>
          <TabsTrigger value="criterios" className="flex-1 sm:flex-none">Critérios</TabsTrigger>
          <TabsTrigger value="elegiveis" className="flex-1 sm:flex-none">Elegíveis Agora</TabsTrigger>
          <TabsTrigger value="promovidos" className="flex-1 sm:flex-none">Promovidos</TabsTrigger>
        </TabsList>

        <TabsContent value="cargos" className="mt-4"><SalaryLevelsPanel /></TabsContent>
        <TabsContent value="competencias" className="mt-4"><CompetenciesPanel /></TabsContent>
        <TabsContent value="criterios" className="mt-4"><PromotionCriteriaPanel /></TabsContent>
        <TabsContent value="elegiveis" className="mt-4"><EligibilityPanel /></TabsContent>
        <TabsContent value="promovidos" className="mt-4"><PromotedPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
