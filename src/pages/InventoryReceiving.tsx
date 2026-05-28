import { useState } from "react";
import { Package, Archive, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import DfeInboundPanel from "@/components/inventory/DfeInboundPanel";

const InventoryReceiving = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            Entrada de mercadorias
          </h1>
          <p className="text-muted-foreground">
            Gerencie e importe notas fiscais capturadas automaticamente via SEFAZ.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/nf-arquivadas" className="gap-1">
              <Archive className="h-4 w-4" /> NF arquivadas
            </Link>
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => window.dispatchEvent(new CustomEvent("dfe:open-config"))}
            aria-label="Configurar DF-e"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <DfeInboundPanel />
    </div>
  );
};

export default InventoryReceiving;
