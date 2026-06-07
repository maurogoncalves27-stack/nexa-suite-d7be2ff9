// Painel de cancelamentos do PDV: lista pedidos cancelados (pdv_orders.status='cancelled')
// com filtros de loja e período, agregando totais e motivos. Mobile-first.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { XCircle, RefreshCw, Loader2, Download, Eye, AlertTriangle } from "lucide-react";

interface Store { id: string; name: string; }

interface CancelRow {
  id: string;
  order_number: string | null;
  external_display_id: string | null;
  store_id: string;
  channel_id: string | null;
  total: number;
  opened_at: string;
  cancelled_at: string | null;
  cancellation_reason_code: string | null;
  cancellation_reason_text: string | null;
  cancelled_by: string | null;
  customer_name: string | null;
  order_type: string | null;
}

interface ChannelLite { id: string; name: string; store_id: string; }

interface ItemLite { name: string; quantity: number; unit_price: number; total: number; notes: string | null; }

interface UserLite { id: string; name: string; }

const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}
function isoToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export default function PdvCancellations() {
  const [stores, setStores] = useState<Store[]>([]);
  const [channels, setChannels] = useState<ChannelLite[]>([]);
  const [storeId, setStoreId] = useState<string>("all");
  const [from, setFrom] = useState<string>(isoDaysAgo(7));
  const [to, setTo] = useState<string>(isoToday());
  const [rows, setRows] = useState<CancelRow[]>([]);
  const [users, setUsers] = useState<Record<string, UserLite>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selected, setSelected] = useState<CancelRow | null>(null);
  const [selectedItems, setSelectedItems] = useState<ItemLite[] | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);

  // Carrega lojas reais (sem virtuais, sem iFood Homologação)
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("stores")
        .select("id,name,is_virtual")
        .eq("is_virtual", false)
        .order("name");
      const list = ((data ?? []) as any[])
        .filter((s) => !/homolog/i.test(s.name ?? ""))
        .map((s) => ({ id: s.id, name: s.name }));
      setStores(list);
      const { data: ch } = await supabase
        .from("pdv_channels")
        .select("id,name,store_id");
      setChannels((ch ?? []) as ChannelLite[]);
    })();
  }, []);

  const load = async () => {
    setRefreshing(true);
    if (rows.length === 0) setLoading(true);

    let q = supabase
      .from("pdv_orders")
      .select("id,order_number,external_display_id,store_id,channel_id,total,opened_at,cancelled_at,cancellation_reason_code,cancellation_reason_text,cancelled_by,customer_name,order_type")
      .eq("status", "cancelled")
      .gte("cancelled_at", `${from}T00:00:00`)
      .lte("cancelled_at", `${to}T23:59:59`)
      .order("cancelled_at", { ascending: false })
      .limit(500);

    if (storeId !== "all") q = q.eq("store_id", storeId);

    const { data, error } = await q;
    setLoading(false);
    setRefreshing(false);
    if (error) {
      toast({ title: "Erro ao carregar cancelamentos", description: error.message, variant: "destructive" });
      setRows([]);
      return;
    }
    const list = (data ?? []) as CancelRow[];
    setRows(list);

    // Carrega nomes dos usuários que cancelaram (best-effort)
    const ids = Array.from(new Set(list.map((r) => r.cancelled_by).filter(Boolean))) as string[];
    if (ids.length > 0) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id,full_name")
        .in("id", ids);
      const map: Record<string, UserLite> = {};
      (prof ?? []).forEach((p: any) => { map[p.id] = { id: p.id, name: p.full_name ?? "" }; });
      setUsers(map);
    } else {
      setUsers({});
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [storeId, from, to]);

  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? "—";
  const channelName = (id: string | null) => id ? (channels.find((c) => c.id === id)?.name ?? "—") : "—";
  const userName = (id: string | null) => id ? (users[id]?.name || id.slice(0, 8)) : "—";

  const stats = useMemo(() => {
    const total = rows.length;
    const lost = rows.reduce((s, r) => s + Number(r.total ?? 0), 0);
    const motivos = new Map<string, { count: number; total: number }>();
    rows.forEach((r) => {
      const key = r.cancellation_reason_text || r.cancellation_reason_code || "Sem motivo";
      const cur = motivos.get(key) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(r.total ?? 0);
      motivos.set(key, cur);
    });
    const top = Array.from(motivos.entries())
      .map(([reason, v]) => ({ reason, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    return { total, lost, top };
  }, [rows]);

  const openDetails = async (r: CancelRow) => {
    setSelected(r);
    setSelectedItems(null);
    setLoadingItems(true);
    const { data } = await supabase
      .from("pdv_order_items")
      .select("name,quantity,unit_price,total_price,notes")
      .eq("order_id", r.id)
      .order("created_at");
    setLoadingItems(false);
    setSelectedItems((data ?? []) as ItemLite[]);
  };

  const exportCsv = () => {
    if (rows.length === 0) {
      toast({ title: "Nada para exportar" });
      return;
    }
    const header = ["Cancelado em", "Pedido", "Loja", "Canal", "Tipo", "Cliente", "Valor", "Motivo", "Cancelado por"];
    const lines = rows.map((r) => [
      fmtDateTime(r.cancelled_at),
      r.external_display_id || r.order_number || r.id.slice(0, 6),
      storeName(r.store_id),
      channelName(r.channel_id),
      r.order_type ?? "",
      r.customer_name ?? "",
      Number(r.total ?? 0).toFixed(2).replace(".", ","),
      (r.cancellation_reason_text || r.cancellation_reason_code || "").replace(/[\r\n;]/g, " "),
      userName(r.cancelled_by),
    ]);
    const csv = [header, ...lines].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cancelamentos_${from}_a_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <XCircle className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Cancelamentos
        </h1>
        <p className="text-muted-foreground">
          Pedidos cancelados no PDV, com valor perdido, motivo e responsável.
        </p>
      </div>

      {/* Filtros */}
      <Card className="p-3 md:p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Loja</Label>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">De</Label>
            <Input type="date" className="h-9" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Até</Label>
            <Input type="date" className="h-9" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <Button variant="outline" className="flex-1" onClick={() => void load()} disabled={refreshing}>
              {refreshing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Atualizar
            </Button>
            <Button variant="outline" onClick={exportCsv} title="Exportar CSV">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Pedidos cancelados</p>
          <p className="text-2xl font-bold mt-1">{stats.total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Valor perdido</p>
          <p className="text-2xl font-bold mt-1 text-destructive">{fmtBRL(stats.lost)}</p>
        </Card>
        <Card className="p-4 col-span-2 md:col-span-1">
          <p className="text-xs text-muted-foreground">Ticket médio cancelado</p>
          <p className="text-2xl font-bold mt-1">
            {stats.total > 0 ? fmtBRL(stats.lost / stats.total) : fmtBRL(0)}
          </p>
        </Card>
      </div>

      {/* Top motivos */}
      {stats.top.length > 0 && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-primary" /> Principais motivos
          </h2>
          <div className="space-y-2">
            {stats.top.map((m) => {
              const pct = stats.total > 0 ? Math.round((m.count / stats.total) * 100) : 0;
              return (
                <div key={m.reason} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate" title={m.reason}>{m.reason}</p>
                    <div className="h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold">{m.count}</p>
                    <p className="text-xs text-muted-foreground">{fmtBRL(m.total)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Lista */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhum cancelamento no período selecionado.
        </Card>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="md:hidden space-y-2">
            {rows.map((r) => (
              <Card key={r.id} className="p-3 space-y-1 cursor-pointer hover:bg-accent/40 transition" onClick={() => void openDetails(r)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm">
                      #{r.external_display_id || r.order_number || r.id.slice(0, 6)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {storeName(r.store_id)} · {channelName(r.channel_id)}
                    </p>
                  </div>
                  <Badge variant="destructive" className="shrink-0">{fmtBRL(r.total)}</Badge>
                </div>
                <p className="text-xs">{r.cancellation_reason_text || r.cancellation_reason_code || "Sem motivo"}</p>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{fmtDateTime(r.cancelled_at)}</span>
                  <span>{userName(r.cancelled_by)}</span>
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop: tabela */}
          <Card className="hidden md:block overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Cancelado em</th>
                    <th className="px-3 py-2">Pedido</th>
                    <th className="px-3 py-2">Loja</th>
                    <th className="px-3 py-2">Canal</th>
                    <th className="px-3 py-2">Cliente</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                    <th className="px-3 py-2">Motivo</th>
                    <th className="px-3 py-2">Por</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-accent/40">
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDateTime(r.cancelled_at)}</td>
                      <td className="px-3 py-2 font-medium">#{r.external_display_id || r.order_number || r.id.slice(0, 6)}</td>
                      <td className="px-3 py-2">{storeName(r.store_id)}</td>
                      <td className="px-3 py-2">{channelName(r.channel_id)}</td>
                      <td className="px-3 py-2 truncate max-w-[180px]">{r.customer_name ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold text-destructive">{fmtBRL(r.total)}</td>
                      <td className="px-3 py-2 max-w-[260px] truncate" title={r.cancellation_reason_text ?? ""}>
                        {r.cancellation_reason_text || r.cancellation_reason_code || "—"}
                      </td>
                      <td className="px-3 py-2 truncate max-w-[140px]">{userName(r.cancelled_by)}</td>
                      <td className="px-3 py-2">
                        <Button size="sm" variant="ghost" onClick={() => void openDetails(r)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* Detalhes */}
      <Dialog open={!!selected} onOpenChange={(v) => { if (!v) { setSelected(null); setSelectedItems(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Pedido cancelado
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-y-1 gap-x-3">
                <span className="text-muted-foreground">Pedido</span>
                <span className="font-medium">#{selected.external_display_id || selected.order_number || selected.id.slice(0, 6)}</span>
                <span className="text-muted-foreground">Loja</span>
                <span>{storeName(selected.store_id)}</span>
                <span className="text-muted-foreground">Canal</span>
                <span>{channelName(selected.channel_id)}</span>
                <span className="text-muted-foreground">Tipo</span>
                <span>{selected.order_type ?? "—"}</span>
                <span className="text-muted-foreground">Cliente</span>
                <span>{selected.customer_name ?? "—"}</span>
                <span className="text-muted-foreground">Aberto em</span>
                <span>{fmtDateTime(selected.opened_at)}</span>
                <span className="text-muted-foreground">Cancelado em</span>
                <span>{fmtDateTime(selected.cancelled_at)}</span>
                <span className="text-muted-foreground">Cancelado por</span>
                <span>{userName(selected.cancelled_by)}</span>
                <span className="text-muted-foreground">Valor</span>
                <span className="font-semibold text-destructive">{fmtBRL(selected.total)}</span>
              </div>

              <div className="rounded-md border p-2 bg-muted/30">
                <p className="text-xs text-muted-foreground mb-1">Motivo</p>
                <p>{selected.cancellation_reason_text || selected.cancellation_reason_code || "Sem motivo informado"}</p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-2">Itens</p>
                {loadingItems ? (
                  <Skeleton className="h-12 w-full" />
                ) : (selectedItems ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Sem itens registrados.</p>
                ) : (
                  <ul className="space-y-1">
                    {(selectedItems ?? []).map((it, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">{it.quantity}× {it.name}</span>
                        <span className="text-muted-foreground shrink-0">{fmtBRL(it.total_price)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
