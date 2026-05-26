import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { MOVEMENT_TYPES, sizesFor, type UniformItem } from "@/lib/uniforms";

interface StoreOpt { id: string; name: string }
interface StockRow {
  id: string; store_id: string; uniform_item_id: string;
  size: string; quantity: number; min_alert: number;
}

interface Props {
  items: UniformItem[];
  stores: StoreOpt[];
}

export function UniformStockPanel({ items, stores }: Props) {
  const { user } = useAuth();
  const [storeId, setStoreId] = useState<string>("");
  const [stock, setStock] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    uniform_item_id: "",
    size: "",
    movement_type: "entrada",
    quantity: "",
    reason: "",
  });

  useEffect(() => {
    if (!storeId && stores.length) setStoreId(stores[0].id);
  }, [stores, storeId]);

  const load = async () => {
    if (!storeId) return;
    setLoading(true);
    const { data } = await supabase
      .from("uniform_stock")
      .select("*")
      .eq("store_id", storeId);
    setStock((data ?? []) as StockRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [storeId]);

  const submit = async () => {
    if (!storeId || !form.uniform_item_id || !form.size || !form.quantity) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("uniform_stock_movements").insert({
      store_id: storeId,
      uniform_item_id: form.uniform_item_id,
      size: form.size,
      movement_type: form.movement_type,
      quantity: Math.max(1, Number(form.quantity) || 1),
      reason: form.reason || null,
      created_by: user?.id,
    });
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Movimentação registrada" });
    setForm({ ...form, quantity: "", reason: "" });
    load();
  };

  const updateMinAlert = async (row: StockRow, value: number) => {
    const { error } = await supabase.from("uniform_stock").update({ min_alert: value }).eq("id", row.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    load();
  };

  const itemMap = Object.fromEntries(items.map((i) => [i.id, i]));
  const selItem = items.find((i) => i.id === form.uniform_item_id);
  const sizes = selItem ? sizesFor(selItem.size_type) : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estoque por loja</CardTitle>
          <CardDescription>Saldos atuais por item e tamanho. Alerta automático quando saldo &lt; mínimo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 max-w-sm">
            <Label>Loja</Label>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : stock.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-sm">Sem estoque registrado nesta loja.</div>
          ) : (
            <>
              {/* Mobile: cards */}
              <div className="md:hidden space-y-2">
                {stock.map((s) => {
                  const it = itemMap[s.uniform_item_id];
                  const low = s.quantity < s.min_alert;
                  return (
                    <div key={s.id} className="rounded-lg border bg-card p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm truncate">{it?.name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">Tam. {s.size}</div>
                        </div>
                        {low ? (
                          <Badge variant="outline" className="border-destructive/60 text-destructive shrink-0">
                            <AlertTriangle className="h-3 w-3 mr-1" /> Reposição
                          </Badge>
                        ) : <Badge variant="outline" className="border-emerald-500/60 text-emerald-700 dark:text-emerald-300 shrink-0">Ok</Badge>}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded bg-muted/50 p-2">
                          <div className="text-muted-foreground">Saldo</div>
                          <div className="font-bold text-base">{s.quantity}</div>
                        </div>
                        <div className="rounded bg-muted/50 p-2">
                          <Label className="text-[10px] text-muted-foreground">Mínimo</Label>
                          <Input type="number" className="h-7 mt-0.5"
                            value={s.min_alert}
                            onChange={(e) => updateMinAlert(s, Number(e.target.value) || 0)} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop: table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground border-b">
                    <tr><th className="py-2">Item</th><th>Tamanho</th><th>Saldo</th><th>Mín.</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {stock.map((s) => {
                      const it = itemMap[s.uniform_item_id];
                      const low = s.quantity < s.min_alert;
                      return (
                        <tr key={s.id} className="border-b hover:bg-muted/30">
                          <td className="py-2">{it?.name ?? "—"}</td>
                          <td>{s.size}</td>
                          <td className="font-medium">{s.quantity}</td>
                          <td>
                            <Input type="number" className="h-8 w-20"
                              value={s.min_alert}
                              onChange={(e) => updateMinAlert(s, Number(e.target.value) || 0)} />
                          </td>
                          <td>
                            {low ? (
                              <Badge variant="outline" className="border-destructive/60 text-destructive">
                                <AlertTriangle className="h-3 w-3 mr-1" /> Reposição
                              </Badge>
                            ) : <Badge variant="outline" className="border-emerald-500/60 text-emerald-700 dark:text-emerald-300">Ok</Badge>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registrar movimentação</CardTitle>
          <CardDescription>Entradas (compras), saídas, ajustes ou perdas</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={form.movement_type} onValueChange={(v) => setForm({ ...form, movement_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MOVEMENT_TYPES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Item</Label>
            <Select value={form.uniform_item_id} onValueChange={(v) => setForm({ ...form, uniform_item_id: v, size: "" })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {items.filter((i) => i.is_active).map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tamanho</Label>
            <Select value={form.size} onValueChange={(v) => setForm({ ...form, size: v })} disabled={!selItem}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {sizes.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Quantidade</Label>
            <Input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </div>
          <div className="space-y-2 md:col-span-4">
            <Label>Observação</Label>
            <Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
          <Button onClick={submit} disabled={saving} className="gap-2 w-full md:w-auto">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Registrar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
