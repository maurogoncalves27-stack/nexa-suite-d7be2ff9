import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Search, ShoppingBag, ArrowRight, ShoppingCart } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface SuggestionRow {
  product_id: string;
  product_name: string;
  unit: string;
  category: string | null;
  total_stock: number;
  total_min: number;
  total_max: number;
  qty_to_buy: number;
  average_cost: number | null;
  estimated_cost: number;
}

const fmtMoney = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));

export default function PurchaseSuggestions() {
  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("suggest_purchases" as any);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
    setRows((data as SuggestionRow[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) =>
      !q ||
      r.product_name.toLowerCase().includes(q) ||
      (r.category ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const totalSelected = filtered.filter((r) => selected[r.product_id]);
  const totalEstimated = totalSelected.reduce((s, r) => s + Number(r.estimated_cost ?? 0), 0);

  const toggleAll = (v: boolean) => {
    const next: Record<string, boolean> = {};
    if (v) filtered.forEach((r) => (next[r.product_id] = true));
    setSelected(next);
  };

  const createQuotation = async () => {
    if (totalSelected.length === 0) {
      return toast({ title: "Selecione ao menos um item", variant: "destructive" });
    }
    setCreating(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 3);

    const { data: q, error } = await supabase
      .from("quotations")
      .insert({
        title: `Reposição de estoque — ${new Date().toLocaleDateString("pt-BR")}`,
        description: "Cotação gerada automaticamente a partir da sugestão de compra.",
        deadline: deadline.toISOString(),
        status: "open",
        created_by: uid,
      })
      .select("id")
      .single();

    if (error || !q) {
      setCreating(false);
      return toast({ title: "Erro", description: error?.message, variant: "destructive" });
    }

    const items = totalSelected.map((r, i) => ({
      quotation_id: q.id,
      description: r.product_name,
      quantity: Number(r.qty_to_buy.toFixed(4)),
      unit: r.unit || "UN",
      sort_order: i,
    }));
    const { error: itErr } = await supabase.from("quotation_items").insert(items);
    setCreating(false);
    if (itErr) return toast({ title: "Erro nos itens", description: itErr.message, variant: "destructive" });

    toast({ title: "Cotação criada", description: `${items.length} item(ns) adicionados.` });
    setSelected({});
    window.location.href = "/cotacoes";
  };

  const allChecked = filtered.length > 0 && filtered.every((r) => selected[r.product_id]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <ShoppingCart className="h-6 w-6 md:h-7 md:w-7 text-primary" /> Sugestão de compra
        </h1>
        <p className="text-muted-foreground">
          Produtos cujo estoque total (soma de todas as lojas) está abaixo do mínimo configurado.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShoppingBag className="h-5 w-5" /> Itens a comprar</CardTitle>
          <CardDescription>
            {filtered.length} produto(s) abaixo do mínimo • {totalSelected.length} selecionado(s) • Estimativa: {fmtMoney(totalEstimated)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar produto ou categoria…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Button onClick={createQuotation} disabled={creating || totalSelected.length === 0}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar cotação <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Nenhum produto abaixo do mínimo. Configure mínimos no <Link to="/estoque" className="underline">Saldo de estoque</Link>.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={allChecked} onCheckedChange={(v) => toggleAll(!!v)} />
                    </TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Estoque</TableHead>
                    <TableHead className="text-right">Mínimo</TableHead>
                    <TableHead className="text-right">A comprar</TableHead>
                    <TableHead>Un.</TableHead>
                    <TableHead className="text-right">Custo médio</TableHead>
                    <TableHead className="text-right">Estimativa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.product_id}>
                      <TableCell>
                        <Checkbox
                          checked={!!selected[r.product_id]}
                          onCheckedChange={(v) => setSelected((p) => ({ ...p, [r.product_id]: !!v }))}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{r.product_name}</TableCell>
                      <TableCell>{r.category ?? "—"}</TableCell>
                      <TableCell className="text-right">{Number(r.total_stock).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</TableCell>
                      <TableCell className="text-right">{Number(r.total_min).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</TableCell>
                      <TableCell className="text-right font-semibold text-primary">
                        {Number(r.qty_to_buy).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}
                      </TableCell>
                      <TableCell>{r.unit}</TableCell>
                      <TableCell className="text-right">{fmtMoney(r.average_cost)}</TableCell>
                      <TableCell className="text-right">{fmtMoney(r.estimated_cost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
