import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Loader2, Clock, Download, MapPin, Settings, Check, ChevronsUpDown } from "lucide-react";
import TimeClockSettingsDialog from "@/components/timeclock/TimeClockSettingsDialog";
import { format } from "date-fns";
import { ENTRY_TYPE_LABEL, ENTRY_TYPE_ORDER, TimeClockEntryType } from "@/lib/timeClock";
import { ScheduleVsPunchPanel } from "@/components/timeclock/ScheduleVsPunchPanel";
import { sortStores } from "@/lib/storeSort";

import JustificationsPanel from "@/components/timeclock/JustificationsPanel";
import EmployeeLeavesPanel from "@/components/timeclock/EmployeeLeavesPanel";
import TimesheetClosurePanel from "@/components/timeclock/TimesheetClosurePanel";
import BancoHoras from "@/pages/BancoHoras";

interface Store { id: string; name: string }
interface Employee { id: string; full_name: string; store_id: string }
interface Entry {
  id: string;
  employee_id: string;
  store_id: string | null;
  entry_type: TimeClockEntryType;
  entry_at: string;
  reference_date: string;
  match_score: number | null;
  latitude: number | null;
  longitude: number | null;
  is_manual: boolean;
  is_outside_geofence: boolean | null;
  distance_from_store_m: number | null;
}

export default function TimeClock() {
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<Store[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [storeId, setStoreId] = useState<string>("all");
  const [employeeId, setEmployeeId] = useState<string>("all");
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { from, to } = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0);
    return { from: format(first, "yyyy-MM-dd"), to: format(last, "yyyy-MM-dd") };
  }, [month]);

  useEffect(() => { init(); }, []);
  useEffect(() => { load(); }, [storeId, employeeId, from, to]);

  const init = async () => {
    const [{ data: sto }, { data: emp }] = await Promise.all([
      supabase.from("stores").select("id, name, store_type").eq("is_active", true).eq("is_virtual", false).order("name"),
      supabase.from("employees").select("id, full_name, store_id").eq("status", "active").order("full_name"),
    ]);
    setStores(sortStores(sto ?? []));
    setEmployees(emp ?? []);
    setLoading(false);
  };

  const load = async () => {
    let q = supabase
      .from("time_clock_entries")
      .select("id, employee_id, store_id, entry_type, entry_at, reference_date, match_score, latitude, longitude, is_manual, is_outside_geofence, distance_from_store_m")
      .gte("reference_date", from)
      .lte("reference_date", to)
      .order("entry_at", { ascending: false })
      .limit(1000);
    if (storeId !== "all") q = q.eq("store_id", storeId);
    if (employeeId !== "all") q = q.eq("employee_id", employeeId);
    const { data } = await q;
    setEntries((data ?? []) as Entry[]);
  };

  const empMap = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
  const storeMap = useMemo(() => Object.fromEntries(stores.map((s) => [s.id, s])), [stores]);

  const grouped = useMemo(() => {
    const m = new Map<string, { employee_id: string; date: string; items: Entry[] }>();
    for (const e of entries) {
      const k = `${e.employee_id}|${e.reference_date}`;
      if (!m.has(k)) m.set(k, { employee_id: e.employee_id, date: e.reference_date, items: [] });
      m.get(k)!.items.push(e);
    }
    return Array.from(m.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [entries]);

  const exportCsv = () => {
    const rows = [["Data", "Colaborador", "Loja", "Tipo", "Hora", "Match %", "Lat", "Lng", "Manual"]];
    for (const e of entries) {
      const emp = empMap[e.employee_id];
      const st = e.store_id ? storeMap[e.store_id] : null;
      rows.push([
        e.reference_date,
        emp?.full_name ?? e.employee_id,
        st?.name ?? "",
        ENTRY_TYPE_LABEL[e.entry_type],
        format(new Date(e.entry_at), "HH:mm:ss"),
        e.match_score != null ? (Number(e.match_score) * 100).toFixed(1) : "",
        e.latitude?.toString() ?? "",
        e.longitude?.toString() ?? "",
        e.is_manual ? "Sim" : "Não",
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ponto_${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Clock className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Controle de Ponto</h1>
          <p className="text-muted-foreground">Batidas registradas com reconhecimento facial</p>
        </div>
      </div>

      <Tabs defaultValue="entries" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="entries">Batidas</TabsTrigger>
          <TabsTrigger value="vs-schedule">Escala × Ponto</TabsTrigger>
          <TabsTrigger value="justifications">Tratativas</TabsTrigger>
          <TabsTrigger value="leaves">Afastamentos</TabsTrigger>
          <TabsTrigger value="closure">Fechamento</TabsTrigger>
          <TabsTrigger value="hour-bank">Banco de Horas</TabsTrigger>
        </TabsList>

        <TabsContent value="entries" className="space-y-4">
          <Card>
            <CardContent className="p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
              <div>
                <Label>Loja</Label>
                <Select value={storeId} onValueChange={(v) => { setStoreId(v); setEmployeeId("all"); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label>Colaborador</Label>
                <EmployeeCombobox
                  value={employeeId}
                  onChange={setEmployeeId}
                  employees={employees.filter((e) => storeId === "all" || e.store_id === storeId)}
                />
              </div>
              <div>
                <Label>Mês</Label>
                <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
              </div>
              <div className="flex items-end gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
                  <Settings className="h-4 w-4 mr-2" /> Config
                </Button>
                <Button variant="outline" size="sm" onClick={exportCsv}>
                  <Download className="h-4 w-4 mr-2" /> CSV
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Registros</CardTitle>
              <CardDescription>{grouped.length} dias / {entries.length} batidas</CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {grouped.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">Nenhuma batida no período.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2">Data</th>
                      <th className="text-left p-2">Colaborador</th>
                      <th className="text-left p-2">Loja</th>
                      {ENTRY_TYPE_ORDER.map((t) => (
                        <th key={t} className="text-center p-2">{ENTRY_TYPE_LABEL[t]}</th>
                      ))}
                      <th className="text-center p-2">GPS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped.map((g) => {
                      const emp = empMap[g.employee_id];
                      const anyStore = g.items.find((i) => i.store_id)?.store_id;
                      const st = anyStore ? storeMap[anyStore] : null;
                      const hasGps = g.items.some((i) => i.latitude != null);
                      return (
                        <tr key={`${g.employee_id}-${g.date}`} className="border-t">
                          <td className="p-2 font-mono text-xs">{format(new Date(g.date + "T00:00"), "dd/MM/yyyy")}</td>
                          <td className="p-2">{emp?.full_name ?? "—"}</td>
                          <td className="p-2 text-muted-foreground">{st?.name ?? "—"}</td>
                          {ENTRY_TYPE_ORDER.map((t) => {
                            const e = g.items.find((i) => i.entry_type === t);
                            return (
                              <td key={t} className="p-2 text-center">
                                {e ? (
                                  <div className="space-y-0.5">
                                    <div className="font-mono">{format(new Date(e.entry_at), "HH:mm")}</div>
                                    {e.is_manual && <Badge variant="outline" className="text-[10px]">manual</Badge>}
                                    {e.is_outside_geofence && (
                                      <Badge variant="destructive" className="text-[10px]" title={e.distance_from_store_m ? `${Math.round(Number(e.distance_from_store_m))}m da loja` : undefined}>
                                        fora da área{e.distance_from_store_m ? ` · ${Math.round(Number(e.distance_from_store_m))}m` : ""}
                                      </Badge>
                                    )}
                                  </div>
                                ) : <span className="text-muted-foreground">—</span>}
                              </td>
                            );
                          })}
                          <td className="p-2 text-center">
                            {hasGps && <MapPin className="h-3 w-3 inline text-primary" />}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vs-schedule">
          <ScheduleVsPunchPanel />
        </TabsContent>

        <TabsContent value="justifications">
          <JustificationsPanel />
        </TabsContent>

        <TabsContent value="leaves">
          <EmployeeLeavesPanel />
        </TabsContent>

        <TabsContent value="closure">
          <TimesheetClosurePanel />
        </TabsContent>

        <TabsContent value="hour-bank">
          <BancoHoras />
        </TabsContent>

      </Tabs>

      <TimeClockSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

function EmployeeCombobox({ value, onChange, employees }: { value: string; onChange: (v: string) => void; employees: Employee[] }) {
  const [open, setOpen] = useState(false);
  const selected = employees.find((e) => e.id === value);
  const label = value === "all" ? "Todos os colaboradores" : (selected?.full_name ?? "Selecionar...");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar colaborador..." />
          <CommandList>
            <CommandEmpty>Nenhum colaborador encontrado.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="todos" onSelect={() => { onChange("all"); setOpen(false); }}>
                <Check className={`mr-2 h-4 w-4 ${value === "all" ? "opacity-100" : "opacity-0"}`} />
                Todos os colaboradores
              </CommandItem>
              {employees.map((e) => (
                <CommandItem key={e.id} value={e.full_name} onSelect={() => { onChange(e.id); setOpen(false); }}>
                  <Check className={`mr-2 h-4 w-4 ${value === e.id ? "opacity-100" : "opacity-0"}`} />
                  {e.full_name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
