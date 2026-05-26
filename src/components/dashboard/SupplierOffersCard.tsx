import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tag, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type OfferRow = {
  id: string;
  supplier_id: string;
  offer_type: "launch" | "promo" | "surplus";
  title: string;
  description: string | null;
  price: number | null;
  unit: string | null;
  valid_until: string | null;
  created_at: string;
  suppliers?: { trade_name: string | null; legal_name: string } | null;
};

const TYPE_LABELS: Record<OfferRow["offer_type"], { label: string; variant: "default" | "secondary" | "outline" }> = {
  launch: { label: "Lançamento", variant: "default" },
  promo: { label: "Promoção", variant: "secondary" },
  surplus: { label: "Excedente", variant: "outline" },
};

export function SupplierOffersCard() {
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("supplier_offers")
        .select("id, supplier_id, offer_type, title, description, price, unit, valid_until, created_at, suppliers(trade_name, legal_name)")
        .eq("is_active", true)
        .or(`valid_until.is.null,valid_until.gte.${today}`)
        .order("created_at", { ascending: false })
        .limit(5);
      setOffers((data as OfferRow[]) ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) return null;
  if (offers.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Tag className="h-4 w-4 text-primary" /> Ofertas dos fornecedores
        </CardTitle>
        <Badge variant="secondary" className="text-[10px]">{offers.length} ativas</Badge>
      </CardHeader>
      <CardContent className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {offers.map((o) => {
          const t = TYPE_LABELS[o.offer_type];
          const supplierName = o.suppliers?.trade_name || o.suppliers?.legal_name || "Fornecedor";
          return (
            <div key={o.id} className="rounded-md border bg-background p-3 space-y-1.5 hover:shadow-sm transition">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={t.variant} className="text-[10px]">{t.label}</Badge>
                <span className="text-[10px] text-muted-foreground truncate">{supplierName}</span>
              </div>
              <div className="font-medium text-sm line-clamp-1">{o.title}</div>
              {o.description && (
                <div className="text-xs text-muted-foreground line-clamp-2">{o.description}</div>
              )}
              <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground pt-1">
                {o.price != null && (
                  <span className="font-semibold text-foreground">
                    R$ {Number(o.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    {o.unit && <span className="font-normal text-muted-foreground">/{o.unit}</span>}
                  </span>
                )}
                {o.valid_until && <span>Até {format(new Date(o.valid_until + "T00:00:00"), "dd/MM", { locale: ptBR })}</span>}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
