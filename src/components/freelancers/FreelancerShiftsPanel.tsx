import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentPosition } from "@/lib/timeClock";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, Calendar, Clock, LogIn, LogOut, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Shift = {
  id: string;
  title: string;
  work_date: string;
  start_time: string | null;
  end_time: string | null;
  amount: number;
  status: string;
  payment_id: string | null;
  stores?: { name: string } | null;
};

type Punch = {
  id: string;
  check_in_at: string | null;
  check_out_at: string | null;
  check_in_within_geofence: boolean | null;
  check_out_within_geofence: boolean | null;
};

const fmtDateBR = (s: string) => { const [y, m, d] = s.split("-"); return `${d}/${m}/${y}`; };
const fmtMoney = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function FreelancerShiftsPanel({ freelancerId }: { freelancerId: string }) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [punches, setPunches] = useState<Record<string, Punch>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: jobs } = await supabase
      .from("freelancer_job_openings")
      .select("id, title, work_date, start_time, end_time, amount, status, payment_id, stores(name)")
      .eq("filled_freelancer_id", freelancerId)
      .gte("work_date", new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))
      .order("work_date", { ascending: true });

    const list = (jobs ?? []) as unknown as Shift[];
    setShifts(list);

    const ids = list.map((j) => j.payment_id).filter(Boolean) as string[];
    if (ids.length > 0) {
      const { data: pays } = await supabase
        .from("freelancer_daily_payments")
        .select("id, check_in_at, check_out_at, check_in_within_geofence, check_out_within_geofence")
        .in("id", ids);
      const map: Record<string, Punch> = {};
      for (const p of (pays ?? []) as Punch[]) map[p.id] = p;
      setPunches(map);
    } else {
      setPunches({});
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [freelancerId]);

  const punch = async (job: Shift, kind: "in" | "out") => {
    setBusy(job.id);
    try {
      const pos = await getCurrentPosition();
      if (!pos?.coords) {
        toast.error("Não foi possível obter sua localização. Ative o GPS e permita o acesso.");
        return;
      }
      const { data, error } = await supabase.rpc("freelancer_check_punch", {
        _job_id: job.id,
        _kind: kind,
        _lat: pos.coords.latitude,
        _lng: pos.coords.longitude,
      });
      if (error) { toast.error(error.message); return; }
      const res = data as { within_geofence: boolean | null; distance_m: number | null } | null;
      if (res?.within_geofence === false) {
        toast.warning(`Registrado, mas você estava a ${res.distance_m}m da loja.`);
      } else {
        toast.success(kind === "in" ? "Check-in registrado!" : "Check-out registrado!");
      }
      load();
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (shifts.length === 0) {
    return <Card><CardContent className="p-8 text-center text-muted-foreground">Você ainda não tem turnos confirmados.</CardContent></Card>;
  }

  const today = todayISO();

  return (
    <div className="space-y-3">
      {shifts.map((j) => {
        const p = j.payment_id ? punches[j.payment_id] : undefined;
        const isToday = j.work_date === today;
        const canPunch = isToday;
        return (
          <Card key={j.id} className="border-l-4 border-l-primary">
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold">{j.title}</h3>
                    {isToday && <Badge>Hoje</Badge>}
                  </div>
                  <div className="text-sm text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{j.stores?.name ?? "—"}</span>
                    <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDateBR(j.work_date)}</span>
                    {(j.start_time || j.end_time) && (
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{(j.start_time ?? "").slice(0, 5)}{j.end_time ? `–${j.end_time.slice(0, 5)}` : ""}</span>
                    )}
                  </div>
                </div>
                <div className="text-left sm:text-right">
                  <div className="text-xl font-bold text-primary">{fmtMoney(Number(j.amount))}</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                {p?.check_in_at ? (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />Entrada {fmtTime(p.check_in_at)}
                    {p.check_in_within_geofence === false && <AlertTriangle className="h-3 w-3 text-warning" />}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">Sem check-in</span>
                )}
                {p?.check_out_at && (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />Saída {fmtTime(p.check_out_at)}
                    {p.check_out_within_geofence === false && <AlertTriangle className="h-3 w-3 text-warning" />}
                  </Badge>
                )}
              </div>

              {canPunch && (
                <div className="flex flex-col sm:flex-row gap-2">
                  {!p?.check_in_at ? (
                    <Button className="flex-1" onClick={() => punch(j, "in")} disabled={busy === j.id}>
                      {busy === j.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <LogIn className="h-4 w-4 mr-1" />}
                      Fazer check-in
                    </Button>
                  ) : !p?.check_out_at ? (
                    <Button className="flex-1" variant="outline" onClick={() => punch(j, "out")} disabled={busy === j.id}>
                      {busy === j.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <LogOut className="h-4 w-4 mr-1" />}
                      Fazer check-out
                    </Button>
                  ) : (
                    <Badge variant="outline" className="w-fit">Turno finalizado</Badge>
                  )}
                </div>
              )}
              {canPunch && (
                <p className="text-[11px] text-muted-foreground">Seu local é registrado no check-in/check-out para confirmar a presença na loja.</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
