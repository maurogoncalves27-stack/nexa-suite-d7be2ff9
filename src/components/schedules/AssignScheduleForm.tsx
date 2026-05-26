import { useState } from "react";
import { Loader2, UserCog, UserX, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type Employee, getStoreColorClasses, type Store } from "@/lib/scheduleRules";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface AssignForm {
  employeeId: string;
  startDate: string;
  entry: string;
  breakStart: string;
  breakEnd: string;
  hasSecondBreak: boolean;
  breakStart2: string;
  breakEnd2: string;
  exit: string;
  offWeekdays: number[];
}

interface Props {
  storeId: string;
  setStoreId: (v: string) => void;
  stores: Store[];
  employees: Employee[];
  form: AssignForm;
  setForm: (f: AssignForm) => void;
  saving: boolean;
  onGenerate: () => void;
  onMarkNoSchedule?: () => void;
  markingNoSchedule?: boolean;
  onEmployeeUpdated?: () => void;
}

export default function AssignScheduleForm({
  storeId, setStoreId, stores, employees, form, setForm, saving, onGenerate, onMarkNoSchedule, markingNoSchedule, onEmployeeUpdated,
}: Props) {
  const [savingNight, setSavingNight] = useState(false);
  const selectedEmp = employees.find((e) => e.id === form.employeeId);
  const sched = (selectedEmp?.work_schedule || "").trim().toLowerCase();
  const need = sched === "5x2" ? 2 : sched === "6x1" ? 1 : 0;
  const labels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><UserCog className="h-5 w-5" />Definir escala padrão</CardTitle>
        <CardDescription>
          Use apenas para colaboradores novos ou quando a escala padrão mudar (ex: passou de 5x2 para 6x1, novo horário fixo). A escala é gerada da data de início até o último dia do mês, e os meses seguintes são replicados automaticamente. Edite a célula só quando houver exceção (troca de horário, folga extra, home office).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <Label>Loja</Label>
            <Select value={storeId === "__all__" ? "" : storeId} onValueChange={setStoreId}>
              <SelectTrigger><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-3 w-3 rounded-full ${getStoreColorClasses(s.name).dot}`} />
                      {s.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Colaborador</Label>
            <Select value={form.employeeId} onValueChange={(v) => setForm({ ...form, employeeId: v })}>
              <SelectTrigger>
                <SelectValue placeholder={storeId === "__all__" ? "Selecione uma loja primeiro" : "Selecione"} />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Escala (do cadastro)</Label>
            <Input
              readOnly
              value={selectedEmp?.work_schedule || "—"}
              placeholder="Selecione um colaborador"
              className="bg-muted"
            />
          </div>
          <div>
            <Label>Data de início da escala</Label>
            <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          {selectedEmp && (
            <div className="md:col-span-2">
              <label className={`flex items-start gap-2 rounded-md border p-3 text-sm cursor-pointer select-none ${selectedEmp.night_shift_eligible ? "bg-primary/5 border-primary/30" : "bg-background"}`}>
                <input
                  type="checkbox"
                  className="h-4 w-4 mt-0.5 accent-primary"
                  disabled={savingNight}
                  checked={!!selectedEmp.night_shift_eligible}
                  onChange={async (e) => {
                    const next = e.target.checked;
                    setSavingNight(true);
                    const { error } = await supabase
                      .from("employees")
                      .update({ night_shift_eligible: next })
                      .eq("id", selectedEmp.id);
                    setSavingNight(false);
                    if (error) {
                      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
                      return;
                    }
                    toast({
                      title: next ? "Adicional noturno habilitado" : "Adicional noturno desabilitado",
                      description: next
                        ? "Será calculado em folha conforme CLT (20% sobre horas entre 22h e 5h, hora reduzida)."
                        : "O colaborador deixará de receber adicional noturno.",
                    });
                    onEmployeeUpdated?.();
                  }}
                />
                <span className="flex-1">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Moon className="h-3.5 w-3.5" />
                    Habilitar adicional noturno (CLT)
                  </span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    Quando habilitado, o sistema calcula automaticamente 20% sobre as horas trabalhadas entre 22h e 5h (hora noturna reduzida de 52'30") com base no ponto registrado.
                  </span>
                </span>
              </label>
            </div>
          )}
          <div className="hidden md:block" />
          <div>
            <Label>Entrada</Label>
            <Input type="time" value={form.entry} onChange={(e) => setForm({ ...form, entry: e.target.value })} />
          </div>
          <div>
            <Label>Saída</Label>
            <Input type="time" value={form.exit} onChange={(e) => setForm({ ...form, exit: e.target.value })} />
          </div>
          <div>
            <Label>Início do intervalo 1</Label>
            <Input type="time" value={form.breakStart} onChange={(e) => setForm({ ...form, breakStart: e.target.value })} />
          </div>
          <div>
            <Label>Fim do intervalo 1</Label>
            <Input type="time" value={form.breakEnd} onChange={(e) => setForm({ ...form, breakEnd: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={form.hasSecondBreak}
                onChange={(e) => setForm({ ...form, hasSecondBreak: e.target.checked })}
              />
              Dividir em 2 intervalos
            </label>
          </div>
          {form.hasSecondBreak && (
            <>
              <div>
                <Label>Início do intervalo 2</Label>
                <Input type="time" value={form.breakStart2} onChange={(e) => setForm({ ...form, breakStart2: e.target.value })} />
              </div>
              <div>
                <Label>Fim do intervalo 2</Label>
                <Input type="time" value={form.breakEnd2} onChange={(e) => setForm({ ...form, breakEnd2: e.target.value })} />
              </div>
            </>
          )}
          {(sched === "5x2" || sched === "6x1") && (
            <div className="md:col-span-2">
              <Label>Dias de folga (selecione {need})</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {labels.map((lab, idx) => {
                  const checked = form.offWeekdays.includes(idx);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        const set = new Set(form.offWeekdays);
                        if (checked) set.delete(idx); else set.add(idx);
                        setForm({ ...form, offWeekdays: Array.from(set).sort() });
                      }}
                      className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${checked ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent border-border"}`}
                    >
                      {lab}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {form.offWeekdays.length}/{need} selecionado(s).
              </p>
            </div>
          )}
          {sched === "12x36" && (
            <div className="md:col-span-2 text-xs text-muted-foreground">
              Escala 12x36: o 1º dia (data de início) será de trabalho e os dias seguintes alternam folga/trabalho automaticamente.
            </div>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={onGenerate} disabled={saving} className="w-full sm:w-auto">
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar escala padrão
          </Button>
          {onMarkNoSchedule && (
            <Button
              type="button"
              variant="outline"
              onClick={onMarkNoSchedule}
              disabled={markingNoSchedule || !form.employeeId}
              className="w-full sm:w-auto"
            >
              {markingNoSchedule ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <UserX className="h-4 w-4 mr-2" />
              )}
              Marcar sem escala
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
