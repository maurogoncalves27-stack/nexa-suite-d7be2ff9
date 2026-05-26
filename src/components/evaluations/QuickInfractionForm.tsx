import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { severityTileClass } from "@/lib/severity";
import type { InfractionType } from "./InfractionTypesPanel";

interface EmployeeRow { id: string; full_name: string; }

interface Props {
  onSaved?: () => void;
  onCancel?: () => void;
  showCancel?: boolean;
}

export default function QuickInfractionForm({ onSaved, onCancel, showCancel = false }: Props) {
  const { user, isAdmin, isManager } = useAuth();
  const canManage = isAdmin || isManager;

  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [types, setTypes] = useState<InfractionType[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedTypeIds, setSelectedTypeIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [suspensionWeeks, setSuspensionWeeks] = useState("4");
  const [occurredOn, setOccurredOn] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!canManage) return;
    (async () => {
      const [{ data: emps }, { data: tps }] = await Promise.all([
        supabase.from("employees").select("id, full_name").eq("status", "active").order("full_name"),
        supabase.from("infraction_types").select("*").eq("is_active", true).order("name"),
      ]);
      setEmployees((emps ?? []) as EmployeeRow[]);
      setTypes((tps ?? []) as InfractionType[]);
    })();
  }, [canManage]);

  const typeMap = useMemo(() => Object.fromEntries(types.map((t) => [t.id, t])), [types]);
  const empMap = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
  const hasCriticalSelected = useMemo(
    () => selectedTypeIds.some((id) => typeMap[id]?.severity === "critical"),
    [selectedTypeIds, typeMap],
  );

  const toggleType = (id: string) =>
    setSelectedTypeIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const reset = () => {
    setEmployeeId(""); setEmployeeSearch(""); setSelectedTypeIds([]);
    setNotes(""); setSuspensionWeeks("4");
    setOccurredOn(new Date().toISOString().slice(0, 10));
    setSaving(false);
  };

  const save = async () => {
    if (!employeeId) return toast({ title: "Selecione um colaborador", variant: "destructive" });
    if (selectedTypeIds.length === 0) return toast({ title: "Selecione ao menos uma infração", variant: "destructive" });
    const weeksNum = Number(suspensionWeeks);
    if (hasCriticalSelected && (!Number.isFinite(weeksNum) || weeksNum <= 0)) {
      return toast({ title: "Informe as semanas de suspensão", variant: "destructive" });
    }
    setSaving(true);
    const occurred = occurredOn || new Date().toISOString().slice(0, 10);
    const rows = selectedTypeIds.map((typeId) => {
      const t = typeMap[typeId];
      const isCritical = t?.severity === "critical";
      const defaultWeeks = Number(t?.default_suspension_weeks ?? 0) || 0;
      const manualWeeks = isCritical ? Math.floor(weeksNum) : 0;
      const weeks = Math.max(defaultWeeks, manualWeeks);
      return {
        employee_id: employeeId,
        infraction_type_id: typeId,
        cycle_id: null,
        occurred_on: occurred,
        applied_weight: t ? Number(t.default_weight) : 1,
        notes: notes.trim() || null,
        created_by: user?.id ?? null,
        suspension_weeks: weeks,
      };
    });
    const { error } = await supabase.from("employee_infractions").insert(rows);
    if (error) {
      setSaving(false);
      return toast({ title: "Erro", description: error.message, variant: "destructive" });
    }

    try {
      const typeNames = selectedTypeIds.map((id) => typeMap[id]?.name).filter(Boolean);
      const empName = empMap[employeeId]?.full_name ?? "Colaborador";
      const title = rows.length > 1 ? "Novas infrações registradas" : "Nova infração registrada";
      const message =
        `${empName}, foi registrada ${rows.length > 1 ? "as seguintes infrações" : "a infração"}: ${typeNames.join(", ")}.` +
        (hasCriticalSelected && Number(suspensionWeeks) > 0
          ? ` Suspensão: ${Math.floor(Number(suspensionWeeks))} semana(s).`
          : "") +
        (notes.trim() ? ` Obs.: ${notes.trim()}` : "");
      const { data: ann } = await supabase
        .from("hr_announcements")
        .insert({
          title,
          message,
          priority: hasCriticalSelected ? "high" : "normal",
          scope: "employee",
          employee_id: employeeId,
          is_active: true,
          send_push: true,
          created_by: user?.id ?? null,
        })
        .select("id")
        .maybeSingle();
      if (ann?.id) {
        supabase.functions
          .invoke("send-push-notification", { body: { announcement_id: ann.id } })
          .catch((e) => console.error("Falha ao enviar push de infração:", e));
      }
    } catch (e) {
      console.error("Falha ao criar aviso de infração:", e);
    }

    setSaving(false);
    toast({ title: rows.length > 1 ? `${rows.length} infrações registradas` : "Infração registrada" });
    reset();
    onSaved?.();
  };

  if (!canManage) return null;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Colaborador*</Label>
        <Input
          type="search"
          value={employeeSearch}
          onChange={(e) => { setEmployeeSearch(e.target.value); setEmployeeId(""); }}
          placeholder="Pesquisar pelo nome..."
        />
        {employeeSearch.trim() && !employeeId && (
          <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
            {employees
              .filter((e) => e.full_name.toLowerCase().includes(employeeSearch.trim().toLowerCase()))
              .slice(0, 20)
              .map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => { setEmployeeId(e.id); setEmployeeSearch(e.full_name); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                >
                  {e.full_name}
                </button>
              ))}
            {employees.filter((e) => e.full_name.toLowerCase().includes(employeeSearch.trim().toLowerCase())).length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground">Nenhum colaborador encontrado.</div>
            )}
          </div>
        )}
        {employeeId && <p className="text-xs text-primary">Selecionado: {empMap[employeeId]?.full_name}</p>}
      </div>

      <div className="space-y-2">
        <Label>Tipo de infração*</Label>
        {types.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma infração ativa cadastrada.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {types.map((t) => {
              const selected = selectedTypeIds.includes(t.id);
              const disabled = !employeeId || saving;
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleType(t.id)}
                  className={`text-center rounded-md border p-2.5 transition-colors flex items-center justify-center min-h-14 ${severityTileClass(t.severity, selected)} ${
                    disabled ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                >
                  <div className="font-semibold text-sm leading-tight break-words">{t.name}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {hasCriticalSelected && (
        <div className="space-y-2">
          <Label>Semanas de suspensão*</Label>
          <Input
            type="number"
            min={1}
            value={suspensionWeeks}
            onChange={(e) => setSuspensionWeeks(e.target.value)}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label>Observações</Label>
        <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="flex flex-row items-center justify-between gap-2 pt-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="quick-infraction-date" className="text-xs whitespace-nowrap">Data</Label>
          <Input
            id="quick-infraction-date"
            type="date"
            value={occurredOn}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setOccurredOn(e.target.value)}
            className="h-9 w-[150px]"
          />
        </div>
        <div className="flex items-center gap-2">
          {showCancel && (
            <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
          )}
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            Registrar
          </Button>
        </div>
      </div>
    </div>
  );
}
