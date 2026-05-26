import { format } from "date-fns";
import { Home } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  type Employee,
  getStoreColorClasses,
  type Schedule,
  type Store,
  WEEKDAYS,
} from "@/lib/scheduleRules";

interface Leave {
  employee_id: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  notes: string | null;
}

interface Props {
  storeId: string;
  stores: Store[];
  employees: Employee[];
  schedules: Schedule[];
  leaves?: Leave[];
  days: Date[];
  onCellClick?: (emp: Employee, date: Date) => void;
}

const getCell = (schedules: Schedule[], employeeId: string, date: Date) =>
  schedules.find((s) => s.employee_id === employeeId && s.schedule_date === format(date, "yyyy-MM-dd"));

const LEAVE_LABELS: Record<string, string> = {
  medical_certificate: "Atestado",
  vacation: "Férias",
  maternity: "Lic. maternidade",
  paternity: "Lic. paternidade",
  unpaid: "Afastamento",
  inss: "INSS",
  suspension: "Suspensão",
};

function findLeave(leaves: Leave[] | undefined, employeeId: string, date: Date): Leave | undefined {
  if (!leaves || leaves.length === 0) return undefined;
  const ds = format(date, "yyyy-MM-dd");
  return leaves.find((l) => l.employee_id === employeeId && l.start_date <= ds && l.end_date >= ds);
}

function CellContent({ cell, leave }: { cell: Schedule | undefined; leave?: Leave }) {
  if (leave) {
    const label = LEAVE_LABELS[leave.leave_type] ?? "Afastamento";
    return (
      <Badge className="bg-amber-500 hover:bg-amber-500 text-white" title={leave.notes ?? label}>
        {label}
      </Badge>
    );
  }
  if (!cell) return <span className="text-muted-foreground">—</span>;
  if (cell.is_day_off) {
    const isLeave = (cell.notes ?? "").toLowerCase().includes("afastament");
    if (isLeave) {
      return (
        <Badge className="bg-amber-500 hover:bg-amber-500 text-white" title={cell.notes ?? undefined}>
          Afastamento
        </Badge>
      );
    }
    return <Badge variant="secondary">Folga</Badge>;
  }
  if (cell.is_home_office) {
    return (
      <Badge className="bg-blue-500 hover:bg-blue-500 text-white gap-1">
        <Home className="h-3 w-3" />
        Home
      </Badge>
    );
  }
  if (cell.start_time) {
    return (
      <span className="font-medium">
        {cell.start_time.slice(0, 5)}–{cell.end_time?.slice(0, 5)}
      </span>
    );
  }
  return <Badge variant="outline">Trabalho</Badge>;
}

export default function ScheduleGrid({ storeId, stores, employees, schedules, leaves, days, onCellClick }: Props) {
  // Oculta colaboradores marcados como "sem escala" (work_schedule null/vazio)
  employees = employees.filter((e) => !!(e.work_schedule ?? "").toString().trim());
  if (storeId === "__all__") {
    if (employees.length === 0) {
      return (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Nenhum colaborador ativo.</CardContent>
        </Card>
      );
    }
    const visibleStores = stores
      .map((store) => ({ store, emps: employees.filter((e) => (e.allocated_store_id ?? e.store_id) === store.id) }))
      .filter((x) => x.emps.length > 0);
    return (
      <Accordion type="multiple" defaultValue={visibleStores.map((x) => x.store.id)} className="space-y-3">
        {visibleStores.map(({ store, emps: empsOfStore }) => {
          const c = getStoreColorClasses(store.name);
          return (
            <AccordionItem key={store.id} value={store.id} className="border rounded-lg overflow-hidden">
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-accent/50">
                <div className="flex items-center gap-2 text-base font-semibold">
                  <span className={`inline-block h-3 w-3 rounded-full ${c.dot}`} />
                  {store.name}
                  <Badge variant="outline" className="ml-2 font-normal">
                    {empsOfStore.length} colaborador(es)
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className={`${c.bg} ${c.fg}`}>
                      <tr>
                        <th className={`text-left p-2 sticky left-0 ${c.bg} ${c.fg} min-w-[200px]`}>Colaborador</th>
                        {days.map((d, i) => (
                          <th key={i} className="p-2 text-center min-w-[140px]">
                            <div>{WEEKDAYS[i]}</div>
                            <div className="text-xs opacity-80 font-normal">{format(d, "dd/MM")}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {empsOfStore.map((emp) => (
                        <tr key={emp.id} className="border-t">
                          <td className="p-2 sticky left-0 bg-background font-medium">{emp.full_name}</td>
                          {days.map((d, i) => {
                            const cell = getCell(schedules, emp.id, d);
                            return (
                              <td key={i} className="p-1">
                                <div className="w-full h-12 rounded-md border border-border text-xs flex items-center justify-center">
                                  <CellContent cell={cell} leave={findLeave(leaves, emp.id, d)} />
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    );
  }

  // Grade de uma loja específica (clicável)
  const c = getStoreColorClasses(stores.find((s) => s.id === storeId)?.name);
  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        {employees.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Nenhum colaborador ativo nesta loja.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className={`${c.bg} ${c.fg}`}>
              <tr>
                <th className={`text-left p-2 sticky left-0 ${c.bg} ${c.fg} min-w-[200px]`}>Colaborador</th>
                {days.map((d, i) => (
                  <th key={i} className="p-2 text-center min-w-[140px]">
                    <div>{WEEKDAYS[i]}</div>
                    <div className="text-xs opacity-80 font-normal">{format(d, "dd/MM")}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id} className="border-t">
                  <td className="p-2 sticky left-0 bg-background font-medium">{emp.full_name}</td>
                  {days.map((d, i) => {
                    const cell = getCell(schedules, emp.id, d);
                    return (
                      <td key={i} className="p-1">
                        <button
                          onClick={() => onCellClick?.(emp, d)}
                          className="w-full h-12 rounded-md border border-border hover:bg-accent transition-colors text-xs flex items-center justify-center"
                        >
                          <CellContent cell={cell} leave={findLeave(leaves, emp.id, d)} />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
