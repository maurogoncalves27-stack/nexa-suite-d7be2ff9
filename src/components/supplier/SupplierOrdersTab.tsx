// Aba "Pedidos recebidos" do fornecedor.
// Mostra purchase_orders dele e permite confirmar item por item ou marcar corte (qtd parcial + motivo).
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Scissors, PackageCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface POItem {
  id: string;
  description: string;
  ordered_quantity: number;
  unit: string;
  unit_price: number;
  pack_description: string | null;
  fulfilled_quantity: number | null;
  cut_reason: string | null;
  status: "pending" | "confirmed" | "cut" | "cancelled";
}
interface PO {
  id: string;
  status: string;
  total_amount: number;
  sent_at: string | null;
  notes: string | null;
  supplier_notes: string | null;
  quotation: { title: string } | null;
  items: POItem[];
}

const fmtMoney = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const statusBadge = (s: string) => {
  const map: Record<string, { label: string; variant: any }> = {
    sent: { label: "Recebido", variant: "default" },
    confirmed: { label: "Confirmado", variant: "default" },
    partial: { label: "Parcial / com cortes", variant: "secondary" },
    fulfilled: { label: "Atendido", variant: "default" },
    cancelled: { label: "Cancelado", variant: "destructive" },
  };
  const c = map[s] ?? { label: s, variant: "outline" };
  return <Badge variant={c.variant}>{c.label}</Badge>;
};

export default function SupplierOrdersTab({ supplierId }: { supplierId: string | null }) {
  const [orders, setOrders] = useState<PO[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, { qty: string; reason: string }>>({});
  const [savingPO, setSavingPO] = useState<string | null>(null);

  const load = async () => {
    if (!supplierId) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("purchase_orders")
      .select("id, status, total_amount, sent_at, notes, supplier_notes, quotation:quotations(title), items:purchase_order_items(*)")
      .eq("supplier_id", supplierId)
      .order("sent_at", { ascending: false });
    setOrders((data ?? []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, [supplierId]);

  const setEdit = (id: string, patch: Partial<{ qty: string; reason: string }>) => {
    setEdits((p) => ({ ...p, [id]: { qty: p[id]?.qty ?? "", reason: p[id]?.reason ?? "", ...patch } }));
  };

  const confirmFull = async (item: POItem) => {
    await supabase.from("purchase_order_items").update({
      status: "confirmed",
      fulfilled_quantity: item.ordered_quantity,
      cut_reason: null,
    }).eq("id", item.id);
    load();
  };

  const applyCut = async (item: POItem) => {
    const e = edits[item.id];
    const qty = Number(e?.qty);
    const reason = (e?.reason ?? "").trim();
    if (!Number.isFinite(qty) || qty < 0 || qty >= item.ordered_quantity) {
      toast({ title: "Quantidade de corte inválida", description: "Informe um valor menor que o pedido.", variant: "destructive" });
      return;
    }
    if (!reason) {
      toast({ title: "Informe o motivo do corte", variant: "destructive" });
      return;
    }
    await supabase.from("purchase_order_items").update({
      status: qty === 0 ? "cancelled" : "cut",
      fulfilled_quantity: qty,
      cut_reason: reason,
    }).eq("id", item.id);
    load();
  };

  const finalizePO = async (po: PO) => {
    setSavingPO(po.id);
    // recarrega itens atualizados
    const { data: its } = await supabase
      .from("purchase_order_items")
      .select("status, fulfilled_quantity, ordered_quantity")
      .eq("purchase_order_id", po.id);
    const list = its ?? [];
    const anyCut = list.some((i: any) => i.status === "cut" || i.status === "cancelled");
    const allOk = list.every((i: any) => i.status === "confirmed");
    const newStatus = allOk ? "fulfilled" : anyCut ? "partial" : "confirmed";
    await supabase.from("purchase_orders").update({
      status: newStatus,
      confirmed_at: new Date().toISOString(),
    }).eq("id", po.id);
    setSavingPO(null);
    toast({ title: "Pedido enviado ao gestor", description: anyCut ? "Cortes registrados." : "Sem cortes." });
    load();
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (orders.length === 0) {
    return <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhum pedido recebido ainda.</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      {orders.map((po) => (
        <Card key={po.id}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <CardTitle className="text-base">{po.quotation?.title ?? "Pedido"}</CardTitle>
                <CardDescription>
                  {po.sent_at && <>Recebido em {format(new Date(po.sent_at), "dd/MM/yyyy HH:mm", { locale: ptBR })} · </>}
                  Total: <strong>{fmtMoney(Number(po.total_amount))}</strong>
                </CardDescription>
              </div>
              {statusBadge(po.status)}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {po.items.map((it) => {
              const e = edits[it.id] ?? { qty: String(it.fulfilled_quantity ?? ""), reason: it.cut_reason ?? "" };
              const isClosed = po.status === "fulfilled" || po.status === "partial" || po.status === "cancelled";
              return (
                <div key={it.id} className="rounded border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{it.description}</div>
                      <div className="text-xs text-muted-foreground">
                        Pedido: <strong>{Number(it.ordered_quantity).toLocaleString("pt-BR")} {it.unit}</strong>
                        {it.pack_description && <> · {it.pack_description}</>}
                        {" · "}{fmtMoney(Number(it.unit_price))}/{it.unit.toLowerCase()}
                      </div>
                    </div>
                    <Badge variant={it.status === "confirmed" ? "default" : it.status === "cut" ? "secondary" : it.status === "cancelled" ? "destructive" : "outline"}>
                      {it.status === "pending" && "A confirmar"}
                      {it.status === "confirmed" && "Confirmado"}
                      {it.status === "cut" && "Cortado parcial"}
                      {it.status === "cancelled" && "Não atende"}
                    </Badge>
                  </div>

                  {!isClosed && (
                    <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto_auto] sm:items-end">
                      <Button size="sm" variant="outline" onClick={() => confirmFull(it)} disabled={it.status === "confirmed"}>
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Atendo tudo
                      </Button>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="number"
                          step="0.001"
                          placeholder={`Qtd que entrego (max ${it.ordered_quantity})`}
                          value={e.qty}
                          onChange={(ev) => setEdit(it.id, { qty: ev.target.value })}
                        />
                        <Input
                          placeholder="Motivo do corte"
                          value={e.reason}
                          onChange={(ev) => setEdit(it.id, { reason: ev.target.value })}
                        />
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => applyCut(it)}>
                        <Scissors className="h-4 w-4 mr-1" /> Aplicar corte
                      </Button>
                    </div>
                  )}

                  {it.cut_reason && (
                    <div className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300 rounded px-2 py-1">
                      Corte: {Number(it.fulfilled_quantity ?? 0).toLocaleString("pt-BR")} {it.unit} — {it.cut_reason}
                    </div>
                  )}
                </div>
              );
            })}

            {(po.status === "sent" || po.status === "confirmed") && (
              <div className="space-y-2 pt-2 border-t">
                <Textarea
                  placeholder="Observações ao gestor (opcional)"
                  value={po.supplier_notes ?? ""}
                  onChange={async (e) => {
                    setOrders((p) => p.map((x) => x.id === po.id ? { ...x, supplier_notes: e.target.value } : x));
                  }}
                  onBlur={async (e) => {
                    await supabase.from("purchase_orders").update({ supplier_notes: e.target.value }).eq("id", po.id);
                  }}
                />
                <Button size="sm" onClick={() => finalizePO(po)} disabled={savingPO === po.id}>
                  {savingPO === po.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <PackageCheck className="h-4 w-4 mr-1" />}
                  Confirmar pedido para o gestor
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
