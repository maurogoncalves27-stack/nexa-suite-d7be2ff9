import EquipmentWarrantiesPanel from "@/components/inventory/EquipmentWarrantiesPanel";

const EquipmentWarranties = () => {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">Garantias de equipamentos</h1>
        <p className="text-muted-foreground">
          Acompanhe vigência, fornecedor e nº de série dos equipamentos comprados.
        </p>
      </div>
      <EquipmentWarrantiesPanel />
    </div>
  );
};

export default EquipmentWarranties;
