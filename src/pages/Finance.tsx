import { useRef, useState } from "react";
import { DollarSign } from "lucide-react";
import FinanceStatementPanel from "@/components/finance/FinanceStatementPanel";
import NewPayableDialog from "@/components/finance/NewPayableDialog";

export default function Finance() {
  const [openNewPayable, setOpenNewPayable] = useState(false);
  const reloadRef = useRef(0);
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <DollarSign className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Extrato / +Pagamentos
        </h1>
        <p className="text-muted-foreground">Movimentações financeiras, contas a pagar e a receber.</p>
      </div>
      <FinanceStatementPanel
        key={reloadKey}
        onNewPayable={() => setOpenNewPayable(true)}
      />
      <NewPayableDialog
        open={openNewPayable}
        onOpenChange={setOpenNewPayable}
        onSaved={() => setReloadKey((k) => k + 1)}
      />
    </div>
  );
}
