// Painel de adjudicação por FORNECEDOR (não por produto).
// - Sugere automaticamente o vencedor pelo menor R$/un-base entre quem cotou
// - Permite vetar item, alterar quantidade final ou transferir para outro fornecedor que cotou
// - Ao "Fechar e gerar pedidos" cria 1 purchase_order por fornecedor com seus itens vencidos
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2, Ban, RotateCcw, Send, Trophy, AlertTriangle } from "lucide-react";

interface Item {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  base_unit: string | null;
}
interface BidLine {
  id: string;
  bid_id: string;
  quotation_item_id: string;
  unit_price: number | null;
  pack_description: string | null;
  pack_price: number | null;
  pack_content_qty: number | null;
  pack_content_unit: string | null;
  price_per_base_unit: number | null;
  bid: {
    id: string;
    supplier_id: string;
    supplier: { id: string; legal_name: string | null; trade_name: string | null } | null;
  } | null;
}
interface AwardRow {
  id?: string;
  quotation_item_id: string;
  bid_item_id: string | null;
  supplier_id: string | null;
  final_quantity: number | null;
  is_vetoed: boolean;
}

const fmt = (v: number | null | undefined, d = 4) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: d });
const fmtN = (v: number | null | undefined) =>
  Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

interface Props {
  quotationId: string;
  storeId: string | null;
  onClosed?: () => void;
}

export default function QuotationAwardPanel({ quotationId, storeId, onClosed }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [bidsByItem, setBidsByItem] = useState<Record<string, BidLine[]>>({});
  const [awards, setAwards] = useState<Record<string, AwardRow>>({});
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data: its } = await supabase
        .from("quotation_items")
        .select("id, description, quantity, unit, base_unit")
        .eq("quotation_id", quotationId)
        .order("sort_order");
      if (cancel) return;
      const itemList = (its ?? []) as Item[];
      setItems(itemList);
      if (itemList.length === 0) { setLoading(false); return; }

      const { data: bidLines } = await supabase
        .from("quotation_bid_items")
        .select("id, bid_id, quotation_item_id, unit_price, pack_description, pack_price, pack_content_qty, pack_content_unit, price_per_base_unit, bid:quotation_bids(id, supplier_id, supplier:suppliers(id, legal_name, trade_name))")
        .in("quotation_item_id", itemList.map((i) => i.id));

      const grouped: Record<string, BidLine[]> = {};
      for (const bl of (bidLines ?? []) as any[]) {
        (grouped[bl.quotation_item_id as string] ||= []).push(bl as BidLine);
      }
      for (const k of Object.keys(grouped)) {
        grouped[k].sort((a, b) => Number(a.price_per_base_unit ?? Infinity) - Number(b.price_per_base_unit ?? Infinity));
      }
      setBidsByItem(grouped);

      // carrega adjudicações existentes
      const { data: aws } = await supabase
        .from("quotation_awards")
        .select("id, quotation_item_id, bid_item_id, supplier_id, final_quantity, is_vetoed")
        .eq("quotation_id", quotationId);
      const existing: Record<string, AwardRow> = {};
      for (const a of (aws ?? []) as AwardRow[]) existing[a.quotation_item_id] = a;

      // sugere vencedor automaticamente para itens sem award
      const next: Record<string, AwardRow> = {};
      for (const it of itemList) {
        if (existing[it.id]) {
          next[it.id] = existing[it.id];
          continue;
        }
        const top = grouped[it.id]?.[0];
        next[it.id] = {
          quotation_item_id: it.id,
          bid_item_id: top?.id ?? null,
          supplier_id: top?.bid?.supplier_id ?? null,
          final_quantity: it.quantity,
          is_vetoed: false,
        };
      }
      setAwards(next);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [quotationId]);

  const updateAward = (itemId: string, patch: Partial<AwardRow>) => {
    setAwards((p) => ({ ...p, [itemId]: { ...p[itemId], ...patch } }));
  };

  const transferTo = (itemId: string, bidItemId: string) => {
    const bid = (bidsByItem[itemId] || []).find((b) => b.id === bidItemId);
    if (!bid) return;
    updateAward(itemId, { bid_item_id: bid.id, supplier_id: bid.bid?.supplier_id ?? null, is_vetoed: false });
  };

  const toggleVeto = (itemId: string) => {
    const a = awards[itemId];
    updateAward(itemId, { is_vetoed: !a.is_vetoed });
  };

  // agrupamento por fornecedor para exibição
  const grouped = useMemo(() => {
    type Group = { supplierId: string; supplierName: string; lines: { item: Item; bid: BidLine | null; award: AwardRow }[]; total: number };
    const map: Record<string, Group> = {};
    for (const it of items) {
      const a = awards[it.id];
      if (!a || a.is_vetoed || !a.supplier_id) continue;
      const bid = (bidsByItem[it.id] || []).find((b) => b.id === a.bid_item_id) ?? null;
      const supName = bid?.bid?.supplier?.trade_name || bid?.bid?.supplier?.legal_name || "—";
      const key = a.supplier_id;
      const g = (map[key] ||= { supplierId: key, supplierName: supName, lines: [], total: 0 });
      g.lines.push({ item: it, bid, award: a });
      const price = Number(bid?.price_per_base_unit ?? 0);
      g.total += price * Number(a.final_quantity ?? 0);
    }
    return Object.values(map);
  }, [items, awards, bidsByItem]);

  const vetoed = items.filter((it) => awards[it.id]?.is_vetoed).length;
  const sem = items.filter((it) => !awards[it.id]?.is_vetoed && !awards[it.id]?.supplier_id).length;

  const saveAwards = async () => {
    const rows = items.map((it) => {
      const a = awards[it.id];
      return {
        quotation_id: quotationId,
        quotation_item_id: it.id,
        bid_item_id: a?.is_vetoed ? null : a?.bid_item_id ?? null,
        supplier_id: a?.is_vetoed ? null : a?.supplier_id ?? null,
        final_quantity: a?.final_quantity ?? it.quantity,
        is_vetoed: !!a?.is_vetoed,
      };
    });
    const { error } = await supabase
      .from("quotation_awards")
      .upsert(rows, { onConflict: "quotation_item_id" });
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return false;
    }
    return true;
  };

  const closeAndGenerate = async () => {
    if (grouped.length === 0) {
      toast({ title: "Nenhum item adjudicado", description: "Selecione ao menos um vencedor antes de fechar.", variant: "destructive" });
      return;
    }
    setClosing(true);
    const ok = await saveAwards();
    if (!ok) { setClosing(false); return; }

    // cria uma purchase_order por fornecedor
    const { data: userRes } = await supabase.auth.getUser();
    let createdCount = 0;
    for (const g of grouped) {
      const total = g.lines.reduce((s, l) => s + Number(l.bid?.price_per_base_unit ?? 0) * Number(l.award.final_quantity ?? 0), 0);
      const { data: po, error: poErr } = await supabase
        .from("purchase_orders")
        .insert({
          quotation_id: quotationId,
          supplier_id: g.supplierId,
          store_id: storeId,
          status: "sent",
          total_amount: Number(total.toFixed(2)),
          created_by: userRes.user?.id ?? null,
        })
        .select("id")
        .single();
      if (poErr || !po) {
        toast({ title: `Erro ao gerar pedido (${g.supplierName})`, description: poErr?.message, variant: "destructive" });
        continue;
      }
      const itemsPayload = g.lines.map((l) => ({
        purchase_order_id: po.id,
        quotation_item_id: l.item.id,
        description: l.item.description,
        ordered_quantity: Number(l.award.final_quantity ?? l.item.quantity),
        unit: (l.item.base_unit || l.item.unit || "UN").toUpperCase(),
        unit_price: Number(l.bid?.price_per_base_unit ?? 0),
        pack_description: l.bid?.pack_description ?? null,
        status: "pending",
      }));
      await supabase.from("purchase_order_items").insert(itemsPayload);
      createdCount++;
    }

    // marca cotação como adjudicada
    await supabase.from("quotations").update({ status: "awarded" }).eq("id", quotationId);
    setClosing(false);
    toast({ title: "Cotação fechada", description: `${createdCount} pedido(s) gerado(s).` });
    onClosed?.();
  };

  if (loading) {
    return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (items.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">Sem itens nesta cotação.</p>;

  return (
    <div className="space-y-4">
      {/* Resumo / ação principal */}
      <Card className="border-primary/40">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Resumo da adjudicação</CardTitle>
              <CardDescription>
                {grouped.length} fornecedor(es) · {items.length - vetoed - sem} itens adjudicados
                {vetoed > 0 && <> · {vetoed} vetado(s)</>}
                {sem > 0 && <> · <span className="text-amber-600">{sem} sem vencedor</span></>}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={async () => { if (await saveAwards()) toast({ title: "Rascunho salvo" }); }}>
                Salvar rascunho
              </Button>
              <Button size="sm" onClick={closeAndGenerate} disabled={closing}>
                {closing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                Fechar e gerar pedidos
              </Button>
            </div>
          </div>
        </CardHeader>
        {grouped.length > 0 && (
          <CardContent className="pt-0">
            <div className="grid gap-2 sm:grid-cols-2">
              {grouped.map((g) => (
                <div key={g.supplierId} className="rounded border p-2 text-xs">
                  <div className="font-medium truncate">{g.supplierName}</div>
                  <div className="text-muted-foreground">{g.lines.length} item(ns) · <span className="font-semibold text-foreground">{fmt(g.total, 2)}</span></div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Itens com controles */}
      {items.map((it) => {
        const baseUnit = (it.base_unit || it.unit || "UN").toUpperCase();
        const bids = bidsByItem[it.id] ?? [];
        const a = awards[it.id];
        const winnerId = a?.bid_item_id ?? "";
        return (
          <Card key={it.id} className={a?.is_vetoed ? "opacity-60 border-destructive/40" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between gap-2 flex-wrap">
                <span className="flex items-center gap-2">
                  {a?.is_vetoed && <Badge variant="destructive" className="text-[10px]">Vetado</Badge>}
                  <span>{it.description}</span>
                </span>
                <span className="text-xs text-muted-foreground font-normal">
                  Pedido: <strong>{fmtN(it.quantity)} {it.unit}</strong> · comparação por <strong>{baseUnit}</strong>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {bids.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem propostas para este item.</p>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-3 items-end">
                    <div>
                      <label className="text-[11px] text-muted-foreground">Fornecedor vencedor</label>
                      <Select value={winnerId} onValueChange={(v) => transferTo(it.id, v)} disabled={a?.is_vetoed}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                        <SelectContent>
                          {bids.map((b, idx) => {
                            const name = b.bid?.supplier?.trade_name || b.bid?.supplier?.legal_name || "—";
                            return (
                              <SelectItem key={b.id} value={b.id}>
                                {idx === 0 ? "🏆 " : ""}{name} · {fmt(b.price_per_base_unit ?? 0)}/{baseUnit.toLowerCase()}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground">Quantidade final ({baseUnit})</label>
                      <Input
                        type="number"
                        step="0.001"
                        value={a?.final_quantity ?? ""}
                        onChange={(e) => updateAward(it.id, { final_quantity: e.target.value === "" ? null : Number(e.target.value) })}
                        disabled={a?.is_vetoed}
                        className="h-9"
                      />
                    </div>
                    <div>
                      <Button
                        variant={a?.is_vetoed ? "outline" : "destructive"}
                        size="sm"
                        className="w-full"
                        onClick={() => toggleVeto(it.id)}
                      >
                        {a?.is_vetoed ? <><RotateCcw className="h-4 w-4 mr-1" /> Restaurar item</> : <><Ban className="h-4 w-4 mr-1" /> Vetar item</>}
                      </Button>
                    </div>
                  </div>

                  {/* lista comparativa */}
                  <div className="space-y-1">
                    {bids.map((b, idx) => {
                      const supplierName = b.bid?.supplier?.trade_name || b.bid?.supplier?.legal_name || "—";
                      const incompat = !!b.pack_content_unit && b.pack_content_unit.toUpperCase() !== baseUnit;
                      const isWinner = b.id === winnerId && !a?.is_vetoed;
                      return (
                        <div
                          key={b.id}
                          className={`flex items-center justify-between gap-2 rounded border p-2 text-xs ${isWinner ? "border-emerald-500/50 bg-emerald-500/5" : ""}`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-medium flex items-center gap-1.5">
                              {isWinner && <Trophy className="h-3.5 w-3.5 text-emerald-600" />}
                              <span className="truncate">{supplierName}</span>
                              {idx === 0 && !isWinner && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">menor preço</Badge>}
                              {incompat && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-amber-500/50 text-amber-600">
                                  <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> unidade incompatível
                                </Badge>
                              )}
                            </div>
                            <div className="text-muted-foreground text-[11px]">
                              {b.pack_description || (b.pack_content_qty ? `${fmtN(b.pack_content_qty)} ${b.pack_content_unit ?? ""}` : "embalagem não informada")}
                              {b.pack_price != null && <> · {fmt(b.pack_price, 2)}/emb</>}
                            </div>
                          </div>
                          <div className="text-right shrink-0 tabular-nums">
                            <div className={`font-semibold ${isWinner ? "text-emerald-600" : ""}`}>
                              {fmt(b.price_per_base_unit ?? 0)}/{baseUnit.toLowerCase()}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
