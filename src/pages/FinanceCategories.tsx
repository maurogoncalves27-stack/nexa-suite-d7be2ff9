import { Tags } from "lucide-react";
import FinanceCategoriesPanel from "@/components/finance/FinanceCategoriesPanel";

export default function FinanceCategories() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Tags className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Categorias financeiras
        </h1>
        <p className="text-muted-foreground">Organize entradas e saídas por categoria contábil.</p>
      </div>
      <FinanceCategoriesPanel />
    </div>
  );
}
