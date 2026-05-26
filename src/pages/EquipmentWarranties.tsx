import EquipmentWarrantiesPanel from "@/components/inventory/EquipmentWarrantiesPanel";

const EquipmentWarranties = () => {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Garantias de equipamentos</h1>
        <p className="text-muted-foreground">
          Acompanhe vigência, fornecedor e nº de série dos equipamentos comprados.
        </p>
      </div>
      <EquipmentWarrantiesPanel />
    </div>
  );
};

export default EquipmentWarranties;
