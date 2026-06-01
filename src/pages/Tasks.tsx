import { ListChecks } from "lucide-react";
import ManageTasksPanel from "@/components/tasks/ManageTasksPanel";

export default function Tasks() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-xl font-bold flex items-center gap-2">
          <ListChecks className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Tarefas
        </h1>
        <p className="text-muted-foreground">Atribua tarefas recorrentes para colaboradores.</p>
      </div>
      <ManageTasksPanel />
    </div>
  );
}
