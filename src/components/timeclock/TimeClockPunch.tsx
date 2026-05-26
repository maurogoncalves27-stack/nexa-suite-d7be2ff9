import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Camera, MapPin, Clock, CheckCircle2, AlertCircle, Home } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
// face-api.js (~1MB) é carregado sob demanda só quando o usuário abre a câmera para bater ponto.
// Isso evita baixar a lib+modelos quem só consulta a escala/histórico.
type FaceApiModule = typeof import("@/lib/faceApi");
let faceApiPromise: Promise<FaceApiModule> | null = null;
const getFaceApi = (): Promise<FaceApiModule> => {
  if (!faceApiPromise) faceApiPromise = import("@/lib/faceApi");
  return faceApiPromise;
};
import {
  ENTRY_TYPE_LABEL,
  TimeClockEntryType,
  nextExpectedEntry,
  getEntryOrder,
  getCurrentPosition,
  haversineDistanceMeters,
} from "@/lib/timeClock";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  employeeId: string;
  storeId: string;
}

interface TodayEntry {
  id: string;
  entry_type: TimeClockEntryType;
  entry_at: string;
}

export default function TimeClockPunch({ employeeId, storeId }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [modelsReady, setModelsReady] = useState(false);
  const [refDescriptor, setRefDescriptor] = useState<number[] | null>(null);
  const [todayEntries, setTodayEntries] = useState<TodayEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [punching, setPunching] = useState(false);
  const [now, setNow] = useState(new Date());
  const [hasSecondBreak, setHasSecondBreak] = useState(false);
  const [isHomeOfficeToday, setIsHomeOfficeToday] = useState(false);
  const [isDayOffToday, setIsDayOffToday] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    init();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  const init = async () => {
    setLoading(true);
    const today = format(new Date(), "yyyy-MM-dd");
    const [{ data: face }, { data: entries }, { data: sched }] = await Promise.all([
      supabase
        .from("employee_face_descriptors")
        .select("descriptor")
        .eq("employee_id", employeeId)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("time_clock_entries")
        .select("id, entry_type, entry_at")
        .eq("employee_id", employeeId)
        .eq("reference_date", today)
        .order("entry_at", { ascending: true }),
      supabase
        .from("work_schedules")
        .select("break_start_2, break_end_2, is_home_office, is_day_off")
        .eq("employee_id", employeeId)
        .eq("schedule_date", today)
        .maybeSingle(),
    ]);
    setRefDescriptor((face?.descriptor as number[] | null) ?? null);
    setTodayEntries((entries ?? []) as TodayEntry[]);
    setHasSecondBreak(!!(sched?.break_start_2 && sched?.break_end_2));
    setIsHomeOfficeToday(!!sched?.is_home_office);
    setIsDayOffToday(!!sched?.is_day_off);
    setLoading(false);
  };

  const startCamera = async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
    } catch (e: any) {
      toast({ title: "Câmera indisponível", description: e.message ?? "Permita o acesso à câmera.", variant: "destructive" });
      return;
    }
    streamRef.current = stream;
    setCameraOn(true);
    setTimeout(async () => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try { await videoRef.current.play(); } catch {}
      }
    }, 50);
    // Carrega lib + modelos em background (lazy import)
    getFaceApi()
      .then(({ loadFaceModels }) => loadFaceModels())
      .then(() => setModelsReady(true))
      .catch((e) => {
        toast({ title: "Erro ao carregar IA", description: e.message, variant: "destructive" });
      });
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  const checkRequiredTasksPending = async (): Promise<string[]> => {
    // Busca tarefas obrigatórias atribuídas a este colaborador (direta ou pela loja)
    const { data: emp } = await supabase
      .from("employees")
      .select("store_id, allocated_store_id")
      .eq("id", employeeId)
      .maybeSingle();
    const storeIds = [emp?.store_id, emp?.allocated_store_id].filter(Boolean) as string[];

    let query = supabase
      .from("employee_tasks")
      .select("id, title, periodicity, scope, employee_id, store_id")
      .eq("is_active", true)
      .eq("is_required", true);
    // Tarefas individuais OU da loja do colaborador
    const orParts: string[] = [`employee_id.eq.${employeeId}`];
    if (storeIds.length > 0) orParts.push(`store_id.in.(${storeIds.join(",")})`);
    query = query.or(orParts.join(","));
    const { data: tasks } = await query;
    if (!tasks || tasks.length === 0) return [];

    // Para cada tarefa, calcula period_start e verifica se há completion
    const periodStartFor = (p: string) => {
      const d = new Date();
      if (p === "once") return "1970-01-01";
      if (p === "daily") return d.toISOString().slice(0, 10);
      if (p === "weekly") {
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        return d.toISOString().slice(0, 10);
      }
      if (p === "biweekly") {
        const day = d.getDate();
        if (day <= 15) return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
        return new Date(d.getFullYear(), d.getMonth(), 16).toISOString().slice(0, 10);
      }
      return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
    };

    const taskIds = tasks.map((t) => t.id);
    const { data: comps } = await supabase
      .from("employee_task_completions")
      .select("task_id, period_start")
      .eq("employee_id", employeeId)
      .in("task_id", taskIds);
    const doneSet = new Set(
      (comps ?? []).map((c: any) => `${c.task_id}|${c.period_start}`),
    );
    return tasks
      .filter((t: any) => !doneSet.has(`${t.id}|${periodStartFor(t.periodicity)}`))
      .map((t: any) => t.title);
  };

  const punch = async () => {
    if (!videoRef.current || !refDescriptor) return;
    const expected = nextExpectedEntry(todayEntries.map((e) => e.entry_type), hasSecondBreak);
    if (!expected) {
      const total = hasSecondBreak ? 6 : 4;
      toast({ title: "Dia já completo", description: `Todas as ${total} batidas de hoje foram registradas.` });
      return;
    }

    // Bloqueia clock_out se houver tarefas obrigatórias pendentes
    if (expected === "clock_out") {
      const pending = await checkRequiredTasksPending();
      if (pending.length > 0) {
        toast({
          title: "Tarefas obrigatórias pendentes",
          description: `Conclua antes de bater a saída: ${pending.slice(0, 3).join(", ")}${pending.length > 3 ? ` e mais ${pending.length - 3}` : ""}.`,
          variant: "destructive",
        });
        return;
      }
    }

    setPunching(true);
    try {
      const { loadFaceModels, detectFaceDescriptor, descriptorDistance, captureVideoFrame, FACE_MATCH_THRESHOLD } = await getFaceApi();
      if (!modelsReady) {
        toast({ title: "Aguarde…", description: "Os modelos de IA ainda estão carregando." });
        await loadFaceModels();
        setModelsReady(true);
      }
      // 1) Detectar rosto
      const desc = await detectFaceDescriptor(videoRef.current);
      if (!desc) {
        toast({ title: "Rosto não detectado", description: "Posicione melhor o rosto.", variant: "destructive" });
        return;
      }

      // 2) Comparar
      const dist = descriptorDistance(desc, refDescriptor);
      if (dist > FACE_MATCH_THRESHOLD) {
        toast({
          title: "Rosto não reconhecido",
          description: `Diferença: ${dist.toFixed(3)} (máx ${FACE_MATCH_THRESHOLD}). Tente novamente com boa iluminação.`,
          variant: "destructive",
        });
        return;
      }

      const matchScore = Math.max(0, 1 - dist);

      // 3) Capturar foto + GPS em paralelo
      const [photoBlob, position] = await Promise.all([
        captureVideoFrame(videoRef.current),
        getCurrentPosition(),
      ]);

      // 3.1) Calcula distância: aceita estar dentro do raio de QUALQUER loja da empresa.
      // Mantém a batida na loja vinculada, mas usa a menor distância encontrada.
      // Bypass: usuários com user_access_overrides.bypass_geofence = true (ou super-user)
      // nunca são marcados como "fora da área" — usado para colaboradores alocados em todas as lojas.
      let distanceM: number | null = null;
      let isOutside = false;
      const { data: { user: bypassUser } } = await supabase.auth.getUser();
      let bypassGeofence = false;
      if (bypassUser?.id) {
        const { data: bp } = await supabase.rpc("has_geofence_bypass", { _user_id: bypassUser.id });
        bypassGeofence = bp === true;
      }
      if (position?.coords) {
        const { data: stores } = await supabase
          .from("stores")
          .select("id, latitude, longitude, geofence_radius_m")
          .eq("is_virtual", false);
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        let bestDistToVinculada: number | null = null;
        let withinAny = false;
        let nearestDist: number | null = null;

        for (const s of stores ?? []) {
          if (s.latitude == null || s.longitude == null) continue;
          const d = haversineDistanceMeters(lat, lon, Number(s.latitude), Number(s.longitude));
          const radius = s.geofence_radius_m ?? 200;
          if (s.id === storeId) bestDistToVinculada = d;
          if (d <= radius) withinAny = true;
          if (nearestDist == null || d < nearestDist) nearestDist = d;
        }

        // Distância exibida/gravada: prioriza a loja vinculada; fallback para a mais próxima
        distanceM = bestDistToVinculada ?? nearestDist;
        // Só marca "fora" se NÃO estiver dentro do raio de nenhuma loja
        // E o usuário não tiver bypass de geofence
        isOutside = !bypassGeofence && !withinAny && distanceM != null;
      }

      // 4) Upload da foto
      const ts = Date.now();
      const photoPath = `${employeeId}/${format(new Date(), "yyyy-MM-dd")}/${expected}-${ts}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("time-clock-photos")
        .upload(photoPath, photoBlob, { contentType: "image/jpeg", upsert: false });
      if (upErr) throw upErr;

      // 5) Inserir batida (reaproveita bypassUser já obtido acima)
      const user = bypassUser;
      const { error: insErr } = await supabase.from("time_clock_entries").insert([{
        employee_id: employeeId,
        store_id: storeId,
        entry_type: expected,
        match_score: Number(matchScore.toFixed(4)),
        latitude: position?.coords.latitude ?? null,
        longitude: position?.coords.longitude ?? null,
        accuracy_m: position?.coords.accuracy ?? null,
        distance_from_store_m: distanceM != null ? Number(distanceM.toFixed(2)) : null,
        is_outside_geofence: isOutside,
        photo_path: photoPath,
        created_by: user?.id ?? null,
      }]);
      if (insErr) throw insErr;

      toast({
        title: `${ENTRY_TYPE_LABEL[expected]} registrada!`,
        description: isOutside
          ? `⚠️ Fora da área da loja (${Math.round(distanceM!)}m). RH será notificado.`
          : `Match: ${(matchScore * 100).toFixed(1)}%${distanceM != null ? ` · ${Math.round(distanceM)}m da loja` : ""}`,
        variant: isOutside ? "destructive" : "default",
      });
      stopCamera();
      init();
    } catch (e: any) {
      toast({ title: "Erro ao bater ponto", description: e.message, variant: "destructive" });
    } finally {
      setPunching(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!refDescriptor) {
    return null;
  }

  const expected = nextExpectedEntry(todayEntries.map((e) => e.entry_type), hasSecondBreak);
  const dayComplete = !expected;
  const order = getEntryOrder(hasSecondBreak);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-nowrap">
          <CardTitle className="flex items-center gap-2 text-lg md:text-xl shrink-0">
            <Clock className="h-6 w-6 text-primary" />
            Bater Ponto
          </CardTitle>
          <CardDescription className="text-xs md:text-base text-right min-w-0 truncate">
            <span className="hidden sm:inline">{format(now, "EEEE, dd 'de' MMMM", { locale: ptBR })} • </span>
            <span className="sm:hidden">{format(now, "dd/MM")} • </span>
            <span className="font-mono font-bold text-foreground text-sm md:text-lg">{format(now, "HH:mm:ss")}</span>
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isHomeOfficeToday ? (
          <div className="flex items-start gap-3 rounded-lg bg-blue-500/10 border border-blue-500/30 px-4 py-4">
            <Home className="h-6 w-6 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div>
              <p className="font-semibold text-base text-blue-700 dark:text-blue-300">Home Office hoje</p>
              <p className="text-sm text-blue-700/80 dark:text-blue-300/80">
                Você não precisa bater ponto neste dia. Bom trabalho!
              </p>
            </div>
          </div>
        ) : isDayOffToday ? (
          <div className="flex items-start gap-3 rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-4">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div>
              <p className="font-semibold text-base text-amber-700 dark:text-amber-300">Dia de folga</p>
              <p className="text-sm text-amber-700/80 dark:text-amber-300/80">Aproveite seu descanso!</p>
            </div>
          </div>
        ) : (
        <>
        {/* Status do dia */}
        <div className={`grid grid-cols-2 ${order.length === 6 ? "sm:grid-cols-6" : "sm:grid-cols-4"} gap-1.5`}>
          {order.map((t) => {
            const entry = todayEntries.find((e) => e.entry_type === t);
            return (
              <div key={t} className={`rounded-md border p-1.5 text-center ${entry ? "bg-primary/5 border-primary/30" : "bg-muted/30"}`}>
                <div className="text-[10px] md:text-xs text-muted-foreground font-medium leading-tight">{ENTRY_TYPE_LABEL[t]}</div>
                <div className="font-mono text-sm md:text-base font-bold">
                  {entry ? format(new Date(entry.entry_at), "HH:mm") : "—"}
                </div>
              </div>
            );
          })}
        </div>

        {dayComplete ? (
          <div className="flex items-center gap-2 rounded-md bg-primary/10 px-4 py-4 text-base text-primary">
            <CheckCircle2 className="h-6 w-6 shrink-0" />
            <span className="font-semibold">Dia completo! Todas as batidas foram registradas.</span>
          </div>
        ) : !cameraOn ? (
          <div className="space-y-3">
            <div className="rounded-md bg-muted/50 px-4 py-3 text-base flex items-center flex-wrap gap-2">
              <span className="font-medium">Próxima batida:</span>
              <Badge className="text-sm px-2.5 py-1">{ENTRY_TYPE_LABEL[expected!]}</Badge>
            </div>
            <Button onClick={startCamera} className="w-full text-base font-semibold h-14" size="lg">
              <Camera className="h-5 w-5 mr-2" />
              Abrir câmera para bater ponto
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative rounded-lg overflow-hidden bg-muted aspect-[4/3]">
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
              <div className="absolute inset-0 pointer-events-none border-4 border-primary/30 rounded-lg" />
              <Badge className="absolute top-2 left-2 text-sm">{ENTRY_TYPE_LABEL[expected!]}</Badge>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Localização será registrada para auditoria.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={stopCamera} disabled={punching} className="h-12 text-base">Cancelar</Button>
              <Button onClick={punch} disabled={punching} className="h-12 text-base font-semibold">
                {punching ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <CheckCircle2 className="h-5 w-5 mr-2" />}
                Confirmar
              </Button>
            </div>
          </div>
        )}
        </>
        )}
      </CardContent>
    </Card>
  );
}
