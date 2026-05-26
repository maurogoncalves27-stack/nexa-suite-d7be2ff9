// Painel "Custo & Rendimento" exibido dentro do editor de receita.
// Mostra fator de conversão (cru→pronto), custo total, custo por unidade e por porção (se houver).
import { useEffect, useState } from "react";
import { Loader2, Calculator, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { calcRecipeCost, type RecipeCostResult } from "@/lib/recipeCost";

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const fmtNum = (v: number, d = 3) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: d });

interface Props {
  recipeId: string;
}

export default function RecipeYieldCostPanel({ recipeId }: Props) {
  const [data, setData] = useState<RecipeCostResult | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const r = await calcRecipeCost(recipeId);
    setData(r);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Calculando custo…
      </div>
    );
  }
  if (!data) return null;

  const { totalCost, yieldQty, yieldUnit, costPerYieldUnit, inputBaseQty, conversionFactor, ingredientLines } = data;

  return (
    <div className="border rounded-md bg-muted/30 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-medium text-sm">
          <Calculator className="h-4 w-4 text-primary" /> Custo & Rendimento
        </div>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Custo total" value={fmtBRL(totalCost)} />
        <Stat label="Rende" value={`${fmtNum(yieldQty)} ${yieldUnit}`} />
        <Stat label={`Custo / ${yieldUnit || "un"}`} value={fmtBRL(costPerYieldUnit)} highlight />
        {conversionFactor > 0 && inputBaseQty > 0 && (
          <Stat
            label="Fator (rende ÷ entra)"
            value={`${fmtNum(conversionFactor, 3)}×`}
            hint={`${fmtNum(inputBaseQty)} → ${fmtNum(yieldQty)} ${yieldUnit}`}
          />
        )}
      </div>

      {ingredientLines.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
            Ver composição ({ingredientLines.length} {ingredientLines.length === 1 ? "ingrediente" : "ingredientes"})
          </summary>
          <div className="mt-2 space-y-1">
            {ingredientLines.map((l) => (
              <div key={l.productId} className="flex items-center justify-between gap-2 border-b border-border/40 pb-1 last:border-0">
                <div className="min-w-0 flex-1 flex items-center gap-1.5">
                  <span className="truncate">{l.name}</span>
                  {l.isProduced && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-purple-500/40 text-purple-600 dark:text-purple-300">
                      ficha
                    </Badge>
                  )}
                </div>
                <div className="text-right shrink-0 tabular-nums">
                  <div>{fmtNum(l.quantity)} {l.unit}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {l.unitCost > 0 ? `${fmtBRL(l.unitCost)} • ${fmtBRL(l.lineCost)}` : "sem custo"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {ingredientLines.some((l) => l.unitCost === 0) && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          ⚠ Alguns ingredientes não têm custo cadastrado (entrada de NF-e ou ficha sem custo). O total pode estar incompleto.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, hint, highlight }: { label: string; value: string; hint?: string; highlight?: boolean }) {
  return (
    <div className={`rounded border bg-card p-2 ${highlight ? "border-primary/50" : ""}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${highlight ? "text-primary" : ""}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
