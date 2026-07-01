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
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

type Source = "google" | "ifood" | "falae" | "outro";
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
  falae: { label: "Falaê", icon: MessageCircle, color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  outro: { label: "Outro", icon: MessageCircle, color: "bg-muted text-muted-foreground" },
};

function Stars({ n }: { n: number | null }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i <= (n ?? 0) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`}
        />
      ))}
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
  const [openReply, setOpenReply] = useState<Review | null>(null);

  async function load() {
    setLoading(true);
    const [r, b, s] = await Promise.all([
      supabase.from("customer_reviews").select("*").order("published_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(500),
      supabase.from("brands").select("id,name").order("name"),
      supabase.from("stores").select("id,name").eq("is_virtual", false).order("name"),
    ]);
    if (r.data) setReviews(r.data as Review[]);
    if (b.data) setBrands(b.data as Brand[]);
    if (s.data) setStores(s.data as Store[]);
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

  const stats = useMemo(() => {
    const total = reviews.length;
    const novos = reviews.filter((r) => r.status === "novo").length;
    const ratings = reviews.filter((r) => r.rating).map((r) => r.rating as number);
    const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    return { total, novos, avg };
  }, [reviews]);

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
      {/* Header KPIs */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">

        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-xl font-semibold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Novos</div>
            <div className="text-xl font-semibold">{stats.novos}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Média</div>
            <div className="text-xl font-semibold flex items-center gap-1">
              {stats.avg.toFixed(1)}
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
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
              <SelectItem value="falae">Falaê</SelectItem>
              <SelectItem value="outro">Outro</SelectItem>
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
            <Plus className="h-4 w-4 mr-1" /> Adicionar
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
                    <Button size="sm" onClick={() => setOpenReply(r)}>
                      {r.status === "respondido" ? "Editar resposta" : "Responder"}
                    </Button>
                    {r.external_url && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={r.external_url} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir
                        </a>
                      </Button>
                    )}
                    {r.status !== "ignorado" && (
                      <Button size="sm" variant="ghost" onClick={async () => {
                        await supabase.from("customer_reviews").update({ status: "ignorado" }).eq("id", r.id);
                        load();
                      }}>Ignorar</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <NewReviewDialog
        open={openNew}
        onOpenChange={setOpenNew}
        brands={brands}
        stores={stores}
        onSaved={() => { setOpenNew(false); load(); }}
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
  open, onOpenChange, brands, stores, onSaved,
}: { open: boolean; onOpenChange: (o: boolean) => void; brands: Brand[]; stores: Store[]; onSaved: () => void }) {
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

  async function save() {
    if (!comment.trim()) {
      toast({ title: "Escreva o comentário do cliente.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("customer_reviews").insert({
      source, rating, comment, customer_name: name || null, external_url: url || null,
      brand_id: brandId === "none" ? null : brandId,
      store_id: storeId === "none" ? null : storeId,
      published_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    setName(""); setComment(""); setUrl(""); setBrandId("none"); setStoreId("none"); setRating(5);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Adicionar avaliação</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Fonte</Label>
              <Select value={source} onValueChange={(v) => setSource(v as Source)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="google">Google</SelectItem>
                  <SelectItem value="ifood">iFood</SelectItem>
                  <SelectItem value="falae">Falaê</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nota</Label>
              <Select value={String(rating)} onValueChange={(v) => setRating(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n} ★</SelectItem>)}
                </SelectContent>
              </Select>
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
