import { Briefcase } from "lucide-react";
import PositionResponsibilitiesPanel from "@/components/announcements/PositionResponsibilitiesPanel";

export default function Responsibilities() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <Briefcase className="h-7 w-7 text-primary" />
          Atribuições por cargo
        </h1>
        <p className="text-muted-foreground">Defina as responsabilidades de cada cargo.</p>
      </div>
      <PositionResponsibilitiesPanel />
    </div>
  );
}
