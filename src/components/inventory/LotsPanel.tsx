import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, AlertTriangle, GitBranch } from "lucide-react";
import LotTrailDialog from "@/components/inventory/LotTrailDialog";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { sortStores } from "@/lib/storeSort";

const LOSS_REASONS = [
  { value: "vencimento", label: "Vencimento" },
  { value: "quebra", label: "Quebra" },
  { value: "descarte", label: "Descarte" },
  { value: "contaminacao", label: "Contaminação" },
  { value: "outro", label: "Outro" },
];

type Store = { id: string; name: string };
type Product = { id: string; name: string; unit: string | null };
type Lot = {
  id: string;
  store_id: string;
  product_id: string;
  lot_number: string | null;
  quantity: number;
  initial_quantity: number;
  unit_cost: number | null;
  manufacture_date: string | null;
  expiry_date: string;
  status: string;
  notes: string | null;
  inventory_products: { name: string; unit: string | null } | null;
  stores: { name: string } | null;
};

const STATUS_OPTS = [
  { value: "active", label: "Ativo" },
  { value: "depleted", label: "Esgotado" },
  { value: "expired", label: "Vencido" },
  { value: "discarded", label: "Descartado" },
];

const alertBadge = (days: number, status: string) => {
  if (status !== "active") return { label: STATUS_OPTS.find(s => s.value === status)?.label || status, cls: "bg-muted text-muted-foreground" };
  if (days < 0) return { label: `Vencido há ${Math.abs(days)}d`, cls: "bg-destructive text-destructive-foreground" };
  if (days <= 7) return { label: `${days}d restantes`, cls: "bg-destructive/80 text-destructive-foreground" };
  if (days <= 15) return { label: `${days}d restantes`, cls: "bg-destructive/40 text-foreground" };
  if (days <= 30) return { label: `${days}d restantes`, cls: "bg-accent text-accent-foreground" };
  return { label: `${days}d restantes`, cls: "bg-primary/15 text-primary border border-primary/30" };
};

export default function LotsPanel() {
  const { isAdmin, isManager } = useAuth();
  const isStaff = isAdmin || isManager;
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lossDialog, setLossDialog] = useState<{ lot: Lot | null; reason: string; notes: string }>({ lot: null, reason: "vencimento", notes: "" });
  const [lossLoading, setLossLoading] = useState(false);
  const [trailLotId, setTrailLotId] = useState<string | null>(null);

  const [fStore, setFStore] = useState<string>("");
  const [fProduct, setFProduct] = useState<string>("");
  const [fLotNumber, setFLotNumber] = useState<string>("");
  const [fQty, setFQty] = useState<string>("");
  const [fCost, setFCost] = useState<string>("");
  const [fMfg, setFMfg] = useState<string>("");
  const [fExp, setFExp] = useState<string>("");
  const [fNotes, setFNotes] = useState<string>("");

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

  const loadLots = async () => {
    let q = supabase
      .from("inventory_lots")
      .select("*, inventory_products(name,unit), stores(name)")
      .order("expiry_date", { ascending: true })
      .limit(500);
    if (storeFilter !== "all") q = q.eq("store_id", storeFilter);
    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    const { data, error } = await q;
    if (error) {
      toast({ title: "Erro ao carregar lotes", description: error.message, variant: "destructive" });
      return;
    }
    setLots((data as any) || []);
  };

  useEffect(() => { loadLots(); }, [storeFilter, statusFilter]);

  const summary = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let expired = 0, critical = 0, warning = 0;
    lots.filter(l => l.status === "active").forEach(l => {
      const d = Math.floor((new Date(l.expiry_date).getTime() - today.getTime()) / 86400000);
      if (d < 0) expired++;
      else if (d <= 7) critical++;
      else if (d <= 15) warning++;
    });
    return { expired, critical, warning };
  }, [lots]);

  const submit = async () => {
    if (!fStore || !fProduct || !fQty || !fExp) {
      toast({ title: "Preencha loja, produto, quantidade e validade", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("inventory_lots").insert({
      store_id: fStore,
      product_id: fProduct,
      lot_number: fLotNumber || null,
      quantity: Number(fQty),
      initial_quantity: Number(fQty),
      unit_cost: fCost ? Number(fCost) : null,
      manufacture_date: fMfg || null,
      expiry_date: fExp,
      notes: fNotes || null,
      status: "active",
    });
    setLoading(false);
    if (error) {
      toast({ title: "Erro ao cadastrar lote", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Lote cadastrado" });
    setOpen(false);
    setFLotNumber(""); setFQty(""); setFCost(""); setFMfg(""); setFExp(""); setFNotes("");
    loadLots();
  };

  const openLossDialog = (lot: Lot, defaultReason: string) => {
    setLossDialog({ lot, reason: defaultReason, notes: "" });
  };

  const confirmLoss = async () => {
    const lot = lossDialog.lot;
    if (!lot) return;
    setLossLoading(true);
    const { error } = await supabase.rpc("register_inventory_loss", {
      _store_id: lot.store_id,
      _product_id: lot.product_id,
      _quantity: Number(lot.quantity),
      _reason: lossDialog.reason,
      _lot_id: lot.id,
      _notes: lossDialog.notes || `Lote ${lot.lot_number || "S/N"} — venc. ${format(parseISO(lot.expiry_date), "dd/MM/yyyy")}`,
      _occurred_on: format(new Date(), "yyyy-MM-dd"),
    });
    setLossLoading(false);
    if (error) {
      toast({ title: "Erro ao registrar perda", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Perda registrada", description: "Lote baixado e perda contabilizada no estoque." });
    setLossDialog({ lot: null, reason: "vencimento", notes: "" });
    loadLots();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este lote?")) return;
    const { error } = await supabase.from("inventory_lots").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    loadLots();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-2" />Novo lote</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Cadastrar lote</DialogTitle></DialogHeader>
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
                  <Label>Nº do lote</Label>
                  <Input value={fLotNumber} onChange={(e) => setFLotNumber(e.target.value)} placeholder="Opcional" />
                </div>
                <div>
                  <Label>Quantidade</Label>
                  <Input type="number" step="0.001" value={fQty} onChange={(e) => setFQty(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Custo unitário</Label>
                  <Input type="number" step="0.01" value={fCost} onChange={(e) => setFCost(e.target.value)} />
                </div>
                <div>
                  <Label>Fabricação</Label>
                  <Input type="date" value={fMfg} onChange={(e) => setFMfg(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Validade *</Label>
                <Input type="date" value={fExp} onChange={(e) => setFExp(e.target.value)} required />
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea value={fNotes} onChange={(e) => setFNotes(e.target.value)} rows={2} />
              </div>
              <Button className="w-full" onClick={submit} disabled={loading}>
                {loading ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Vencidos</div>
            <div className="text-2xl font-bold text-destructive">{summary.expired}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">≤7 dias</div>
            <div className="text-2xl font-bold text-destructive/80">{summary.critical}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">≤15 dias</div>
            <div className="text-2xl font-bold text-primary">{summary.warning}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
          <Label>Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {STATUS_OPTS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Loja</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Validade</TableHead>
              <TableHead>Alerta</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lots.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                  Nenhum lote cadastrado.
                </TableCell>
              </TableRow>
            )}
            {lots.map(l => {
              const today = new Date(); today.setHours(0,0,0,0);
              const days = Math.floor((new Date(l.expiry_date).getTime() - today.getTime()) / 86400000);
              const a = alertBadge(days, l.status);
              return (
                <TableRow key={l.id} className={l.status === "active" && days < 0 ? "bg-destructive/5" : undefined}>
                  <TableCell className="text-xs">{l.stores?.name}</TableCell>
                  <TableCell>{l.inventory_products?.name}</TableCell>
                  <TableCell className="font-mono text-xs">{l.lot_number || "—"}</TableCell>
                  <TableCell className="text-right">
                    {Number(l.quantity).toLocaleString("pt-BR")} {l.inventory_products?.unit}
                  </TableCell>
                  <TableCell>{format(parseISO(l.expiry_date), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                  <TableCell>
                    <Badge className={a.cls}>{a.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      <Button size="sm" variant="ghost" onClick={() => setTrailLotId(l.id)} title="Trilha do lote">
                        <GitBranch className="h-4 w-4 text-primary" />
                      </Button>
                      {l.status === "active" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openLossDialog(l, days < 0 ? "vencimento" : "descarte")}
                        >
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Dar baixa
                        </Button>
                      )}
                      {isStaff && (
                        <Button size="sm" variant="ghost" onClick={() => remove(l.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!lossDialog.lot} onOpenChange={(o) => !o && setLossDialog({ lot: null, reason: "vencimento", notes: "" })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Dar baixa no lote
            </DialogTitle>
          </DialogHeader>
          {lossDialog.lot && (
            <div className="space-y-3">
              <div className="rounded-md bg-muted/40 p-3 text-sm space-y-1">
                <div><span className="text-muted-foreground">Produto:</span> <span className="font-medium">{lossDialog.lot.inventory_products?.name}</span></div>
                <div><span className="text-muted-foreground">Lote:</span> <span className="font-mono">{lossDialog.lot.lot_number || "S/N"}</span></div>
                <div><span className="text-muted-foreground">Quantidade a baixar:</span> <span className="font-medium">{Number(lossDialog.lot.quantity).toLocaleString("pt-BR")} {lossDialog.lot.inventory_products?.unit}</span></div>
                <div><span className="text-muted-foreground">Validade:</span> {format(parseISO(lossDialog.lot.expiry_date), "dd/MM/yyyy", { locale: ptBR })}</div>
              </div>
              <div>
                <Label>Motivo da perda</Label>
                <Select value={lossDialog.reason} onValueChange={(v) => setLossDialog((s) => ({ ...s, reason: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LOSS_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea
                  rows={2}
                  value={lossDialog.notes}
                  onChange={(e) => setLossDialog((s) => ({ ...s, notes: e.target.value }))}
                  placeholder="Opcional"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                A perda será registrada automaticamente em <strong>Perdas de estoque</strong> e o saldo do lote será zerado.
              </p>
              <Button className="w-full" onClick={confirmLoss} disabled={lossLoading}>
                {lossLoading ? "Registrando..." : "Confirmar baixa e registrar perda"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <LotTrailDialog lotId={trailLotId} onClose={() => setTrailLotId(null)} />
    </div>
  );
}
