import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  Star,
  Sparkles,
  ExternalLink,
  Plus,
  Globe,
  ShoppingBag,
  MessageCircle,
  Loader2,
  Copy,
  Pencil,
  Trash2,
  AlertTriangle,
} from "lucide-react";

import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

type Source = "google" | "ifood" | "nutri";
type Status = "novo" | "respondido" | "ignorado";

interface Review {
  id: string;
  source: Source;
  external_url: string | null;
  rating: number | null;
  title: string | null;
  comment: string | null;
  customer_name: string | null;
  previous_orders: number | null;
  order_description: string | null;
  order_number: string | null;
  brand_id: string | null;
  store_id: string | null;
  status: Status;
  published_at: string | null;
  ai_suggestion: string | null;
  reply_text: string | null;
  replied_at: string | null;
  created_at: string;
}
interface Brand { id: string; name: string }
interface Store { id: string; name: string }

const SOURCE_META: Record<Source, { label: string; icon: any; color: string }> = {
  google: { label: "Google", icon: Globe, color: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  ifood: { label: "iFood", icon: ShoppingBag, color: "bg-red-500/10 text-red-700 dark:text-red-300" },
  nutri: { label: "Nutri", icon: MessageCircle, color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
};


function Stars({ n }: { n: number | null }) {
  const value = n ?? 0;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <div key={i} className="relative h-3.5 w-3.5">
            <Star className="absolute inset-0 h-3.5 w-3.5 text-muted-foreground/30" />
            {fill > 0 && (
              <div className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
              </div>
            )}
          </div>
        );
      })}
      {n != null && !Number.isInteger(n) && (
        <span className="ml-1 text-[10px] text-muted-foreground">{n.toFixed(1).replace(".", ",")}</span>
      )}
    </div>
  );
}

export default function CustomerReviews({ embedded = false }: { embedded?: boolean } = {}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Status | "todos">("novo");
  const [filterSource, setFilterSource] = useState<Source | "all">("all");
  const [filterBrand, setFilterBrand] = useState<string>("all");
  const [filterStore, setFilterStore] = useState<string>("all");

  const [openNew, setOpenNew] = useState(false);
  const [editing, setEditing] = useState<Review | null>(null);
  const [openReply, setOpenReply] = useState<Review | null>(null);

  const [syncingGoogle, setSyncingGoogle] = useState(false);
  const [nutriVisits, setNutriVisits] = useState<Array<{ store_id: string; nutritionist_rating: number }>>([]);

  async function load() {
    setLoading(true);
    const ALLOWED_STORES = ["ASA SUL", "114 NORTE", "ASA NORTE", "AGUAS CLARAS", "ÁGUAS CLARAS", "LAGO SUL", "CD", "CD"];
    const ALLOWED_BRANDS = ["AQUELA PARME", "AQUELA PARMÊ", "AQUELE ESTROGONOFE", "AQUELE ESTROGONOFÊ", "BOX CAIPIRA"];
    const [r, b, s, g] = await Promise.all([
      supabase.from("customer_reviews").select("*").order("published_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(500),
      supabase.from("brands").select("id,name").order("name"),
      supabase.from("stores").select("id,name").eq("is_virtual", false).order("name"),
      supabase.from("store_brand_google").select("store_id,brand_id,avg_rating,total_ratings"),
    ]);
    const nv = await supabase
      .from("nutri_visit_reports")
      .select("store_id,nutritionist_rating")
      .not("nutritionist_rating", "is", null);
    setNutriVisits(
      ((nv.data ?? []) as Array<{ store_id: string; nutritionist_rating: number | null }>)
        .filter((x) => x.store_id && x.nutritionist_rating != null)
        .map((x) => ({ store_id: x.store_id, nutritionist_rating: Number(x.nutritionist_rating) }))
    );
    if (r.data) setReviews(r.data as Review[]);
    if (b.data) setBrands((b.data as Brand[]).filter((x) => ALLOWED_BRANDS.includes(x.name.trim().toUpperCase())));
    if (s.data) setStores((s.data as Store[]).filter((x) => ALLOWED_STORES.includes(x.name.trim().toUpperCase())));
    // Hidrata notas do Google (por loja × marca) a partir do sync automático.
    if (g.data && g.data.length > 0) {
      const merged: Record<string, ManualEntry> = { ...googleByStore };
      for (const row of g.data as Array<{ store_id: string; brand_id: string; avg_rating: number | null; total_ratings: number | null }>) {
        if (row.avg_rating == null) continue;
        merged[`${row.store_id}::${row.brand_id}`] = {
          avg: Number(row.avg_rating),
          count: Number(row.total_ratings ?? 0),
        };
      }
      setGoogleByStore(merged);
      localStorage.setItem(GOOGLE_STORES_KEY, JSON.stringify(merged));
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function syncGoogleNow() {
    setSyncingGoogle(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-reviews-sync", { body: { action: "sync" } });
      if (error) throw error;
      const ok = (data?.results ?? []).filter((r: any) => r.status === "ok").length;
      toast({ title: "Google sincronizado", description: `${ok} combinações loja×marca atualizadas.` });
      await load();
    } catch (err: any) {
      toast({ title: "Falha na sincronização", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setSyncingGoogle(false);
    }
  }

  const filtered = useMemo(() => {
    return reviews.filter((r) => {
      if (tab !== "todos" && r.status !== tab) return false;
      if (filterSource !== "all" && r.source !== filterSource) return false;
      if (filterBrand !== "all" && r.brand_id !== filterBrand) return false;
      if (filterStore !== "all" && r.store_id !== filterStore) return false;
      return true;
    });
  }, [reviews, tab, filterSource, filterBrand, filterStore]);

  const perSource = useMemo(() => {
    const sources: Source[] = ["google", "ifood", "nutri"];
    return sources.map((src) => {
      const rows = reviews.filter((r) => r.source === src);
      const ratings =
        src === "nutri"
          ? [...rows.filter((r) => r.rating).map((r) => r.rating as number), ...nutriVisits.map((v) => v.nutritionist_rating)]
          : rows.filter((r) => r.rating).map((r) => r.rating as number);
      const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
      const novos = rows.filter((r) => r.status === "novo").length;
      const total = src === "nutri" ? rows.length + nutriVisits.length : rows.length;
      return { source: src, total, novos, avg, hasRatings: ratings.length > 0 };
    });
  }, [reviews, nutriVisits]);

  // Métricas de recorrência (qtde de pedidos do cliente informada nas avaliações)
  const loyalty = useMemo(() => {
    const withData = reviews.filter((r) => r.previous_orders != null);
    const total = withData.length;
    const novos = withData.filter((r) => (r.previous_orders as number) <= 1).length;
    const recorrentes = withData.filter((r) => (r.previous_orders as number) >= 2 && (r.previous_orders as number) <= 5).length;
    const fieis = withData.filter((r) => (r.previous_orders as number) >= 6).length;
    const media = total ? withData.reduce((a, r) => a + (r.previous_orders as number), 0) / total : 0;
    const avgOf = (rows: Review[]) => {
      const rt = rows.filter((r) => r.rating != null).map((r) => r.rating as number);
      return rt.length ? rt.reduce((a, b) => a + b, 0) / rt.length : null;
    };
    const buckets = [
      { key: "1", label: "1 pedido", rows: withData.filter((r) => (r.previous_orders as number) <= 1) },
      { key: "2-5", label: "2 a 5 pedidos", rows: withData.filter((r) => (r.previous_orders as number) >= 2 && (r.previous_orders as number) <= 5) },
      { key: "6-10", label: "6 a 10 pedidos", rows: withData.filter((r) => (r.previous_orders as number) >= 6 && (r.previous_orders as number) <= 10) },
      { key: "11+", label: "11+ pedidos", rows: withData.filter((r) => (r.previous_orders as number) >= 11) },
    ].map((b) => ({ label: b.label, count: b.rows.length, avg: avgOf(b.rows) }));
    return { total, novos, recorrentes, fieis, media, buckets };
  }, [reviews]);



  // Média manual do iFood por loja+marca (CD não vende no iFood)
  const IFOOD_STORES_KEY = "crm.ifood.manual_by_store_brand";
  // Média manual do Google por loja+marca (CD não tem Google público)
  const GOOGLE_STORES_KEY = "crm.google.manual_by_store_brand";
  type ManualEntry = { avg: number; count: number };
  type IfoodEntry = ManualEntry;
  // key = `${storeId}::${brandId}`
  const [ifoodByStore, setIfoodByStore] = useState<Record<string, IfoodEntry>>(() => {
    try { return JSON.parse(localStorage.getItem(IFOOD_STORES_KEY) || "{}"); } catch { return {}; }
  });
  const [googleByStore, setGoogleByStore] = useState<Record<string, ManualEntry>>(() => {
    try { return JSON.parse(localStorage.getItem(GOOGLE_STORES_KEY) || "{}"); } catch { return {}; }
  });
  const [openIfoodDialog, setOpenIfoodDialog] = useState(false);
  const [openGoogleDialog, setOpenGoogleDialog] = useState(false);
  // Rascunhos editados no modal — só vão para o banco ao clicar em "Salvar"
  const [ifoodDraft, setIfoodDraft] = useState<Record<string, IfoodEntry>>({});
  const [googleDraft, setGoogleDraft] = useState<Record<string, ManualEntry>>({});
  const [savingManual, setSavingManual] = useState(false);
  useEffect(() => { if (openIfoodDialog) setIfoodDraft({ ...ifoodByStore }); }, [openIfoodDialog]);
  useEffect(() => { if (openGoogleDialog) setGoogleDraft({ ...googleByStore }); }, [openGoogleDialog]);

  // Apenas pontos de venda: CD / Fábrica / Estoque Central não vendem no iFood
  const ifoodStores = useMemo(
    () => stores.filter((s) => !/f[aá]brica|estoque\s*central|^\s*cd\s*$|centro\s*de\s*distribui/i.test(s.name)),
    [stores]
  );
  const googleStores = ifoodStores;

  // Lembrete: atualizar as notas do iFood toda terça-feira às 10h
  const IFOOD_LAST_UPDATE_KEY = "crm.ifood.last_manual_update";
  const [ifoodLastUpdate, setIfoodLastUpdate] = useState<number | null>(() => {
    const v = Number(localStorage.getItem(IFOOD_LAST_UPDATE_KEY));
    return v > 0 ? v : null;
  });
  const ifoodReminderDue = useMemo(() => {
    const now = new Date();
    // última terça-feira 10h (ou a desta semana, se já passou)
    const due = new Date(now);
    const diff = (now.getDay() - 2 + 7) % 7;
    due.setDate(now.getDate() - diff);
    due.setHours(10, 0, 0, 0);
    if (due.getTime() > now.getTime()) due.setDate(due.getDate() - 7);
    return !ifoodLastUpdate || ifoodLastUpdate < due.getTime();
  }, [ifoodLastUpdate]);

  // Agrega só pontos de venda (CD / Fábrica / Estoque Central ficam de fora)
  const salesStoreIds = useMemo(() => new Set(ifoodStores.map((s) => s.id)), [ifoodStores]);
  const aggregateByStoreMap = (map: Record<string, ManualEntry>) => {
    const entries = Object.entries(map)
      .filter(([k, e]) => e && e.count > 0 && e.avg > 0 && salesStoreIds.has(k.split("::")[0]))
      .map(([, e]) => e);
    const totalCount = entries.reduce((s, e) => s + Number(e.count || 0), 0);
    const weighted = entries.reduce((s, e) => s + Number(e.avg) * Number(e.count), 0);
    const avg = totalCount > 0 ? weighted / totalCount : 0;
    return { avg, totalCount, hasData: totalCount > 0 };
  };
  const ifoodAggregate = useMemo(() => aggregateByStoreMap(ifoodByStore), [ifoodByStore, salesStoreIds]);
  const googleAggregate = useMemo(() => aggregateByStoreMap(googleByStore), [googleByStore, salesStoreIds]);

  // Alerta: nota do iFood abaixo de 4,7 = atenção
  const IFOOD_MIN_OK = 4.7;
  const isLowRating = (avg?: number) => typeof avg === "number" && avg > 0 && avg < IFOOD_MIN_OK;
  const ifoodAlerts = useMemo(() => {
    const out: { key: string; store: string; brand: string; avg: number; count: number }[] = [];
    Object.entries(ifoodByStore).forEach(([key, e]) => {
      if (!e || !isLowRating(Number(e.avg))) return;
      const [sid, bid] = key.split("::");
      if (!salesStoreIds.has(sid)) return;
      const store = ifoodStores.find((s) => s.id === sid)?.name;
      const brand = brands.find((b) => b.id === bid)?.name;
      if (!store || !brand) return;
      out.push({ key, store, brand, avg: Number(e.avg), count: Number(e.count || 0) });
    });
    return out.sort((a, b) => a.avg - b.avg);
  }, [ifoodByStore, salesStoreIds, ifoodStores, brands]);




  const storeAggregate = (storeId: string, map: Record<string, ManualEntry> = ifoodByStore) => {
    const entries = brands
      .map((b) => map[`${storeId}::${b.id}`])
      .filter((e) => e && e.count > 0 && e.avg > 0);
    const totalCount = entries.reduce((s, e) => s + Number(e.count || 0), 0);
    const weighted = entries.reduce((s, e) => s + Number(e.avg) * Number(e.count), 0);
    return { avg: totalCount > 0 ? weighted / totalCount : 0, totalCount };
  };

  // Histórico semanal das médias manuais — persistido no banco (review_manual_ratings)
  // Snapshot por semana ISO: { weekKey, ifood: {`store::brand`: {avg,count}}, google: {...} }
  type SnapMap = Record<string, ManualEntry>;
  type WeekSnap = { weekKey: string; ifood: SnapMap; google: SnapMap };
  const [history, setHistory] = useState<WeekSnap[]>([]);
  const getWeekKey = (d = new Date()) => {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  };

  async function loadHistory() {
    const { data } = await supabase
      .from("review_manual_ratings")
      .select("source,store_id,brand_id,week_key,avg,count,updated_at")
      .order("week_key", { ascending: true });
    const byWeek = new Map<string, WeekSnap>();
    let lastIfoodUpdate = 0;
    ((data ?? []) as Array<{ source: string; store_id: string; brand_id: string | null; week_key: string; avg: number | null; count: number | null; updated_at?: string | null }>).forEach((row) => {
      if (!byWeek.has(row.week_key)) byWeek.set(row.week_key, { weekKey: row.week_key, ifood: {}, google: {} });
      const snap = byWeek.get(row.week_key)!;
      const key = `${row.store_id}::${row.brand_id ?? ""}`;
      const entry = { avg: Number(row.avg ?? 0), count: Number(row.count ?? 0) };
      if (entry.avg > 0) (row.source === "ifood" ? snap.ifood : snap.google)[key] = entry;
      if (row.source === "ifood" && row.updated_at) {
        const t = new Date(row.updated_at).getTime();
        if (t > lastIfoodUpdate) lastIfoodUpdate = t;
      }
    });
    if (lastIfoodUpdate > 0) {
      setIfoodLastUpdate((prev) => (prev && prev > lastIfoodUpdate ? prev : lastIfoodUpdate));
      try { localStorage.setItem(IFOOD_LAST_UPDATE_KEY, String(lastIfoodUpdate)); } catch { /* ignore */ }
    }

    const list = [...byWeek.values()].sort((a, b) => a.weekKey.localeCompare(b.weekKey));
    setHistory(list);
    // Hidrata os valores atuais a partir do banco (compartilhado entre usuários),
    // usando o valor mais recente de cada loja::marca em cada canal.
    const latest: { ifood: SnapMap; google: SnapMap } = { ifood: {}, google: {} };
    list.forEach((snap) => {
      Object.entries(snap.ifood).forEach(([k, v]) => { latest.ifood[k] = v; });
      Object.entries(snap.google).forEach(([k, v]) => { latest.google[k] = v; });
    });
    if (Object.keys(latest.ifood).length) {
      setIfoodByStore((prev) => {
        const merged = { ...prev, ...latest.ifood };
        localStorage.setItem(IFOOD_STORES_KEY, JSON.stringify(merged));
        return merged;
      });
    }
    if (Object.keys(latest.google).length) {
      setGoogleByStore((prev) => {
        const merged = { ...prev, ...latest.google };
        localStorage.setItem(GOOGLE_STORES_KEY, JSON.stringify(merged));
        return merged;
      });
    }
    return list;
  }
  useEffect(() => { loadHistory(); }, []);

  // Se existirem notas manuais só no navegador (antes da persistência no banco),
  // sobe para o banco na primeira carga para todos passarem a enxergar.
  const migratedLocalRef = useRef(false);
  useEffect(() => {
    if (migratedLocalRef.current) return;
    const hasLocal = Object.keys(ifoodByStore).length > 0 || Object.keys(googleByStore).length > 0;
    if (!hasLocal) return;
    migratedLocalRef.current = true;
    (async () => {
      if (Object.keys(ifoodByStore).length) await persistHistory("ifood", ifoodByStore);
      if (Object.keys(googleByStore).length) await persistHistory("google", googleByStore);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const persistHistory = async (source: "ifood" | "google", map: Record<string, ManualEntry>) => {
    const weekKey = getWeekKey();
    const { data: auth } = await supabase.auth.getUser();
    const rows = Object.entries(map)
      .filter(([, v]) => v && Number(v.avg) > 0)
      .map(([k, v]) => {
        const [store_id, brand_id] = k.split("::");
        return {
          source,
          store_id,
          brand_id: brand_id || null,
          week_key: weekKey,
          avg: Number(Number(v.avg).toFixed(2)),
          count: Number(v.count || 0),
          updated_by: auth?.user?.id ?? null,
        };
      });
    if (rows.length === 0) return true;
    const { error } = await supabase
      .from("review_manual_ratings")
      .upsert(rows, { onConflict: "source,store_id,brand_id,week_key" });
    if (error) {
      toast({ title: "Não foi possível salvar", description: error.message, variant: "destructive" });
      return false;
    }
    await loadHistory();
    return true;
  };

  const previousAvg = (source: "ifood" | "google", key: string): number | null => {
    // Última semana anterior à corrente que tenha valor
    const wk = getWeekKey();
    for (let i = history.length - 1; i >= 0; i--) {
      const s = history[i];
      if (s.weekKey >= wk) continue;
      const v = s[source]?.[key]?.avg;
      if (typeof v === "number" && v > 0) return v;
    }
    return null;
  };

  const saveIfoodStores = async (next: Record<string, IfoodEntry>) => {
    setSavingManual(true);
    setIfoodByStore(next);
    localStorage.setItem(IFOOD_STORES_KEY, JSON.stringify(next));
    const now = Date.now();
    localStorage.setItem(IFOOD_LAST_UPDATE_KEY, String(now));
    setIfoodLastUpdate(now);
    const ok = await persistHistory("ifood", next);
    setSavingManual(false);
    if (ok) {
      toast({ title: "Notas do iFood salvas", description: "Histórico da semana atualizado." });
      setOpenIfoodDialog(false);
    }
  };
  const saveGoogleStores = async (next: Record<string, ManualEntry>) => {
    setSavingManual(true);
    setGoogleByStore(next);
    localStorage.setItem(GOOGLE_STORES_KEY, JSON.stringify(next));
    const ok = await persistHistory("google", next);
    setSavingManual(false);
    if (ok) {
      toast({ title: "Notas do Google salvas", description: "Histórico da semana atualizado." });
      setOpenGoogleDialog(false);
    }
  };





  return (
    <div className={embedded ? "space-y-6" : "space-y-6 p-3 sm:p-4"}>
      {!embedded && (
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Star className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            Avaliações de clientes
          </h1>
          <p className="text-muted-foreground">Resenhas recebidas dos canais de venda — responda e acompanhe a média.</p>
        </div>
      )}

      <Tabs defaultValue="graficos" className="w-full">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="graficos">Visão geral</TabsTrigger>
          <TabsTrigger value="comentarios">Comentários</TabsTrigger>
        </TabsList>

        <TabsContent value="graficos" className="space-y-6 mt-4">
      {ifoodReminderDue && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
          <div className="text-xs sm:text-sm flex-1">
            <b>Atualização semanal pendente:</b> as notas do iFood devem ser atualizadas toda terça-feira às 10h.
            {ifoodLastUpdate && (
              <span className="text-muted-foreground"> Última atualização: {format(new Date(ifoodLastUpdate), "dd/MM/yyyy HH:mm", { locale: ptBR })}.</span>
            )}
          </div>
          <Button size="sm" onClick={() => setOpenIfoodDialog(true)}>Atualizar agora</Button>
        </div>
      )}
      {ifoodAlerts.length > 0 && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <div className="text-xs sm:text-sm font-semibold text-destructive">
              Atenção: {ifoodAlerts.length} {ifoodAlerts.length === 1 ? "loja/marca está" : "lojas/marcas estão"} abaixo de 4,7 no iFood
            </div>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => setOpenIfoodDialog(true)}>
              Ver notas
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ifoodAlerts.map((a) => (
              <Badge key={a.key} variant="destructive" className="text-[11px] font-medium">
                {a.store} · {a.brand} — {a.avg.toFixed(1)} ★ ({a.count})
              </Badge>
            ))}
          </div>
        </div>
      )}
      {/* Cards por fonte */}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        {perSource.map(({ source, total, novos, avg, hasRatings }) => {
          const meta = SOURCE_META[source];
          const Icon = meta.icon;
          const isIfood = source === "ifood";
          const isGoogle = source === "google";
          const isManual = isIfood || isGoogle;
          const manualAgg = isIfood ? ifoodAggregate : isGoogle ? googleAggregate : null;
          const displayAvg = manualAgg ? manualAgg.avg : avg;
          const displayHasAvg = manualAgg ? manualAgg.hasData : hasRatings;
          const displayCount = manualAgg ? manualAgg.totalCount : total;
          const cardLow = isIfood && (isLowRating(displayAvg) || ifoodAlerts.length > 0);
          return (
            <Card key={source} className={cardLow ? "border-destructive/60 bg-destructive/5" : undefined}>
              <CardContent className="p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" />
                    {meta.label}
                  </div>
                  {isManual && (
                    <div className="flex items-center gap-2">
                      {isGoogle && (
                        <button
                          type="button"
                          onClick={syncGoogleNow}
                          disabled={syncingGoogle}
                          className="text-[10px] text-primary hover:underline disabled:opacity-50"
                        >
                          {syncingGoogle ? "sincronizando…" : "sincronizar"}
                        </button>
                      )}
                      {isIfood && (
                        <button
                          type="button"
                          onClick={() => setOpenIfoodDialog(true)}
                          className="text-[10px] text-primary hover:underline"
                        >
                          editar por loja
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className={`text-lg font-semibold flex items-center gap-1 ${isIfood && isLowRating(displayAvg) ? "text-destructive" : ""}`}>
                  {displayHasAvg ? displayAvg.toFixed(1) : "—"}
                  {displayHasAvg && <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />}
                  {cardLow && <AlertTriangle className="h-4 w-4 text-destructive" />}
                </div>

                <div className="text-[10px] text-muted-foreground">
                  {isManual
                    ? `${displayCount} avaliações · ${isGoogle ? "sincronizado por loja/marca" : "manual por loja/marca"}`
                    : `${total} ${total === 1 ? "avaliação" : "avaliações"}${novos ? ` · ${novos} novas` : ""}`}
                </div>

              </CardContent>
            </Card>
          );
        })}

      </div>

      {/* Recorrência do cliente */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recorrência dos clientes avaliadores</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loyalty.total === 0 ? (
            <p className="text-sm text-muted-foreground">
              Informe o campo “Qtde de pedidos do cliente” ao cadastrar avaliações para gerar estas métricas.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
                <div className="rounded-lg border p-3">
                  <div className="text-[10px] text-muted-foreground">Média de pedidos por cliente</div>
                  <div className="text-lg font-semibold">{loyalty.media.toFixed(1)}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-[10px] text-muted-foreground">Clientes de 1º pedido (1)</div>
                  <div className="text-lg font-semibold">
                    {loyalty.novos}
                    <span className="text-xs text-muted-foreground ml-1">
                      ({Math.round((loyalty.novos / loyalty.total) * 100)}%)
                    </span>
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-[10px] text-muted-foreground">Recorrentes (2–5)</div>
                  <div className="text-lg font-semibold">
                    {loyalty.recorrentes}
                    <span className="text-xs text-muted-foreground ml-1">
                      ({Math.round((loyalty.recorrentes / loyalty.total) * 100)}%)
                    </span>
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-[10px] text-muted-foreground">Fiéis (6+)</div>
                  <div className="text-lg font-semibold">
                    {loyalty.fieis}
                    <span className="text-xs text-muted-foreground ml-1">
                      ({Math.round((loyalty.fieis / loyalty.total) * 100)}%)
                    </span>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                {loyalty.buckets.map((b) => (
                  <div key={b.label} className="flex items-center gap-2 text-xs">
                    <span className="w-24 shrink-0 text-muted-foreground">{b.label}</span>
                    <div className="flex-1 h-2 rounded bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${loyalty.total ? (b.count / loyalty.total) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="w-8 text-right">{b.count}</span>
                    <span className="w-16 text-right text-muted-foreground">
                      {b.avg != null ? `${b.avg.toFixed(1)} ★` : "—"}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Base: {loyalty.total} avaliações com pedidos anteriores informados. “★” = nota média do grupo.
              </p>
            </>
          )}
        </CardContent>
      </Card>


      {/* Dialog iFood por loja */}
      <Dialog open={openIfoodDialog} onOpenChange={setOpenIfoodDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-primary" />
              Avaliações iFood por loja
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Como o iFood não libera as notas via API, informe manualmente a média (0–5) e o nº de avaliações de cada loja. A média geral do card é ponderada pelo nº de avaliações.
          </p>
          <div className="max-h-[55vh] overflow-y-auto pr-1">
            <Accordion type="multiple" className="w-full">
              {ifoodStores.map((s) => {
                const agg = storeAggregate(s.id, ifoodDraft);
                return (
                  <AccordionItem key={s.id} value={s.id}>
                    <AccordionTrigger className="py-2 hover:no-underline">
                      <div className="flex items-center justify-between w-full pr-2">
                        <span className="text-sm font-medium flex items-center gap-1.5">
                          {s.name}
                          {isLowRating(agg.avg) && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                        </span>
                        <span className={`text-xs flex items-center gap-1 ${isLowRating(agg.avg) ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                          {agg.totalCount > 0 ? (
                            <>
                              {agg.avg.toFixed(1)}
                              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                              <span>· {agg.totalCount}</span>
                            </>
                          ) : "—"}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-2 pt-1">
                      {brands.map((b) => {
                        const key = `${s.id}::${b.id}`;
                        const entry = ifoodDraft[key] || { avg: 0, count: 0 };
                        const low = isLowRating(Number(entry.avg));
                        return (
                          <div key={b.id} className={`grid grid-cols-[1fr_90px_110px] items-center gap-2 border rounded-md p-2 ${low ? "border-destructive/60 bg-destructive/10" : ""}`}>
                            <div className="text-xs font-medium truncate flex items-center gap-1.5">
                              {b.name}
                              {low && <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                            </div>
                            <Input
                              type="number" step="0.1" min="0" max="5"
                              placeholder="Média"
                              value={entry.avg || ""}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value.replace(",", ".")) || 0;
                                setIfoodDraft((d) => ({ ...d, [key]: { ...entry, avg: v } }));
                              }}
                              className={`h-8 text-sm ${low ? "border-destructive text-destructive font-semibold" : ""}`}
                            />

                            <Input
                              type="number" min="0"
                              placeholder="Nº aval."
                              value={entry.count || ""}
                              onChange={(e) => {
                                const v = parseInt(e.target.value, 10) || 0;
                                setIfoodDraft((d) => ({ ...d, [key]: { ...entry, count: v } }));
                              }}
                              className="h-8 text-sm"
                            />
                          </div>
                        );
                      })}
                      {brands.length === 0 && (
                        <div className="text-xs text-muted-foreground text-center py-2">Nenhuma marca cadastrada.</div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
            {ifoodStores.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-6">Nenhuma loja disponível.</div>
            )}
          </div>
          <DialogFooter>
            <div className="text-xs text-muted-foreground mr-auto">
              Média ponderada: <b>{ifoodAggregate.hasData ? ifoodAggregate.avg.toFixed(2) : "—"}</b> em {ifoodAggregate.totalCount} avaliações
            </div>
            <Button variant="ghost" onClick={() => setOpenIfoodDialog(false)} disabled={savingManual}>Cancelar</Button>
            <Button onClick={() => saveIfoodStores(ifoodDraft)} disabled={savingManual}>
              {savingManual ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Dialog Google por loja/marca */}
      <Dialog open={openGoogleDialog} onOpenChange={setOpenGoogleDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              Avaliações Google por loja
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Informe manualmente a média (0–5) e o nº de avaliações do Google de cada marca dentro de cada loja. A média geral do card é ponderada.
          </p>
          <div className="max-h-[55vh] overflow-y-auto pr-1">
            <Accordion type="multiple" className="w-full">
              {googleStores.map((s) => {
                const agg = storeAggregate(s.id, googleDraft);
                return (
                  <AccordionItem key={s.id} value={s.id}>
                    <AccordionTrigger className="py-2 hover:no-underline">
                      <div className="flex items-center justify-between w-full pr-2">
                        <span className="text-sm font-medium">{s.name}</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          {agg.totalCount > 0 ? (
                            <>
                              {agg.avg.toFixed(1)}
                              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                              <span>· {agg.totalCount}</span>
                            </>
                          ) : "—"}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-2 pt-1">
                      {brands.map((b) => {
                        const key = `${s.id}::${b.id}`;
                        const entry = googleDraft[key] || { avg: 0, count: 0 };
                        return (
                          <div key={b.id} className="grid grid-cols-[1fr_90px_110px] items-center gap-2 border rounded-md p-2">
                            <div className="text-xs font-medium truncate">{b.name}</div>
                            <Input
                              type="number" step="0.1" min="0" max="5"
                              placeholder="Média"
                              value={entry.avg || ""}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value.replace(",", ".")) || 0;
                                setGoogleDraft((d) => ({ ...d, [key]: { ...entry, avg: v } }));
                              }}
                              className="h-8 text-sm"
                            />
                            <Input
                              type="number" min="0"
                              placeholder="Nº aval."
                              value={entry.count || ""}
                              onChange={(e) => {
                                const v = parseInt(e.target.value, 10) || 0;
                                setGoogleDraft((d) => ({ ...d, [key]: { ...entry, count: v } }));
                              }}
                              className="h-8 text-sm"
                            />
                          </div>
                        );
                      })}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>
          <DialogFooter>
            <div className="text-xs text-muted-foreground mr-auto">
              Média ponderada: <b>{googleAggregate.hasData ? googleAggregate.avg.toFixed(2) : "—"}</b> em {googleAggregate.totalCount} avaliações
            </div>
            <Button variant="ghost" onClick={() => setOpenGoogleDialog(false)} disabled={savingManual}>Cancelar</Button>
            <Button onClick={() => saveGoogleStores(googleDraft)} disabled={savingManual}>
              {savingManual ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

        {/* Gráficos consolidados */}
          {(() => {
            const parme = brands.find((b) => /parm/i.test(b.name));
            const box = brands.find((b) => /box/i.test(b.name));
            const estro = brands.find((b) => /estrog/i.test(b.name));
            const isFabrica = (name: string) => /f[aá]brica|\bcd\b/i.test(name);
            const nonFabrica = stores.filter((s) => !isFabrica(s.name));
            const brandCols = [
              { id: parme?.id, key: "P", label: "Aquela Parmê", color: "hsl(0 72% 51%)" },
              { id: box?.id, key: "B", label: "Box Caipira", color: "hsl(24 90% 55%)" },
              { id: estro?.id, key: "E", label: "Aquele Estrogonofê", color: "hsl(20 40% 35%)" },
            ];

            const buildData = (map: Record<string, ManualEntry>) =>
              nonFabrica.map((s) => {
                const row: any = { loja: s.name.replace(/^loja\s+/i, "") };
                brandCols.forEach((c) => {
                  if (!c.id) return;
                  const e = map[`${s.id}::${c.id}`];
                  row[c.key] = e && e.avg > 0 ? Number(e.avg.toFixed(2)) : null;
                });
                return row;
              });

            const ifoodData = buildData(ifoodByStore);
            const googleData = buildData(googleByStore);

            const nutriData = stores.map((s) => {
              const vals = [
                ...reviews.filter((r) => r.source === "nutri" && r.store_id === s.id && r.rating != null).map((r) => r.rating as number),
                ...nutriVisits.filter((v) => v.store_id === s.id).map((v) => v.nutritionist_rating),
              ];
              const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
              return { loja: s.name.replace(/^loja\s+/i, ""), N: avg > 0 ? Number(avg.toFixed(2)) : null };
            });

            // Evolução semanal (média ponderada global) — histórico do banco
            const wAvgSnap = (snap: SnapMap, filter?: (key: string) => boolean) => {
              let sum = 0, n = 0;
              Object.entries(snap).forEach(([k, v]) => {
                if (filter && !filter(k)) return;
                const c = Number(v.count) || 1;
                sum += Number(v.avg) * c; n += c;
              });
              return n ? Number((sum / n).toFixed(2)) : null;
            };
            const weeklyPoints = history.map((h) => ({
              semana: h.weekKey.replace(/^\d{4}-/, ""),
              iFood: wAvgSnap(h.ifood),
              Google: wAvgSnap(h.google),
            }));

            // Comparativo semana atual × semana anterior, por loja e por marca
            const lastTwo = history.slice(-2);
            const curSnap = lastTwo[lastTwo.length - 1];
            const prevSnap = lastTwo.length > 1 ? lastTwo[0] : null;
            const deltaRows: Array<{ label: string; ifood: number | null; ifoodPrev: number | null; google: number | null; googlePrev: number | null }> = [];
            if (curSnap) {
              nonFabrica.forEach((s) => {
                const f = (k: string) => k.startsWith(`${s.id}::`);
                deltaRows.push({
                  label: s.name.replace(/^loja\s+/i, ""),
                  ifood: wAvgSnap(curSnap.ifood, f),
                  ifoodPrev: prevSnap ? wAvgSnap(prevSnap.ifood, f) : null,
                  google: wAvgSnap(curSnap.google, f),
                  googlePrev: prevSnap ? wAvgSnap(prevSnap.google, f) : null,
                });
              });
              brandCols.forEach((c) => {
                if (!c.id) return;
                const f = (k: string) => k.endsWith(`::${c.id}`);
                deltaRows.push({
                  label: c.label,
                  ifood: wAvgSnap(curSnap.ifood, f),
                  ifoodPrev: prevSnap ? wAvgSnap(prevSnap.ifood, f) : null,
                  google: wAvgSnap(curSnap.google, f),
                  googlePrev: prevSnap ? wAvgSnap(prevSnap.google, f) : null,
                });
              });
            }
            const Delta = ({ cur, prev }: { cur: number | null; prev: number | null }) => {
              if (cur == null) return <span className="text-muted-foreground">—</span>;
              if (prev == null) return <span>{cur.toFixed(2)}</span>;
              const d = cur - prev;
              const cls = d > 0.004 ? "text-success" : d < -0.004 ? "text-destructive" : "text-muted-foreground";
              const sign = d > 0.004 ? "▲" : d < -0.004 ? "▼" : "=";
              return (
                <span className="inline-flex items-center gap-1">
                  {cur.toFixed(2)}
                  <span className={`text-[10px] ${cls}`}>{sign} {Math.abs(d).toFixed(2)}</span>
                </span>
              );
            };


            const ChartCard = ({ title, data, source }: { title: string; data: any[]; source: "brand" | "nutri" }) => (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{title}</CardTitle>
                </CardHeader>
                <CardContent className="p-2 sm:p-3">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="loja" tick={{ fontSize: 11 }} interval={0} />
                      <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
                      <ReTooltip contentStyle={{ fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {source === "brand"
                        ? brandCols.map((c) => (
                            <Bar key={c.key} dataKey={c.key} name={`${c.key} — ${c.label}`} fill={c.color} radius={[4, 4, 0, 0]} />
                          ))
                        : <Bar dataKey="N" name="N — Nutricionista" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />}
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            );

            return (
              <>
                <div className="text-[11px] text-muted-foreground">
                  Legenda: <b>P</b>=Aquela Parmê · <b>B</b>=Box Caipira · <b>E</b>=Aquele Estrogonofê · <b>N</b>=Nutricionista · <b>G</b>=Google
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <ChartCard title="iFood — média por loja e marca" data={ifoodData} source="brand" />
                  <ChartCard title="Google — média por loja e marca" data={googleData} source="brand" />
                  <ChartCard title="Nutricionista — média por loja" data={nutriData} source="nutri" />
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Evolução semanal (média ponderada)</CardTitle>
                    </CardHeader>
                    <CardContent className="p-2 sm:p-3">
                      {weeklyPoints.length < 2 ? (
                        <div className="text-xs text-muted-foreground text-center py-10">
                          Ainda sem histórico suficiente. As médias são armazenadas semanalmente à medida que você edita as notas.
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height={260}>
                          <LineChart data={weeklyPoints} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                            <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                            <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
                            <ReTooltip contentStyle={{ fontSize: 12 }} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Line type="monotone" dataKey="iFood" stroke="hsl(0 72% 51%)" strokeWidth={2} dot={{ r: 3 }} />
                            <Line type="monotone" dataKey="Google" stroke="hsl(217 91% 60%)" strokeWidth={2} dot={{ r: 3 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>
                  <Card className="lg:col-span-2">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">
                        Comparativo semanal — {curSnap ? curSnap.weekKey : "sem dados"}
                        {prevSnap ? ` vs ${prevSnap.weekKey}` : ""}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-2 sm:p-3">
                      {deltaRows.length === 0 ? (
                        <div className="text-xs text-muted-foreground text-center py-6">
                          Ainda sem histórico. Atualize as notas do iFood/Google para gravar a primeira semana.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-muted-foreground border-b">
                                <th className="text-left py-1.5 pr-2 font-medium">Ponto de venda / Marca</th>
                                <th className="text-right py-1.5 px-2 font-medium">iFood</th>
                                <th className="text-right py-1.5 pl-2 font-medium">Google</th>
                              </tr>
                            </thead>
                            <tbody>
                              {deltaRows.map((r, i) => (
                                <tr key={`${r.label}-${i}`} className="border-b last:border-0">
                                  <td className="py-1.5 pr-2">{r.label}</td>
                                  <td className="py-1.5 px-2 text-right tabular-nums"><Delta cur={r.ifood} prev={r.ifoodPrev} /></td>
                                  <td className="py-1.5 pl-2 text-right tabular-nums"><Delta cur={r.google} prev={r.googlePrev} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {!prevSnap && (
                            <div className="text-[11px] text-muted-foreground pt-2">
                              Primeira semana registrada — as setas de comparação aparecem a partir da próxima atualização.
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

              </>
            );
          })()}
        </TabsContent>

        <TabsContent value="comentarios" className="space-y-6 mt-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full sm:w-auto">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="novo">Novos</TabsTrigger>
            <TabsTrigger value="respondido">Respondidos</TabsTrigger>
            <TabsTrigger value="ignorado">Ignorados</TabsTrigger>
            <TabsTrigger value="todos">Todos</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Select value={filterSource} onValueChange={(v) => setFilterSource(v as any)}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Fonte" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as fontes</SelectItem>
              <SelectItem value="google">Google</SelectItem>
              <SelectItem value="ifood">iFood</SelectItem>
              <SelectItem value="nutri">Nutri</SelectItem>

            </SelectContent>
          </Select>
          <Select value={filterBrand} onValueChange={setFilterBrand}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Marca" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as marcas</SelectItem>
              {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStore} onValueChange={setFilterStore}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Loja" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as lojas</SelectItem>
              {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setOpenNew(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Add comentário
          </Button>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-center text-muted-foreground py-10">Carregando…</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhuma avaliação aqui.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const meta = SOURCE_META[r.source];
            const Icon = meta.icon;
            const brand = brands.find((b) => b.id === r.brand_id)?.name;
            const store = stores.find((s) => s.id === r.store_id)?.name;
            return (
              <Card key={r.id}>
                <CardHeader className="pb-2 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={meta.color} variant="secondary">
                      <Icon className="h-3 w-3 mr-1" /> {meta.label}
                    </Badge>
                    <Stars n={r.rating} />
                    <span className="text-sm font-medium truncate">{r.customer_name ?? "Cliente"}</span>
                    {r.previous_orders != null && (
                      <Badge variant="outline" className="text-[10px]">
                        {(r.previous_orders as number) <= 1
                          ? "1º pedido"
                          : `${r.previous_orders} pedidos`}
                      </Badge>
                    )}
                    {r.order_number && (
                      <Badge variant="outline" className="text-[10px]">
                        Pedido #{r.order_number}
                      </Badge>
                    )}
                    {r.order_description && (
                      <Badge variant="secondary" className="text-[10px] max-w-[240px] truncate">
                        {r.order_description}
                      </Badge>
                    )}
                    {r.status === "respondido" && <Badge variant="default">Respondido</Badge>}
                    {r.status === "ignorado" && <Badge variant="outline">Ignorado</Badge>}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {r.published_at ? format(parseISO(r.published_at), "dd/MM/yy", { locale: ptBR }) : ""}
                    </span>
                  </div>
                  {(brand || store) && (
                    <div className="text-xs text-muted-foreground">
                      {brand}{brand && store ? " · " : ""}{store}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {r.title && <div className="font-medium text-sm">{r.title}</div>}
                  {r.comment && <p className="text-sm whitespace-pre-wrap">{r.comment}</p>}
                  {r.reply_text && (
                    <div className="rounded-md border bg-muted/30 p-2 text-sm">
                      <div className="text-xs text-muted-foreground mb-1">Sua resposta:</div>
                      {r.reply_text}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={async () => {
                        if (!confirm("Excluir esta avaliação?")) return;
                        const { error, count } = await supabase
                          .from("customer_reviews")
                          .delete({ count: "exact" })
                          .eq("id", r.id);
                        if (error) return toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
                        if (!count) return toast({ title: "Não foi possível excluir", description: "Você não tem permissão para excluir esta avaliação.", variant: "destructive" });
                        toast({ title: "Avaliação excluída" });
                        load();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
        </TabsContent>
      </Tabs>


      <NewReviewDialog
        open={openNew || editing !== null}
        onOpenChange={(o) => { if (!o) { setOpenNew(false); setEditing(null); } }}
        brands={brands}
        stores={stores}
        editing={editing}
        onSaved={() => { setOpenNew(false); setEditing(null); load(); }}
      />
      <ReplyDialog
        review={openReply}
        onOpenChange={(o) => { if (!o) setOpenReply(null); }}
        brands={brands}
        stores={stores}
        currentUserId={user?.id ?? null}
        onSaved={() => { setOpenReply(null); load(); }}
      />
    </div>
  );
}

/* ---------- Novo registro manual ---------- */
function NewReviewDialog({
  open, onOpenChange, brands, stores, editing, onSaved,
}: { open: boolean; onOpenChange: (o: boolean) => void; brands: Brand[]; stores: Store[]; editing?: Review | null; onSaved: () => void }) {
  const { toast } = useToast();
  const [source, setSource] = useState<Source>("google");
  const [rating, setRating] = useState<number>(5);
  const [ratingStr, setRatingStr] = useState<string>("5,0");
  const [name, setName] = useState("");
  const [prevOrders, setPrevOrders] = useState<string>("1");
  const [orderDesc, setOrderDesc] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [comment, setComment] = useState("");
  const [url, setUrl] = useState("");
  const [brandId, setBrandId] = useState<string>("none");
  const [storeId, setStoreId] = useState<string>("none");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setSource((editing.source as Source) ?? "google");
      const r = editing.rating ?? 5;
      setRating(r);
      setRatingStr(Number(r).toFixed(1).replace(".", ","));
      setName(editing.customer_name ?? "");
      setPrevOrders(editing.previous_orders != null ? String(editing.previous_orders) : "1");
      setOrderDesc(editing.order_description ?? "");
      setOrderNumber(editing.order_number ?? "");
      setComment(editing.comment ?? "");
      setUrl(editing.external_url ?? "");
      setBrandId(editing.brand_id ?? "none");
      setStoreId(editing.store_id ?? "none");
    } else {
      setSource("google"); setRating(5); setRatingStr("5,0");
      setName(""); setPrevOrders("1"); setOrderDesc(""); setOrderNumber(""); setComment(""); setUrl(""); setBrandId("none"); setStoreId("none");
    }
  }, [open, editing]);

  async function save() {
    if (!comment.trim()) {
      toast({ title: "Escreva o comentário do cliente.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      source, rating, comment, customer_name: name || null, external_url: url || null,
      previous_orders: prevOrders.trim() === "" ? null : Math.max(1, parseInt(prevOrders, 10) || 1),
      order_description: orderDesc.trim() || null,
      order_number: orderNumber.trim() || null,
      brand_id: brandId === "none" ? null : brandId,
      store_id: storeId === "none" ? null : storeId,
    };
    const { error } = editing
      ? await supabase.from("customer_reviews").update(payload).eq("id", editing.id)
      : await supabase.from("customer_reviews").insert({ ...payload, published_at: new Date().toISOString() });
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing ? "Avaliação atualizada" : "Avaliação adicionada" });
    onSaved();
  }


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Editar avaliação" : "Adicionar avaliação"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Fonte</Label>
              <Select value={source} onValueChange={(v) => setSource(v as Source)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="google">Google</SelectItem>
                  <SelectItem value="ifood">iFood</SelectItem>
                  <SelectItem value="nutri">Nutri</SelectItem>

                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nota (1 a 5, aceita 1 casa decimal — ex: 4,6)</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={ratingStr}
                onChange={(e) => {
                  const raw = e.target.value.replace(",", ".");
                  setRatingStr(e.target.value);
                  const n = parseFloat(raw);
                  if (!isNaN(n) && n >= 1 && n <= 5) {
                    setRating(Math.round(n * 10) / 10);
                  }
                }}
                onBlur={() => {
                  const n = parseFloat(ratingStr.replace(",", "."));
                  if (isNaN(n) || n < 1 || n > 5) {
                    setRating(5); setRatingStr("5,0");
                  } else {
                    const clamped = Math.round(n * 10) / 10;
                    setRating(clamped);
                    setRatingStr(clamped.toFixed(1).replace(".", ","));
                  }
                }}
                placeholder="Ex: 4,6"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Cliente</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do cliente" />
            </div>
            <div>
              <Label>Qtde de pedidos do cliente</Label>
              <Input
                type="number"
                min={1}
                inputMode="numeric"
                value={prevOrders}
                onChange={(e) => setPrevOrders(e.target.value)}
                placeholder="Ex: 3"
              />
            </div>
          </div>
          <div>
            <Label>Número do pedido</Label>
            <Input
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="Ex: 4435"
            />
          </div>
          <div>
            <Label>Descrição do pedido</Label>
            <Textarea
              rows={2}
              value={orderDesc}
              onChange={(e) => setOrderDesc(e.target.value)}
              placeholder="Ex: 1 Parmegiana Família + 2 refrigerantes"
            />
          </div>
          <div>
            <Label>Comentário</Label>
            <Textarea rows={4} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Cole o que o cliente escreveu" />
          </div>
          <div>
            <Label>Link da avaliação (opcional)</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Marca</Label>
              <Select value={brandId} onValueChange={setBrandId}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Loja</Label>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Responder ---------- */
function ReplyDialog({
  review, onOpenChange, brands, stores, currentUserId, onSaved,
}: { review: Review | null; onOpenChange: (o: boolean) => void; brands: Brand[]; stores: Store[]; currentUserId: string | null; onSaved: () => void }) {
  const { toast } = useToast();
  const [reply, setReply] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setReply(review?.reply_text ?? review?.ai_suggestion ?? "");
  }, [review?.id]);

  if (!review) return null;
  const meta = SOURCE_META[review.source];
  const brandName = brands.find((b) => b.id === review.brand_id)?.name;
  const storeName = stores.find((s) => s.id === review.store_id)?.name;

  async function suggest() {
    setSuggesting(true);
    const { data, error } = await supabase.functions.invoke("suggest-review-reply", {
      body: {
        rating: review.rating, comment: review.comment, customer_name: review.customer_name,
        brand: brandName, store: storeName, source: meta.label,
      },
    });
    setSuggesting(false);
    if (error || !data?.suggestion) {
      toast({ title: "Erro na sugestão", description: error?.message ?? "Tente novamente.", variant: "destructive" });
      return;
    }
    setReply(data.suggestion);
    await supabase.from("customer_reviews").update({ ai_suggestion: data.suggestion }).eq("id", review.id);
  }

  async function save() {
    if (!reply.trim()) {
      toast({ title: "Escreva uma resposta.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("customer_reviews").update({
      reply_text: reply, status: "respondido",
      replied_by: currentUserId, replied_at: new Date().toISOString(),
    }).eq("id", review.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    onSaved();
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Responder avaliação</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-sm bg-muted/30 space-y-1">
            <div className="flex items-center gap-2">
              <Badge className={meta.color} variant="secondary">{meta.label}</Badge>
              <Stars n={review.rating} />
              <span className="font-medium">{review.customer_name ?? "Cliente"}</span>
            </div>
            {(brandName || storeName) && (
              <div className="text-xs text-muted-foreground">{brandName}{brandName && storeName ? " · " : ""}{storeName}</div>
            )}
            {review.comment && <p className="whitespace-pre-wrap">{review.comment}</p>}
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={suggest} disabled={suggesting}>
              {suggesting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
              Sugerir com IA
            </Button>
            {review.external_url && (
              <Button size="sm" variant="ghost" asChild>
                <a href={review.external_url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir no {meta.label}
                </a>
              </Button>
            )}
          </div>

          <Textarea rows={6} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Sua resposta…" />
          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <span>{reply.length} caracteres</span>
            <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(reply); toast({ title: "Resposta copiada" }); }}>
              <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Salvando…" : "Marcar como respondido"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
