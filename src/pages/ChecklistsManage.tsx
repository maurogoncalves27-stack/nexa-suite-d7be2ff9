import { ClipboardCheck } from "lucide-react";
import ChecklistsFullPanel from "@/components/checklists/ChecklistsFullPanel";

export default function ChecklistsManage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Check-lists
        </h1>
        <p className="text-muted-foreground">Gerencie templates, atribuições e histórico de check-lists.</p>
      </div>
      <ChecklistsFullPanel />
    </div>
  );
}
