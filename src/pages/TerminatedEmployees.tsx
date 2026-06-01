import { UserX } from "lucide-react";
import TerminatedEmployeesList from "@/components/employees/TerminatedEmployeesList";

export default function TerminatedEmployees() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-xl font-bold flex items-center gap-2">
          <UserX className="h-6 w-6 md:h-7 md:w-7 text-primary" /> Desligados
        </h1>
        <p className="text-muted-foreground">
          Colaboradores que não estão mais ativos · histórico preservado
        </p>
      </div>
      <TerminatedEmployeesList />
    </div>
  );
}
