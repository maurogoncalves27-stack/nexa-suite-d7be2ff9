import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus, Send, FileText, Save, Pencil, Trash2, ShieldAlert, CheckCircle2, XCircle, Clock, User } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Template {
  id: string;
  title: string;
  content: string;
  is_active: boolean;
}

interface Warning {
  id: string;
  employee_id: string;
  title: string;
  content: string;
  status: "pending" | "signed" | "refused";
  issued_at: string;
  signed_at: string | null;
  signature_path: string | null;
  refused_at: string | null;
  refusal_reason: string | null;
}

interface Employee { id: string; full_name: string; }

const STATUS_LABEL: Record<string, string> = { pending: "Pendente", signed: "Assinada", refused: "Recusada" };
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline", signed: "default", refused: "destructive",
};
const STATUS_ICON: Record<string, any> = { pending: Clock, signed: CheckCircle2, refused: XCircle };

export default function WarningsPanel() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  // Issue dialog
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueEmployeeId, setIssueEmployeeId] = useState("");
  const [issueTitle, setIssueTitle] = useState("");
  const [issueContent, setIssueContent] = useState("");
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [issuing, setIssuing] = useState(false);

  // Template dialog
  const [tplOpen, setTplOpen] = useState(false);
  const [tplEditingId, setTplEditingId] = useState<string | null>(null);
  const [tplTitle, setTplTitle] = useState("");
  const [tplContent, setTplContent] = useState("");
  const [tplSaving, setTplSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: t }, { data: w }, { data: e }] = await Promise.all([
      supabase.from("warning_templates").select("*").order("created_at", { ascending: false }),
      supabase.from("employee_warnings").select("*").order("issued_at", { ascending: false }),
      supabase.from("employees").select("id, full_name").in("status", ["active", "in_training"]).order("full_name"),
    ]);
    setTemplates((t ?? []) as Template[]);
    setWarnings((w ?? []) as Warning[]);
    setEmployees((e ?? []) as Employee[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const resetIssue = () => {
    setIssueEmployeeId(""); setIssueTitle(""); setIssueContent("");
    setSaveAsTemplate(false); setSelectedTemplateId("");
  };

  const applyTemplate = (id: string) => {
    setSelectedTemplateId(id);
    const tpl = templates.find((x) => x.id === id);
    if (tpl) { setIssueTitle(tpl.title); setIssueContent(tpl.content); }
  };

  const issueWarning = async () => {
    if (!issueEmployeeId) return toast({ title: "Selecione o colaborador", variant: "destructive" });
    if (!issueTitle.trim() || !issueContent.trim())
      return toast({ title: "Preencha título e conteúdo", variant: "destructive" });

    setIssuing(true);
    const { error } = await supabase.from("employee_warnings").insert({
      employee_id: issueEmployeeId,
      title: issueTitle.trim(),
      content: issueContent.trim(),
      issued_by: user?.id ?? null,
    });
    if (error) { setIssuing(false); return toast({ title: "Erro", description: error.message, variant: "destructive" }); }

    if (saveAsTemplate) {
      await supabase.from("warning_templates").insert({
        title: issueTitle.trim(), content: issueContent.trim(), created_by: user?.id ?? null,
      });
    }

    setIssuing(false);
    toast({ title: "Advertência enviada ao colaborador" });
    setIssueOpen(false); resetIssue(); load();
  };

  const openTplNew = () => { setTplEditingId(null); setTplTitle(""); setTplContent(""); setTplOpen(true); };
  const openTplEdit = (t: Template) => { setTplEditingId(t.id); setTplTitle(t.title); setTplContent(t.content); setTplOpen(true); };

  const saveTpl = async () => {
    if (!tplTitle.trim() || !tplContent.trim())
      return toast({ title: "Preencha título e conteúdo", variant: "destructive" });
    setTplSaving(true);
    const payload = { title: tplTitle.trim(), content: tplContent.trim() };
    const { error } = tplEditingId
      ? await supabase.from("warning_templates").update(payload).eq("id", tplEditingId)
      : await supabase.from("warning_templates").insert({ ...payload, created_by: user?.id ?? null });
    setTplSaving(false);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: tplEditingId ? "Modelo atualizado" : "Modelo criado" });
    setTplOpen(false); load();
  };

  const removeTpl = async (id: string) => {
    if (!confirm("Excluir este modelo?")) return;
    const { error } = await supabase.from("warning_templates").delete().eq("id", id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    load();
  };

  const removeWarning = async (id: string) => {
    if (!confirm("Excluir esta advertência?")) return;
    const { error } = await supabase.from("employee_warnings").delete().eq("id", id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    load();
  };

  const empName = (id: string) => employees.find((e) => e.id === id)?.full_name ?? "Colaborador";

  return (
    <Tabs defaultValue="issued" className="space-y-4 w-full">
      <TabsList className="grid grid-cols-2 w-full sm:w-auto sm:inline-flex h-auto">
        <TabsTrigger value="issued" className="gap-1 text-xs sm:text-sm"><ShieldAlert className="h-3.5 w-3.5 sm:h-4 sm:w-4" /><span className="truncate">Advertências</span></TabsTrigger>
        <TabsTrigger value="templates" className="gap-1 text-xs sm:text-sm"><FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />Modelos</TabsTrigger>
      </TabsList>

      <TabsContent value="issued" className="space-y-4">
        <div className="flex justify-end">
          <Dialog open={issueOpen} onOpenChange={(o) => { setIssueOpen(o); if (!o) resetIssue(); }}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto"><Plus className="h-4 w-4 mr-2" />Nova advertência</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Emitir advertência</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Colaborador</Label>
                  <Select value={issueEmployeeId} onValueChange={setIssueEmployeeId}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {templates.length > 0 && (
                  <div>
                    <Label>Usar modelo (opcional)</Label>
                    <Select value={selectedTemplateId} onValueChange={applyTemplate}>
                      <SelectTrigger><SelectValue placeholder="Selecione um modelo..." /></SelectTrigger>
                      <SelectContent>
                        {templates.filter((t) => t.is_active).map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label>Título</Label>
                  <Input maxLength={200} value={issueTitle} onChange={(e) => setIssueTitle(e.target.value)} />
                </div>
                <div>
                  <Label>Conteúdo</Label>
                  <Textarea rows={8} maxLength={4000} value={issueContent} onChange={(e) => setIssueContent(e.target.value)} />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Switch checked={saveAsTemplate} onCheckedChange={setSaveAsTemplate} />
                  <Label className="cursor-pointer">Salvar este texto como modelo para reutilizar</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setIssueOpen(false)}>Cancelar</Button>
                <Button onClick={issueWarning} disabled={issuing}>
                  {issuing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Enviar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="overflow-hidden">
          <CardHeader className="pb-3 px-3 sm:px-6"><CardTitle className="text-base sm:text-lg">Advertências emitidas</CardTitle></CardHeader>
          <CardContent className="px-2 sm:px-6">
            {loading ? (
              <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : warnings.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma advertência emitida.</p>
            ) : (() => {
              const grouped = warnings.reduce<Record<string, Warning[]>>((acc, w) => {
                (acc[w.employee_id] ||= []).push(w);
                return acc;
              }, {});
              const entries = Object.entries(grouped).sort((a, b) =>
                empName(a[0]).localeCompare(empName(b[0]), "pt-BR"),
              );
              return (
                <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {entries.map(([empId, items]) => {
                    const counts = items.reduce(
                      (a, w) => ({ ...a, [w.status]: (a[w.status] ?? 0) + 1 }),
                      {} as Record<string, number>,
                    );
                    return (
                      <Card key={empId} className="border-2 hover:border-primary/40 transition-colors overflow-hidden">
                        <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <User className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                            </div>
                            <CardTitle className="text-sm sm:text-base truncate min-w-0">{empName(empId)}</CardTitle>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3 px-2.5 sm:px-6 pb-3 sm:pb-6">
                          <div className="grid grid-cols-3 gap-1 sm:gap-2">
                            <div className="rounded-lg border bg-muted/40 p-1 sm:p-2 text-center min-w-0">
                              <div className="text-base sm:text-2xl font-bold leading-tight">{items.length}</div>
                              <div className="text-[8px] sm:text-[10px] uppercase tracking-tight sm:tracking-wide text-muted-foreground truncate">Total</div>
                            </div>
                            <div className="rounded-lg border bg-muted/40 p-1 sm:p-2 text-center min-w-0">
                              <div className="text-base sm:text-2xl font-bold text-primary leading-tight">{counts.pending ?? 0}</div>
                              <div className="text-[8px] sm:text-[10px] uppercase tracking-tight sm:tracking-wide text-muted-foreground truncate">Pendente</div>
                            </div>
                            <div className="rounded-lg border bg-muted/40 p-1 sm:p-2 text-center min-w-0">
                              <div className="text-base sm:text-2xl font-bold text-destructive leading-tight">{counts.refused ?? 0}</div>
                              <div className="text-[8px] sm:text-[10px] uppercase tracking-tight sm:tracking-wide text-muted-foreground truncate">Recusada</div>
                            </div>
                          </div>

                          {counts.signed ? (
                            <div className="flex flex-wrap gap-1.5">
                              <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" />{counts.signed} assinada{counts.signed > 1 ? "s" : ""}</Badge>
                            </div>
                          ) : null}

                          <div className="space-y-2 pt-2 border-t">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Últimas advertências</p>
                            <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
                              {items.slice(0, 5).map((w) => {
                                const Icon = STATUS_ICON[w.status];
                                return (
                                  <li key={w.id} className="flex items-start gap-2 text-sm">
                                    <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="font-medium truncate">{w.title}</span>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeWarning(w.id)}>
                                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                        </Button>
                                      </div>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <Badge variant={STATUS_VARIANT[w.status]} className="text-[10px] py-0 h-4">{STATUS_LABEL[w.status]}</Badge>
                                        <span className="text-[10px] text-muted-foreground">{format(new Date(w.issued_at), "dd/MM/yyyy")}</span>
                                      </div>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                            {items.length > 5 && (
                              <p className="text-[11px] text-muted-foreground text-center">+ {items.length - 5} mais antigas</p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="templates" className="space-y-4">
        <div className="flex justify-end">
          <Dialog open={tplOpen} onOpenChange={setTplOpen}>
            <DialogTrigger asChild>
              <Button onClick={openTplNew} className="w-full sm:w-auto"><Plus className="h-4 w-4 mr-2" />Novo modelo</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{tplEditingId ? "Editar modelo" : "Novo modelo"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Título</Label><Input maxLength={200} value={tplTitle} onChange={(e) => setTplTitle(e.target.value)} /></div>
                <div><Label>Conteúdo</Label><Textarea rows={8} maxLength={4000} value={tplContent} onChange={(e) => setTplContent(e.target.value)} /></div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setTplOpen(false)}>Cancelar</Button>
                <Button onClick={saveTpl} disabled={tplSaving}>
                  {tplSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base sm:text-lg">Modelos salvos</CardTitle></CardHeader>
          <CardContent className="px-3 sm:px-6">
            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum modelo salvo ainda.</p>
            ) : (
              <ul className="divide-y">
                {templates.map((t) => (
                  <li key={t.id} className="py-3 flex items-start gap-2 sm:gap-3">
                    <FileText className="h-5 w-5 mt-0.5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm sm:text-base truncate">{t.title}</p>
                      <p className="text-xs sm:text-sm text-muted-foreground whitespace-pre-wrap mt-1 line-clamp-2 sm:line-clamp-3">{t.content}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => openTplEdit(t)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeTpl(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
