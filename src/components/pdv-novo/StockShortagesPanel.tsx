// Painel de rupturas + últimas baixas de estoque do PDV próprio (Fase C).
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, PackageX, RefreshCw, Loader2 } from "lucide-react";

interface Shortage {
  store_id: string;
  product_id: string;
  product_name: string;
  unit: string | null;
  current_qty: number;
  min_qty: number | null;
  severity: "out" | "low" | "ok";
  updated_at: string;
}

interface Movement {
  id: string;
  product_id: string;
  quantity: number;
  created_at: string;
  notes: string | null;
  product?: { name: string; unit: string | null } | null;
}

interface Props {
  storeId: string;
}

export default function StockShortagesPanel({ storeId }: Props) {
  const [shortages, setShortages] = useState<Shortage[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    const [sh, mv] = await Promise.all([
      supabase
        .from("pdv_stock_shortages" as never)
        .select("*")
        .eq("store_id", storeId)
        .order("severity", { ascending: true })
        .order("current_qty", { ascending: true }),
      supabase
        .from("inventory_stock_movements")
        .select("id,product_id,quantity,created_at,notes,product:inventory_products(name,unit)")
        .eq("store_id", storeId)
        .eq("movement_type", "sale")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setShortages(((sh.data ?? []) as unknown) as Shortage[]);
    setMovements((mv.data ?? []) as unknown as Movement[]);
    setLoading(false);
  }, [storeId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3 flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Rupturas de estoque
            </CardTitle>
            <CardDescription className="text-xs">
              Produtos zerados ou abaixo do mínimo nesta loja.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </Button>
        </CardHeader>
        <CardContent>
          {shortages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              ✓ Tudo em dia. Nenhuma ruptura no momento.
            </p>
          ) : (
            <div className="space-y-2">
              {shortages.map((s) => (
                <div
                  key={s.product_id}
                  className="flex items-center justify-between gap-2 rounded-md border p-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{s.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Atual: <strong>{Number(s.current_qty).toFixed(2)}</strong> {s.unit ?? ""}
                      {s.min_qty != null && <> · mín. {Number(s.min_qty).toFixed(2)}</>}
                    </p>
                  </div>
                  <Badge
                    variant={s.severity === "out" ? "destructive" : "secondary"}
                    className="shrink-0"
                  >
                    {s.severity === "out" ? "Zerado" : "Baixo"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <PackageX className="h-4 w-4 text-muted-foreground" />
            Últimas baixas por venda
          </CardTitle>
          <CardDescription className="text-xs">
            Movimentos do tipo "venda" (PDV/Totem/Balcão/iFood) — últimos 20.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {movements.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Sem baixas registradas ainda.
            </p>
          ) : (
            <div className="space-y-1.5">
              {movements.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 text-xs border-b pb-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{m.product?.name ?? m.product_id}</p>
                    <p className="text-muted-foreground">
                      {new Date(m.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <span className="text-destructive font-mono shrink-0">
                    {Number(m.quantity).toFixed(2)} {m.product?.unit ?? ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
