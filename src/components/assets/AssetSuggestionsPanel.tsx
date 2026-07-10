import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Check, X, Sparkles, Package } from "lucide-react";

type Category = "mobiliario" | "equipamento" | "utensilio";
interface Store { id: string; name: string }
interface Suggestion {
  id: string;
  source_type: "nfe" | "inventory_invoice" | "payable";
  source_id: string;
  store_id: string | null;
  supplier_name: string | null;
  description: string;
  ncm: string | null;
  quantity: number;
  unit_value: number;
  total_value: number;
  suggested_category: Category;
  status: "pending" | "confirmed" | "ignored";
  created_at: string;
}

const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const SOURCE_LABEL: Record<Suggestion["source_type"], string> = {
  nfe: "NFe entrada",
  inventory_invoice: "Nota estoque",
  payable: "Contas a pagar",
};

interface Props { onConfirmed?: () => void }

export default function AssetSuggestionsPanel({ onConfirmed }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<Store[]>([]);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [statusFilter, setStatusFilter] = useState<"pending" | "confirmed" | "ignored">("pending");
  const [confirming, setConfirming] = useState<Suggestion | null>(null);
  const [form, setForm] = useState({ store_id: "", category: "equipamento" as Category, depreciation_rate_yearly: "10" });
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const [storesRes, sugRes] = await Promise.all([
      supabase.from("stores").select("id, name").eq("is_virtual", false).order("name"),
      supabase.from("asset_suggestions").select("*").eq("status", statusFilter).order("created_at", { ascending: false }).limit(200),
    ]);
    if (sugRes.error) toast({ title: "Erro", description: sugRes.error.message, variant: "destructive" });
    setStores(storesRes.data ?? []);
    setItems((sugRes.data ?? []) as Suggestion[]);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter]);

  const pendingCount = useMemo(() => items.length, [items]);

  function openConfirm(s: Suggestion) {
    setConfirming(s);
    setForm({
      store_id: s.store_id ?? stores[0]?.id ?? "",
      category: s.suggested_category,
      depreciation_rate_yearly: "10",
    });
  }

  async function confirm() {
    if (!confirming || !form.store_id) {
      toast({ title: "Selecione a loja", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { data: asset, error: e1 } = await supabase.from("asset_inventory").insert({
      store_id: form.store_id,
      category: form.category,
      name: confirming.description.slice(0, 200),
      quantity: confirming.quantity,
      unit_value: confirming.unit_value,
      acquired_at: new Date(confirming.created_at).toISOString().slice(0, 10),
      depreciation_rate_yearly: Number(form.depreciation_rate_yearly) || 0,
      notes: confirming.supplier_name ? `Origem: ${SOURCE_LABEL[confirming.source_type]} — ${confirming.supplier_name}` : `Origem: ${SOURCE_LABEL[confirming.source_type]}`,
      source_suggestion_id: confirming.id,
      created_by: user?.id,
    }).select("id").single();
    if (e1 || !asset) {
      setSubmitting(false);
      toast({ title: "Erro ao criar patrimônio", description: e1?.message, variant: "destructive" });
      return;
    }
    const { error: e2 } = await supabase.from("asset_suggestions").update({
      status: "confirmed", asset_id: asset.id, decided_by: user?.id, decided_at: new Date().toISOString(),
    }).eq("id", confirming.id);
    setSubmitting(false);
    if (e2) { toast({ title: "Sugestão não atualizada", description: e2.message, variant: "destructive" }); return; }
    toast({ title: "Patrimônio criado a partir da sugestão" });
    setConfirming(null);
    load();
    onConfirmed?.();
  }

  async function ignore(id: string) {
    const { error } = await supabase.from("asset_suggestions").update({
      status: "ignored", decided_by: user?.id, decided_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    load();
  }

  async function reopen(id: string) {
    const { error } = await supabase.from("asset_suggestions").update({
      status: "pending", decided_by: null, decided_at: null,
    }).eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    load();
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium">Sugestões de patrimônio</p>
            {statusFilter === "pending" && pendingCount > 0 && (
              <Badge variant="secondary">{pendingCount} pendente(s)</Badge>
            )}
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="confirmed">Confirmadas</SelectItem>
              <SelectItem value="ignored">Ignoradas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs text-muted-foreground">
          Itens detectados automaticamente em notas fiscais de entrada (NCM 84/85/90/9403) ou lançamentos em categorias marcadas como imobilizado. Confirme para adicionar ao patrimônio.
        </p>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
            <Package className="h-6 w-6 opacity-50" />
            Nenhuma sugestão {statusFilter === "pending" ? "pendente" : statusFilter === "confirmed" ? "confirmada" : "ignorada"}.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((s) => {
              const store = stores.find((st) => st.id === s.store_id);
              return (
                <div key={s.id} className="border rounded-md p-3 flex flex-col md:flex-row md:items-center gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{SOURCE_LABEL[s.source_type]}</Badge>
                      {s.ncm && <Badge variant="secondary" className="text-[10px]">NCM {s.ncm}</Badge>}
                      <Badge variant="secondary" className="text-[10px]">{s.suggested_category}</Badge>
                      {store && <span className="text-[11px] text-muted-foreground">{store.name}</span>}
                    </div>
                    <p className="text-sm font-medium truncate">{s.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.supplier_name ?? "—"} · {s.quantity} un × {fmtBRL(s.unit_value)} = <span className="font-medium text-foreground">{fmtBRL(s.total_value)}</span>
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {statusFilter === "pending" ? (
                      <>
                        <Button size="sm" onClick={() => openConfirm(s)}>
                          <Check className="h-4 w-4 mr-1" /> Confirmar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => ignore(s.id)}>
                          <X className="h-4 w-4 mr-1" /> Ignorar
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => reopen(s.id)}>Reabrir</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={!!confirming} onOpenChange={(o) => !submitting && !o && setConfirming(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar como patrimônio</DialogTitle>
          </DialogHeader>
          {confirming && (
            <div className="space-y-3">
              <div className="text-sm border rounded-md p-2 bg-muted/40">
                <p className="font-medium">{confirming.description}</p>
                <p className="text-xs text-muted-foreground">
                  {confirming.quantity} un × {fmtBRL(confirming.unit_value)} = {fmtBRL(confirming.total_value)}
                </p>
              </div>
              <div className="space-y-1">
                <Label>Loja</Label>
                <Select value={form.store_id} onValueChange={(v) => setForm({ ...form, store_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
                  <SelectContent>
                    {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Categoria</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as Category })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mobiliario">Mobiliário</SelectItem>
                    <SelectItem value="equipamento">Equipamento</SelectItem>
                    <SelectItem value="utensilio">Utensílio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Depreciação anual (%)</Label>
                <Input type="number" step="0.1" min="0" max="100"
                  value={form.depreciation_rate_yearly}
                  onChange={(e) => setForm({ ...form, depreciation_rate_yearly: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(null)} disabled={submitting}>Cancelar</Button>
            <Button onClick={confirm} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Criar patrimônio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
