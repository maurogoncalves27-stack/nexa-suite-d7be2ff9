import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, Brain, CheckCircle2, Clock, Loader2, Plus, RefreshCw, Sparkles } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

type Row = {
  id: string;
  store_id: string | null;
  category: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  probability: "low" | "medium" | "high";
  source: string;
  action_plan: string | null;
  resolution_notes: string | null;
  responsible_employee_id: string | null;
  deadline: string | null;
  resolved_at: string | null;
  status: "open" | "in_progress" | "mitigated" | "accepted";
  auto_generated: boolean;
  created_at: string;
};

const CATEGORIES: { value: string; label: string }[] = [
  { value: "carga_de_trabalho", label: "Carga de trabalho / jornada" },
  { value: "assedio", label: "Assédio moral ou sexual" },
  { value: "relacionamento", label: "Relacionamento interpessoal / gestão" },
  { value: "reconhecimento", label: "Reconhecimento e recompensa" },
  { value: "autonomia", label: "Autonomia e controle" },
  { value: "violencia_externa", label: "Violência externa (clientes/entregas)" },
  { value: "saude_mental", label: "Sinais coletivos de saúde mental" },
  { value: "outros", label: "Outros" },
];

const SEVERITY_TONE: Record<Row["severity"], string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-warning/15 text-warning border-warning/40",
  high: "bg-destructive/15 text-destructive border-destructive/40",
  critical: "bg-destructive text-destructive-foreground",
};

const STATUS_TONE: Record<Row["status"], string> = {
  open: "bg-destructive/15 text-destructive border-destructive/40",
  in_progress: "bg-warning/15 text-warning border-warning/40",
  mitigated: "bg-success/15 text-success border-success/40",
  accepted: "bg-muted text-muted-foreground",
};

const STATUS_LABEL: Record<Row["status"], string> = {
  open: "Aberto",
  in_progress: "Em andamento",
  mitigated: "Mitigado",
  accepted: "Aceito",
};

export default function PsychosocialRisksPanel() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  const [filter, setFilter] = useState<"all" | "open" | "mitigated">("open");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: risks }, { data: st }, { data: managerRoles }] = await Promise.all([
      supabase.from("psychosocial_risks").select("*").order("created_at", { ascending: false }),
      supabase.from("stores").select("id, name").order("name"),
      supabase.from("user_roles").select("user_id").in("role", ["manager", "admin", "hr"]),
    ]);
    const managerUserIds = Array.from(new Set((managerRoles ?? []).map((r: any) => r.user_id).filter(Boolean)));
    let emp: { id: string; full_name: string }[] = [];
    if (managerUserIds.length) {
      const { data } = await supabase
        .from("employees")
        .select("id, full_name")
        .eq("status", "active")
        .in("user_id", managerUserIds)
        .order("full_name");
      emp = (data ?? []) as any;
    }
    setRows((risks ?? []) as Row[]);
    setStores((st ?? []) as any);
    setEmployees(emp);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "open") return rows.filter((r) => ["open", "in_progress"].includes(r.status));
    return rows.filter((r) => ["mitigated", "accepted"].includes(r.status));
  }, [rows, filter]);

  const openCount = rows.filter((r) => ["open", "in_progress"].includes(r.status)).length;
  const highCount = rows.filter((r) => ["open", "in_progress"].includes(r.status) && ["high", "critical"].includes(r.severity)).length;
  const autoCount = rows.filter((r) => r.auto_generated && r.status === "open").length;

  const save = async (payload: Partial<Row>) => {
    const clean: Partial<Row> = { ...payload };
    // Auto set/clear resolved_at based on status
    if (clean.status === "mitigated" && !clean.resolved_at) {
      clean.resolved_at = new Date().toISOString().slice(0, 10);
    }
    if (clean.status && !["mitigated", "accepted"].includes(clean.status)) {
      clean.resolved_at = null;
    }
    if (editing) {
      const { error } = await supabase.from("psychosocial_risks").update(clean).eq("id", editing.id);
      if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    } else {
      const { error } = await supabase.from("psychosocial_risks").insert({
        ...clean,
        created_by: user?.id,
      } as any);
      if (error) { toast({ title: "Erro ao criar", description: error.message, variant: "destructive" }); return; }
    }
    toast({ title: editing ? "Risco atualizado" : "Risco cadastrado" });
    setDialogOpen(false);
    setEditing(null);
    load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              Riscos Psicossociais (PGR / NR-1)
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={load}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" disabled={suggesting} onClick={async () => {
                setSuggesting(true);
                const { data, error } = await supabase.functions.invoke("suggest-psychosocial-risks");
                setSuggesting(false);
                if (error) { toast({ title: "Falha ao sugerir", description: error.message, variant: "destructive" }); return; }
                toast({ title: `${data?.inserted ?? 0} risco(s) sugerido(s) pela IA`, description: "Baseado em humor, atestados (CID F) e docs SST." });
                load();
              }}>
                {suggesting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                Sugerir com IA
              </Button>
              <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditing(null); }}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1" /> Novo risco
                  </Button>
                </DialogTrigger>
                <RiskDialog editing={editing} stores={stores} employees={employees} onSave={save} />
              </Dialog>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md border p-2">
              <div className="text-2xl font-bold">{openCount}</div>
              <div className="text-xs text-muted-foreground">Abertos / Em andamento</div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-2xl font-bold text-destructive">{highCount}</div>
              <div className="text-xs text-muted-foreground">Alta severidade</div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-2xl font-bold text-warning flex items-center justify-center gap-1">
                <Sparkles className="h-4 w-4" /> {autoCount}
              </div>
              <div className="text-xs text-muted-foreground">Sugeridos automaticamente</div>
            </div>
          </div>

          <div className="flex gap-2">
            {(["open", "mitigated", "all"] as const).map((k) => (
              <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} onClick={() => setFilter(k)}>
                {k === "open" ? "Abertos" : k === "mitigated" ? "Concluídos" : "Todos"}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
          {filter === "open" ? "Nenhum risco aberto. 🎉" : "Nenhum registro."}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <Card key={r.id} className="cursor-pointer hover:border-primary/50" onClick={() => { setEditing(r); setDialogOpen(true); }}>
              <CardContent className="p-3 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap gap-1 items-center">
                    <Badge variant="outline" className={SEVERITY_TONE[r.severity]}>
                      {r.severity === "critical" ? "Crítico" : r.severity === "high" ? "Alto" : r.severity === "medium" ? "Médio" : "Baixo"}
                    </Badge>
                    <Badge variant="outline" className={STATUS_TONE[r.status]}>
                      {STATUS_LABEL[r.status]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {CATEGORIES.find((c) => c.value === r.category)?.label ?? r.category}
                    </span>
                    {r.auto_generated && (
                      <Badge variant="outline" className="text-xs"><Sparkles className="h-3 w-3 mr-1" />Auto</Badge>
                    )}
                    {stores.find((s) => s.id === r.store_id) && (
                      <Badge variant="outline" className="text-xs">
                        {stores.find((s) => s.id === r.store_id)?.name}
                      </Badge>
                    )}
                  </div>
                  {r.deadline && (
                    <span className={`text-xs flex items-center gap-1 ${r.deadline < new Date().toISOString().slice(0, 10) ? "text-destructive" : "text-muted-foreground"}`}>
                      <Clock className="h-3 w-3" /> {format(parseISO(r.deadline), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                  )}
                </div>
                <p className="text-sm">{r.description}</p>
                {r.action_plan && (
                  <p className="text-xs text-muted-foreground border-l-2 border-primary/40 pl-2">
                    <CheckCircle2 className="h-3 w-3 inline mr-1" />
                    <strong>Plano:</strong> {r.action_plan}
                  </p>
                )}
                {r.resolution_notes && (
                  <p className="text-xs text-muted-foreground border-l-2 border-success/40 pl-2">
                    <CheckCircle2 className="h-3 w-3 inline mr-1 text-success" />
                    <strong>O que foi feito:</strong> {r.resolution_notes}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function RiskDialog({
  editing, stores, employees, onSave,
}: {
  editing: Row | null;
  stores: { id: string; name: string }[];
  employees: { id: string; full_name: string }[];
  onSave: (payload: Partial<Row>) => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<Row>>(() => editing ?? {
    category: "carga_de_trabalho",
    severity: "medium",
    probability: "medium",
    status: "open",
    source: "manual",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(editing ?? {
      category: "carga_de_trabalho",
      severity: "medium",
      probability: "medium",
      status: "open",
      source: "manual",
    });
  }, [editing]);

  const submit = async () => {
    if (!form.description?.trim()) {
      toast({ title: "Descrição obrigatória", variant: "destructive" });
      return;
    }
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{editing ? "Editar risco psicossocial" : "Novo risco psicossocial"}</DialogTitle>
      </DialogHeader>

      <div className="grid gap-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Categoria</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Loja / Unidade</Label>
            <Select value={form.store_id ?? "__all__"} onValueChange={(v) => setForm({ ...form, store_id: v === "__all__" ? null : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas / Empresa</SelectItem>
                {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>Descrição do risco</Label>
          <Textarea
            value={form.description ?? ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            placeholder="Ex.: Escala de 12x36 aos fins de semana está gerando exaustão relatada em pesquisa de clima."
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Severidade</Label>
            <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Baixa</SelectItem>
                <SelectItem value="medium">Média</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="critical">Crítica</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Probabilidade</Label>
            <Select value={form.probability} onValueChange={(v) => setForm({ ...form, probability: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Baixa</SelectItem>
                <SelectItem value="medium">Média</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Aberto</SelectItem>
                <SelectItem value="in_progress">Em andamento</SelectItem>
                <SelectItem value="mitigated">Mitigado</SelectItem>
                <SelectItem value="accepted">Aceito (risco residual)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>Plano de ação</Label>
          <Textarea
            value={form.action_plan ?? ""}
            onChange={(e) => setForm({ ...form, action_plan: e.target.value })}
            rows={3}
            placeholder="Ações concretas, prazos, quem faz."
          />
        </div>

        <div>
          <Label>O que a empresa fez para sanar</Label>
          <Textarea
            value={form.resolution_notes ?? ""}
            onChange={(e) => setForm({ ...form, resolution_notes: e.target.value })}
            rows={3}
            placeholder="Descreva as ações executadas, treinamentos realizados, mudanças implantadas, etc."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Responsável</Label>
            <Select value={form.responsible_employee_id ?? "__none__"} onValueChange={(v) => setForm({ ...form, responsible_employee_id: v === "__none__" ? null : v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Prazo</Label>
            <Input
              type="date"
              value={form.deadline ?? ""}
              onChange={(e) => setForm({ ...form, deadline: e.target.value || null })}
            />
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button onClick={submit} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {editing ? "Salvar alterações" : "Cadastrar risco"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
