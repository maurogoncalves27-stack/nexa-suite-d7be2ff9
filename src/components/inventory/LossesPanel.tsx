import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { format, parseISO, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { sortStores } from "@/lib/storeSort";

type Store = { id: string; name: string };
type Product = { id: string; name: string; unit: string | null };
type Lot = { id: string; lot_number: string | null; expiry_date: string; quantity: number };
type Loss = {
  id: string;
  store_id: string;
  product_id: string;
  occurred_on: string;
  quantity: number;
  unit_cost: number | null;
  total_cost: number | null;
  reason: string;
  notes: string | null;
  lot_id: string | null;
  inventory_products: { name: string; unit: string | null } | null;
  stores: { name: string } | null;
};

const REASONS = [
  { value: "vencimento", label: "Vencimento" },
  { value: "quebra", label: "Quebra" },
  { value: "descarte", label: "Descarte" },
  { value: "contaminacao", label: "Contaminação" },
  { value: "outro", label: "Outro" },
];

const reasonColor = (r: string) => {
  switch (r) {
    case "vencimento": return "bg-accent text-accent-foreground border-border";
    case "quebra": return "bg-destructive/15 text-destructive border-destructive/30";
    case "contaminacao": return "bg-primary/15 text-primary border-primary/30";
    case "descarte": return "bg-secondary text-secondary-foreground border-border";
    default: return "bg-muted text-muted-foreground border-border";
  }
};

export default function LossesPanel() {
  const { isAdmin, isManager } = useAuth();
  const isStaff = isAdmin || isManager;
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [losses, setLosses] = useState<Loss[]>([]);
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [from, setFrom] = useState<string>(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [fStore, setFStore] = useState<string>("");
  const [fProduct, setFProduct] = useState<string>("");
  const [fQty, setFQty] = useState<string>("");
  const [fReason, setFReason] = useState<string>("vencimento");
  const [fNotes, setFNotes] = useState<string>("");
  const [fDate, setFDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [fLotId, setFLotId] = useState<string>("none");
  const [productLots, setProductLots] = useState<Lot[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: s }, { data: p }] = await Promise.all([
        supabase.from("stores").select("id, name, store_type").eq("is_virtual", false).order("name"),
        supabase.from("inventory_products").select("id,name,unit").eq("is_active", true).order("name"),
      ]);
      setStores(sortStores(s || []));
      setProducts(p || []);
    })();
  }, []);

  const loadLosses = async () => {
    let q = supabase
      .from("inventory_losses")
      .select("*, inventory_products(name,unit), stores(name)")
      .gte("occurred_on", from)
      .lte("occurred_on", to)
      .order("occurred_on", { ascending: false })
      .limit(500);
    if (storeFilter !== "all") q = q.eq("store_id", storeFilter);
    const { data, error } = await q;
    if (error) {
      toast({ title: "Erro ao carregar perdas", description: error.message, variant: "destructive" });
      return;
    }
    setLosses((data as any) || []);
  };

  useEffect(() => { loadLosses(); }, [storeFilter, from, to]);

  useEffect(() => {
    if (!fProduct || !fStore) { setProductLots([]); return; }
    (async () => {
      const { data } = await supabase
        .from("inventory_lots")
        .select("id,lot_number,expiry_date,quantity")
        .eq("product_id", fProduct)
        .eq("store_id", fStore)
        .eq("status", "active")
        .gt("quantity", 0)
        .order("expiry_date", { ascending: true });
      setProductLots((data as any) || []);
    })();
  }, [fProduct, fStore]);

  const total = useMemo(
    () => losses.reduce((acc, l) => acc + Number(l.total_cost || 0), 0),
    [losses]
  );

  const byReason = useMemo(() => {
    const m = new Map<string, number>();
    losses.forEach((l) => m.set(l.reason, (m.get(l.reason) || 0) + Number(l.total_cost || 0)));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [losses]);

  const submit = async () => {
    if (!fStore || !fProduct || !fQty) {
      toast({ title: "Preencha loja, produto e quantidade", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.rpc("register_inventory_loss", {
      _store_id: fStore,
      _product_id: fProduct,
      _quantity: Number(fQty),
      _reason: fReason,
      _lot_id: fLotId === "none" ? null : fLotId,
      _notes: fNotes || null,
      _occurred_on: fDate,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Erro ao registrar perda", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Perda registrada", description: "Estoque baixado com sucesso." });
    setOpen(false);
    setFProduct(""); setFQty(""); setFNotes(""); setFLotId("none");
    loadLosses();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta perda? O movimento de estoque NÃO será revertido automaticamente.")) return;
    const { error } = await supabase.from("inventory_losses").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    loadLosses();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-2" />Nova perda</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Registrar perda</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Loja</Label>
                <Select value={fStore} onValueChange={setFStore}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Produto</Label>
                <Select value={fProduct} onValueChange={setFProduct}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Quantidade</Label>
                  <Input type="number" step="0.001" value={fQty} onChange={(e) => setFQty(e.target.value)} />
                </div>
                <div>
                  <Label>Data</Label>
                  <Input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Motivo</Label>
                <Select value={fReason} onValueChange={setFReason}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {productLots.length > 0 && (
                <div>
                  <Label>Lote (opcional)</Label>
                  <Select value={fLotId} onValueChange={setFLotId}>
                    <SelectTrigger><SelectValue placeholder="Sem lote" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem lote específico</SelectItem>
                      {productLots.map(l => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.lot_number || "S/N"} — venc. {format(parseISO(l.expiry_date), "dd/MM/yy")} — saldo {l.quantity}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Observações</Label>
                <Textarea value={fNotes} onChange={(e) => setFNotes(e.target.value)} rows={2} />
              </div>
              <Button className="w-full" onClick={submit} disabled={loading}>
                {loading ? "Registrando..." : "Registrar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label>Loja</Label>
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>De</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label>Até</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="rounded-lg border bg-muted/30 p-3">
        <div className="text-xs text-muted-foreground">Custo total no período</div>
        <div className="text-2xl font-bold text-destructive">
          R$ {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </div>
      </div>

      {byReason.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {byReason.map(([r, v]) => (
            <Badge key={r} variant="outline" className={reasonColor(r)}>
              {REASONS.find(x => x.value === r)?.label || r}: R$ {v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </Badge>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Loja</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead className="text-right">Qtd</TableHead>
              <TableHead className="text-right">Custo</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Obs.</TableHead>
              {isStaff && <TableHead></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {losses.length === 0 && (
              <TableRow>
                <TableCell colSpan={isStaff ? 8 : 7} className="text-center text-muted-foreground py-6">
                  Nenhuma perda no período.
                </TableCell>
              </TableRow>
            )}
            {losses.map(l => (
              <TableRow key={l.id}>
                <TableCell>{format(parseISO(l.occurred_on), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                <TableCell className="text-xs">{l.stores?.name}</TableCell>
                <TableCell>{l.inventory_products?.name}</TableCell>
                <TableCell className="text-right">
                  {Number(l.quantity).toLocaleString("pt-BR")} {l.inventory_products?.unit}
                </TableCell>
                <TableCell className="text-right font-medium text-destructive">
                  R$ {Number(l.total_cost || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={reasonColor(l.reason)}>
                    {REASONS.find(x => x.value === l.reason)?.label || l.reason}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{l.notes}</TableCell>
                {isStaff && (
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => remove(l.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
