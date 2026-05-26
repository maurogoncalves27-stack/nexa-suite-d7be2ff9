import InternshipPaymentsPanel from "@/components/internships/InternshipPaymentsPanel";
import { HandCoins } from "lucide-react";

export default function InternshipPaymentsPage() {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl md:text-3xl font-bold flex items-center gap-2">
          <HandCoins className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Bolsa Estágio
        </h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Pagamentos mensais de bolsa-auxílio aos estagiários · exportação PIX C6
        </p>
      </div>
      <InternshipPaymentsPanel />
    </div>
  );
}
