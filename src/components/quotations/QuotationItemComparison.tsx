// Comparação item-a-item de uma cotação, normalizada por unidade-base.
// Mostra cada item com as ofertas dos fornecedores ranqueadas por R$/unidade-base,
// destacando o melhor preço em verde e marcando incompatibilidades de unidade.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trophy, AlertTriangle } from "lucide-react";

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
  unit_price: number | null;
  available_quantity: number | null;
  pack_description: string | null;
  pack_price: number | null;
  pack_content_qty: number | null;
  pack_content_unit: string | null;
  min_order_packs: number | null;
  price_per_base_unit: number | null;
  bid: {
    id: string;
    supplier: { legal_name: string | null; trade_name: string | null } | null;
  } | null;
}

const fmt = (v: number | null | undefined, d = 4) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: d });
const fmtN = (v: number | null | undefined) =>
  Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

interface Props { quotationId: string }

export default function QuotationItemComparison({ quotationId }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [bidsByItem, setBidsByItem] = useState<Record<string, BidLine[]>>({});
  const [loading, setLoading] = useState(false);

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
        .select("id, bid_id, quotation_item_id, unit_price, available_quantity, pack_description, pack_price, pack_content_qty, pack_content_unit, min_order_packs, price_per_base_unit, bid:quotation_bids(id, supplier:suppliers(legal_name, trade_name))")
        .in("quotation_item_id", itemList.map((i) => i.id));

      const grouped: Record<string, BidLine[]> = {};
      for (const bl of (bidLines ?? []) as any[]) {
        const k = bl.quotation_item_id as string;
        (grouped[k] ||= []).push(bl as BidLine);
      }
      // ordena por preço por unidade-base ascendente
      for (const k of Object.keys(grouped)) {
        grouped[k].sort((a, b) => (Number(a.price_per_base_unit ?? Infinity) - Number(b.price_per_base_unit ?? Infinity)));
      }
      setBidsByItem(grouped);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [quotationId]);

  if (loading) {
    return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (items.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">Sem itens nesta cotação.</p>;

  return (
    <div className="space-y-3">
      {items.map((it) => {
        const baseUnit = (it.base_unit || it.unit || "UN").toUpperCase();
        const bids = bidsByItem[it.id] ?? [];
        return (
          <Card key={it.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between gap-2 flex-wrap">
                <span>{it.description}</span>
                <span className="text-xs text-muted-foreground font-normal">
                  Pedido: <strong>{fmtN(it.quantity)} {it.unit}</strong> · comparação por <strong>{baseUnit}</strong>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {bids.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">Sem propostas para este item.</p>
              ) : (
                <div className="space-y-1.5">
                  {bids.map((b, idx) => {
                    const supplierName = b.bid?.supplier?.trade_name || b.bid?.supplier?.legal_name || "—";
                    const incompat = !!b.pack_content_unit && b.pack_content_unit.toUpperCase() !== baseUnit;
                    const priceBase = Number(b.price_per_base_unit ?? 0);
                    const totalForOrder = priceBase * Number(it.quantity || 0);
                    return (
                      <div
                        key={b.id}
                        className={`flex items-center justify-between gap-2 rounded border p-2 text-xs ${
                          idx === 0 && !incompat ? "border-emerald-500/50 bg-emerald-500/5" : ""
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium flex items-center gap-1.5">
                            {idx === 0 && !incompat && <Trophy className="h-3.5 w-3.5 text-emerald-600" />}
                            <span className="truncate">{supplierName}</span>
                            {incompat && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-amber-500/50 text-amber-600">
                                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> unidade incompatível
                              </Badge>
                            )}
                          </div>
                          <div className="text-muted-foreground text-[11px]">
                            {b.pack_description || (b.pack_content_qty
                              ? `${fmtN(b.pack_content_qty)} ${b.pack_content_unit ?? ""}`
                              : "embalagem não informada")}
                            {b.pack_price != null && <> · {fmt(b.pack_price, 2)}/emb</>}
                            {b.min_order_packs && Number(b.min_order_packs) > 1 && <> · mín. {fmtN(b.min_order_packs)} emb</>}
                          </div>
                        </div>
                        <div className="text-right shrink-0 tabular-nums">
                          <div className={`font-semibold ${idx === 0 && !incompat ? "text-emerald-600" : ""}`}>
                            {fmt(priceBase)}/{baseUnit.toLowerCase()}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            total: {fmt(totalForOrder, 2)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
