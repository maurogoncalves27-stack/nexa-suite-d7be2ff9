import { Building2 } from "lucide-react";
import BankAccountsManager from "@/components/finance/BankAccountsManager";

export default function FinanceAccounts() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Building2 className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Contas bancárias
        </h1>
        <p className="text-muted-foreground">Cadastre e gerencie as contas bancárias do grupo.</p>
      </div>
      <BankAccountsManager />
    </div>
  );
}
