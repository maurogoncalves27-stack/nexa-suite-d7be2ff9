import { FileBarChart } from "lucide-react";
import DrePanel from "@/components/finance/DrePanel";

export default function FinanceDre() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <FileBarChart className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          DRE
        </h1>
        <p className="text-muted-foreground">Demonstrativo de resultado do exercício consolidado.</p>
      </div>
      <DrePanel />
    </div>
  );
}
