import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Building2, Home, CalendarOff, AlertTriangle, Download } from "lucide-react";
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { sortStores } from "@/lib/storeSort";

interface Store { id: string; name: string }
interface Employee { id: string; full_name: string; store_id: string; allocated_store_id: string | null }
interface Row {
  employee_id: string;
  presencial: number;
  home_office: number;
  folga: number;
  falta: number;
  total: number;
}

export default function WorkModalityReport() {
  const today = new Date();
  const [month, setMonth] = useState(format(today, "yyyy-MM"));
  const [storeId, setStoreId] = useState("all");
  const [stores, setStores] = useState<Store[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: sto }, { data: emp }] = await Promise.all([
        supabase.from("stores").select("id, name, store_type").eq("is_active", true).eq("is_virtual", false).order("name"),
        supabase.from("employees").select("id, full_name, store_id, allocated_store_id").eq("status", "active").order("full_name"),
      ]);
      setStores(sortStores(sto ?? []));
      setEmployees((emp ?? []) as Employee[]);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (employees.length === 0) return;
    (async () => {
      setLoading(true);
      const start = startOfMonth(parseISO(month + "-01"));
      const end = endOfMonth(start);
      const startStr = format(start, "yyyy-MM-dd");
      const endStr = format(end, "yyyy-MM-dd");

      const filteredEmps = storeId === "all"
        ? employees
        : employees.filter((e) => (e.allocated_store_id ?? e.store_id) === storeId);
      const empIds = filteredEmps.map((e) => e.id);
      if (empIds.length === 0) { setRows([]); setLoading(false); return; }

      // Pega todas as escalas do período pra esses colaboradores
      const { data: scheds } = await supabase
        .from("work_schedules")
        .select("employee_id, schedule_date, is_day_off, is_home_office")
        .in("employee_id", empIds)
        .gte("schedule_date", startStr)
        .lte("schedule_date", endStr);

      // Pega batidas clock_in do período (basta uma por dia pra contar como presença)
      const { data: punches } = await supabase
        .from("time_clock_entries")
        .select("employee_id, reference_date")
        .in("employee_id", empIds)
        .gte("reference_date", startStr)
        .lte("reference_date", endStr)
        .eq("entry_type", "clock_in");

      // Set de "tem batida" por colaborador|data
      const punchSet = new Set((punches ?? []).map((p: any) => `${p.employee_id}|${p.reference_date}`));

      // Agrega por colaborador
      const map = new Map<string, Row>();
      for (const e of filteredEmps) {
        map.set(e.id, { employee_id: e.id, presencial: 0, home_office: 0, folga: 0, falta: 0, total: 0 });
      }
      for (const s of (scheds ?? []) as any[]) {
        const r = map.get(s.employee_id);
        if (!r) continue;
        r.total++;
        if (s.is_day_off) r.folga++;
        else if (s.is_home_office) r.home_office++;
        else if (punchSet.has(`${s.employee_id}|${s.schedule_date}`)) r.presencial++;
        else {
          // Dia presencial agendado, mas sem batida → falta (somente se já passou)
          const d = parseISO(s.schedule_date);
          if (d < today) r.falta++;
          else r.presencial++; // dia futuro: contabiliza como esperado presencial
        }
      }
      // Mantém só quem tem alguma escala no mês
      setRows(Array.from(map.values()).filter((r) => r.total > 0));
      setLoading(false);
    })();
  }, [employees, storeId, month]);

  const empMap = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);

  const totals = useMemo(() => rows.reduce(
    (acc, r) => ({
      presencial: acc.presencial + r.presencial,
      home_office: acc.home_office + r.home_office,
      folga: acc.folga + r.folga,
      falta: acc.falta + r.falta,
    }),
    { presencial: 0, home_office: 0, folga: 0, falta: 0 },
  ), [rows]);

  const exportCsv = () => {
    const header = [["Colaborador", "Presencial", "Home Office", "Folga", "Falta", "Total dias na escala"]];
    const body = rows
      .slice()
      .sort((a, b) => (empMap[a.employee_id]?.full_name ?? "").localeCompare(empMap[b.employee_id]?.full_name ?? ""))
      .map((r) => [
        empMap[r.employee_id]?.full_name ?? r.employee_id,
        String(r.presencial),
        String(r.home_office),
        String(r.folga),
        String(r.falta),
        String(r.total),
      ]);
    const csv = [...header, ...body]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `modalidade_${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label>Mês</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <div>
            <Label>Loja</Label>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 flex items-end">
            <Button variant="outline" onClick={exportCsv} className="w-full md:w-auto ml-auto" disabled={rows.length === 0}>
              <Download className="h-4 w-4 mr-2" /> Exportar CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Building2 className="h-8 w-8 text-primary" />
          <div><p className="text-xs text-muted-foreground">Presencial</p><p className="text-2xl font-bold">{totals.presencial}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Home className="h-8 w-8 text-blue-500" />
          <div><p className="text-xs text-muted-foreground">Home Office</p><p className="text-2xl font-bold">{totals.home_office}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <CalendarOff className="h-8 w-8 text-amber-500" />
          <div><p className="text-xs text-muted-foreground">Folga</p><p className="text-2xl font-bold">{totals.folga}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <div><p className="text-xs text-muted-foreground">Falta</p><p className="text-2xl font-bold">{totals.falta}</p></div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Por colaborador</CardTitle>
          <CardDescription>
            Conta os dias da escala no mês. Falta = dia presencial sem batida (dias passados). Dias futuros sem batida contam como presencial esperado.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Nenhuma escala no período selecionado.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2">Colaborador</th>
                  <th className="text-center p-2">Presencial</th>
                  <th className="text-center p-2">Home Office</th>
                  <th className="text-center p-2">Folga</th>
                  <th className="text-center p-2">Falta</th>
                  <th className="text-center p-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .slice()
                  .sort((a, b) => (empMap[a.employee_id]?.full_name ?? "").localeCompare(empMap[b.employee_id]?.full_name ?? ""))
                  .map((r) => (
                    <tr key={r.employee_id} className="border-t">
                      <td className="p-2 font-medium">{empMap[r.employee_id]?.full_name ?? "—"}</td>
                      <td className="p-2 text-center">{r.presencial > 0 ? <Badge variant="default">{r.presencial}</Badge> : <span className="text-muted-foreground">0</span>}</td>
                      <td className="p-2 text-center">{r.home_office > 0 ? <Badge className="bg-blue-500 hover:bg-blue-500 text-white">{r.home_office}</Badge> : <span className="text-muted-foreground">0</span>}</td>
                      <td className="p-2 text-center">{r.folga > 0 ? <Badge variant="secondary">{r.folga}</Badge> : <span className="text-muted-foreground">0</span>}</td>
                      <td className="p-2 text-center">{r.falta > 0 ? <Badge variant="destructive">{r.falta}</Badge> : <span className="text-muted-foreground">0</span>}</td>
                      <td className="p-2 text-center font-semibold">{r.total}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
