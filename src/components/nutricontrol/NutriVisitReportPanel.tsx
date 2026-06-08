import { useEffect, useState, useCallback, useRef } from "react";
import { format } from "date-fns";
import { Trash2, Plus, Pencil, Eye, ClipboardCheck, Calendar as CalendarIcon, Settings, ChevronLeft, ChevronRight } from "lucide-react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NutriStoreSelector } from "@/components/nutricontrol/NutriStoreSelector";

const SECTIONS = [
  "1. Documentação e Requisitos Legais",
  "2. Higiene e Comportamento dos Manipuladores",
  "3. Recebimento e Armazenamento de Mercadorias",
  "4. Áreas de Frio (Geladeiras, Freezers e Câmaras)",
  "5. Pré-Preparo e Preparo dos Alimentos",
  "6. Distribuição e Exposição do Alimento Pronto",
  "7. Higienização de Instalações, Equipamentos e Utensílios",
  "8. Gestão de Resíduos e Controle de Pragas",
] as const;

const OTHER_SECTION = "Outros";

interface ChecklistItem {
  id: string;
  name: string;
  sort_order: number;
  section: string | null;
}

interface ChecklistResponse {
  checklist_item_id: string;
  is_conform: boolean;
  observation: string;
}

interface VisitReport {
  id: string;
  visit_date: string;
  visitor_name: string;
  general_notes: string;
  signature_url: string | null;
  store_responsible_name: string;
  user_id: string;
  created_at: string;
  store_id: string;
}

interface VisitReportWithResponses extends VisitReport {
  responses: { checklist_item_id: string; is_conform: boolean; observation: string }[];
}

interface NutriVisitReportPanelProps {
  hideHistory?: boolean;
  hideForm?: boolean;
  managerOpen?: boolean;
  onManagerChange?: (open: boolean) => void;
  externalStoreId?: string | null;
  hideStoreSelector?: boolean;
}

export default function NutriVisitReportPanel({ hideHistory = false, hideForm = false, managerOpen, onManagerChange, externalStoreId, hideStoreSelector = false }: NutriVisitReportPanelProps = {}) {
  const { user, isAdmin } = useAuth();
  const sigRef = useRef<SignatureCanvas | null>(null);

  const [internalStoreId, setInternalStoreId] = useState<string | null>(null);
  const currentStoreId = externalStoreId !== undefined ? externalStoreId : internalStoreId;
  const setCurrentStoreId = setInternalStoreId;

  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [reports, setReports] = useState<VisitReportWithResponses[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [visitorName, setVisitorName] = useState("");
  const [visitDate, setVisitDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [generalNotes, setGeneralNotes] = useState("");
  const [storeResponsible, setStoreResponsible] = useState("");
  const [responses, setResponses] = useState<Record<string, ChecklistResponse>>({});
  const [saving, setSaving] = useState(false);

  // Admin: manage checklist items
  const [newItemName, setNewItemName] = useState("");
  const [newItemSection, setNewItemSection] = useState<string>(SECTIONS[0]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // View report
  const [viewingReport, setViewingReport] = useState<string | null>(null);

  // Manager dialog
  const [showManagerInternal, setShowManagerInternal] = useState(false);
  const showManager = managerOpen !== undefined ? managerOpen : showManagerInternal;
  const setShowManager = (open: boolean) => {
    if (managerOpen === undefined) setShowManagerInternal(open);
    onManagerChange?.(open);
  };
  const [stepIndex, setStepIndex] = useState<number>(0);


  const fetchData = useCallback(async () => {
    setLoading(true);
    let reportsQuery = supabase
      .from("nutri_visit_reports")
      .select("*")
      .order("visit_date", { ascending: false })
      .limit(50);
    if (currentStoreId) reportsQuery = reportsQuery.eq("store_id", currentStoreId);
    const [itemsRes, reportsRes] = await Promise.all([
      supabase.from("nutri_visit_checklist_items").select("*").order("sort_order"),
      reportsQuery,
    ]);

    const items = (itemsRes.data ?? []) as ChecklistItem[];
    setChecklistItems(items);

    const initialResponses: Record<string, ChecklistResponse> = {};
    items.forEach((item) => {
      initialResponses[item.id] = { checklist_item_id: item.id, is_conform: true, observation: "" };
    });
    setResponses(initialResponses);

    const reps = (reportsRes.data ?? []) as VisitReport[];
    if (reps.length > 0) {
      const reportIds = reps.map((r) => r.id);
      const { data: allResponses } = await supabase
        .from("nutri_visit_checklist_responses")
        .select("*")
        .in("visit_report_id", reportIds);

      const enriched: VisitReportWithResponses[] = reps.map((r) => ({
        ...r,
        responses: (allResponses ?? [])
          .filter((resp) => resp.visit_report_id === r.id)
          .map((resp) => ({
            checklist_item_id: resp.checklist_item_id,
            is_conform: resp.is_conform,
            observation: resp.observation,
          })),
      }));
      setReports(enriched);
    } else {
      setReports([]);
    }

    setLoading(false);
  }, [currentStoreId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-preencher nome da nutricionista a partir do login
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .maybeSingle();
      const name = (data?.full_name || user.email || "").trim();
      if (name) setVisitorName(name);
    })();
  }, [user]);

  const toggleConform = (itemId: string) => {
    setResponses((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], is_conform: !prev[itemId].is_conform },
    }));
  };

  const setObservation = (itemId: string, obs: string) => {
    setResponses((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], observation: obs },
    }));
  };

  const saveReport = async () => {
    if (!user) return;
    if (!currentStoreId) {
      toast({ title: "Selecione uma loja", variant: "destructive" });
      return;
    }
    if (!visitorName.trim()) {
      toast({ title: "Informe o nome do visitante", variant: "destructive" });
      return;
    }
    if (!storeResponsible.trim()) {
      setStepIndex(Number.MAX_SAFE_INTEGER);
      toast({ title: "Informe o nome do responsável pela loja", variant: "destructive" });
      return;
    }
    if (sigRef.current?.isEmpty()) {
      setStepIndex(Number.MAX_SAFE_INTEGER);
      toast({ title: "Assinatura é obrigatória", variant: "destructive" });
      return;
    }

    setSaving(true);

    let signatureUrl: string | null = null;
    try {
      const canvas = sigRef.current!.getCanvas();
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed"))), "image/png");
      });
      const path = `${user.id}/${Date.now()}.png`;
      const { error: upErr } = await supabase.storage
        .from("nutri-visit-signatures")
        .upload(path, blob, { contentType: "image/png" });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("nutri-visit-signatures").getPublicUrl(path);
      signatureUrl = urlData.publicUrl;
    } catch (err: any) {
      toast({ title: "Erro ao salvar assinatura", description: err.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    const { data: report, error: reportErr } = await supabase
      .from("nutri_visit_reports")
      .insert({
        user_id: user.id,
        store_id: currentStoreId,
        visit_date: visitDate,
        visitor_name: visitorName.trim(),
        general_notes: generalNotes.trim(),
        signature_url: signatureUrl,
        store_responsible_name: storeResponsible.trim(),
      })
      .select()
      .single();

    if (reportErr || !report) {
      toast({ title: "Erro ao salvar visita", description: reportErr?.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    const responsesToInsert = Object.values(responses).map((r) => ({
      visit_report_id: report.id,
      checklist_item_id: r.checklist_item_id,
      is_conform: r.is_conform,
      observation: r.observation.trim(),
    }));

    if (responsesToInsert.length > 0) {
      const { error: respErr } = await supabase
        .from("nutri_visit_checklist_responses")
        .insert(responsesToInsert);
      if (respErr) {
        toast({ title: "Erro ao salvar checklist", description: respErr.message, variant: "destructive" });
      }
    }

  // Não limpamos visitorName: continua = nome do logado para o próximo registro
    setGeneralNotes("");
    setStoreResponsible("");
    sigRef.current?.clear();
    const reset: Record<string, ChecklistResponse> = {};
    checklistItems.forEach((item) => {
      reset[item.id] = { checklist_item_id: item.id, is_conform: true, observation: "" };
    });
    setResponses(reset);

    toast({ title: "Visita registrada com sucesso" });
    setSaving(false);
    fetchData();
  };

  const deleteReport = async (id: string) => {
    if (!confirm("Excluir este registro de visita?")) return;
    const { error } = await supabase.from("nutri_visit_reports").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      return;
    }
    setViewingReport(null);
    fetchData();
  };

  const addChecklistItem = async () => {
    if (!user || !newItemName.trim()) return;
    const maxOrder = checklistItems.reduce((max, i) => Math.max(max, i.sort_order), 0);
    const { error } = await supabase.from("nutri_visit_checklist_items").insert({
      name: newItemName.trim(),
      section: newItemSection,
      sort_order: maxOrder + 1,
      created_by: user.id,
    });
    if (error) {
      toast({ title: "Erro ao adicionar", description: error.message, variant: "destructive" });
      return;
    }
    setNewItemName("");
    fetchData();
  };

  const updateChecklistItem = async (id: string) => {
    if (!editingName.trim()) return;
    const { error } = await supabase
      .from("nutri_visit_checklist_items")
      .update({ name: editingName.trim() })
      .eq("id", id);
    if (error) {
      toast({ title: "Erro ao editar", description: error.message, variant: "destructive" });
      return;
    }
    setEditingItemId(null);
    fetchData();
  };

  const deleteChecklistItem = async (id: string) => {
    if (!confirm("Remover este item do checklist?")) return;
    const { error } = await supabase.from("nutri_visit_checklist_items").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      return;
    }
    fetchData();
  };

  const viewedReport = viewingReport ? reports.find((r) => r.id === viewingReport) : null;
  if (viewedReport) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => setViewingReport(null)}>
          ← Voltar
        </Button>
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Registro de Visita Técnica</h3>
            <span className="text-xs text-muted-foreground">
              {format(new Date(viewedReport.visit_date + "T00:00:00"), "dd/MM/yyyy")}
            </span>
          </div>
          <div className="space-y-1 text-sm">
            <p><span className="text-muted-foreground">Visitante:</span> {viewedReport.visitor_name}</p>
            <p><span className="text-muted-foreground">Responsável loja:</span> {viewedReport.store_responsible_name}</p>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Check-list</h4>
            {[...SECTIONS, OTHER_SECTION].map((sec) => {
              const secResponses = viewedReport.responses.filter((r) => {
                const item = checklistItems.find((i) => i.id === r.checklist_item_id);
                return (item?.section ?? OTHER_SECTION) === sec;
              });
              if (secResponses.length === 0) return null;
              return (
                <div key={sec} className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-primary uppercase tracking-wide">{sec}</p>
                  {secResponses.map((resp) => {
                    const item = checklistItems.find((i) => i.id === resp.checklist_item_id);
                    return (
                      <div key={resp.checklist_item_id} className="border border-border rounded-md p-2.5">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            resp.is_conform
                              ? "bg-primary text-primary-foreground"
                              : "bg-destructive text-destructive-foreground"
                          }`}>
                            {resp.is_conform ? "C" : "NC"}
                          </span>
                          <span className="text-sm text-foreground">{item?.name ?? "Item removido"}</span>
                        </div>
                        {resp.observation && (
                          <p className="text-xs text-muted-foreground mt-1 ml-8 italic">"{resp.observation}"</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {viewedReport.general_notes && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Observações gerais</h4>
              <p className="text-sm text-foreground whitespace-pre-wrap">{viewedReport.general_notes}</p>
            </div>
          )}

          {viewedReport.signature_url && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Assinatura</h4>
              <img
                src={viewedReport.signature_url}
                alt="Assinatura"
                className="border border-border rounded-md max-h-32 bg-white"
              />
            </div>
          )}
        </div>

        <Button variant="destructive" size="sm" onClick={() => deleteReport(viewedReport.id)}>
          <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir registro
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!hideStoreSelector && (
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <NutriStoreSelector value={currentStoreId} onChange={setCurrentStoreId} />
          </div>
          {isAdmin && !hideForm && managerOpen === undefined && (
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              title="Gerenciar itens do checklist"
              onClick={() => setShowManager(true)}
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}


      {isAdmin && !hideForm && (
        <Dialog open={showManager} onOpenChange={setShowManager}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <ClipboardCheck className="h-4 w-4 text-primary" />
                Gerenciar itens do checklist
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
            <form
              onSubmit={(e) => { e.preventDefault(); addChecklistItem(); }}
              className="space-y-2"
            >
              <Select value={newItemSection} onValueChange={setNewItemSection}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Seção" />
                </SelectTrigger>
                <SelectContent>
                  {SECTIONS.map((s) => (
                    <SelectItem key={s} value={s} className="text-sm">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input
                  placeholder="Novo item..."
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="flex-1 h-9 text-sm"
                />
                <Button type="submit" size="icon" className="h-9 w-9" disabled={!newItemName.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </form>
            <Accordion type="single" collapsible>
            <AccordionItem value="list" className="border-none">
              <AccordionTrigger className="px-3 py-2 hover:no-underline">
                <span className="text-xs text-muted-foreground font-normal">
                  Ver itens cadastrados ({checklistItems.length})
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-3 space-y-3">
                {[...SECTIONS, OTHER_SECTION].map((sec) => {
                  const secItems = checklistItems.filter((i) => (i.section ?? OTHER_SECTION) === sec);
                  if (secItems.length === 0) return null;
                  return (
                    <div key={sec} className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-primary uppercase tracking-wide">{sec}</p>
                      {secItems.map((item) => (
                        <div key={item.id} className="flex items-center gap-2 pl-2">
                          {editingItemId === item.id ? (
                            <form
                              onSubmit={(e) => { e.preventDefault(); updateChecklistItem(item.id); }}
                              className="flex-1 flex gap-2"
                            >
                              <Input
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                className="h-7 text-sm"
                                autoFocus
                              />
                              <Button type="submit" size="sm" className="h-7 text-xs">Salvar</Button>
                              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingItemId(null)}>Cancelar</Button>
                            </form>
                          ) : (
                            <>
                              <span className="flex-1 text-sm text-foreground">{item.name}</span>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingItemId(item.id); setEditingName(item.name); }}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteChecklistItem(item.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
                {checklistItems.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">Nenhum item cadastrado.</p>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {!hideForm && (
      <div className="bg-card border border-border rounded-lg p-3 space-y-4">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          Nova visita técnica
        </h4>

        {!currentStoreId && (
          <div className="bg-accent/50 border border-accent rounded-md p-3 text-center">
            <p className="text-sm font-medium text-foreground">Selecione uma loja para iniciar o checklist</p>
          </div>
        )}

        <div className={!currentStoreId ? "pointer-events-none opacity-50 select-none" : ""} aria-hidden={!currentStoreId ? true : undefined}>
        {/* Data e responsável ocultos — data = hoje, responsável = usuário logado */}





        {checklistItems.length > 0 && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full justify-start h-auto flex-wrap p-1 gap-1">
              {[...SECTIONS, OTHER_SECTION].map((sec) => {
                const secItems = checklistItems.filter((i) => (i.section ?? OTHER_SECTION) === sec);
                if (secItems.length === 0) return null;
                const ncCount = secItems.filter((i) => responses[i.id] && !responses[i.id].is_conform).length;
                // Short label: number + first word(s), full label as tooltip
                const shortLabel = sec.replace(/^(\d+)\.\s*(\S+).*/, "$1. $2");
                return (
                  <TabsTrigger
                    key={sec}
                    value={sec}
                    title={sec}
                    className="shrink-0 text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    <span>{shortLabel}</span>
                    {ncCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive text-destructive-foreground font-semibold">
                        {ncCount}
                      </span>
                    )}
                  </TabsTrigger>
                );
              })}
              <TabsTrigger
                value="finalizar"
                title="Finalizar visita"
                className="shrink-0 text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Finalizar</span>
              </TabsTrigger>
            </TabsList>

            {[...SECTIONS, OTHER_SECTION].map((sec) => {
              const secItems = checklistItems.filter((i) => (i.section ?? OTHER_SECTION) === sec);
              if (secItems.length === 0) return null;
              return (
                <TabsContent key={sec} value={sec} className="space-y-2 mt-3">
                  <p className="text-[11px] font-semibold text-primary uppercase tracking-wide px-1">{sec}</p>
                  {secItems.map((item) => {
                    const resp = responses[item.id];
                    if (!resp) return null;
                    return (
                      <div key={item.id} className="border border-border rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => toggleConform(item.id)}
                            className={`px-2.5 py-0.5 rounded-full text-xs font-semibold transition-colors shrink-0 ${
                              resp.is_conform
                                ? "bg-primary text-primary-foreground"
                                : "bg-destructive text-destructive-foreground"
                            }`}
                          >
                            {resp.is_conform ? "C" : "NC"}
                          </button>
                          <span className="text-sm text-foreground flex-1">{item.name}</span>
                        </div>
                        <Textarea
                          placeholder="Observação do item (opcional)..."
                          value={resp.observation}
                          onChange={(e) => setObservation(item.id, e.target.value)}
                          className="text-sm min-h-[50px] resize-none"
                          maxLength={500}
                        />
                      </div>
                    );
                  })}
                </TabsContent>
              );
            })}
            <TabsContent value="finalizar" className="space-y-3 mt-3">
              {(() => {
                const all = Object.values(responses);
                const conf = all.filter((r) => r.is_conform).length;
                const nc = all.filter((r) => !r.is_conform).length;
                return (
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Resumo da visita
                    </p>
                    <p className="text-sm text-foreground">
                      <span className="font-semibold text-primary">{conf}</span> conformes ·{" "}
                      <span className="font-semibold text-destructive">{nc}</span> não conformes
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Os campos abaixo valem para a visita inteira.
                    </p>
                  </div>
                );
              })()}

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Observações gerais</label>
                <Textarea
                  placeholder="Observações gerais da visita..."
                  value={generalNotes}
                  onChange={(e) => setGeneralNotes(e.target.value)}
                  className="text-sm min-h-[80px] resize-none"
                  maxLength={1000}
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Nome do responsável pela loja</label>
                <Input
                  placeholder="Nome completo"
                  value={storeResponsible}
                  onChange={(e) => setStoreResponsible(e.target.value)}
                  className="h-9 text-sm"
                  maxLength={120}
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Assinatura do responsável pela loja</label>
                <div className="border border-border rounded-md bg-white overflow-hidden">
                  <SignatureCanvas
                    ref={sigRef}
                    penColor="black"
                    canvasProps={{ className: "w-full h-32" }}
                  />
                </div>
                <Button variant="ghost" size="sm" className="text-xs mt-1" onClick={() => sigRef.current?.clear()}>
                  Limpar assinatura
                </Button>
              </div>

              <Button onClick={saveReport} size="sm" className="w-full" disabled={saving || !currentStoreId}>
                {saving ? "Salvando..." : "Salvar registro de visita"}
              </Button>
            </TabsContent>
          </Tabs>
        )}

        {checklistItems.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            {isAdmin ? "Adicione itens ao checklist acima." : "Nenhum item no checklist. Peça ao administrador para configurar."}
          </p>
        )}
        </div>
      </div>
      )}

      {!hideHistory && (loading ? (
        <p className="text-center text-muted-foreground py-6 text-sm">Carregando histórico...</p>
      ) : reports.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Visitas anteriores</h4>
          {reports.map((rep) => {
            const conformCount = rep.responses.filter((r) => r.is_conform).length;
            const total = rep.responses.length;
            return (
              <div
                key={rep.id}
                className="bg-card border border-border rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => setViewingReport(rep.id)}
              >
                <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {format(new Date(rep.visit_date + "T00:00:00"), "dd/MM/yyyy")} — {rep.visitor_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {conformCount}/{total} conforme · Loja: {rep.store_responsible_name}
                  </p>
                </div>
                <Eye className="h-4 w-4 text-muted-foreground" />
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-center text-muted-foreground py-6 text-sm">Nenhuma visita registrada ainda.</p>
      ))}
    </div>
  );
}
