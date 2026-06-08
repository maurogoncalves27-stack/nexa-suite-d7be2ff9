import { Stethoscope, History } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import NutriVisitReportPanel from "@/components/nutricontrol/NutriVisitReportPanel";

export default function NutriVisit() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Stethoscope className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            Visita técnica
          </h1>
          <p className="text-muted-foreground">Registro de visita técnica com checklist e assinatura do responsável.</p>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link to="/nutri-visita/historico">
            <History className="h-4 w-4 mr-1.5" />
            <span className="hidden sm:inline">Histórico</span>
          </Link>
        </Button>
      </div>
      <NutriVisitReportPanel hideHistory />
    </div>
  );
}
