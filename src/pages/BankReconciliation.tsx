import BankReconciliationPanel from "@/components/finance/BankReconciliationPanel";

const BankReconciliation = () => {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl md:text-xl font-bold flex items-center gap-2">Conciliação bancária</h1>
        <p className="text-muted-foreground">
          Importe extratos no formato OFX e concilie automaticamente contra as contas a pagar em aberto.
        </p>
      </div>
      <BankReconciliationPanel />
    </div>
  );
};

export default BankReconciliation;
