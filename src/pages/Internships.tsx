import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Loader2, Plus, AlertTriangle, DollarSign, Building2, Briefcase, Users, CheckCircle2, CircleDashed, Pencil, Trash2, UserSearch } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "@/hooks/use-toast";
import { differenceInDays, format } from "date-fns";
import InternshipPaymentsPanel from "@/components/internships/InternshipPaymentsPanel";
import InternshipContractCard from "@/components/auth/InternshipContractCard";
import InternshipCandidatesPanel from "@/components/internships/InternshipCandidatesPanel";
import { upsertInternshipOpening, closeLinkedJobOpening } from "@/lib/internshipOpenings";

interface Employee { id: string; full_name: string }
interface Internship {
  id: string; employee_id: string;
  institution: string | null; course: string | null; supervisor_name: string | null;
  start_date: string; end_date: string; status: string; notes: string | null;
  outsourced_company_id: string | null;
  store_id: string | null;
  internship_opening_id: string | null;
  contract_external: boolean | null;
}
interface OutsourcedCompany { id: string; trade_name: string | null; legal_name: string | null }
interface Store { id: string; name: string }
interface InternshipOpening { id: string; title: string; store_id: string | null; positions_count: number; status: string; notes: string | null; job_opening_id: string | null }

export default function Internships() {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [internships, setInternships] = useState<Internship[]>([]);
  const [outsourcedCompanies, setOutsourcedCompanies] = useState<OutsourcedCompany[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [openings, setOpenings] = useState<InternshipOpening[]>([]);
  const [contractEmployeeIds, setContractEmployeeIds] = useState<Set<string>>(new Set());
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab = tabParam === "candidates" ? tabParam : "active";
  const [tab, setTab] = useState(initialTab);
  useEffect(() => { const t = searchParams.get("tab"); if (t && t !== tab) setTab(t); }, [searchParams]);

  const [intDialog, setIntDialog] = useState(false);
  const [intForm, setIntForm] = useState({ employee_id: "", internship_opening_id: "", institution: "", course: "", supervisor_name: "", start_date: "", end_date: "", stipend_amount: "", outsourced_company_id: "", store_id: "" });

  const [openingDialog, setOpeningDialog] = useState(false);
  const [editingOpening, setEditingOpening] = useState<InternshipOpening | null>(null);
  const [openingForm, setOpeningForm] = useState({ title: "", store_id: "", positions_count: 1, status: "open" });

  const load = async () => {
    setLoading(true);
    const [{ data: em }, { data: it }, { data: oc }, { data: ic }, { data: st }, { data: op }] = await Promise.all([
      supabase.from("employees").select("id, full_name").eq("status", "active").order("full_name"),
      supabase.from("internships").select("*").order("start_date", { ascending: false }),
      supabase.from("outsourced_companies").select("id, trade_name, legal_name").eq("status", "active").order("trade_name"),
      supabase.from("internship_contracts" as any).select("employee_id"),
      supabase.from("stores").select("id, name").eq("is_active", true).eq("is_virtual", false).order("name"),
      supabase.from("internship_openings" as any).select("*").order("title"),
    ]);
    setEmployees(em ?? []);
    setInternships((it ?? []) as unknown as Internship[]);
    setOutsourcedCompanies((oc ?? []) as OutsourcedCompany[]);
    setContractEmployeeIds(new Set(((ic as any[]) ?? []).map((r) => r.employee_id)));
    setStores((st ?? []) as Store[]);
    setOpenings(((op as any) ?? []) as InternshipOpening[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const createInternship = async () => {
    if (!intForm.employee_id || !intForm.start_date || !intForm.end_date) {
      return toast({ title: "Preencha colaborador, início e fim", variant: "destructive" });
    }
    const { error } = await supabase.from("internships").insert({
      employee_id: intForm.employee_id,
      institution: intForm.institution || null,
      course: intForm.course || null,
      supervisor_name: intForm.supervisor_name || null,
      start_date: intForm.start_date,
      end_date: intForm.end_date,
      stipend_amount: Number(intForm.stipend_amount) || 0,
      outsourced_company_id: intForm.outsourced_company_id || null,
      store_id: intForm.store_id || null,
      internship_opening_id: intForm.internship_opening_id || null,
      status: "active",
    } as any);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Estágio cadastrado" });
    setIntDialog(false);
    setIntForm({ employee_id: "", internship_opening_id: "", institution: "", course: "", supervisor_name: "", start_date: "", end_date: "", stipend_amount: "", outsourced_company_id: "", store_id: "" });
    load();
  };

  const openOpeningDialog = (op?: InternshipOpening) => {
    if (op) {
      setEditingOpening(op);
      setOpeningForm({ title: op.title, store_id: op.store_id ?? "", positions_count: op.positions_count, status: op.status });
    } else {
      setEditingOpening(null);
      setOpeningForm({ title: "", store_id: "", positions_count: 1, status: "open" });
    }
    setOpeningDialog(true);
  };

  const saveOpening = async () => {
    if (!openingForm.title.trim()) return toast({ title: "Informe o título da vaga", variant: "destructive" });
    try {
      await upsertInternshipOpening({
        id: editingOpening?.id,
        title: openingForm.title.trim(),
        store_id: openingForm.store_id || null,
        positions_count: Math.max(1, Number(openingForm.positions_count) || 1),
        status: openingForm.status,
        job_opening_id: editingOpening?.job_opening_id ?? null,
      });
      toast({ title: editingOpening ? "Vaga atualizada (sincronizada com recrutamento)" : "Vaga criada e publicada no recrutamento" });
      setOpeningDialog(false);
      load();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const deleteOpening = async (op: InternshipOpening) => {
    const filled = internships.filter((i) => i.internship_opening_id === op.id && i.status === "active").length;
    if (filled > 0) return toast({ title: "Não é possível excluir", description: "Há estagiários ativos nesta vaga.", variant: "destructive" });
    if (!confirm(`Excluir a vaga "${op.title}"? A vaga pública também será encerrada.`)) return;
    const { error } = await supabase.from("internship_openings" as any).delete().eq("id", op.id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    await closeLinkedJobOpening(op.job_opening_id);
    toast({ title: "Vaga removida e divulgação encerrada" });
    load();
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <GraduationCap className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl md:text-xl font-bold flex items-center gap-2">Estágio / Trainee</h1>
          <p className="text-muted-foreground">Vagas de estágio, vigência e pagamentos</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v); setSearchParams(v === "active" ? {} : { tab: v }); }} className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="active">Estagiários ativos</TabsTrigger>
          <TabsTrigger value="candidates"><UserSearch className="h-3.5 w-3.5 mr-1" />Candidatos</TabsTrigger>
        </TabsList>

        <TabsContent value="candidates" className="space-y-4">
          <InternshipCandidatesPanel onCandidateHired={load} />
        </TabsContent>

        <TabsContent value="active" className="space-y-4">
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => openOpeningDialog()}><Plus className="h-4 w-4 mr-1" />Nova vaga estágio</Button>
            <Dialog open={intDialog} onOpenChange={setIntDialog}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Novo estágio</Button></DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Cadastrar estágio</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Colaborador</Label>
                    <Select value={intForm.employee_id} onValueChange={(v) => setIntForm({ ...intForm, employee_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Vaga de estágio</Label>
                    <Select value={intForm.internship_opening_id || "none"} onValueChange={(v) => {
                      const id = v === "none" ? "" : v;
                      const op = openings.find((o) => o.id === id);
                      setIntForm({ ...intForm, internship_opening_id: id, store_id: op?.store_id || intForm.store_id });
                    }}>
                      <SelectTrigger><SelectValue placeholder="Selecione a vaga" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Nenhuma —</SelectItem>
                        {openings.filter((o) => o.status === "open").map((o) => {
                          const s = stores.find((x) => x.id === o.store_id);
                          return <SelectItem key={o.id} value={o.id}>{o.title}{s ? ` · ${s.name}` : ""}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>Instituição de ensino</Label><Input value={intForm.institution} onChange={(e) => setIntForm({ ...intForm, institution: e.target.value })} /></div>
                    <div><Label>Curso</Label><Input value={intForm.course} onChange={(e) => setIntForm({ ...intForm, course: e.target.value })} /></div>
                  </div>
                  <div>
                    <Label>Agente integrador</Label>
                    <Select value={intForm.outsourced_company_id || "none"} onValueChange={(v) => setIntForm({ ...intForm, outsourced_company_id: v === "none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Nenhuma —</SelectItem>
                        {outsourcedCompanies.map((c) => <SelectItem key={c.id} value={c.id}>{c.trade_name || c.legal_name || "—"}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Loja onde o estagiário está alocado</Label>
                    <Select value={intForm.store_id || "none"} onValueChange={(v) => setIntForm({ ...intForm, store_id: v === "none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Nenhuma —</SelectItem>
                        {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                   <div className="grid grid-cols-2 gap-2">
                     <div><Label>Início</Label><Input type="date" value={intForm.start_date} onChange={(e) => {
                       const sd = e.target.value;
                       let ed = "";
                       if (sd) {
                         const d = new Date(sd + "T00:00:00");
                         d.setFullYear(d.getFullYear() + 1);
                         ed = d.toISOString().slice(0, 10);
                       }
                       setIntForm({ ...intForm, start_date: sd, end_date: ed });
                     }} /></div>
                     <div><Label>Fim (auto: +1 ano)</Label><Input type="date" value={intForm.end_date} readOnly disabled /></div>
                   </div>
                </div>
                <DialogFooter><Button onClick={createInternship}>Salvar</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Dialog de vaga */}
          <Dialog open={openingDialog} onOpenChange={setOpeningDialog}>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingOpening ? "Editar vaga" : "Nova vaga de estágio"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Título</Label><Input value={openingForm.title} onChange={(e) => setOpeningForm({ ...openingForm, title: e.target.value })} placeholder="Ex: Estágio Auxiliar de Cozinha" /></div>
                <div>
                  <Label>Loja / Setor</Label>
                  <Select value={openingForm.store_id || "none"} onValueChange={(v) => setOpeningForm({ ...openingForm, store_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Sem loja —</SelectItem>
                      {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Nº de posições</Label><Input type="number" min={1} value={openingForm.positions_count} onChange={(e) => setOpeningForm({ ...openingForm, positions_count: Number(e.target.value) })} /></div>
                  <div>
                    <Label>Status</Label>
                    <Select value={openingForm.status} onValueChange={(v) => setOpeningForm({ ...openingForm, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Aberta</SelectItem>
                        <SelectItem value="closed">Fechada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter><Button onClick={saveOpening}>Salvar</Button></DialogFooter>
            </DialogContent>
          </Dialog>

          {(() => {
            const validInternships = internships.filter((i) => employees.some((e) => e.id === i.employee_id));
            const activeInternships = validInternships.filter((i) => i.status === "active");
            const groupsMap = new Map<string, Internship[]>();
            for (const i of validInternships) {
              const key = i.internship_opening_id || "__none__";
              if (!groupsMap.has(key)) groupsMap.set(key, []);
              groupsMap.get(key)!.push(i);
            }
            for (const o of openings.filter((o) => o.status === "open")) {
              if (!groupsMap.has(o.id)) groupsMap.set(o.id, []);
            }

            const totalSlots = openings
              .filter((o) => o.status === "open")
              .reduce((sum, o) => sum + (o.positions_count || 1), 0);
            const filledSlots = openings
              .filter((o) => o.status === "open")
              .reduce((sum, o) => {
                const filled = activeInternships.filter((i) => i.internship_opening_id === o.id).length;
                return sum + Math.min(filled, o.positions_count || 1);
              }, 0);
            const openSlots = Math.max(0, totalSlots - filledSlots);

            return (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  <Card><CardContent className="p-3 sm:p-4">
                    <div className="text-xs text-muted-foreground flex items-center gap-1"><Briefcase className="h-3 w-3" />Vagas abertas</div>
                    <div className="text-2xl font-bold">{openings.filter((o) => o.status === "open").length}</div>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 sm:p-4">
                    <div className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" />Total de posições</div>
                    <div className="text-2xl font-bold">{totalSlots}</div>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 sm:p-4">
                    <div className="text-xs text-muted-foreground flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3 w-3" />Preenchidas</div>
                    <div className="text-2xl font-bold text-emerald-700">{filledSlots}</div>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 sm:p-4">
                    <div className="text-xs text-muted-foreground flex items-center gap-1 text-amber-700"><CircleDashed className="h-3 w-3" />Em aberto</div>
                    <div className="text-2xl font-bold text-amber-700">{openSlots}</div>
                  </CardContent></Card>
                </div>

                {groupsMap.size === 0 ? (
                  <Card><CardContent className="p-6 text-center text-muted-foreground text-sm">Nenhuma vaga ou estagiário cadastrado.</CardContent></Card>
                ) : (
                  <Accordion type="multiple" defaultValue={Array.from(groupsMap.keys())} className="space-y-3">
                    {Array.from(groupsMap.entries()).map(([key, items]) => {
                      const op = key === "__none__" ? null : openings.find((o) => o.id === key);
                      const opStore = op ? stores.find((s) => s.id === op.store_id) : null;
                      const slots = op?.positions_count || (key === "__none__" ? items.length : 1);
                      const filled = items.filter((i) => i.status === "active").length;
                      const remaining = Math.max(0, slots - filled);
                      const pct = slots > 0 ? Math.min(100, (filled / slots) * 100) : 0;
                      const isOpen = key !== "__none__" && remaining > 0 && (op?.status === "open");
                      const isFull = key !== "__none__" && remaining === 0 && slots > 0;
                      return (
                        <AccordionItem key={key} value={key} className="border rounded-lg bg-card px-3 sm:px-4">
                          <AccordionTrigger className="hover:no-underline py-3">
                            <div className="flex flex-1 flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-left pr-2">
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-sm sm:text-base truncate flex items-center gap-2">
                                  <Briefcase className="h-4 w-4 text-primary shrink-0" />
                                  {key === "__none__" ? "Sem vaga vinculada" : (op?.title ?? "Vaga removida")}
                                </div>
                                <div className="text-xs text-muted-foreground truncate mt-0.5">
                                  {opStore?.name ?? (key === "__none__" ? "Estágios sem vaga" : "Sem loja")}
                                </div>
                                {key !== "__none__" && (
                                  <div className="mt-2 flex items-center gap-2">
                                    <Progress value={pct} className="h-1.5 flex-1 max-w-[200px]" />
                                    <span className="text-xs font-medium tabular-nums">{filled}/{slots}</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-wrap shrink-0">
                                {isFull && <Badge className="bg-emerald-600 hover:bg-emerald-600">Completa</Badge>}
                                {isOpen && <Badge variant="outline" className="border-amber-500 text-amber-700">{remaining} em aberto</Badge>}
                                {key === "__none__" && <Badge variant="secondary">{items.length} sem vaga</Badge>}
                                {op && (
                                  <>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openOpeningDialog(op); }}><Pencil className="h-3.5 w-3.5" /></Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); deleteOpening(op); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                                  </>
                                )}
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pt-2 pb-4 space-y-2">
                            {items.length === 0 ? (
                              <div className="text-sm text-muted-foreground italic py-2">Nenhum estagiário alocado nesta vaga ainda.</div>
                            ) : (
                              items.map((i) => {
                                const emp = employees.find((e) => e.id === i.employee_id);
                                const today = new Date();
                                const totalDays = Math.max(1, differenceInDays(new Date(i.end_date), new Date(i.start_date)));
                                const remainingDays = differenceInDays(new Date(i.end_date), today);
                                const elapsedDays = Math.max(0, Math.min(totalDays, totalDays - remainingDays));
                                const expiringSoon = remainingDays <= 30 && remainingDays >= 0;
                                const expired = remainingDays < 0;
                                const company = outsourcedCompanies.find((c) => c.id === i.outsourced_company_id);
                                const store = stores.find((s) => s.id === i.store_id);
                                const hasUploaded = contractEmployeeIds.has(i.employee_id);
                                const hasContract = hasUploaded || !!i.contract_external;
                                const toggleExternal = async () => {
                                  const next = !i.contract_external;
                                  const { error } = await supabase.from("internships").update({ contract_external: next } as any).eq("id", i.id);
                                  if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
                                  toast({ title: next ? "Marcado como contrato em pasta" : "Marcação removida" });
                                  load();
                                };
                                return (
                                  <div key={i.id} className="border rounded-md p-3 bg-muted/30 space-y-3">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                      <div className="min-w-0">
                                        <div className="font-medium text-sm truncate">{emp?.full_name ?? "—"}</div>
                                        <div className="text-xs text-muted-foreground truncate">
                                          {store?.name ?? "Sem loja"} · {i.institution ?? "—"} · {i.course ?? "—"}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <Badge variant={i.status === "active" ? "default" : "outline"}>{i.status}</Badge>
                                        <Badge
                                          variant={hasContract ? "default" : "destructive"}
                                          className={`cursor-pointer ${hasContract ? "bg-emerald-600 hover:bg-emerald-600" : ""}`}
                                          onClick={() => { if (!hasUploaded) toggleExternal(); }}
                                          title={hasUploaded ? "Contrato anexado no sistema" : (i.contract_external ? "Contrato em pasta física (clique para desmarcar)" : "Clique para marcar como em pasta física")}
                                        >
                                          {hasUploaded ? "Contrato enviado" : i.contract_external ? "Contrato em pasta" : "Contrato pendente"}
                                        </Badge>
                                        <Badge variant={expired ? "destructive" : expiringSoon ? "outline" : "secondary"} className={expiringSoon && !expired ? "border-amber-500 text-amber-700" : ""}>
                                          {expired ? `Encerrado há ${Math.abs(remainingDays)}d` : `Faltam ${remainingDays}d de ${totalDays}d`}
                                        </Badge>
                                      </div>
                                    </div>
                                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">
                                      <div><span className="text-muted-foreground">Início:</span> {format(new Date(i.start_date), "dd/MM/yyyy")}</div>
                                      <div><span className="text-muted-foreground">Fim:</span> {format(new Date(i.end_date), "dd/MM/yyyy")} {expiringSoon && !expired && <AlertTriangle className="h-3 w-3 text-amber-500 inline" />}</div>
                                      <div><span className="text-muted-foreground">Progresso:</span> {elapsedDays}d/{totalDays}d</div>
                                      <div><span className="text-muted-foreground">Agente:</span> {i.supervisor_name ?? "—"}</div>
                                      <div className="sm:col-span-2"><span className="text-muted-foreground"><Building2 className="h-3 w-3 inline" /> Agente integrador:</span> {company ? (company.trade_name || company.legal_name) : "—"}</div>
                                    </div>
                                    <InternshipContractCard employeeId={i.employee_id} />
                                  </div>
                                );
                              })
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                )}
              </>
            );
          })()}
        </TabsContent>
      </Tabs>
    </div>
  );
}
