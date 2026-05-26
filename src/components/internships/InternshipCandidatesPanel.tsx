import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, ArrowRight, CheckCircle2, XCircle, Calendar, ClipboardCheck, UserPlus, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { addDays, format } from "date-fns";

interface Opening { id: string; title: string; store_id: string | null }
interface Store { id: string; name: string }
interface Candidate {
  id: string;
  internship_opening_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  institution: string | null;
  course: string | null;
  stage: string;
  interview_date: string | null;
  interview_notes: string | null;
  trial_start_date: string | null;
  trial_end_date: string | null;
  trial_notes: string | null;
  evaluation_score: number | null;
  evaluation_notes: string | null;
  evaluation_decision: string | null;
  hired_employee_id: string | null;
  notes: string | null;
}

const STAGES = [
  { key: "applied", label: "Inscritos", color: "bg-slate-500" },
  { key: "interview", label: "Entrevista", color: "bg-blue-500" },
  { key: "trial", label: "Em teste (3d)", color: "bg-amber-500" },
  { key: "evaluation", label: "Avaliação", color: "bg-purple-500" },
  { key: "hired", label: "Contratados", color: "bg-emerald-600" },
  { key: "rejected", label: "Reprovados", color: "bg-rose-500" },
] as const;

interface Props { onCandidateHired?: () => void }

export default function InternshipCandidatesPanel({ onCandidateHired }: Props) {
  const [loading, setLoading] = useState(true);
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  const [newDialog, setNewDialog] = useState(false);
  const [newForm, setNewForm] = useState({ full_name: "", email: "", phone: "", institution: "", course: "", internship_opening_id: "" });

  const [evalDialog, setEvalDialog] = useState<Candidate | null>(null);
  const [evalForm, setEvalForm] = useState({ evaluation_score: "", evaluation_notes: "", evaluation_decision: "approved" });

  const load = async () => {
    setLoading(true);
    const [{ data: op }, { data: st }, { data: cd }] = await Promise.all([
      supabase.from("internship_openings" as any).select("id, title, store_id").eq("status", "open").order("title"),
      supabase.from("stores").select("id, name").eq("is_active", true).eq("is_virtual", false).order("name"),
      supabase.from("internship_candidates" as any).select("*").order("created_at", { ascending: false }),
    ]);
    setOpenings(((op as any) ?? []) as Opening[]);
    setStores((st ?? []) as Store[]);
    setCandidates(((cd as any) ?? []) as Candidate[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const createCandidate = async () => {
    if (!newForm.full_name.trim()) return toast({ title: "Informe o nome", variant: "destructive" });
    const { error } = await supabase.from("internship_candidates" as any).insert({
      full_name: newForm.full_name.trim(),
      email: newForm.email || null,
      phone: newForm.phone || null,
      institution: newForm.institution || null,
      course: newForm.course || null,
      internship_opening_id: newForm.internship_opening_id || null,
      stage: "applied",
    });
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Candidato cadastrado" });
    setNewDialog(false);
    setNewForm({ full_name: "", email: "", phone: "", institution: "", course: "", internship_opening_id: "" });
    load();
  };

  const advance = async (c: Candidate) => {
    const next: Record<string, string> = { applied: "interview", interview: "trial", trial: "evaluation" };
    const target = next[c.stage];
    if (!target) return;
    const patch: any = { stage: target };
    if (target === "interview" && !c.interview_date) patch.interview_date = format(new Date(), "yyyy-MM-dd");
    if (target === "trial") {
      patch.trial_start_date = format(new Date(), "yyyy-MM-dd");
      patch.trial_end_date = format(addDays(new Date(), 2), "yyyy-MM-dd");
    }
    if (target === "evaluation") {
      // se já passou do fim, ok; senão mantém
    }
    const { error } = await supabase.from("internship_candidates" as any).update(patch).eq("id", c.id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: `Movido para: ${STAGES.find((s) => s.key === target)?.label}` });
    load();
  };

  const reject = async (c: Candidate) => {
    if (!confirm(`Reprovar ${c.full_name}?`)) return;
    const { error } = await supabase.from("internship_candidates" as any).update({ stage: "rejected", evaluation_decision: "rejected" }).eq("id", c.id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Candidato reprovado" });
    load();
  };

  const remove = async (c: Candidate) => {
    if (!confirm(`Excluir candidato ${c.full_name}?`)) return;
    const { error } = await supabase.from("internship_candidates" as any).delete().eq("id", c.id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Removido" });
    load();
  };

  const openEval = (c: Candidate) => {
    setEvalForm({
      evaluation_score: c.evaluation_score?.toString() ?? "",
      evaluation_notes: c.evaluation_notes ?? "",
      evaluation_decision: c.evaluation_decision ?? "approved",
    });
    setEvalDialog(c);
  };

  const saveEval = async () => {
    if (!evalDialog) return;
    const score = Number(evalForm.evaluation_score);
    if (Number.isNaN(score) || score < 0 || score > 10) return toast({ title: "Nota deve ser entre 0 e 10", variant: "destructive" });
    const decision = evalForm.evaluation_decision;
    const newStage = decision === "approved" ? "hired" : "rejected";
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase.from("internship_candidates" as any).update({
      stage: newStage,
      evaluation_score: score,
      evaluation_notes: evalForm.evaluation_notes || null,
      evaluation_decision: decision,
      evaluated_at: new Date().toISOString(),
      evaluated_by: userRes.user?.id ?? null,
    }).eq("id", evalDialog.id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: decision === "approved" ? "Aprovado" : "Reprovado" });
    setEvalDialog(null);
    load();
    if (decision === "approved") onCandidateHired?.();
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  const grouped = STAGES.reduce<Record<string, Candidate[]>>((acc, s) => {
    acc[s.key] = candidates.filter((c) => c.stage === s.key);
    return acc;
  }, {});

  const openingLabel = (id: string | null) => {
    if (!id) return "Sem vaga";
    const o = openings.find((x) => x.id === id);
    if (!o) return "Vaga removida";
    const s = stores.find((x) => x.id === o.store_id);
    return s ? `${o.title} · ${s.name}` : o.title;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm text-muted-foreground">Fluxo: Inscrito → Entrevista → 3 dias de teste → Avaliação → Contratado/Reprovado</div>
        <Button size="sm" onClick={() => setNewDialog(true)}><Plus className="h-4 w-4 mr-1" />Novo candidato</Button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {STAGES.map((s) => (
          <Card key={s.key}>
            <CardContent className="p-2 sm:p-3">
              <div className="text-[10px] sm:text-xs text-muted-foreground truncate">{s.label}</div>
              <div className="text-lg sm:text-2xl font-bold">{grouped[s.key].length}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Colunas por fase */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {STAGES.map((s) => (
          <div key={s.key} className="border rounded-lg bg-card p-3 space-y-2 min-h-[120px]">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${s.color}`} />
              <div className="font-semibold text-sm">{s.label}</div>
              <Badge variant="secondary" className="ml-auto">{grouped[s.key].length}</Badge>
            </div>
            {grouped[s.key].length === 0 ? (
              <div className="text-xs text-muted-foreground italic py-2">Vazio</div>
            ) : grouped[s.key].map((c) => (
              <div key={c.id} className="border rounded-md p-2 bg-muted/30 space-y-2">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{c.full_name}</div>
                  <div className="text-xs text-muted-foreground truncate">{openingLabel(c.internship_opening_id)}</div>
                  {(c.email || c.phone) && (
                    <div className="text-[11px] text-muted-foreground truncate">{c.email || ""}{c.email && c.phone ? " · " : ""}{c.phone || ""}</div>
                  )}
                </div>
                {c.stage === "trial" && c.trial_start_date && c.trial_end_date && (
                  <div className="text-[11px] flex items-center gap-1 text-amber-700"><Calendar className="h-3 w-3" />{format(new Date(c.trial_start_date), "dd/MM")} → {format(new Date(c.trial_end_date), "dd/MM")}</div>
                )}
                {c.stage === "hired" && c.evaluation_score != null && (
                  <div className="text-[11px] text-emerald-700">Nota: {c.evaluation_score}/10</div>
                )}
                {c.stage === "rejected" && c.evaluation_score != null && (
                  <div className="text-[11px] text-rose-700">Nota: {c.evaluation_score}/10</div>
                )}
                <div className="flex flex-wrap gap-1">
                  {c.stage === "applied" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => advance(c)}><ArrowRight className="h-3 w-3 mr-1" />Entrevista</Button>
                  )}
                  {c.stage === "interview" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => advance(c)}><ArrowRight className="h-3 w-3 mr-1" />Iniciar teste</Button>
                  )}
                  {c.stage === "trial" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => advance(c)}><ClipboardCheck className="h-3 w-3 mr-1" />Avaliar</Button>
                  )}
                  {c.stage === "evaluation" && (
                    <Button size="sm" className="h-7 text-xs" onClick={() => openEval(c)}><CheckCircle2 className="h-3 w-3 mr-1" />Lançar nota</Button>
                  )}
                  {c.stage !== "hired" && c.stage !== "rejected" && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-rose-600" onClick={() => reject(c)}><XCircle className="h-3 w-3 mr-1" />Reprovar</Button>
                  )}
                  {c.stage === "hired" && !c.hired_employee_id && (
                    <div className="text-[11px] text-muted-foreground">Cadastre como colaborador e crie o estágio na aba "Estagiários ativos".</div>
                  )}
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive ml-auto" onClick={() => remove(c)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Novo candidato */}
      <Dialog open={newDialog} onOpenChange={setNewDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Novo candidato a estágio</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={newForm.full_name} onChange={(e) => setNewForm({ ...newForm, full_name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>E-mail</Label><Input type="email" value={newForm.email} onChange={(e) => setNewForm({ ...newForm, email: e.target.value })} /></div>
              <div><Label>Telefone</Label><Input value={newForm.phone} onChange={(e) => setNewForm({ ...newForm, phone: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Instituição</Label><Input value={newForm.institution} onChange={(e) => setNewForm({ ...newForm, institution: e.target.value })} /></div>
              <div><Label>Curso</Label><Input value={newForm.course} onChange={(e) => setNewForm({ ...newForm, course: e.target.value })} /></div>
            </div>
            <div>
              <Label>Vaga</Label>
              <Select value={newForm.internship_opening_id || "none"} onValueChange={(v) => setNewForm({ ...newForm, internship_opening_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Nenhuma —</SelectItem>
                  {openings.map((o) => <SelectItem key={o.id} value={o.id}>{openingLabel(o.id)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button onClick={createCandidate}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Avaliação final */}
      <Dialog open={!!evalDialog} onOpenChange={(o) => !o && setEvalDialog(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Avaliação final · {evalDialog?.full_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              {evalDialog?.trial_start_date && evalDialog?.trial_end_date
                ? `Período de teste: ${format(new Date(evalDialog.trial_start_date), "dd/MM/yyyy")} → ${format(new Date(evalDialog.trial_end_date), "dd/MM/yyyy")}`
                : "Sem período de teste registrado"}
            </div>
            <div>
              <Label>Nota (0 a 10)</Label>
              <Input type="number" min={0} max={10} step="0.5" value={evalForm.evaluation_score} onChange={(e) => setEvalForm({ ...evalForm, evaluation_score: e.target.value })} />
            </div>
            <div>
              <Label>Parecer</Label>
              <Textarea rows={4} value={evalForm.evaluation_notes} onChange={(e) => setEvalForm({ ...evalForm, evaluation_notes: e.target.value })} placeholder="Comportamento, aprendizado, pontualidade..." />
            </div>
            <div>
              <Label>Decisão</Label>
              <Select value={evalForm.evaluation_decision} onValueChange={(v) => setEvalForm({ ...evalForm, evaluation_decision: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Aprovar (contratar)</SelectItem>
                  <SelectItem value="rejected">Reprovar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {evalForm.evaluation_decision === "approved" && (
              <div className="text-xs bg-emerald-50 text-emerald-900 border border-emerald-200 rounded p-2 flex items-start gap-2">
                <UserPlus className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Após aprovar, cadastre o colaborador (Funcionários) e crie o estágio na aba "Estagiários ativos" vinculando à vaga.</span>
              </div>
            )}
          </div>
          <DialogFooter><Button onClick={saveEval}>Salvar avaliação</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
