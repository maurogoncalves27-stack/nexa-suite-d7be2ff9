import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { History, AlertTriangle, CalendarClock } from "lucide-react";
import LotsPanel from "@/components/inventory/LotsPanel";
import LossesPanel from "@/components/inventory/LossesPanel";

export default function InventoryLots() {
  return (
    <div className="container mx-auto p-4 space-y-4 max-w-7xl">
      <div>
        <h1 className="text-2xl md:text-xl font-bold flex items-center gap-2">
          <History className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Lotes, validades e perdas
        </h1>
        <p className="text-sm text-muted-foreground">Controle de validade por lote com alertas e registro de perdas diárias.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" /> Lotes e validades
            </CardTitle>
            <CardDescription>Cadastro e acompanhamento de lotes ativos com alertas de vencimento.</CardDescription>
          </CardHeader>
          <CardContent>
            <LotsPanel />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" /> Perdas de estoque
            </CardTitle>
            <CardDescription>Registre perdas diárias por vencimento, quebra, contaminação ou descarte.</CardDescription>
          </CardHeader>
          <CardContent>
            <LossesPanel />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
