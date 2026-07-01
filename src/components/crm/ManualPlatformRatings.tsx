import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Star, Plus, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, startOfWeek, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

type Source = "ifood" | "google" | "nutri";

const SOURCES: { value: Source; label: string; color: string; requiresBrand: boolean }[] = [
  { value: "ifood", label: "iFood", color: "#EB0033", requiresBrand: true },
  { value: "google", label: "Google", color: "#4285F4", requiresBrand: false },
  { value: "nutri", label: "Nutri (Vig. Sanitária)", color: "#16A34A", requiresBrand: false },
];

const BRANDS: { value: string; label: string }[] = [
  { value: "aquela_parme", label: "Aquela Parmê" },
  { value: "estrogonofe", label: "Estrogonofe" },
  { value: "box_caipira", label: "Box Caipira" },
];

interface Row {
  id: string;
  source: Source;
  store_id: string;
  brand: string | null;
  week_start: string;
  score: number;
  reviews_count: number | null;
  notes: string | null;
}

interface Store { id: string; name: string }

function mondayOf(d: Date) {
  return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export function ManualPlatformRatings() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState({
    source: "ifood" as Source,
    store_id: "",
    brand: "aquela_parme" as string | null,
    week_start: mondayOf(new Date()),
    score: "",
    reviews_count: "",
    notes: "",
  });

  const { data: stores = [] } = useQuery({
    queryKey: ["manual-ratings-stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name")
        .eq("is_virtual", false)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Store[];
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["manual-platform-ratings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manual_platform_ratings" as any)
        .select("*")
        .order("week_start", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? "—";
  const brandLabel = (b: string | null) => (b ? BRANDS.find((x) => x.value === b)?.label ?? b : "—");
  const sourceMeta = (s: Source) => SOURCES.find((x) => x.value === s)!;

  const openNew = () => {
    setEditing(null);
    setForm({
      source: "ifood",
      store_id: stores[0]?.id ?? "",
      brand: "aquela_parme",
      week_start: mondayOf(new Date()),
      score: "",
      reviews_count: "",
      notes: "",
    });
    setDialogOpen(true);
  };

  const openEdit = (r: Row) => {
    setEditing(r);
    setForm({
      source: r.source,
      store_id: r.store_id,
      brand: r.brand ?? null,
      week_start: r.week_start,
      score: String(r.score),
      reviews_count: r.reviews_count == null ? "" : String(r.reviews_count),
      notes: r.notes ?? "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    const score = Number(String(form.score).replace(",", "."));
    if (!form.store_id) return toast({ title: "Selecione a loja", variant: "destructive" });
    if (!Number.isFinite(score) || score < 0 || score > 5)
      return toast({ title: "Nota deve estar entre 0 e 5", variant: "destructive" });
    const meta = sourceMeta(form.source);
    const brand = meta.requiresBrand ? form.brand : null;
    if (meta.requiresBrand && !brand)
      return toast({ title: "Selecione a marca", variant: "destructive" });

    const payload = {
      source: form.source,
      store_id: form.store_id,
      brand,
      week_start: form.week_start,
      score,
      reviews_count: form.reviews_count === "" ? null : Number(form.reviews_count),
      notes: form.notes || null,
    };

    const { data: user } = await supabase.auth.getUser();
    const body: any = { ...payload, created_by: user?.user?.id ?? null };

    const q = editing
      ? supabase.from("manual_platform_ratings" as any).update(body).eq("id", editing.id)
      : supabase.from("manual_platform_ratings" as any).insert(body);
    const { error } = await q;
    if (error) return toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    toast({ title: editing ? "Nota atualizada" : "Nota lançada" });
    setDialogOpen(false);
    qc.invalidateQueries({ queryKey: ["manual-platform-ratings"] });
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este lançamento?")) return;
    const { error } = await supabase.from("manual_platform_ratings" as any).delete().eq("id", id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    qc.invalidateQueries({ queryKey: ["manual-platform-ratings"] });
  };

  // agrupamento simples para leitura: última semana por (source, store, brand)
  const latest = useMemo(() => {
    const seen = new Set<string>();
    const out: Row[] = [];
    for (const r of rows) {
      const k = `${r.source}|${r.store_id}|${r.brand ?? ""}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(r);
    }
    return out;
  }, [rows]);

  const currentMeta = sourceMeta(form.source);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Star className="h-5 w-5 text-primary" />
            Notas manuais (iFood, Google, Nutri)
          </CardTitle>
          <CardDescription>
            Lançamento semanal manual até termos as APIs oficiais. Atualize toda semana com a nota vigente de cada plataforma.
          </CardDescription>
        </div>
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4" /> Lançar nota
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhuma nota lançada. Clique em "Lançar nota" para começar.
          </p>
        ) : (
          <div className="space-y-6">
            <div>
              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Última nota por plataforma / loja</h4>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {latest.map((r) => {
                  const meta = sourceMeta(r.source);
                  return (
                    <div key={r.id} className="rounded-md border p-3 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: meta.color }} />
                        <span className="text-sm font-medium">{meta.label}</span>
                        <Badge variant="secondary" className="ml-auto text-[10px]">
                          semana {format(parseISO(r.week_start), "dd/MM", { locale: ptBR })}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {storeName(r.store_id)}{r.brand ? ` · ${brandLabel(r.brand)}` : ""}
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold">{r.score.toFixed(2)}</span>
                        <span className="text-xs text-muted-foreground">/ 5</span>
                        {r.reviews_count != null && (
                          <span className="text-xs text-muted-foreground ml-2">({r.reviews_count} avaliações)</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Histórico</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b">
                      <th className="py-2 pr-3">Semana</th>
                      <th className="py-2 pr-3">Plataforma</th>
                      <th className="py-2 pr-3">Loja</th>
                      <th className="py-2 pr-3">Marca</th>
                      <th className="py-2 pr-3 text-right">Nota</th>
                      <th className="py-2 pr-3 text-right">Avaliações</th>
                      <th className="py-2 pr-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b hover:bg-muted/30">
                        <td className="py-2 pr-3">{format(parseISO(r.week_start), "dd/MM/yyyy", { locale: ptBR })}</td>
                        <td className="py-2 pr-3">{sourceMeta(r.source).label}</td>
                        <td className="py-2 pr-3">{storeName(r.store_id)}</td>
                        <td className="py-2 pr-3">{brandLabel(r.brand)}</td>
                        <td className="py-2 pr-3 text-right font-medium">{r.score.toFixed(2)}</td>
                        <td className="py-2 pr-3 text-right">{r.reviews_count ?? "—"}</td>
                        <td className="py-2 pr-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => remove(r.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar nota" : "Lançar nota"}</DialogTitle>
            <DialogDescription>
              Informe a nota da semana. Use a nota atual exibida na plataforma.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Plataforma</Label>
                <Select value={form.source} onValueChange={(v) => setForm((f) => ({ ...f, source: v as Source, brand: SOURCES.find((s) => s.value === v)!.requiresBrand ? (f.brand ?? "aquela_parme") : null }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Semana (segunda)</Label>
                <Input
                  type="date"
                  value={form.week_start}
                  onChange={(e) => setForm((f) => ({ ...f, week_start: mondayOf(new Date(e.target.value + "T00:00:00")) }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Loja</Label>
                <Select value={form.store_id} onValueChange={(v) => setForm((f) => ({ ...f, store_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {currentMeta.requiresBrand && (
                <div className="space-y-1.5">
                  <Label>Marca</Label>
                  <Select value={form.brand ?? ""} onValueChange={(v) => setForm((f) => ({ ...f, brand: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      {BRANDS.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nota (0 a 5)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="5"
                  value={form.score}
                  onChange={(e) => setForm((f) => ({ ...f, score: e.target.value }))}
                  placeholder="Ex.: 4.85"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Nº de avaliações (opcional)</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.reviews_count}
                  onChange={(e) => setForm((f) => ({ ...f, reviews_count: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Observação (opcional)</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save}>{editing ? "Salvar" : "Lançar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default ManualPlatformRatings;
