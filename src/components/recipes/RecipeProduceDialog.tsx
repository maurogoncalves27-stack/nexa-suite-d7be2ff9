import { useEffect, useMemo, useState } from "react";
import { Loader2, ChefHat, AlertTriangle, ClipboardCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { isFactoryName } from "@/lib/factory";
import { toast } from "sonner";
import { sortStores } from "@/lib/storeSort";

interface Ingredient {
  product_id: string;
  quantity: number;
  unit: string;
  product_name: string;
  average_cost: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  recipe: {
    id: string;
    name: string;
    yield_quantity: number;
    yield_unit: string;
    scope?: "fabrica" | "loja";
    output_product_id?: string;
    shelf_life_days?: number | null;
  } | null;
  onProduced?: () => void;
}

interface Store {
  id: string;
  name: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const RecipeProduceDialog = ({ open, onOpenChange, recipe, onProduced }: Props) => {
  const { user, isAdmin, isManager } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [multiplier, setMultiplier] = useState<string>("1");
  const [notes, setNotes] = useState("");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requiresExpiry, setRequiresExpiry] = useState(false);
  const [shelfLifeDays, setShelfLifeDays] = useState<number | null>(null);
  const [manufactureDate, setManufactureDate] = useState<string>(todayISO());
  const [expiryDate, setExpiryDate] = useState<string>("");
  const [lotNumber, setLotNumber] = useState<string>("");
  const [requestedQty, setRequestedQty] = useState<number>(0);
  const [divergenceReason, setDivergenceReason] = useState<string>("");

  useEffect(() => {
    if (!open || !recipe) return;
    const load = async () => {
      setLoading(true);
      // lojas acessíveis
      let query = supabase.from("stores").select("id, name, store_type").eq("is_virtual", false).order("name");
      if (!isAdmin && !isManager && user) {
        const { data: emp } = await supabase
          .from("employees")
          .select("store_id, allocated_store_id")
          .eq("user_id", user.id)
          .maybeSingle();
        const ids = [emp?.store_id, emp?.allocated_store_id].filter(Boolean) as string[];
        if (ids.length) query = query.in("id", ids);
      }
      const { data: st } = await query;
      // Filtra por escopo da ficha: 'fabrica' só mostra lojas-CD; 'loja' exclui CD
      const scope = recipe.scope ?? "loja";
      const filteredStores = (st ?? []).filter((s) =>
        scope === "fabrica" ? isFactoryName(s.name) : !isFactoryName(s.name),
      );
      setStores(sortStores(filteredStores));
      if (filteredStores.length === 1) setStoreId(filteredStores[0].id);

      const { data: ing } = await supabase
        .from("recipe_ingredients")
        .select("product_id, quantity, unit, inventory_products(name, average_cost)")
        .eq("recipe_id", recipe.id)
        .order("sort_order");

      const mapped: Ingredient[] = (ing ?? []).map((r: any) => ({
        product_id: r.product_id,
        quantity: Number(r.quantity),
        unit: r.unit,
        product_name: r.inventory_products?.name ?? "—",
        average_cost: Number(r.inventory_products?.average_cost ?? 0),
      }));
      setIngredients(mapped);

      // Carrega regra de validade do produto resultante e dias da ficha
      const { data: rec } = await supabase
        .from("recipes")
        .select("shelf_life_days, output_product_id, inventory_products!recipes_output_product_id_fkey(requires_expiry, default_shelf_life_days)")
        .eq("id", recipe.id)
        .maybeSingle();
      const days = (rec as any)?.shelf_life_days ?? (rec as any)?.inventory_products?.default_shelf_life_days ?? null;
      const reqExp = Boolean((rec as any)?.inventory_products?.requires_expiry);
      setShelfLifeDays(days);
      setRequiresExpiry(reqExp);
      setManufactureDate(todayISO());
      setExpiryDate(days ? addDaysISO(Number(days)) : "");
      setLotNumber("");

      // Total solicitado pelas lojas (pendente) para o produto final desta ficha
      const { data: pending } = await supabase.rpc("pending_request_for_recipe" as any, { _recipe_id: recipe.id });
      setRequestedQty(Number(pending ?? 0));
      setDivergenceReason("");

      setLoading(false);
    };
    load();
  }, [open, recipe, user, isAdmin, isManager]);

  // Buscar saldo dos ingredientes na loja selecionada
  useEffect(() => {
    if (!storeId || ingredients.length === 0) {
      setStockMap({});
      return;
    }
    const load = async () => {
      const ids = ingredients.map((i) => i.product_id);
      const { data } = await supabase
        .from("inventory_stock")
        .select("product_id, quantity")
        .eq("store_id", storeId)
        .in("product_id", ids);
      const map: Record<string, number> = {};
      (data ?? []).forEach((row: any) => {
        map[row.product_id] = Number(row.quantity);
      });
      setStockMap(map);
    };
    load();
  }, [storeId, ingredients]);

  const mult = Number(multiplier) || 0;
  const totalCost = useMemo(
    () => ingredients.reduce((sum, i) => sum + i.quantity * mult * i.average_cost, 0),
    [ingredients, mult],
  );
  const insufficient = useMemo(
    () =>
      ingredients
        .filter((i) => (stockMap[i.product_id] ?? 0) < i.quantity * mult)
        .map((i) => i.product_name),
    [ingredients, stockMap, mult],
  );

  const isFactoryProduction = (recipe?.scope ?? "loja") === "fabrica";
  const producedQty = (recipe?.yield_quantity ?? 0) * mult;
  const divergence = isFactoryProduction ? producedQty - requestedQty : 0;
  const hasDivergence = isFactoryProduction && requestedQty > 0 && Math.abs(divergence) > 0.0001;

  const reset = () => {
    setStoreId("");
    setMultiplier("1");
    setNotes("");
    setIngredients([]);
    setStockMap({});
    setRequestedQty(0);
    setDivergenceReason("");
  };

  const handleProduce = async () => {
    if (!recipe || !storeId || mult <= 0) return;
    if (insufficient.length > 0) {
      toast.error(`Estoque insuficiente: ${insufficient.join(", ")}`);
      return;
    }
    if (requiresExpiry && !expiryDate) {
      toast.error("Este produto exige data de validade");
      return;
    }
    if (hasDivergence && !divergenceReason.trim()) {
      toast.error("Informe o motivo da divergência entre solicitado e produzido");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("produce_recipe", {
        _recipe_id: recipe.id,
        _store_id: storeId,
        _multiplier: mult,
        _notes: notes || null,
        _expiry_date: expiryDate || null,
        _manufacture_date: manufactureDate || null,
        _lot_number: lotNumber.trim() || null,
        _requested_quantity: isFactoryProduction ? requestedQty : null,
        _divergence_reason: hasDivergence ? divergenceReason.trim() : null,
      } as any);
      if (error) throw error;
      toast.success("Produção registrada com sucesso");
      reset();
      onOpenChange(false);
      onProduced?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao produzir");
    } finally {
      setSaving(false);
    }
  };

  if (!recipe) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ChefHat className="h-5 w-5" /> Produzir: {recipe.name}
          </DialogTitle>
          <DialogDescription>
            Esta ação irá debitar os ingredientes do estoque e adicionar o produto final.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Loja *</Label>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
                <SelectContent>
                  {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Multiplicador da receita *</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={multiplier}
                onChange={(e) => setMultiplier(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Ao produzir <b>{mult || 0}×</b>, serão geradas <b>{(recipe.yield_quantity * mult).toLocaleString("pt-BR")} {recipe.yield_unit}</b>.
              </p>
            </div>

            <div className="rounded-md border bg-muted/40 p-2 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Validade do lote {requiresExpiry && <span className="text-destructive">*</span>}
                </Label>
                {shelfLifeDays != null && (
                  <span className="text-xs text-muted-foreground">Padrão: {shelfLifeDays} dia(s)</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Fabricação</Label>
                  <Input
                    type="date"
                    value={manufactureDate}
                    onChange={(e) => {
                      setManufactureDate(e.target.value);
                      if (shelfLifeDays && e.target.value) {
                        const d = new Date(e.target.value);
                        d.setDate(d.getDate() + Number(shelfLifeDays));
                        setExpiryDate(d.toISOString().slice(0, 10));
                      }
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Validade {requiresExpiry && "*"}</Label>
                  <Input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    min={manufactureDate}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nº do lote (opcional)</Label>
                <Input
                  placeholder="Ex.: PROD-20260427"
                  value={lotNumber}
                  onChange={(e) => setLotNumber(e.target.value)}
                />
              </div>
              {requiresExpiry && !expiryDate && (
                <p className="text-xs text-destructive">Este produto exige data de validade.</p>
              )}
            </div>

            {isFactoryProduction && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-primary" />
                  <Label className="text-xs font-semibold uppercase tracking-wide text-primary">
                    Conferência da produção
                  </Label>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-background border p-2">
                    <p className="text-[10px] uppercase text-muted-foreground">Solicitado</p>
                    <p className="text-base font-bold tabular-nums">
                      {requestedQty.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{recipe.yield_unit}</p>
                  </div>
                  <div className="rounded-md bg-background border p-2">
                    <p className="text-[10px] uppercase text-muted-foreground">A produzir</p>
                    <p className="text-base font-bold tabular-nums text-primary">
                      {producedQty.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{recipe.yield_unit}</p>
                  </div>
                  <div className={`rounded-md border p-2 ${hasDivergence ? "bg-warning/10 border-warning/40" : "bg-background"}`}>
                    <p className="text-[10px] uppercase text-muted-foreground">Diferença</p>
                    <p className={`text-base font-bold tabular-nums ${hasDivergence ? "text-warning-foreground" : "text-muted-foreground"}`}>
                      {divergence > 0 ? "+" : ""}
                      {divergence.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{recipe.yield_unit}</p>
                  </div>
                </div>
                {hasDivergence && (
                  <div className="space-y-1">
                    <Label className="text-xs text-warning-foreground">Motivo da divergência *</Label>
                    <Textarea
                      rows={2}
                      placeholder={divergence < 0
                        ? "Ex.: faltou matéria-prima, equipamento parado..."
                        : "Ex.: produção extra para estoque, antecipação..."}
                      value={divergenceReason}
                      onChange={(e) => setDivergenceReason(e.target.value)}
                    />
                  </div>
                )}
                {!hasDivergence && requestedQty > 0 && (
                  <p className="text-[11px] text-success text-center">✓ Sem divergência</p>
                )}
                {requestedQty === 0 && (
                  <p className="text-[11px] text-muted-foreground text-center">
                    Nenhum pedido pendente das lojas para este produto.
                  </p>
                )}
              </div>
            )}

            {storeId && ingredients.length > 0 && (
              <div className="border rounded-md p-2 space-y-1.5 max-h-64 overflow-y-auto">
                <p className="text-xs font-semibold text-muted-foreground">Consumo de ingredientes</p>
                {ingredients.map((i) => {
                  const need = i.quantity * mult;
                  const have = stockMap[i.product_id] ?? 0;
                  const ok = have >= need;
                  return (
                    <div key={i.product_id} className="flex items-center justify-between text-sm">
                      <span className="truncate flex-1">{i.product_name}</span>
                      <span className={`font-mono text-xs ${ok ? "text-foreground" : "text-destructive font-semibold"}`}>
                        {need.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} {i.unit} / {have.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} disp.
                      </span>
                    </div>
                  );
                })}
                <div className="border-t pt-1.5 flex items-center justify-between text-sm font-semibold">
                  <span>Custo total</span>
                  <span>{totalCost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                </div>
              </div>
            )}

            {insufficient.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Estoque insuficiente: {insufficient.join(", ")}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-1">
              <Label>Observações</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={handleProduce}
            disabled={saving || !storeId || mult <= 0 || insufficient.length > 0 || ingredients.length === 0 || (requiresExpiry && !expiryDate) || (hasDivergence && !divergenceReason.trim())}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Confirmar produção
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RecipeProduceDialog;
