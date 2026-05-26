import { useRef, useState } from "react";
import FinanceStatementPanel from "@/components/finance/FinanceStatementPanel";
import NewPayableDialog from "@/components/finance/NewPayableDialog";

export default function Finance() {
  const [openNewPayable, setOpenNewPayable] = useState(false);
  const reloadRef = useRef(0);
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div className="space-y-4">
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
