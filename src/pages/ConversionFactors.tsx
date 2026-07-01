import { useEffect, useMemo, useState } from "react";
import { Loader2, Scale, Search, Plus, Trash2, Star, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import { useInventoryPermission } from "@/hooks/useInventoryPermission";
import { toast } from "sonner";

const UNITS = ["UN", "KG", "G", "L", "ML", "CX", "PCT", "FD", "DZ", "SC", "PC", "PORCAO"];
const TYPE_LABEL: Record<string, { label: string; hint: string }> = {
  compra: { label: "Compra", hint: "Embalagem do fornecedor → unidade de estoque" },
  preparo: { label: "Preparo", hint: "Cru → pronto (ex.: 1 kg arroz cru = 2,5 kg cozido)" },
  porcionamento: { label: "Porcionamento", hint: "Peça inteira → porção (ex.: 1 peça = 14 porções)" },
};

interface Product { id: string; name: string; unit: string; category: string | null; }
interface Conv {
  id: string;
  product_id: string;
  conversion_type: "compra" | "preparo" | "porcionamento";
  from_unit: string;
  from_qty: number;
  to_unit: string;
  to_qty: number;
  is_default: boolean;
  notes: string | null;
}

const emptyConv = (product_id: string, base_unit: string, type: Conv["conversion_type"]): Omit<Conv, "id"> => ({
  product_id,
  conversion_type: type,
  from_unit: type === "compra" ? "CX" : type === "preparo" ? "KG" : "UN",
  from_qty: 1,
  to_unit: base_unit || "UN",
  to_qty: 1,
  is_default: true,
  notes: null,
});

const ConversionFactors = () => {
  const { canReceive } = useInventoryPermission();
  const [products, setProducts] = useState<Product[]>([]);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [gap, setGap] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: prods }, { data: cs }] = await Promise.all([
      supabase.from("inventory_products").select("id, name, unit, category").eq("is_active", true).order("name"),
      supabase.from("product_conversions").select("*").order("conversion_type"),
    ]);
    setProducts((prods as Product[]) ?? []);
    setConvs((cs as Conv[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const byProduct = useMemo(() => {
    const m = new Map<string, Conv[]>();
    convs.forEach((c) => {
      if (!m.has(c.product_id)) m.set(c.product_id, []);
      m.get(c.product_id)!.push(c);
    });
    return m;
  }, [convs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      const list = byProduct.get(p.id) ?? [];
      if (typeFilter !== "all" && !list.some((c) => c.conversion_type === typeFilter)) return false;
      if (gap && list.length > 0) return false;
      return true;
    });
  }, [products, byProduct, search, typeFilter, gap]);

  const addConv = async (p: Product, type: Conv["conversion_type"]) => {
    setBusy(p.id);
    const payload = emptyConv(p.id, p.unit ?? "UN", type);
    const { data, error } = await supabase.from("product_conversions").insert(payload).select().single();
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    setConvs((arr) => [...arr, data as Conv]);
  };

  const updateConv = async (c: Conv, patch: Partial<Conv>) => {
    setConvs((arr) => arr.map((x) => (x.id === c.id ? { ...x, ...patch } : x)));
    const { error } = await supabase.from("product_conversions").update(patch).eq("id", c.id);
    if (error) toast.error(error.message);
  };

  const setDefault = async (c: Conv) => {
    const siblings = convs.filter(
      (x) => x.product_id === c.product_id && x.conversion_type === c.conversion_type && x.id !== c.id,
    );
    setConvs((arr) => arr.map((x) =>
      x.product_id === c.product_id && x.conversion_type === c.conversion_type
        ? { ...x, is_default: x.id === c.id }
        : x,
    ));
    await supabase.from("product_conversions").update({ is_default: false }).in("id", siblings.map((s) => s.id));
    await supabase.from("product_conversions").update({ is_default: true }).eq("id", c.id);
  };

  const remove = async (c: Conv) => {
    setConvs((arr) => arr.filter((x) => x.id !== c.id));
    const { error } = await supabase.from("product_conversions").delete().eq("id", c.id);
    if (error) toast.error(error.message);
  };

  const gapCount = products.filter((p) => !(byProduct.get(p.id)?.length)).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Scale className="h-6 w-6 md:h-7 md:w-7 text-primary" /> Fatores de conversão
        </h1>
        <p className="text-muted-foreground">
          Cadastro único para transformar unidades: <b>compra</b> (embalagem do fornecedor), <b>preparo</b> (cru → pronto) e <b>porcionamento</b> (peça → porção). O sistema aplica automático nas fichas técnicas, sugestão de compra e recebimento.
        </p>
      </div>

      <Card>
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar produto…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="compra">Só com Compra</SelectItem>
                <SelectItem value="preparo">Só com Preparo (cru→pronto)</SelectItem>
                <SelectItem value="porcionamento">Só com Porcionamento</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant={gap ? "default" : "outline"}
              onClick={() => setGap(!gap)}
              className="gap-2"
            >
              <AlertCircle className="h-4 w-4" /> Sem conversão ({gapCount})
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum produto.</p>
          ) : (
            <Accordion type="multiple" className="w-full">
              {filtered.map((p) => {
                const list = byProduct.get(p.id) ?? [];
                return (
                  <AccordionItem key={p.id} value={p.id}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-3 flex-1 text-left">
                        <span className="font-medium">{p.name}</span>
                        <Badge variant="secondary" className="text-[10px]">{p.unit}</Badge>
                        {p.category && <Badge variant="outline" className="text-[10px]">{p.category}</Badge>}
                        <div className="ml-auto flex gap-1 mr-2">
                          {list.length === 0 ? (
                            <Badge variant="outline" className="text-[10px] border-warning/60 text-warning">sem conversão</Badge>
                          ) : (
                            <>
                              {(["compra","preparo","porcionamento"] as const).map((t) =>
                                list.some((c) => c.conversion_type === t) ? (
                                  <Badge key={t} variant="secondary" className="text-[10px]">{TYPE_LABEL[t].label}</Badge>
                                ) : null,
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-3">
                      {(["compra","preparo","porcionamento"] as const).map((t) => {
                        const rows = list.filter((c) => c.conversion_type === t);
                        return (
                          <div key={t} className="border rounded-md p-2 space-y-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-semibold">{TYPE_LABEL[t].label}</p>
                                <p className="text-xs text-muted-foreground">{TYPE_LABEL[t].hint}</p>
                              </div>
                              {canReceive && (
                                <Button size="sm" variant="outline" onClick={() => addConv(p, t)} disabled={busy === p.id}>
                                  <Plus className="h-4 w-4 mr-1" /> Adicionar
                                </Button>
                              )}
                            </div>
                            {rows.length === 0 ? (
                              <p className="text-xs text-muted-foreground pl-1">Nenhuma linha.</p>
                            ) : (
                              <div className="space-y-1">
                                {rows.map((c) => (
                                  <div key={c.id} className="grid grid-cols-12 gap-1 items-center text-sm">
                                    <Input
                                      type="number" step="0.001" min="0.001"
                                      className="col-span-2 h-8"
                                      value={c.from_qty}
                                      onChange={(e) => updateConv(c, { from_qty: Number(e.target.value) })}
                                      disabled={!canReceive}
                                    />
                                    <Select value={c.from_unit} onValueChange={(v) => updateConv(c, { from_unit: v })}>
                                      <SelectTrigger className="col-span-2 h-8"><SelectValue /></SelectTrigger>
                                      <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                                    </Select>
                                    <span className="col-span-1 text-center text-muted-foreground">=</span>
                                    <Input
                                      type="number" step="0.001" min="0.001"
                                      className="col-span-2 h-8"
                                      value={c.to_qty}
                                      onChange={(e) => updateConv(c, { to_qty: Number(e.target.value) })}
                                      disabled={!canReceive}
                                    />
                                    <Select value={c.to_unit} onValueChange={(v) => updateConv(c, { to_unit: v })}>
                                      <SelectTrigger className="col-span-2 h-8"><SelectValue /></SelectTrigger>
                                      <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                                    </Select>
                                    <div className="col-span-3 flex justify-end gap-1">
                                      <Button
                                        size="icon"
                                        variant={c.is_default ? "default" : "ghost"}
                                        className="h-8 w-8"
                                        onClick={() => setDefault(c)}
                                        disabled={!canReceive || c.is_default}
                                        title="Marcar como padrão"
                                      >
                                        <Star className={"h-4 w-4 " + (c.is_default ? "" : "text-muted-foreground")} />
                                      </Button>
                                      <Button
                                        size="icon" variant="ghost" className="h-8 w-8"
                                        onClick={() => remove(c)} disabled={!canReceive}
                                      >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ConversionFactors;
