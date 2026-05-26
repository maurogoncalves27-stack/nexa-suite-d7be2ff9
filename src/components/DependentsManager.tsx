import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, Users } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export interface PendingDependent {
  tempId: string;
  full_name: string;
  birth_date: string | null;
  cpf: string | null;
  relationship: string | null;
}

interface Dependent {
  id: string;
  full_name: string;
  birth_date: string | null;
  cpf: string | null;
  relationship: string | null;
}

const RELATIONSHIPS = [
  { value: "filho", label: "Filho(a)" },
  { value: "enteado", label: "Enteado(a)" },
  { value: "conjuge", label: "Cônjuge" },
  { value: "outro", label: "Outro" },
];

const calcAge = (birth?: string | null) => {
  if (!birth) return null;
  const d = new Date(birth);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
};

interface Props {
  /** Quando informado, opera direto no banco. */
  employeeId?: string;
  /** Modo controlado (antes de salvar). */
  pending?: PendingDependent[];
  onPendingChange?: (next: PendingDependent[]) => void;
}

export default function DependentsManager({ employeeId, pending, onPendingChange }: Props) {
  const isPendingMode = !employeeId;
  const [list, setList] = useState<Dependent[]>([]);
  const [loading, setLoading] = useState(!isPendingMode);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    birth_date: "",
    cpf: "",
    relationship: "filho",
  });

  const load = async () => {
    if (!employeeId) return;
    setLoading(true);
    const { data } = await supabase
      .from("employee_dependents")
      .select("*")
      .eq("employee_id", employeeId)
      .order("birth_date", { ascending: true });
    setList(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (employeeId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  const resetForm = () =>
    setForm({ full_name: "", birth_date: "", cpf: "", relationship: "filho" });

  const handleAdd = async () => {
    if (!form.full_name.trim()) {
      toast({ title: "Informe o nome do dependente", variant: "destructive" });
      return;
    }
    if (isPendingMode) {
      onPendingChange?.([
        ...(pending ?? []),
        {
          tempId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          full_name: form.full_name.trim(),
          birth_date: form.birth_date || null,
          cpf: form.cpf.trim() || null,
          relationship: form.relationship || null,
        },
      ]);
      resetForm();
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("employee_dependents").insert({
      employee_id: employeeId!,
      full_name: form.full_name.trim(),
      birth_date: form.birth_date || null,
      cpf: form.cpf.trim() || null,
      relationship: form.relationship || null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    resetForm();
    toast({ title: "Dependente adicionado" });
    load();
  };

  const handleRemove = async (id: string, name: string) => {
    if (!confirm(`Remover dependente "${name}"?`)) return;
    const { error } = await supabase.from("employee_dependents").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Dependente removido" });
    load();
  };

  const handleRemovePending = (tempId: string) => {
    onPendingChange?.((pending ?? []).filter((p) => p.tempId !== tempId));
  };

  const displayList: (Dependent | (PendingDependent & { id?: undefined }))[] = isPendingMode
    ? (pending ?? [])
    : list;

  const minorCount = displayList.filter((d) => {
    const age = calcAge(d.birth_date);
    return age !== null && age < 14;
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Dependentes</h3>
        {minorCount > 0 && (
          <span className="text-xs px-2 py-1 rounded-full bg-warning/15 text-warning border border-warning/30">
            {minorCount} menor{minorCount > 1 ? "es" : ""} de 14 anos
          </span>
        )}
        {isPendingMode && (pending?.length ?? 0) > 0 && (
          <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground border">
            Serão salvos junto com o cadastro
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end p-4 bg-muted/40 rounded-lg">
        <div className="space-y-2 md:col-span-2">
          <Label>Nome completo</Label>
          <Input
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            placeholder="Nome do dependente"
          />
        </div>
        <div className="space-y-2">
          <Label>Data de nascimento</Label>
          <Input
            type="date"
            value={form.birth_date}
            onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>CPF</Label>
          <Input
            value={form.cpf}
            onChange={(e) => setForm({ ...form, cpf: e.target.value })}
            placeholder="000.000.000-00"
          />
        </div>
        <div className="space-y-2">
          <Label>Parentesco</Label>
          <Select value={form.relationship} onValueChange={(v) => setForm({ ...form, relationship: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {RELATIONSHIPS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-5 flex justify-end">
          <Button type="button" onClick={handleAdd} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Adicionar dependente
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : displayList.length === 0 ? (
        <div className="text-center text-muted-foreground py-6 text-sm">Nenhum dependente cadastrado.</div>
      ) : (
        <div className="space-y-2">
          {displayList.map((d) => {
            const age = calcAge(d.birth_date);
            const isMinor = age !== null && age < 14;
            const key = (d as Dependent).id ?? (d as PendingDependent).tempId;
            const onRemove = () => {
              if ((d as Dependent).id) {
                handleRemove((d as Dependent).id, d.full_name);
              } else {
                handleRemovePending((d as PendingDependent).tempId);
              }
            };
            return (
              <div
                key={key}
                className={`flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/30 ${
                  isMinor ? "border-warning/40 bg-warning/5" : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate flex items-center gap-2">
                    {d.full_name}
                    {isMinor && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-warning/15 text-warning border border-warning/30">
                        menor de 14
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {RELATIONSHIPS.find((r) => r.value === d.relationship)?.label ?? d.relationship ?? "—"}
                    {d.birth_date && ` · Nasc. ${new Date(d.birth_date).toLocaleDateString("pt-BR")}`}
                    {age !== null && ` · ${age} anos`}
                    {d.cpf && ` · CPF ${d.cpf}`}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={onRemove}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
