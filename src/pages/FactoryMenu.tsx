import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Utensils } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useInventoryPermission } from "@/hooks/useInventoryPermission";
import { toast } from "sonner";

interface Row {
  id: string;
  name: string;
  yield_quantity: number;
  yield_unit: string;
  is_active: boolean;
  output_product_id: string | null;
  output_is_internal: boolean;
}

const FactoryMenu = () => {
  const { canReceive } = useInventoryPermission();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"all" | "porcao" | "prep">("all");
  const [status, setStatus] = useState<"all" | "on" | "off">("all");
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase.from("recipes") as any)
      .select("id, name, yield_quantity, yield_unit, is_active, output_product_id, inventory_products:output_product_id(is_internal)")
      .eq("scope", "fabrica")
      .order("name");
    if (error) toast.error(error.message);
    setRows(
      ((data as any[]) ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        yield_quantity: Number(r.yield_quantity ?? 0),
        yield_unit: r.yield_unit,
        is_active: !!r.is_active,
        output_product_id: r.output_product_id,
        output_is_internal: !!r.inventory_products?.is_internal,
      })),
    );
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggle = async (r: Row, value: boolean) => {
    setSavingId(r.id);
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active: value } : x)));
    const { error } = await supabase.from("recipes").update({ is_active: value }).eq("id", r.id);
    setSavingId(null);
    if (error) {
      toast.error(error.message);
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active: !value } : x)));
      return;
    }
    toast.success(value ? "No cardápio" : "Fora do cardápio");
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) => {
      const isPrep = !r.output_product_id || r.output_is_internal;
      if (kind === "porcao" && isPrep) return false;
      if (kind === "prep" && !isPrep) return false;
      if (status === "on" && !r.is_active) return false;
      if (status === "off" && r.is_active) return false;
      return !q || r.name.toLowerCase().includes(q);
    });
  }, [rows, search, kind, status]);

  const totalOn = rows.filter((r) => r.is_active).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Utensils className="h-6 w-6 md:h-7 md:w-7 text-primary" /> Cardápio da Fábrica
        </h1>
        <p className="text-muted-foreground">
          Marque quais fichas da fábrica estão liberadas para produção. Desmarcar retira do cardápio, mas mantém a ficha técnica intacta.
        </p>
      </div>

      <Card>
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={kind} onValueChange={(v) => setKind(v as any)}>
              <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="porcao">Porção</SelectItem>
                <SelectItem value="prep">Pré-preparo</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="on">No cardápio</SelectItem>
                <SelectItem value="off">Fora do cardápio</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            {totalOn} de {rows.length} fichas no cardápio
          </p>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma ficha encontrada.</p>
          ) : (
            <div className="divide-y border rounded-md">
              {filtered.map((r) => {
                const isPrep = !r.output_product_id || r.output_is_internal;
                return (
                  <div key={r.id} className="flex items-center gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{r.name}</p>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                        <span>Rende {r.yield_quantity} {r.yield_unit}</span>
                        <Badge variant={isPrep ? "secondary" : "outline"} className="text-[10px]">
                          {isPrep ? "Pré-preparo" : "Porção"}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {savingId === r.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                      <Switch
                        checked={r.is_active}
                        onCheckedChange={(v) => toggle(r, v)}
                        disabled={!canReceive || savingId === r.id}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FactoryMenu;
