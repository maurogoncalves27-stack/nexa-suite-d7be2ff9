import { ScrollText } from "lucide-react";
import ContractsPanel from "@/components/announcements/ContractsPanel";

export default function Contracts() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-xl font-bold flex items-center gap-2">
          <ScrollText className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Contratos
        </h1>
        <p className="text-muted-foreground">Modelos e gestão de contratos de trabalho.</p>
      </div>
      <ContractsPanel />
    </div>
  );
}
