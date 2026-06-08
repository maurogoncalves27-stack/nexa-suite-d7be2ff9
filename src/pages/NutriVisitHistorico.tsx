import { History } from "lucide-react";
import NutriVisitReportPanel from "@/components/nutricontrol/NutriVisitReportPanel";

export default function NutriVisitHistorico() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <History className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Histórico de visitas técnicas
        </h1>
        <p className="text-muted-foreground">Consulte e revise as visitas técnicas já realizadas.</p>
      </div>
      <NutriVisitReportPanel hideForm />
    </div>
  );
}
