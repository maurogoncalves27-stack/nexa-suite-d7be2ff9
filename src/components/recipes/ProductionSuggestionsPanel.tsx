import { useEffect, useMemo, useState } from "react";
import { Loader2, ChefHat, Sparkles, Store, ChevronDown, ChevronRight, RefreshCw, Truck } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface StoreBreakdown {
  store_id: string;
  store_name: string;
  stock: number;
  target: number;
  to_send: number;
}

interface SuggestionRow {
  recipe_id: string;
  recipe_name: string;
  yield_quantity: number;
  yield_unit: string;
  output_product_id: string;
  output_product_name: string;
  factory_stock: number;
  total_needed: number;
  suggested_qty: number;
  suggested_multiplier: number;
  store_breakdown: StoreBreakdown[];
}

interface Props {
  onProduce?: (recipeId: string, multiplier: number) => void;
}

const fmt = (n: number, max = 4) =>
  Number(n).toLocaleString("pt-BR", { maximumFractionDigits: max });

const ProductionSuggestionsPanel = ({ onProduce }: Props) => {
  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [distributing, setDistributing] = useState<string | null>(null);
  const [confirmDistribute, setConfirmDistribute] = useState<SuggestionRow | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("production_suggestions");
    if (error) {
      toast.error(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as unknown as SuggestionRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleDistribute = async (row: SuggestionRow) => {
    setDistributing(row.recipe_id);
    try {
      const { data, error } = await supabase.rpc("distribute_factory_production", {
        _output_product_id: row.output_product_id,
        _notes: `Distribuição automática — ${row.recipe_name}`,
      });
      if (error) throw error;
      const list = (data ?? []) as Array<{ destination_name: string; quantity: number }>;
      if (list.length === 0) {
        toast.info("Nenhuma loja com necessidade no momento.");
      } else {
        toast.success(
          `${list.length} transferência(s) criada(s): ${list
            .map((t) => `${t.destination_name} (${fmt(Number(t.quantity))})`)
            .join(", ")}`,
        );
      }
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao distribuir");
    } finally {
      setDistributing(null);
      setConfirmDistribute(null);
    }
  };

  const withSuggestion = useMemo(() => rows.filter((r) => r.suggested_qty > 0), [rows]);
  const okStock = useMemo(() => rows.filter((r) => r.suggested_qty <= 0), [rows]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" /> Sugestão de produção
            </CardTitle>
            <CardDescription>
              Soma a contingência de cada loja vinculada e desconta o estoque atual da fábrica.
            </CardDescription>
          </div>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhuma ficha de fábrica cadastrada com produto final vinculado.
          </p>
        ) : (
          <>
            {withSuggestion.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                ✅ Todas as lojas estão dentro da contingência. Nada a produzir agora.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase">A produzir</p>
                {withSuggestion.map((r) => (
                  <SuggestionCard
                    key={r.recipe_id}
                    row={r}
                    expanded={!!expanded[r.recipe_id]}
                    onToggle={() => setExpanded((p) => ({ ...p, [r.recipe_id]: !p[r.recipe_id] }))}
                    onProduce={onProduce}
                    onDistribute={() => setConfirmDistribute(r)}
                    distributing={distributing === r.recipe_id}
                  />
                ))}
              </div>
            )}

            {okStock.length > 0 && (
              <div className="space-y-2 pt-2 border-t">
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  Sem necessidade ({okStock.length})
                </p>
                {okStock.map((r) => (
                  <div
                    key={r.recipe_id}
                    className="border rounded-md p-2 flex items-center justify-between text-sm bg-muted/30"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.recipe_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Fábrica: {fmt(r.factory_stock)} • Necessidade: {fmt(r.total_needed)}
                      </p>
                    </div>
                    <Badge variant="secondary" className="ml-2 shrink-0">OK</Badge>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>

      <AlertDialog open={!!confirmDistribute} onOpenChange={(o) => !o && setConfirmDistribute(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" /> Distribuir para as lojas?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              {confirmDistribute && (
                <div className="space-y-2 text-sm">
                  <p>
                    Será criada uma transferência da fábrica para cada loja com necessidade do produto{" "}
                    <b>{confirmDistribute.output_product_name}</b>.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Estoque disponível na fábrica: <b>{fmt(confirmDistribute.factory_stock)} {confirmDistribute.yield_unit}</b>
                  </p>
                  <div className="border rounded-md divide-y bg-muted/30">
                    {confirmDistribute.store_breakdown
                      .filter((s) => s.to_send > 0)
                      .map((s) => (
                        <div key={s.store_id} className="flex justify-between text-xs px-2 py-1.5">
                          <span className="truncate">{s.store_name}</span>
                          <span className="font-mono font-semibold text-primary">
                            +{fmt(Math.min(s.to_send, confirmDistribute.factory_stock))}
                          </span>
                        </div>
                      ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Se o estoque da fábrica não cobrir tudo, será priorizada a loja com maior necessidade.
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDistribute && handleDistribute(confirmDistribute)}>
              Distribuir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

const SuggestionCard = ({
  row,
  expanded,
  onToggle,
  onProduce,
  onDistribute,
  distributing,
}: {
  row: SuggestionRow;
  expanded: boolean;
  onToggle: () => void;
  onProduce?: (recipeId: string, multiplier: number) => void;
  onDistribute?: () => void;
  distributing?: boolean;
}) => {
  const lojasComNecessidade = row.store_breakdown.filter((s) => s.to_send > 0).length;
  const canDistribute = row.factory_stock > 0 && lojasComNecessidade > 0;
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="p-3 flex flex-col sm:flex-row sm:items-center gap-2 bg-card">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-semibold truncate">{row.recipe_name}</p>
            <Badge className="text-[10px]">{lojasComNecessidade} loja(s)</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            → {row.output_product_name} • Rendimento: {fmt(row.yield_quantity)} {row.yield_unit}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs mt-1">
            <span>
              Necessidade: <b>{fmt(row.total_needed)} {row.yield_unit}</b>
            </span>
            <span>
              Em estoque (fábrica): <b>{fmt(row.factory_stock)}</b>
            </span>
            <span className="text-primary font-semibold">
              Produzir: {fmt(row.suggested_qty)} {row.yield_unit} ({fmt(row.suggested_multiplier, 0)}×)
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 shrink-0">
          <Button size="sm" variant="ghost" onClick={onToggle} className="gap-1">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Detalhes
          </Button>
          {onDistribute && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              disabled={!canDistribute || distributing}
              onClick={onDistribute}
              title={!canDistribute ? "Sem estoque na fábrica ou sem lojas com necessidade" : "Distribuir o estoque atual da fábrica"}
            >
              {distributing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
              Distribuir
            </Button>
          )}
          {onProduce && (
            <Button
              size="sm"
              className="gap-1"
              onClick={() => onProduce(row.recipe_id, row.suggested_multiplier)}
            >
              <ChefHat className="h-4 w-4" /> Produzir
            </Button>
          )}
        </div>
      </div>
      <Collapsible open={expanded}>
        <CollapsibleContent>
          <div className="border-t bg-muted/30 p-3 space-y-1.5">
            <div className="grid grid-cols-12 gap-2 text-[11px] font-semibold text-muted-foreground uppercase px-1">
              <div className="col-span-6 sm:col-span-5">Loja</div>
              <div className="col-span-2 text-right">Saldo</div>
              <div className="col-span-2 text-right">Alvo</div>
              <div className="col-span-2 sm:col-span-3 text-right">Enviar</div>
            </div>
            {row.store_breakdown.length === 0 ? (
              <p className="text-xs text-muted-foreground italic px-1 py-2">
                Nenhuma loja vinculada a este produto. Vincule lojas em <b>Estoque → produto → ⋯</b>.
              </p>
            ) : (
              row.store_breakdown.map((s) => (
                <div
                  key={s.store_id}
                  className={`grid grid-cols-12 gap-2 text-xs items-center px-1 py-1 rounded ${
                    s.to_send > 0 ? "bg-warning/10" : ""
                  }`}
                >
                  <div className="col-span-6 sm:col-span-5 truncate flex items-center gap-1">
                    <Store className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="truncate">{s.store_name}</span>
                  </div>
                  <div className="col-span-2 text-right font-mono">{fmt(s.stock)}</div>
                  <div className="col-span-2 text-right font-mono text-muted-foreground">{fmt(s.target)}</div>
                  <div className={`col-span-2 sm:col-span-3 text-right font-mono ${s.to_send > 0 ? "font-bold text-warning-foreground" : "text-muted-foreground"}`}>
                    {s.to_send > 0 ? `+${fmt(s.to_send)}` : "—"}
                  </div>
                </div>
              ))
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default ProductionSuggestionsPanel;
