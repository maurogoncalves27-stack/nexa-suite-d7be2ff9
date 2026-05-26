import { Stethoscope } from "lucide-react";
import NutriVisitReportPanel from "@/components/nutricontrol/NutriVisitReportPanel";

export default function NutriVisit() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <Stethoscope className="h-7 w-7 text-primary" />
          Visita técnica
        </h1>
        <p className="text-muted-foreground">Registro de visita técnica com checklist e assinatura do responsável.</p>
      </div>
      <NutriVisitReportPanel />
    </div>
  );
}
