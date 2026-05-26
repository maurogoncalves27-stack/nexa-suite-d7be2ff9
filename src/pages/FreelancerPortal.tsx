import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFreelancerSelf } from "@/hooks/useFreelancerSelf";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, MapPin, Calendar, Clock, HandCoins, LogOut, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";

type Job = {
  id: string;
  store_id: string | null;
  title: string;
  description: string | null;
  work_date: string;
  start_time: string | null;
  end_time: string | null;
  amount: number;
  status: string;
  filled_freelancer_id: string | null;
  stores?: { name: string } | null;
};
type App = {
  id: string;
  job_id: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  freelancer_job_openings?: Job | null;
};

const fmtMoney = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDateBR = (s: string) => { const [y,m,d] = s.split("-"); return `${d}/${m}/${y}`; };

export default function FreelancerPortal() {
  const navigate = useNavigate();
  const { user, loading: authLoading, signOut } = useAuth();
  const { freelancer, loading: flLoading } = useFreelancerSelf();
  const [open, setOpen] = useState<Job[]>([]);
  const [mine, setMine] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);

  const load = async () => {
    if (!freelancer) return;
    setLoading(true);
    const [{ data: jobs }, { data: apps }] = await Promise.all([
      supabase.from("freelancer_job_openings")
        .select("*, stores(name)")
        .eq("status", "open")
        .order("work_date", { ascending: true }),
      supabase.from("freelancer_job_applications")
        .select("*, freelancer_job_openings(*, stores(name))")
        .eq("freelancer_id", freelancer.id)
        .order("created_at", { ascending: false }),
    ]);
    setOpen((jobs ?? []) as Job[]);
    setMine((apps ?? []) as App[]);
    setLoading(false);
  };

  useEffect(() => { if (freelancer) load(); /* eslint-disable-next-line */ }, [freelancer?.id]);

  if (authLoading || flLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }
  if (!user) return <Navigate to="/freelancer/login" replace />;
  if (!freelancer) return <Navigate to="/freelancer/login" replace />;

  const appliedIds = new Set(mine.filter((a) => a.status !== "withdrawn" && a.status !== "rejected").map((a) => a.job_id));

  const apply = async (job: Job) => {
    setApplying(job.id);
    const { error } = await supabase.from("freelancer_job_applications").insert({
      job_id: job.id, freelancer_id: freelancer.id,
    });
    setApplying(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Candidatura enviada!");
    load();
  };

  const withdraw = async (a: App) => {
    if (!confirm("Cancelar sua candidatura?")) return;
    const { error } = await supabase.from("freelancer_job_applications").update({ status: "withdrawn" }).eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const handleLogout = async () => { await signOut(); navigate("/freelancer/login"); };

  const StatusBadge = ({ s }: { s: App["status"] }) => {
    const map = {
      pending: { label: "Aguardando", v: "secondary" as const },
      approved: { label: "Aprovado", v: "default" as const },
      rejected: { label: "Recusado", v: "destructive" as const },
      withdrawn: { label: "Cancelado", v: "outline" as const },
    };
    return <Badge variant={map[s].v}>{map[s].label}</Badge>;
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-background border-b sticky top-0 z-10">
        <div className="container mx-auto p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HandCoins className="h-6 w-6 text-primary" />
            <div>
              <div className="font-semibold">Olá, {freelancer.full_name.split(" ")[0]}!</div>
              <div className="text-xs text-muted-foreground">Vagas de diária</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}><LogOut className="h-4 w-4 mr-1" />Sair</Button>
        </div>
      </header>

      <main className="container mx-auto p-4 max-w-3xl">
        <Tabs defaultValue="open">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="open">Vagas disponíveis ({open.length})</TabsTrigger>
            <TabsTrigger value="mine">Minhas candidaturas ({mine.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="open" className="space-y-3 mt-4">
            {loading ? (
              <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : open.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhuma vaga aberta no momento. Volte em breve!</CardContent></Card>
            ) : open.map((j) => {
              const already = appliedIds.has(j.id);
              return (
                <Card key={j.id} className="overflow-hidden border-l-4 border-l-primary">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="space-y-1 flex-1">
                        <h3 className="font-bold text-lg">{j.title}</h3>
                        <div className="text-sm text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                          <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{j.stores?.name ?? "—"}</span>
                          <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDateBR(j.work_date)}</span>
                          {(j.start_time || j.end_time) && (
                            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{(j.start_time ?? "").slice(0,5)}{j.end_time ? `–${j.end_time.slice(0,5)}` : ""}</span>
                          )}
                        </div>
                        {j.description && <p className="text-sm mt-2">{j.description}</p>}
                      </div>
                      <div className="text-center sm:text-right">
                        <div className="text-3xl font-bold text-primary">{fmtMoney(Number(j.amount))}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">por diária</div>
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">
                      {already ? (
                        <Badge variant="secondary"><CheckCircle2 className="h-3 w-3 mr-1" />Você já se candidatou</Badge>
                      ) : (
                        <Button size="sm" onClick={() => apply(j)} disabled={applying === j.id}>
                          {applying === j.id && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                          Quero esta vaga
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="mine" className="space-y-3 mt-4">
            {mine.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">Você ainda não se candidatou a nenhuma vaga.</CardContent></Card>
            ) : mine.map((a) => {
              const j = a.freelancer_job_openings;
              if (!j) return null;
              return (
                <Card key={a.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold">{j.title}</h3>
                          <StatusBadge s={a.status} />
                        </div>
                        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 mt-1">
                          <span>{j.stores?.name ?? "—"}</span>
                          <span>{fmtDateBR(j.work_date)}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-primary">{fmtMoney(Number(j.amount))}</div>
                      </div>
                    </div>
                    {a.status === "pending" && (
                      <div className="mt-2 flex justify-end">
                        <Button size="sm" variant="outline" onClick={() => withdraw(a)}><X className="h-3 w-3 mr-1" />Cancelar candidatura</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
