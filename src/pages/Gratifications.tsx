import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Gift } from "lucide-react";
import GratificationsPanel from "@/components/payroll/GratificationsPanel";

export default function Gratifications() {
  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-3xl font-bold flex items-center gap-2">
          <Gift className="h-6 w-6 md:h-7 md:w-7 text-primary" /> Gratificações
        </h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Valores avulsos definidos pelo gestor para cada colaborador.
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <GratificationsPanel />
        </CardContent>
      </Card>
    </div>
  );
}
