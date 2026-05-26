import LabCoatIcon from "@/components/icons/LabCoatIcon";
import NutriReportsPanel from "@/components/nutricontrol/NutriReportsPanel";

export default function NutriReports() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <LabCoatIcon className="h-7 w-7 text-primary" />
          Relatórios NutriControle
        </h1>
        <p className="text-muted-foreground">Visualize relatórios operacionais do NutriControle.</p>
      </div>
      <NutriReportsPanel />
    </div>
  );
}
