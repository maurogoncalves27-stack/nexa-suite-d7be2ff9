import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Briefcase, Users, Search } from "lucide-react";
import { toast } from "sonner";

interface PositionRow {
  id: string;
  name: string;
  time_clock_required: boolean;
  time_clock_payroll: boolean;
}
interface EmployeeRow {
  id: string;
  full_name: string;
  position: string | null;
  time_clock_required: boolean | null;
  time_clock_payroll: boolean | null;
}

type TriBool = "default" | "yes" | "no";
const triFromBool = (v: boolean | null): TriBool => v === null ? "default" : v ? "yes" : "no";
const triToBool = (v: TriBool): boolean | null => v === "default" ? null : v === "yes";

export default function TimeClockSettingsDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => { if (open) load(); }, [open]);

  const load = async () => {
    setLoading(true);
    const [{ data: pos }, { data: emps }] = await Promise.all([
      supabase.from("positions")
        .select("id, name, time_clock_required, time_clock_payroll")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase.from("employees")
        .select("id, full_name, position, time_clock_required, time_clock_payroll")
        .eq("status", "active")
        .order("full_name", { ascending: true }),
    ]);
    setPositions((pos ?? []) as PositionRow[]);
    setEmployees((emps ?? []) as EmployeeRow[]);
    setLoading(false);
  };

  const posMap = useMemo(
    () => Object.fromEntries(positions.map((p) => [p.name, p])),
    [positions],
  );

  const updatePosition = (id: string, patch: Partial<PositionRow>) =>
    setPositions((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const updateEmployee = (id: string, patch: Partial<EmployeeRow>) =>
    setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const savePositions = async () => {
    setSaving(true);
    try {
      for (const p of positions) {
        const { error } = await supabase
          .from("positions")
          .update({
            time_clock_required: p.time_clock_required,
            time_clock_payroll: p.time_clock_payroll,
          })
          .eq("id", p.id);
        if (error) throw error;
      }
      toast.success("Padrões por cargo salvos");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const saveEmployees = async () => {
    setSaving(true);
    try {
      for (const e of employees) {
        const { error } = await supabase
          .from("employees")
          .update({
            time_clock_required: e.time_clock_required,
            time_clock_payroll: e.time_clock_payroll,
          })
          .eq("id", e.id);
        if (error) throw error;
      }
      toast.success("Configurações por colaborador salvas");
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.full_name.toLowerCase().includes(q) ||
        (e.position ?? "").toLowerCase().includes(q),
    );
  }, [employees, search]);

  const effective = (e: EmployeeRow, key: "time_clock_required" | "time_clock_payroll") => {
    if (e[key] !== null) return e[key] as boolean;
    const pos = e.position ? posMap[e.position] : null;
    if (pos) return pos[key];
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurações de Ponto</DialogTitle>
          <DialogDescription>
            Defina quem é obrigado a bater ponto e se o ponto entra na folha.
            Override por colaborador prevalece sobre o padrão do cargo.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="positions" className="space-y-4">
            <TabsList className="grid grid-cols-2 w-full h-auto">
              <TabsTrigger value="positions" className="gap-2">
                <Briefcase className="h-4 w-4" /> Por cargo
              </TabsTrigger>
              <TabsTrigger value="employees" className="gap-2">
                <Users className="h-4 w-4" /> Por colaborador
              </TabsTrigger>
            </TabsList>

            <TabsContent value="positions" className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Define o padrão para todos os colaboradores deste cargo.
                Pode ser sobrescrito individualmente na aba "Por colaborador".
              </p>
              <div className="space-y-2">
                {positions.map((p) => (
                  <div key={p.id} className="border rounded-lg p-3 space-y-3">
                    <div className="font-medium text-sm">{p.name}</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="flex items-center justify-between gap-3 rounded-md border p-2">
                        <Label className="text-xs">Obrigado a bater ponto</Label>
                        <Switch
                          checked={p.time_clock_required}
                          onCheckedChange={(v) =>
                            updatePosition(p.id, { time_clock_required: v })
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-md border p-2">
                        <Label className="text-xs">Ponto entra na folha</Label>
                        <Switch
                          checked={p.time_clock_payroll}
                          onCheckedChange={(v) =>
                            updatePosition(p.id, { time_clock_payroll: v })
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <Button onClick={savePositions} disabled={saving} className="w-full">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar padrões por cargo
              </Button>
            </TabsContent>

            <TabsContent value="employees" className="space-y-3">
              <p className="text-xs text-muted-foreground">
                "Padrão do cargo" usa a regra definida na outra aba. Marque "Sim/Não" para
                sobrescrever individualmente.
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar colaborador ou cargo"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="space-y-2">
                {filteredEmployees.map((e) => {
                  const reqEff = effective(e, "time_clock_required");
                  const payEff = effective(e, "time_clock_payroll");
                  return (
                    <div key={e.id} className="border rounded-lg p-3 space-y-3">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <div className="font-medium text-sm">{e.full_name}</div>
                          <div className="text-xs text-muted-foreground">{e.position ?? "—"}</div>
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          <Badge variant={reqEff ? "default" : "outline"} className="text-[10px]">
                            {reqEff ? "Bate ponto" : "Dispensado"}
                          </Badge>
                          <Badge variant={payEff ? "default" : "outline"} className="text-[10px]">
                            {payEff ? "Folha" : "Só controle"}
                          </Badge>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <TriSwitch
                          label="Obrigado a bater ponto"
                          value={triFromBool(e.time_clock_required)}
                          onChange={(v) =>
                            updateEmployee(e.id, { time_clock_required: triToBool(v) })
                          }
                        />
                        <TriSwitch
                          label="Ponto entra na folha"
                          value={triFromBool(e.time_clock_payroll)}
                          onChange={(v) =>
                            updateEmployee(e.id, { time_clock_payroll: triToBool(v) })
                          }
                        />
                      </div>
                    </div>
                  );
                })}
                {filteredEmployees.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Nenhum colaborador encontrado.
                  </p>
                )}
              </div>
              <Button onClick={saveEmployees} disabled={saving} className="w-full">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar configurações
              </Button>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TriSwitch({
  label, value, onChange,
}: { label: string; value: TriBool; onChange: (v: TriBool) => void }) {
  return (
    <div className="rounded-md border p-2 space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="grid grid-cols-3 gap-1">
        {(["default", "yes", "no"] as TriBool[]).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`text-xs rounded-md py-1.5 border transition-colors ${
              value === opt
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-accent"
            }`}
          >
            {opt === "default" ? "Padrão cargo" : opt === "yes" ? "Sim" : "Não"}
          </button>
        ))}
      </div>
    </div>
  );
}
