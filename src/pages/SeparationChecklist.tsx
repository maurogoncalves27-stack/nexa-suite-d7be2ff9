import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Printer, ClipboardList, Package, Snowflake, Thermometer, Box, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Group = "seco" | "refrigerado" | "congelado" | "embalagem" | "outros";

interface Row {
  store_id: string;
  store_name: string;
  storage_group: Group;
  product_id: string;
  product_name: string;
  unit: string;
  quantity: number;
  current_stock: number;
  min_qty: number;
  max_qty: number;
}

const GROUP_META: Record<Group, { label: string; icon: any; className: string }> = {
  refrigerado: { label: "Refrigerados", icon: Thermometer, className: "text-sky-600 dark:text-sky-400" },
  congelado: { label: "Congelados", icon: Snowflake, className: "text-cyan-600 dark:text-cyan-400" },
  seco: { label: "Estoque seco", icon: Package, className: "text-amber-600 dark:text-amber-400" },
  embalagem: { label: "Embalagens", icon: Box, className: "text-violet-600 dark:text-violet-400" },
  outros: { label: "Outros", icon: Package, className: "text-muted-foreground" },
};

const GROUP_ORDER: Group[] = ["refrigerado", "congelado", "seco", "embalagem", "outros"];

const fmt = (n: number) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export default function SeparationChecklist() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [activeStore, setActiveStore] = useState<string>("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("friday_separation_checklist" as any);
    if (error) toast.error(error.message);
    setRows((data ?? []) as unknown as Row[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const stores = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => map.set(r.store_id, r.store_name));
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  useEffect(() => {
    if (!activeStore && stores.length > 0) setActiveStore(stores[0].id);
  }, [stores, activeStore]);

  const storeRows = useMemo(() => rows.filter((r) => r.store_id === activeStore), [rows, activeStore]);

  const grouped = useMemo(() => {
    const g: Record<Group, Row[]> = { refrigerado: [], congelado: [], seco: [], embalagem: [], outros: [] };
    storeRows.forEach((r) => {
      const k = (GROUP_ORDER.includes(r.storage_group) ? r.storage_group : "outros") as Group;
      g[k].push(r);
    });
    return g;
  }, [storeRows]);

  const totalItems = storeRows.length;
  const checkedItems = storeRows.filter((r) => checked[`${r.store_id}|${r.product_id}`]).length;
  const progress = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;

  const toggle = (r: Row) => {
    const key = `${r.store_id}|${r.product_id}`;
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const resetStore = () => {
    setChecked((prev) => {
      const next = { ...prev };
      storeRows.forEach((r) => delete next[`${r.store_id}|${r.product_id}`]);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6 md:h-7 md:w-7 text-primary" /> Checklist de separação
          </h1>
          <p className="text-muted-foreground text-sm">
            Lista de sexta-feira para envio às lojas, organizada por grupo de armazenagem.
            Marque conforme separa para não esquecer nada.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : stores.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            ✅ Nenhuma loja precisa de reposição agora — todas dentro do estoque mínimo.
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeStore} onValueChange={setActiveStore} className="space-y-4">
          <div className="overflow-x-auto">
            <TabsList className="flex flex-wrap h-auto">
              {stores.map((s) => {
                const c = rows.filter((r) => r.store_id === s.id).length;
                return (
                  <TabsTrigger key={s.id} value={s.id} className="gap-1.5">
                    {s.name}
                    <Badge variant="secondary" className="ml-1">{c}</Badge>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          {stores.map((s) => (
            <TabsContent key={s.id} value={s.id} className="space-y-3">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {s.name}
                        {progress === 100 && <CheckCircle2 className="h-5 w-5 text-success" />}
                      </CardTitle>
                      <CardDescription>{checkedItems} de {totalItems} item(ns) separados</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={resetStore} disabled={checkedItems === 0}>
                      Limpar marcações
                    </Button>
                  </div>
                  <Progress value={progress} className="h-2" />
                </CardHeader>
              </Card>

              {GROUP_ORDER.map((g) => {
                const items = grouped[g];
                if (!items || items.length === 0) return null;
                const Icon = GROUP_META[g].icon;
                const groupChecked = items.filter((r) => checked[`${r.store_id}|${r.product_id}`]).length;
                return (
                  <Card key={g}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className={cn("text-sm flex items-center gap-2", GROUP_META[g].className)}>
                          <Icon className="h-4 w-4" />
                          {GROUP_META[g].label}
                        </CardTitle>
                        <Badge variant={groupChecked === items.length ? "default" : "outline"}>
                          {groupChecked}/{items.length}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      {items.map((r) => {
                        const key = `${r.store_id}|${r.product_id}`;
                        const isChecked = !!checked[key];
                        return (
                          <label
                            key={key}
                            className={cn(
                              "flex items-center gap-3 px-2 py-2 rounded-md border cursor-pointer hover:bg-accent/50 transition",
                              isChecked && "bg-success/5 border-success/30"
                            )}
                          >
                            <Checkbox checked={isChecked} onCheckedChange={() => toggle(r)} className="h-5 w-5" />
                            <div className="flex-1 min-w-0">
                              <div className={cn("font-medium text-sm truncate", isChecked && "line-through text-muted-foreground")}>
                                {r.product_name}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Loja tem {fmt(r.current_stock)} • mín. {fmt(r.min_qty)}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className={cn("text-base font-bold tabular-nums", isChecked ? "text-muted-foreground" : "text-primary")}>
                                {fmt(r.quantity)}
                              </div>
                              <div className="text-xs text-muted-foreground">{r.unit}</div>
                            </div>
                          </label>
                        );
                      })}
                    </CardContent>
                  </Card>
                );
              })}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
