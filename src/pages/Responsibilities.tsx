import { Briefcase } from "lucide-react";
import PositionResponsibilitiesPanel from "@/components/announcements/PositionResponsibilitiesPanel";

export default function Responsibilities() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Briefcase className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Atribuições por cargo
        </h1>
        <p className="text-muted-foreground">Defina as responsabilidades de cada cargo.</p>
      </div>
      <PositionResponsibilitiesPanel />
    </div>
  );
}
