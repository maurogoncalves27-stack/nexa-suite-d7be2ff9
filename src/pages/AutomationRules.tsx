import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import {
  Settings, Loader2, Plus, Pencil, Trash2, Play, History, AlertTriangle,
  Clock, FileX, ShieldAlert, Repeat, Users, Briefcase, X, ChevronsUpDown,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { usePositions } from "@/hooks/usePositions";

type TriggerType = "late_arrival" | "wrong_punch" | "unjustified_absence" | "infraction_recurrence";

type Rule = {
  id: string;
  name: string;
  description: string | null;
  trigger_type: TriggerType;
  params: any;
  actions: any;
  is_active: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
};

type Run = {
  id: string;
  rule_id: string | null;
  trigger_type: TriggerType;
  reference_date: string | null;
  scanned: number;
  matched: number;
  infractions_created: number;
  warnings_created: number;
  notifications_sent: number;
  detail: any;
  error: string | null;
  ran_at: string;
};

type InfractionType = { id: string; name: string };

const TRIGGER_META: Record<TriggerType, { label: string; icon: any; color: string; fnName: string | null }> = {
  late_arrival: { label: "Atraso na entrada", icon: Clock, color: "text-amber-600", fnName: "auto-infraction-late" },
  wrong_punch: { label: "Ponto errado/incompleto", icon: ShieldAlert, color: "text-orange-600", fnName: "auto-infraction-wrong-punch" },
  unjustified_absence: { label: "Falta sem justificativa", icon: FileX, color: "text-red-600", fnName: "auto-infraction-absence" },
  infraction_recurrence: { label: "Recorrência → advertência", icon: Repeat, color: "text-purple-600", fnName: null },
};

export default function AutomationRules() {
  const { user, loading: authLoading } = useAuth();
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<Rule[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [infractionTypes, setInfractionTypes] = useState<InfractionType[]>([]);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [running, setRunning] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    (async () => {
      const { data: canManageData } = await (supabase as any).rpc("can_manage_automation_rules", { _user_id: user.id });
      setCanManage(!!canManageData);
      await loadAll();
      setLoading(false);
    })();
  }, [user, authLoading]);

  async function loadAll() {
    const [rulesRes, runsRes, typesRes] = await Promise.all([
      (supabase as any).from("automation_rules").select("*").order("trigger_type").order("name"),
      (supabase as any).from("automation_rule_runs").select("*").order("ran_at", { ascending: false }).limit(50),
      supabase.from("infraction_types").select("id, name").order("name"),
    ]);
    setRules((rulesRes.data ?? []) as Rule[]);
    setRuns((runsRes.data ?? []) as Run[]);
    setInfractionTypes((typesRes.data ?? []) as InfractionType[]);
  }

  async function toggleActive(rule: Rule) {
    const { error } = await (supabase as any).from("automation_rules")
      .update({ is_active: !rule.is_active }).eq("id", rule.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: rule.is_active ? "Regra revogada" : "Regra ativada" });
    loadAll();
  }

  async function deleteRule(rule: Rule) {
    if (!confirm(`Excluir a regra "${rule.name}"?`)) return;
    const { error } = await (supabase as any).from("automation_rules").delete().eq("id", rule.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Regra excluída" });
    loadAll();
  }

  async function runNow(rule: Rule) {
    const meta = TRIGGER_META[rule.trigger_type];
    if (!meta.fnName) {
      toast({ title: "Esta regra é encadeada", description: "Roda automaticamente após a regra de infração relacionada." });
      return;
    }
    setRunning(rule.id);
    try {
      const { data, error } = await supabase.functions.invoke(meta.fnName, { body: { rule_id: rule.id } });
      if (error) throw error;
      toast({ title: "Regra executada", description: JSON.stringify(data).slice(0, 120) });
      loadAll();
    } catch (e: any) {
      toast({ title: "Erro ao executar", description: e.message, variant: "destructive" });
    } finally {
      setRunning(null);
    }
  }

  if (authLoading || loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            Regras automáticas
          </h1>
          <p className="text-muted-foreground text-sm md:text-base">
            Crie, ative e revogue gatilhos para alertas, infrações e advertências automáticas.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => { setEditing(null); setShowDialog(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> Nova regra
          </Button>
        )}
      </div>

      {!canManage && (
        <div className="flex items-start gap-2 p-3 rounded-lg border bg-muted/40">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            Você pode visualizar as regras, mas não tem permissão para criar, editar ou revogar. Solicite ao RH ou administrador.
          </p>
        </div>
      )}

      <Tabs defaultValue="rules" className="space-y-4">
        <TabsList>
          <TabsTrigger value="rules">Regras ({rules.length})</TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-1" /> Histórico ({runs.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-3">
          {rules.length === 0 && (
            <p className="text-sm text-muted-foreground text-center p-8">Nenhuma regra cadastrada.</p>
          )}
          {rules.map((rule) => {
            const meta = TRIGGER_META[rule.trigger_type];
            const Icon = meta.icon;
            return (
              <Card key={rule.id} className={rule.is_active ? "" : "opacity-60"}>
                <CardContent className="pt-6">
                  <div className="flex flex-col md:flex-row md:items-start gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <Icon className={`h-5 w-5 mt-1 shrink-0 ${meta.color}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="font-semibold">{rule.name}</h3>
                          {rule.is_system && <Badge variant="outline" className="text-xs">Sistema</Badge>}
                          {!rule.is_active && <Badge variant="secondary" className="text-xs">Revogada</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">{meta.label}</p>
                        {rule.description && <p className="text-sm text-muted-foreground">{rule.description}</p>}
                        <RuleSummary rule={rule} infractionTypes={infractionTypes} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 md:flex-col md:items-end">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={rule.is_active}
                          onCheckedChange={() => toggleActive(rule)}
                          disabled={!canManage}
                        />
                        <span className="text-xs text-muted-foreground">{rule.is_active ? "Ativa" : "Inativa"}</span>
                      </div>
                      <div className="flex gap-1">
                        {meta.fnName && canManage && (
                          <Button size="sm" variant="outline" onClick={() => runNow(rule)} disabled={running === rule.id} className="gap-1">
                            {running === rule.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                            Rodar agora
                          </Button>
                        )}
                        {canManage && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => { setEditing(rule); setShowDialog(true); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {!rule.is_system && (
                              <Button size="sm" variant="ghost" onClick={() => deleteRule(rule)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="history" className="space-y-2">
          {runs.length === 0 && (
            <p className="text-sm text-muted-foreground text-center p-8">Nenhuma execução registrada ainda.</p>
          )}
          {runs.map((run) => {
            const meta = TRIGGER_META[run.trigger_type];
            const rule = rules.find((r) => r.id === run.rule_id);
            return (
              <Card key={run.id}>
                <CardContent className="py-3 px-4">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <Badge variant="outline" className="text-xs">{meta.label}</Badge>
                    <span className="font-medium">{rule?.name ?? "regra removida"}</span>
                    <span className="text-muted-foreground text-xs">
                      {new Date(run.ran_at).toLocaleString("pt-BR")}
                    </span>
                    {run.reference_date && (
                      <span className="text-xs text-muted-foreground">ref: {run.reference_date.split("-").reverse().join("/")}</span>
                    )}
                    <span className="text-xs">
                      {run.scanned} verificados · <strong>{run.matched}</strong> elegíveis
                      {run.infractions_created > 0 && <> · {run.infractions_created} infrações</>}
                      {run.warnings_created > 0 && <> · {run.warnings_created} advertências</>}
                    </span>
                    {run.error && <span className="text-xs text-destructive">erro: {run.error}</span>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>

      <RuleEditorDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        rule={editing}
        infractionTypes={infractionTypes}
        onSaved={() => { setShowDialog(false); loadAll(); }}
      />
    </div>
  );
}

function RuleSummary({ rule, infractionTypes }: { rule: Rule; infractionTypes: InfractionType[] }) {
  const apply = rule.actions?.apply_infraction;
  const warn = rule.actions?.create_warning;
  const notify = rule.actions?.notify_manager;
  const scope = rule.params?.scope ?? {};
  const positionIds: string[] = Array.isArray(scope.position_ids) ? scope.position_ids : [];
  const employeeIds: string[] = Array.isArray(scope.employee_ids) ? scope.employee_ids : [];
  const positionNames: string[] = Array.isArray(scope.position_names) ? scope.position_names : [];
  const employeeNames: string[] = Array.isArray(scope.employee_names) ? scope.employee_names : [];
  const typeName = (id: string) => infractionTypes.find((t) => t.id === id)?.name ?? "?";
  const scopeAll = positionIds.length === 0 && employeeIds.length === 0;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
      {rule.trigger_type === "late_arrival" && (
        <Badge variant="secondary">Tolerância: {rule.params?.tolerance_min ?? 15} min</Badge>
      )}
      {rule.trigger_type === "infraction_recurrence" && (
        <Badge variant="secondary">
          {rule.params?.count ?? 3}x em {rule.params?.window_days ?? 7} dias · {typeName(rule.params?.infraction_type_id)}
        </Badge>
      )}
      {apply && <Badge>Infração: {typeName(apply.infraction_type_id)} (peso {apply.weight})</Badge>}
      {warn && <Badge>Advertência escrita</Badge>}
      {notify && <Badge variant="outline">Notifica gestor</Badge>}
      {scopeAll ? (
        <Badge variant="outline" className="gap-1"><Users className="h-3 w-3" /> Todos colaboradores</Badge>
      ) : (
        <>
          {positionIds.length > 0 && (
            <Badge variant="outline" className="gap-1" title={positionNames.join(", ")}>
              <Briefcase className="h-3 w-3" /> {positionIds.length} cargo{positionIds.length > 1 ? "s" : ""}
            </Badge>
          )}
          {employeeIds.length > 0 && (
            <Badge variant="outline" className="gap-1" title={employeeNames.join(", ")}>
              <Users className="h-3 w-3" /> {employeeIds.length} colaborador{employeeIds.length > 1 ? "es" : ""}
            </Badge>
          )}
        </>
      )}
    </div>
  );
}

function RuleEditorDialog({
  open, onOpenChange, rule, infractionTypes, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rule: Rule | null;
  infractionTypes: InfractionType[];
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState<TriggerType>("late_arrival");
  const [toleranceMin, setToleranceMin] = useState(15);
  const [recCount, setRecCount] = useState(3);
  const [recWindow, setRecWindow] = useState(7);
  const [recInfractionType, setRecInfractionType] = useState("");
  const [applyInfractionType, setApplyInfractionType] = useState("");
  const [applyWeight, setApplyWeight] = useState(1);
  const [createWarning, setCreateWarning] = useState(false);
  const [warningTitle, setWarningTitle] = useState("");
  const [warningTemplate, setWarningTemplate] = useState("");
  const [notifyManager, setNotifyManager] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scopePositionIds, setScopePositionIds] = useState<string[]>([]);
  const [scopeEmployeeIds, setScopeEmployeeIds] = useState<string[]>([]);
  const [employees, setEmployees] = useState<{ id: string; full_name: string; position: string | null }[]>([]);
  const { positions } = usePositions(true);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("employees")
        .select("id, full_name, position")
        .eq("status", "active")
        .order("full_name");
      setEmployees((data ?? []) as any);
    })();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (rule) {
      setName(rule.name);
      setDescription(rule.description ?? "");
      setTriggerType(rule.trigger_type);
      setToleranceMin(rule.params?.tolerance_min ?? 15);
      setRecCount(rule.params?.count ?? 3);
      setRecWindow(rule.params?.window_days ?? 7);
      setRecInfractionType(rule.params?.infraction_type_id ?? "");
      setApplyInfractionType(rule.actions?.apply_infraction?.infraction_type_id ?? "");
      setApplyWeight(rule.actions?.apply_infraction?.weight ?? 1);
      setCreateWarning(!!rule.actions?.create_warning);
      setWarningTitle(rule.actions?.create_warning?.title ?? "");
      setWarningTemplate(rule.actions?.create_warning?.template ?? "");
      setNotifyManager(rule.actions?.notify_manager ?? true);
      setScopePositionIds(Array.isArray(rule.params?.scope?.position_ids) ? rule.params.scope.position_ids : []);
      setScopeEmployeeIds(Array.isArray(rule.params?.scope?.employee_ids) ? rule.params.scope.employee_ids : []);
    } else {
      setName(""); setDescription(""); setTriggerType("late_arrival");
      setToleranceMin(15); setRecCount(3); setRecWindow(7); setRecInfractionType("");
      setApplyInfractionType(""); setApplyWeight(1);
      setCreateWarning(false); setWarningTitle(""); setWarningTemplate(""); setNotifyManager(true);
      setScopePositionIds([]); setScopeEmployeeIds([]);
    }
  }, [open, rule]);

  async function save() {
    if (!name.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    const params: any = {};
    const actions: any = { notify_manager: notifyManager };

    if (triggerType === "late_arrival") {
      params.tolerance_min = Number(toleranceMin);
    }
    if (triggerType === "infraction_recurrence") {
      if (!recInfractionType) {
        toast({ title: "Escolha o tipo de infração monitorado", variant: "destructive" });
        return;
      }
      params.infraction_type_id = recInfractionType;
      params.count = Number(recCount);
      params.window_days = Number(recWindow);
    }

    if (triggerType !== "infraction_recurrence") {
      if (!applyInfractionType) {
        toast({ title: "Escolha o tipo de infração a aplicar", variant: "destructive" });
        return;
      }
      actions.apply_infraction = { infraction_type_id: applyInfractionType, weight: Number(applyWeight) };
    }
    if (createWarning || triggerType === "infraction_recurrence") {
      if (!warningTitle.trim() || !warningTemplate.trim()) {
        toast({ title: "Preencha título e texto da advertência", variant: "destructive" });
        return;
      }
      actions.create_warning = { title: warningTitle, template: warningTemplate };
    }

    // Escopo (cargo e/ou colaborador). Vazio = todos.
    if (scopePositionIds.length > 0 || scopeEmployeeIds.length > 0) {
      const positionNames = positions
        .filter((p) => scopePositionIds.includes(p.id))
        .map((p) => p.name);
      const employeeNames = employees
        .filter((e) => scopeEmployeeIds.includes(e.id))
        .map((e) => e.full_name);
      params.scope = {
        position_ids: scopePositionIds,
        position_names: positionNames,
        employee_ids: scopeEmployeeIds,
        employee_names: employeeNames,
      };
    }

    setSaving(true);
    try {
      const payload = {
        name, description: description || null, trigger_type: triggerType, params, actions,
      };
      const op = rule
        ? (supabase as any).from("automation_rules").update(payload).eq("id", rule.id)
        : (supabase as any).from("automation_rules").insert({ ...payload, is_active: true });
      const { error } = await op;
      if (error) throw error;
      toast({ title: rule ? "Regra atualizada" : "Regra criada" });
      onSaved();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? "Editar regra" : "Nova regra automática"}</DialogTitle>
          <DialogDescription>
            Configure quando o sistema deve aplicar infração, gerar advertência ou notificar o gestor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Atrasos > 15 min" />
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="space-y-2">
            <Label>Tipo de gatilho</Label>
            <Select value={triggerType} onValueChange={(v) => setTriggerType(v as TriggerType)} disabled={!!rule}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="late_arrival">Atraso na entrada</SelectItem>
                <SelectItem value="wrong_punch">Ponto errado/incompleto</SelectItem>
                <SelectItem value="unjustified_absence">Falta sem justificativa</SelectItem>
                <SelectItem value="infraction_recurrence">Recorrência → advertência</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {triggerType === "late_arrival" && (
            <div className="space-y-2">
              <Label>Tolerância (minutos)</Label>
              <Input type="number" min={0} value={toleranceMin} onChange={(e) => setToleranceMin(Number(e.target.value))} />
            </div>
          )}

          {triggerType === "infraction_recurrence" && (
            <>
              <div className="space-y-2">
                <Label>Infração monitorada</Label>
                <Select value={recInfractionType} onValueChange={setRecInfractionType}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {infractionTypes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Quantas ocorrências</Label>
                  <Input type="number" min={2} value={recCount} onChange={(e) => setRecCount(Number(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Em quantos dias</Label>
                  <Input type="number" min={1} value={recWindow} onChange={(e) => setRecWindow(Number(e.target.value))} />
                </div>
              </div>
            </>
          )}

          {triggerType !== "infraction_recurrence" && (
            <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
              <Label className="font-semibold">Aplicar infração</Label>
              <Select value={applyInfractionType} onValueChange={setApplyInfractionType}>
                <SelectTrigger><SelectValue placeholder="Tipo de infração..." /></SelectTrigger>
                <SelectContent>
                  {infractionTypes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="space-y-1">
                <Label className="text-xs">Peso aplicado</Label>
                <Input type="number" min={1} value={applyWeight} onChange={(e) => setApplyWeight(Number(e.target.value))} />
              </div>
            </div>
          )}

          {triggerType !== "infraction_recurrence" && (
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <Label className="font-semibold">Gerar advertência também</Label>
                <p className="text-xs text-muted-foreground">Cria advertência escrita ao detectar.</p>
              </div>
              <Switch checked={createWarning} onCheckedChange={setCreateWarning} />
            </div>
          )}

          {(createWarning || triggerType === "infraction_recurrence") && (
            <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
              <Label className="font-semibold">Texto da advertência</Label>
              <Input value={warningTitle} onChange={(e) => setWarningTitle(e.target.value)} placeholder="Título" />
              <Textarea
                value={warningTemplate}
                onChange={(e) => setWarningTemplate(e.target.value)}
                rows={5}
                placeholder="Use {{name}}, {{count}}, {{dates}} como variáveis..."
              />
              <p className="text-xs text-muted-foreground">
                Variáveis disponíveis: <code>{"{{name}}"}</code>, <code>{"{{count}}"}</code>, <code>{"{{dates}}"}</code>
              </p>
            </div>
          )}

          <ScopeSelector
            positions={positions}
            employees={employees}
            positionIds={scopePositionIds}
            employeeIds={scopeEmployeeIds}
            onChangePositions={setScopePositionIds}
            onChangeEmployees={setScopeEmployeeIds}
          />

          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <Label className="font-semibold">Notificar gestor</Label>
              <p className="text-xs text-muted-foreground">Envia notificação no sino quando a regra dispara.</p>
            </div>
            <Switch checked={notifyManager} onCheckedChange={setNotifyManager} />
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScopeSelector({
  positions,
  employees,
  positionIds,
  employeeIds,
  onChangePositions,
  onChangeEmployees,
}: {
  positions: { id: string; name: string }[];
  employees: { id: string; full_name: string; position: string | null }[];
  positionIds: string[];
  employeeIds: string[];
  onChangePositions: (ids: string[]) => void;
  onChangeEmployees: (ids: string[]) => void;
}) {
  const [openPos, setOpenPos] = useState(false);
  const [openEmp, setOpenEmp] = useState(false);
  const [searchPos, setSearchPos] = useState("");
  const [searchEmp, setSearchEmp] = useState("");

  const togglePos = (id: string) =>
    onChangePositions(positionIds.includes(id) ? positionIds.filter((x) => x !== id) : [...positionIds, id]);
  const toggleEmp = (id: string) =>
    onChangeEmployees(employeeIds.includes(id) ? employeeIds.filter((x) => x !== id) : [...employeeIds, id]);

  const filteredPositions = positions.filter((p) =>
    p.name.toLowerCase().includes(searchPos.trim().toLowerCase()),
  );
  const filteredEmployees = employees.filter((e) =>
    e.full_name.toLowerCase().includes(searchEmp.trim().toLowerCase()),
  );

  const scopeAll = positionIds.length === 0 && employeeIds.length === 0;

  return (
    <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
      <div>
        <Label className="font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" /> Aplicar a quem?
        </Label>
        <p className="text-xs text-muted-foreground">
          Selecione cargos e/ou colaboradores específicos. Se deixar vazio, vale para <strong>todos</strong>.
        </p>
      </div>

      {/* Cargos */}
      <div className="space-y-1.5">
        <Label className="text-xs">Cargos</Label>
        <Popover open={openPos} onOpenChange={setOpenPos}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-between font-normal h-auto min-h-10 py-2">
              <span className="truncate text-left flex flex-wrap gap-1">
                {positionIds.length === 0 ? (
                  <span className="text-muted-foreground">Todos os cargos</span>
                ) : (
                  positions
                    .filter((p) => positionIds.includes(p.id))
                    .map((p) => (
                      <Badge key={p.id} variant="secondary" className="gap-1">
                        {p.name}
                        <X
                          className="h-3 w-3 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePos(p.id);
                          }}
                        />
                      </Badge>
                    ))
                )}
              </span>
              <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0 w-[--radix-popover-trigger-width] max-w-[95vw]" align="start">
            <div className="p-2 border-b">
              <Input
                autoFocus
                placeholder="Buscar cargo..."
                value={searchPos}
                onChange={(e) => setSearchPos(e.target.value)}
                className="h-8"
              />
            </div>
            <div className="max-h-[260px] overflow-y-auto py-1">
              {filteredPositions.length === 0 ? (
                <p className="p-3 text-center text-sm text-muted-foreground">Nenhum cargo.</p>
              ) : (
                filteredPositions.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent cursor-pointer"
                  >
                    <Checkbox
                      checked={positionIds.includes(p.id)}
                      onCheckedChange={() => togglePos(p.id)}
                    />
                    <span>{p.name}</span>
                  </label>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Colaboradores */}
      <div className="space-y-1.5">
        <Label className="text-xs">Colaboradores específicos</Label>
        <Popover open={openEmp} onOpenChange={setOpenEmp}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-between font-normal h-auto min-h-10 py-2">
              <span className="truncate text-left flex flex-wrap gap-1">
                {employeeIds.length === 0 ? (
                  <span className="text-muted-foreground">Nenhum específico</span>
                ) : (
                  employees
                    .filter((e) => employeeIds.includes(e.id))
                    .map((e) => (
                      <Badge key={e.id} variant="secondary" className="gap-1">
                        {e.full_name}
                        <X
                          className="h-3 w-3 cursor-pointer"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            toggleEmp(e.id);
                          }}
                        />
                      </Badge>
                    ))
                )}
              </span>
              <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0 w-[--radix-popover-trigger-width] max-w-[95vw]" align="start">
            <div className="p-2 border-b">
              <Input
                autoFocus
                placeholder="Buscar colaborador..."
                value={searchEmp}
                onChange={(e) => setSearchEmp(e.target.value)}
                className="h-8"
              />
            </div>
            <div className="max-h-[260px] overflow-y-auto py-1">
              {filteredEmployees.length === 0 ? (
                <p className="p-3 text-center text-sm text-muted-foreground">Ninguém encontrado.</p>
              ) : (
                filteredEmployees.slice(0, 200).map((e) => (
                  <label
                    key={e.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent cursor-pointer"
                  >
                    <Checkbox
                      checked={employeeIds.includes(e.id)}
                      onCheckedChange={() => toggleEmp(e.id)}
                    />
                    <div className="min-w-0">
                      <div className="truncate">{e.full_name}</div>
                      {e.position && (
                        <div className="text-xs text-muted-foreground truncate">{e.position}</div>
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {scopeAll && (
        <p className="text-xs text-muted-foreground italic">
          Sem filtros: a regra será aplicada a todos os colaboradores ativos.
        </p>
      )}
    </div>
  );
}
