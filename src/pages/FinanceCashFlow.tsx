import { Waves } from "lucide-react";
import CashFlowPanel from "@/components/finance/CashFlowPanel";

export default function FinanceCashFlow() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Waves className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Fluxo de caixa
        </h1>
        <p className="text-muted-foreground">Regime de caixa — despesas pela data de pagamento e receitas pela data de recebimento.</p>
      </div>
      <CashFlowPanel />
    </div>
  );
}
