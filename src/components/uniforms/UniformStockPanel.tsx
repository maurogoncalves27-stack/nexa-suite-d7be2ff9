import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, AlertTriangle, Warehouse } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { MOVEMENT_TYPES, CONDITION_OPTIONS, UNIFORM_CENTRAL_STORE_ID, sizesFor, type UniformItem, type UniformCondition } from "@/lib/uniforms";

interface StoreOpt { id: string; name: string }
interface StockRow {
  id: string; store_id: string; uniform_item_id: string;
  size: string; quantity: number; min_alert: number; condition: UniformCondition;
}

interface Props {
  items: UniformItem[];
  stores: StoreOpt[];
}

export function UniformStockPanel({ items }: Props) {
  const { user } = useAuth();
  const [stock, setStock] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    uniform_item_id: "",
    size: "",
    movement_type: "entrada",
    quantity: "",
    reason: "",
    condition: "nova" as UniformCondition,
  });

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("uniform_stock")
      .select("*")
      .eq("store_id", UNIFORM_CENTRAL_STORE_ID);
    setStock(((data ?? []) as any[]).map((r) => ({ ...r, condition: (r.condition ?? "nova") as UniformCondition })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.uniform_item_id || !form.size || !form.quantity) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("uniform_stock_movements").insert({
      store_id: UNIFORM_CENTRAL_STORE_ID,
      uniform_item_id: form.uniform_item_id,
      size: form.size,
      movement_type: form.movement_type,
      quantity: Math.max(1, Number(form.quantity) || 1),
      reason: form.reason || null,
      created_by: user?.id,
      condition: form.condition,
    } as any);
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

  // Agrupa: item+size com colunas Nova/Usada
  const grouped = (() => {
    const map = new Map<string, { item: UniformItem | undefined; size: string; nova: StockRow | null; usada: StockRow | null }>();
    for (const r of stock) {
      const key = `${r.uniform_item_id}-${r.size}`;
      if (!map.has(key)) map.set(key, { item: itemMap[r.uniform_item_id], size: r.size, nova: null, usada: null });
      const g = map.get(key)!;
      if (r.condition === "usada") g.usada = r; else g.nova = r;
    }
    return Array.from(map.values()).sort((a, b) => (a.item?.name ?? "").localeCompare(b.item?.name ?? "") || a.size.localeCompare(b.size));
  })();

  const totalNova = stock.filter((s) => s.condition === "nova").reduce((s, r) => s + r.quantity, 0);
  const totalUsada = stock.filter((s) => s.condition === "usada").reduce((s, r) => s + r.quantity, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Warehouse className="h-4 w-4 text-primary" /> Estoque central (sede)</CardTitle>
          <CardDescription>
            Todo o estoque de uniformes fica em um único local. Peças <b>Novas</b> vêm de compras; <b>Usadas</b> vêm de devoluções de colaboradores desligados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className="border-primary/50">Novas: <span className="ml-1 font-bold text-foreground">{totalNova}</span></Badge>
            <Badge variant="outline" className="border-amber-500/60 text-amber-700 dark:text-amber-300">Usadas: <span className="ml-1 font-bold text-foreground">{totalUsada}</span></Badge>
          </div>

          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : grouped.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-sm">Sem estoque registrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2">Peça</th>
                    <th>Tam.</th>
                    <th className="text-center">Novas</th>
                    <th className="text-center">Usadas</th>
                    <th>Mín.</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map((g) => {
                    const totalQty = (g.nova?.quantity ?? 0) + (g.usada?.quantity ?? 0);
                    const minAlert = Math.max(g.nova?.min_alert ?? 0, g.usada?.min_alert ?? 0);
                    const low = minAlert > 0 && totalQty < minAlert;
                    return (
                      <tr key={`${g.item?.id}-${g.size}`} className="border-b hover:bg-muted/30">
                        <td className="py-2">{g.item?.name ?? "—"}</td>
                        <td>{g.size}</td>
                        <td className="text-center font-medium">{g.nova?.quantity ?? 0}</td>
                        <td className="text-center font-medium text-amber-700 dark:text-amber-300">{g.usada?.quantity ?? 0}</td>
                        <td>
                          <Input type="number" className="h-8 w-20"
                            value={g.nova?.min_alert ?? g.usada?.min_alert ?? 0}
                            onChange={(e) => {
                              const v = Number(e.target.value) || 0;
                              const row = g.nova ?? g.usada;
                              if (row) updateMinAlert(row, v);
                            }} />
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
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registrar movimentação (sede)</CardTitle>
          <CardDescription>Entrada de compra, ajuste ou perda. Devoluções são registradas automaticamente pela aba <b>Pendências</b>.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
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
            <Label>Peça</Label>
            <Select value={form.uniform_item_id} onValueChange={(v) => setForm({ ...form, uniform_item_id: v, size: "" })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {items.filter((i) => i.is_active).map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tam.</Label>
            <Select value={form.size} onValueChange={(v) => setForm({ ...form, size: v })} disabled={!selItem}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {sizes.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Condição</Label>
            <Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v as UniformCondition })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONDITION_OPTIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Quantidade</Label>
            <Input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </div>
          <div className="space-y-2 md:col-span-5">
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
