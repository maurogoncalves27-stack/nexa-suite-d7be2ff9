import { Scale } from "lucide-react";
import BankReconciliationPanel from "@/components/finance/BankReconciliationPanel";

const BankReconciliation = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Scale className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Conciliação bancária
        </h1>
        <p className="text-muted-foreground">
          Importe extratos no formato OFX e concilie automaticamente contra as contas a pagar em aberto.
        </p>
      </div>
      <BankReconciliationPanel />
    </div>
  );
};

export default BankReconciliation;
