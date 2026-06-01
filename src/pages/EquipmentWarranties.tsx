import { ShieldCheck } from "lucide-react";
import EquipmentWarrantiesPanel from "@/components/inventory/EquipmentWarrantiesPanel";

const EquipmentWarranties = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Garantias de equipamentos
        </h1>
        <p className="text-muted-foreground">
          Acompanhe vigência, fornecedor e nº de série dos equipamentos comprados.
        </p>
      </div>
      <EquipmentWarrantiesPanel />
    </div>
  );
};

export default EquipmentWarranties;
