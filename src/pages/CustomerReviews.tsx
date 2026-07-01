import { useEffect, useMemo, useState } from "react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

type Source = "google" | "ifood" | "nutri" | "falae" | "outro";
type Status = "novo" | "respondido" | "ignorado";

interface Review {
  id: string;
  source: Source;
  external_url: string | null;
  rating: number | null;
  title: string | null;
  comment: string | null;
  customer_name: string | null;
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
  falae: { label: "Falaê", icon: MessageCircle, color: "bg-muted text-muted-foreground" },
  outro: { label: "Outro", icon: MessageCircle, color: "bg-muted text-muted-foreground" },
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

  async function load() {
    setLoading(true);
    const ALLOWED_STORES = ["ASA SUL", "ASA NORTE", "AGUAS CLARAS", "ÁGUAS CLARAS", "LAGO SUL", "FABRICA", "FÁBRICA"];
    const ALLOWED_BRANDS = ["AQUELA PARME", "AQUELA PARMÊ", "AQUELE ESTROGONOFE", "AQUELE ESTROGONOFÊ", "BOX CAIPIRA"];
    const [r, b, s] = await Promise.all([
      supabase.from("customer_reviews").select("*").order("published_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(500),
      supabase.from("brands").select("id,name").order("name"),
      supabase.from("stores").select("id,name").eq("is_virtual", false).order("name"),
    ]);
    if (r.data) setReviews(r.data as Review[]);
    if (b.data) setBrands((b.data as Brand[]).filter((x) => ALLOWED_BRANDS.includes(x.name.trim().toUpperCase())));
    if (s.data) setStores((s.data as Store[]).filter((x) => ALLOWED_STORES.includes(x.name.trim().toUpperCase())));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

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
    const sources: Source[] = ["google", "ifood", "nutri", "falae", "outro"];
    return sources.map((src) => {
      const rows = reviews.filter((r) => r.source === src);
      const ratings = rows.filter((r) => r.rating).map((r) => r.rating as number);
      const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
      const novos = rows.filter((r) => r.status === "novo").length;
      return { source: src, total: rows.length, novos, avg, hasRatings: ratings.length > 0 };
    });
  }, [reviews]);

  // Média manual do iFood por loja+marca (Fábrica não vende no iFood)
  const IFOOD_STORES_KEY = "crm.ifood.manual_by_store_brand";
  // Média manual do Google por loja+marca (Fábrica não tem Google público)
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

  const ifoodStores = useMemo(
    () => stores.filter((s) => !/f[aá]brica/i.test(s.name)),
    [stores]
  );
  const googleStores = ifoodStores;

  const aggregateByStoreMap = (map: Record<string, ManualEntry>) => {
    const entries = Object.values(map).filter((e) => e && e.count > 0 && e.avg > 0);
    const totalCount = entries.reduce((s, e) => s + Number(e.count || 0), 0);
    const weighted = entries.reduce((s, e) => s + Number(e.avg) * Number(e.count), 0);
    const avg = totalCount > 0 ? weighted / totalCount : 0;
    return { avg, totalCount, hasData: totalCount > 0 };
  };
  const ifoodAggregate = useMemo(() => aggregateByStoreMap(ifoodByStore), [ifoodByStore]);
  const googleAggregate = useMemo(() => aggregateByStoreMap(googleByStore), [googleByStore]);

  const storeAggregate = (storeId: string, map: Record<string, ManualEntry> = ifoodByStore) => {
    const entries = brands
      .map((b) => map[`${storeId}::${b.id}`])
      .filter((e) => e && e.count > 0 && e.avg > 0);
    const totalCount = entries.reduce((s, e) => s + Number(e.count || 0), 0);
    const weighted = entries.reduce((s, e) => s + Number(e.avg) * Number(e.count), 0);
    return { avg: totalCount > 0 ? weighted / totalCount : 0, totalCount };
  };

  const saveIfoodStores = (next: Record<string, IfoodEntry>) => {
    setIfoodByStore(next);
    localStorage.setItem(IFOOD_STORES_KEY, JSON.stringify(next));
  };
  const saveGoogleStores = (next: Record<string, ManualEntry>) => {
    setGoogleByStore(next);
    localStorage.setItem(GOOGLE_STORES_KEY, JSON.stringify(next));
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
          return (
            <Card key={source}>
              <CardContent className="p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" />
                    {meta.label}
                  </div>
                  {isManual && (
                    <button
                      type="button"
                      onClick={() => (isIfood ? setOpenIfoodDialog(true) : setOpenGoogleDialog(true))}
                      className="text-[10px] text-primary hover:underline"
                    >
                      editar por loja
                    </button>
                  )}
                </div>
                <div className="text-lg font-semibold flex items-center gap-1">
                  {displayHasAvg ? displayAvg.toFixed(1) : "—"}
                  {displayHasAvg && <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {isManual
                    ? `${displayCount} avaliações (manual)`
                    : `${total} ${total === 1 ? "avaliação" : "avaliações"}${novos ? ` · ${novos} novas` : ""}`}
                </div>
              </CardContent>
            </Card>
          );
        })}

      </div>

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
                const agg = storeAggregate(s.id);
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
                        const entry = ifoodByStore[key] || { avg: 0, count: 0 };
                        return (
                          <div key={b.id} className="grid grid-cols-[1fr_90px_110px] items-center gap-2 border rounded-md p-2">
                            <div className="text-xs font-medium truncate">{b.name}</div>
                            <Input
                              type="number" step="0.1" min="0" max="5"
                              placeholder="Média"
                              value={entry.avg || ""}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value.replace(",", ".")) || 0;
                                saveIfoodStores({ ...ifoodByStore, [key]: { ...entry, avg: v } });
                              }}
                              className="h-8 text-sm"
                            />
                            <Input
                              type="number" min="0"
                              placeholder="Nº aval."
                              value={entry.count || ""}
                              onChange={(e) => {
                                const v = parseInt(e.target.value, 10) || 0;
                                saveIfoodStores({ ...ifoodByStore, [key]: { ...entry, count: v } });
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
            <Button onClick={() => setOpenIfoodDialog(false)}>Fechar</Button>
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
                const agg = storeAggregate(s.id, googleByStore);
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
                        const entry = googleByStore[key] || { avg: 0, count: 0 };
                        return (
                          <div key={b.id} className="grid grid-cols-[1fr_90px_110px] items-center gap-2 border rounded-md p-2">
                            <div className="text-xs font-medium truncate">{b.name}</div>
                            <Input
                              type="number" step="0.1" min="0" max="5"
                              placeholder="Média"
                              value={entry.avg || ""}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value.replace(",", ".")) || 0;
                                saveGoogleStores({ ...googleByStore, [key]: { ...entry, avg: v } });
                              }}
                              className="h-8 text-sm"
                            />
                            <Input
                              type="number" min="0"
                              placeholder="Nº aval."
                              value={entry.count || ""}
                              onChange={(e) => {
                                const v = parseInt(e.target.value, 10) || 0;
                                saveGoogleStores({ ...googleByStore, [key]: { ...entry, count: v } });
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
            <Button onClick={() => setOpenGoogleDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Matriz de notas por loja (modelo antigo) */}
      {(() => {
        const parme = brands.find((b) => /parm/i.test(b.name));
        const box = brands.find((b) => /box/i.test(b.name));
        const estro = brands.find((b) => /estrog/i.test(b.name));
        const isFabrica = (name: string) => /f[aá]brica/i.test(name);

        const avgBySource = (storeId: string, src: Source) => {
          const rows = reviews.filter(
            (r) => r.source === src && r.store_id === storeId && r.rating != null,
          );
          if (rows.length === 0) return { avg: 0, n: 0 };
          const sum = rows.reduce((s, r) => s + (r.rating as number), 0);
          return { avg: sum / rows.length, n: rows.length };
        };

        const manualCell = (map: Record<string, ManualEntry>, storeId: string, brandId?: string) => {
          if (!brandId) return { avg: 0, n: 0 };
          const e = map[`${storeId}::${brandId}`];
          return { avg: e?.avg ?? 0, n: e?.count ?? 0 };
        };

        const Cell = ({ avg, n }: { avg: number; n: number }) => {
          if (!n || !avg) return <span className="text-muted-foreground/60">—</span>;
          const color =
            avg >= 4.5 ? "text-emerald-600 dark:text-emerald-400"
            : avg >= 4.0 ? "text-yellow-600 dark:text-yellow-400"
            : "text-destructive";
          return (
            <div className="leading-tight">
              <div className={`font-semibold tabular-nums ${color}`}>{avg.toFixed(1).replace(".", ",")}</div>
              <div className="text-[10px] text-muted-foreground tabular-nums">{n}</div>
            </div>
          );
        };

        const orderedStores = [...stores].sort((a, b) => {
          const af = isFabrica(a.name) ? 1 : 0;
          const bf = isFabrica(b.name) ? 1 : 0;
          if (af !== bf) return af - bf;
          return a.name.localeCompare(b.name);
        });

        const brandCols: { id: string | undefined; short: string; title: string }[] = [
          { id: parme?.id, short: "P", title: "Aquela Parmê" },
          { id: box?.id, short: "B", title: "Box Caipira" },
          { id: estro?.id, short: "E", title: "Aquele Estrogonofê" },
        ];

        return (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="h-4 w-4 text-primary" /> Quadro de notas por loja
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                <b>G</b>=Google · <b>I</b>=iFood · <b>N</b>=Nutri · <b>P</b>=Aquela Parmê · <b>B</b>=Box Caipira · <b>E</b>=Aquele Estrogonofê · (F)=Fábrica
              </p>
            </CardHeader>
            <CardContent className="p-2 sm:p-3 overflow-x-auto">
              <table className="w-full text-center text-xs border-collapse min-w-[640px]">
                <thead>
                  <tr>
                    <th rowSpan={2} className="border border-border bg-muted/40 px-2 py-1 text-left align-middle">Loja</th>
                    <th colSpan={3} className="border border-border bg-muted/40 px-2 py-1">Google</th>
                    <th colSpan={3} className="border border-border bg-muted/40 px-2 py-1">iFood</th>
                    <th rowSpan={2} className="border border-border bg-muted/40 px-2 py-1 align-middle" title="Nutricionista">N</th>
                  </tr>
                  <tr>
                    {brandCols.map((c) => (
                      <th key={`g-${c.short}`} className="border border-border bg-muted/20 px-2 py-1" title={`Google ${c.title}`}>{c.short}</th>
                    ))}
                    {brandCols.map((c) => (
                      <th key={`i-${c.short}`} className="border border-border bg-muted/20 px-2 py-1" title={`iFood ${c.title}`}>{c.short}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orderedStores.map((s) => {
                    const fabrica = isFabrica(s.name);
                    const n = avgBySource(s.id, "nutri");
                    return (
                      <tr key={s.id}>
                        <td className="border border-border px-2 py-1 text-left font-medium whitespace-nowrap">
                          {s.name}
                          {fabrica && <span className="ml-1 text-[10px] text-muted-foreground">(F)</span>}
                        </td>
                        {brandCols.map((c) => (
                          <td key={`g-${s.id}-${c.short}`} className="border border-border px-2 py-1">
                            {fabrica ? <span className="text-muted-foreground/40">—</span> : <Cell {...manualCell(googleByStore, s.id, c.id)} />}
                          </td>
                        ))}
                        {brandCols.map((c) => (
                          <td key={`i-${s.id}-${c.short}`} className="border border-border px-2 py-1">
                            {fabrica ? <span className="text-muted-foreground/40">—</span> : <Cell {...manualCell(ifoodByStore, s.id, c.id)} />}
                          </td>
                        ))}
                        <td className="border border-border px-2 py-1"><Cell {...n} /></td>
                      </tr>
                    );
                  })}
                  {orderedStores.length === 0 && (
                    <tr><td colSpan={8} className="border border-border py-4 text-muted-foreground">Nenhuma loja.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        );
      })()}



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
          <Button onClick={() => setOpenIfoodDialog(true)} size="sm" variant="outline">
            <Star className="h-4 w-4 mr-1" /> Avaliação da loja
          </Button>
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
                        const { error } = await supabase.from("customer_reviews").delete().eq("id", r.id);
                        if (error) return toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
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
      setComment(editing.comment ?? "");
      setUrl(editing.external_url ?? "");
      setBrandId(editing.brand_id ?? "none");
      setStoreId(editing.store_id ?? "none");
    } else {
      setSource("google"); setRating(5); setRatingStr("5,0");
      setName(""); setComment(""); setUrl(""); setBrandId("none"); setStoreId("none");
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
          <div>
            <Label>Cliente</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do cliente" />
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
