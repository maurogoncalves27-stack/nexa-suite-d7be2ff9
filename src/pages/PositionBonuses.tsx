import { Coins } from "lucide-react";
import PositionBonusesPanel from "@/components/evaluations/PositionBonusesPanel";

export default function PositionBonuses() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-xl font-bold flex items-center gap-2">
          <Coins className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Bônus por cargo
        </h1>
        <p className="text-muted-foreground">Configure o valor de bônus de cada cargo.</p>
      </div>
      <PositionBonusesPanel />
    </div>
  );
}
