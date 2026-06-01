import { Bus } from "lucide-react";
import TransportVoucherPanel from "@/components/payroll/TransportVoucherPanel";

export default function TransportVoucher() {
  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-xl font-bold flex items-center gap-2">
          <Bus className="md: md: h-6 w-6 md:h-7 md:w-7 text-primary" /> Vale Transporte
        </h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Cadastro simples por colaborador: valor diário, dias úteis e percentual de desconto.
        </p>
      </div>
      <TransportVoucherPanel />
    </div>
  );
}
