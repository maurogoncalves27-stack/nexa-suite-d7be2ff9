import BankReconciliationPanel from "@/components/finance/BankReconciliationPanel";

const BankReconciliation = () => {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Conciliação bancária</h1>
        <p className="text-muted-foreground">
          Importe extratos no formato OFX e concilie automaticamente contra as contas a pagar em aberto.
        </p>
      </div>
      <BankReconciliationPanel />
    </div>
  );
};

export default BankReconciliation;
