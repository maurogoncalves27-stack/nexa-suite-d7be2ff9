import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, UserSearch, BookOpen, Globe, Copy, Briefcase, MapPin, Users, Plus, Edit2, Trash2, Link2, ExternalLink, CalendarClock, Pause, Play, Inbox } from "lucide-react";
import { JobOpeningsPanel, type JobOpening } from "@/components/recruitment/JobOpeningsPanel";
import { CandidatePipeline } from "@/components/recruitment/CandidatePipeline";
import InterviewSlotsPanel from "@/components/recruitment/InterviewSlotsPanel";
import ExternalApplicationsPanel from "@/components/recruitment/ExternalApplicationsPanel";
import { RecruitmentInbox } from "@/components/recruitment/RecruitmentInbox";
import { JobOpeningStats } from "@/components/recruitment/JobOpeningStats";
import NewInternshipOpeningButton from "@/components/internships/NewInternshipOpeningButton";


import Trainings from "@/pages/Trainings";
import { sortStores } from "@/lib/storeSort";
import { toast } from "@/hooks/use-toast";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  open: { label: "Aberta", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  paused: { label: "Pausada", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  closed: { label: "Encerrada", cls: "bg-muted text-muted-foreground" },
};

export default function Recruitment() {
  const [openings, setOpenings] = useState<JobOpening[]>([]);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openItems, setOpenItems] = useState<string[]>([]);
  const [pendingApps, setPendingApps] = useState(0);
  const [activeTab, setActiveTab] = useState<string>("pipeline");

  const focusJob = (jobOpeningId: string) => {
    setActiveTab("pipeline");
    setSelectedId(jobOpeningId);
    setOpenItems((prev) => (prev.includes(jobOpeningId) ? prev : [...prev, jobOpeningId]));
    setTimeout(() => {
      const el = document.getElementById(`job-${jobOpeningId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  };

  const loadPendingApps = async () => {
    const { count } = await supabase
      .from("job_applications")
      .select("id", { count: "exact", head: true })
      .eq("interview_status", "pending");
    setPendingApps(count ?? 0);
  };

  const loadOpenings = async () => {
    const { data } = await supabase
      .from("job_openings")
      .select("*")
      .order("status", { ascending: true })
      .order("opened_at", { ascending: false });
    const list = (data ?? []) as JobOpening[];
    setOpenings(list);
    if (list.length > 0 && !selectedId) setSelectedId(list[0].id);
    setOpenItems((prev) => (prev.length === 0 ? list.map((j) => j.id) : prev));
  };

  useEffect(() => {
    const init = async () => {
      const { data: sto } = await supabase.from("stores").select("id, name, store_type").eq("is_active", true).eq("is_virtual", false).order("name");
      setStores(sortStores(sto ?? []));
      await Promise.all([loadOpenings(), loadPendingApps()]);
      setLoading(false);
    };
    init();
  }, []);

  // Abre a aba "Candidaturas" automaticamente se houver pendentes na primeira carga
  useEffect(() => {
    if (!loading && pendingApps > 0 && activeTab === "pipeline") {
      setActiveTab("applications");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const selected = openings.find((o) => o.id === selectedId) ?? null;
  const storeMap = Object.fromEntries(stores.map((s) => [s.id, s.name]));

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const PUBLIC_BASE = "https://nexa.aquelaparme.com.br";
  const publicUrl = `${PUBLIC_BASE}/vagas`;
  const copyPublicLink = async () => {
    await navigator.clipboard.writeText(publicUrl);
    toast({ title: "Link copiado!", description: publicUrl });
  };

  const copyJobLink = async (id: string) => {
    const url = `${PUBLIC_BASE}/vagas/${id}`;
    await navigator.clipboard.writeText(url);
    toast({ title: "Link copiado!", description: url });
  };

  const removeJob = async (id: string) => {
    if (!confirm("Excluir vaga e todos os candidatos vinculados?")) return;
    const { error } = await supabase.from("job_openings").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Vaga excluída" });
    loadOpenings();
  };

  const toggleJobStatus = async (id: string, current: string) => {
    const next = current === "paused" ? "open" : "paused";
    const { error } = await supabase.from("job_openings").update({ status: next }).eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: next === "paused" ? "Vaga pausada" : "Vaga reaberta" });
    loadOpenings();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
              <UserSearch className="h-6 w-6 md:h-7 md:w-7 text-primary" />
              Recrutamento e Seleção
            </h1>
            <p className="text-muted-foreground">Gerencie vagas, candidatos e avaliações com roteiros estruturados.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyPublicLink} className="gap-2">
            <Copy className="h-4 w-4" />Copiar link público
          </Button>
          <Button asChild size="sm" className="gap-2">
            <a href={publicUrl} target="_blank" rel="noopener"><Globe className="h-4 w-4" />Ver página pública</a>
          </Button>
        </div>
      </div>

      <RecruitmentInbox
        onFocusJob={focusJob}
        onSwitchTab={(t) => setActiveTab(t)}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="applications" className="gap-2">
            <Inbox className="h-4 w-4" /> Candidaturas
            {pendingApps > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                {pendingApps}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="pipeline">Vagas e candidatos</TabsTrigger>
          <TabsTrigger value="agenda" className="gap-2">
            <CalendarClock className="h-4 w-4" /> Agenda de entrevistas
          </TabsTrigger>
          <TabsTrigger value="training" className="gap-2">
            <BookOpen className="h-4 w-4" /> Treinamento
          </TabsTrigger>
        </TabsList>

        <TabsContent value="applications">
          <ExternalApplicationsPanel />
        </TabsContent>

        <TabsContent value="pipeline" className="space-y-4">
          {/* Cabeçalho com botão "Nova vaga" e ações em massa */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-0">
              <JobOpeningsPanel
                stores={stores}
                openings={openings}
                onChanged={loadOpenings}
                onSelect={setSelectedId}
                selectedId={selectedId}
                mode="header-only"
              />
            </div>
            <NewInternshipOpeningButton onCreated={loadOpenings} />
          </div>

          {openings.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Nenhuma vaga cadastrada ainda. Clique em "Nova vaga" para começar.
              </CardContent>
            </Card>
          ) : (
            <Accordion
              type="multiple"
              value={openItems}
              onValueChange={setOpenItems}
              className="space-y-3"
            >
              {openings.map((j) => (
                <AccordionItem
                  key={j.id}
                  id={`job-${j.id}`}
                  value={j.id}
                  className="border rounded-lg bg-card overflow-hidden data-[state=open]:border-primary/50 scroll-mt-24"
                >
                  <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/40">
                    <div className="flex flex-1 items-center justify-between gap-3 pr-2">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Briefcase className="h-5 w-5 text-primary shrink-0" />
                        <div className="min-w-0 text-left">
                          <div className="font-semibold truncate">{j.title}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                            <span>{j.position}</span>
                            {j.store_id && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />{storeMap[j.store_id] ?? "—"}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />{j.positions_count} {j.positions_count === 1 ? "vaga" : "vagas"}
                            </span>
                          </div>
                          <div className="mt-1.5">
                            <JobOpeningStats jobOpeningId={j.id} openedAt={j.opened_at} />
                          </div>
                        </div>
                      </div>
                      <Badge className={STATUS_LABEL[j.status].cls} variant="outline">
                        {STATUS_LABEL[j.status].label}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4 pt-2 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={() => copyJobLink(j.id)}
                      >
                        <Link2 className="h-3.5 w-3.5" /> Copiar link
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={() => window.open(`${PUBLIC_BASE}/vagas/${j.id}`, "_blank")}
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Página pública
                      </Button>
                      <JobOpeningsPanel
                        stores={stores}
                        openings={openings}
                        onChanged={loadOpenings}
                        onSelect={setSelectedId}
                        selectedId={selectedId}
                        mode="edit-button"
                        editingJobId={j.id}
                      />
                      {j.status !== "closed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2"
                          onClick={() => toggleJobStatus(j.id, j.status)}
                        >
                          {j.status === "paused" ? (
                            <><Play className="h-3.5 w-3.5" /> Retomar</>
                          ) : (
                            <><Pause className="h-3.5 w-3.5" /> Pausar</>
                          )}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-2 text-destructive hover:text-destructive"
                        onClick={() => removeJob(j.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Excluir
                      </Button>
                    </div>
                    <CandidatePipeline
                      jobOpeningId={j.id}
                      jobTitle={j.title}
                      jobPosition={j.position}
                    />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </TabsContent>

        <TabsContent value="agenda">
          <InterviewSlotsPanel />
        </TabsContent>

        <TabsContent value="training">
          <Trainings />
        </TabsContent>


      </Tabs>
    </div>
  );
}
