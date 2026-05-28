import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Search, Send, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { sortStores } from "@/lib/storeSort";

interface Store { id: string; name: string; }

interface SuggestionRow {
  destination_store_id: string;
  destination_store_name: string;
  product_id: string;
  product_name: string;
  unit: string;
  current_qty: number;
  min_qty: number;
  max_qty: number;
  needed_qty: number;
  origin_available: number;
  suggested_qty: number;
}

interface Props {
  onTransfersCreated?: () => void;
}

export default function TransferSuggestionsPanel({ onTransfersCreated }: Props) {
  const [stores, setStores] = useState<Store[]>([]);
  const [originId, setOriginId] = useState<string>("");
  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const loadStores = async () => {
      const { data } = await supabase.from("stores").select("id, name, store_type").eq("is_virtual", false).order("name");
      const list = (data ?? []) as Store[];
      setStores(sortStores(list));
      const factory = list.find((s) =>
        ["fábrica", "fabrica", "central", "matriz"].some((k) => s.name.toLowerCase().includes(k))
      );
      setOriginId(factory?.id ?? list[0]?.id ?? "");
    };
    loadStores();
  }, []);

  const load = async () => {
    if (!originId) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("suggest_transfers" as any, { _origin_store_id: originId });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    setRows((data as SuggestionRow[]) ?? []);
    setSelected({});
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [originId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) => {
      const ms = !q || r.product_name.toLowerCase().includes(q) || r.destination_store_name.toLowerCase().includes(q);
      const md = storeFilter === "all" || r.destination_store_id === storeFilter;
      return ms && md;
    });
  }, [rows, search, storeFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; items: SuggestionRow[] }>();
    filtered.forEach((r) => {
      if (!map.has(r.destination_store_id)) {
        map.set(r.destination_store_id, { name: r.destination_store_name, items: [] });
      }
      map.get(r.destination_store_id)!.items.push(r);
    });
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v }));
  }, [filtered]);

  const rowKey = (r: SuggestionRow) => `${r.destination_store_id}__${r.product_id}`;
  const totalSelected = filtered.filter((r) => selected[rowKey(r)]);

  const toggleStore = (storeId: string, v: boolean) => {
    setSelected((prev) => {
      const next = { ...prev };
      filtered
        .filter((r) => r.destination_store_id === storeId)
        .forEach((r) => (next[rowKey(r)] = v));
      return next;
    });
  };

  const createTransfers = async () => {
    if (!originId) return toast({ title: "Selecione a loja origem", variant: "destructive" });
    if (totalSelected.length === 0) return toast({ title: "Selecione ao menos um item", variant: "destructive" });
    setSending(true);
    const byDest = new Map<string, SuggestionRow[]>();
    totalSelected.forEach((r) => {
      if (!byDest.has(r.destination_store_id)) byDest.set(r.destination_store_id, []);
      byDest.get(r.destination_store_id)!.push(r);
    });
    let ok = 0;
    let failed = 0;
    for (const [destId, items] of byDest.entries()) {
      const payload = items
        .filter((it) => Number(it.suggested_qty) > 0)
        .map((it) => ({ product_id: it.product_id, quantity: Number(it.suggested_qty) }));
      if (payload.length === 0) continue;
      const { error } = await supabase.rpc("create_inventory_transfer" as any, {
        _origin_store_id: originId,
        _destination_store_id: destId,
        _items: payload,
        _sender_name: null,
        _notes: "Gerado por sugestão de transferência",
      });
      if (error) { failed++; toast({ title: `Erro destino ${items[0].destination_store_name}`, description: error.message, variant: "destructive" }); }
      else ok++;
    }
    setSending(false);
    if (ok > 0) toast({ title: `${ok} transferência(s) criada(s)`, description: failed > 0 ? `${failed} falhou(ram)` : undefined });
    setSelected({});
    load();
    onTransfersCreated?.();
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {totalSelected.length} item(ns) selecionado(s) em {grouped.length} destino(s).
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Select value={originId} onValueChange={setOriginId}>
          <SelectTrigger><SelectValue placeholder="Loja origem (fábrica)" /></SelectTrigger>
          <SelectContent>
            {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={storeFilter} onValueChange={setStoreFilter}>
          <SelectTrigger><SelectValue placeholder="Filtrar destino" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os destinos</SelectItem>
            {stores.filter((s) => s.id !== originId).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar produto ou loja…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={createTransfers} disabled={sending || totalSelected.length === 0} size="sm">
          {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          <Send className="h-4 w-4 mr-2" /> Criar envios <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          Nenhuma loja precisa de reposição. Configure mínimos por loja em <Link to="/estoque" className="underline">Saldo de estoque</Link>.
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map((g) => {
            const allChecked = g.items.every((r) => selected[rowKey(r)]);
            return (
              <div key={g.id} className="border rounded-md">
                <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
                  <Checkbox checked={allChecked} onCheckedChange={(v) => toggleStore(g.id, !!v)} />
                  <span className="font-semibold">{g.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{g.items.length} item(ns)</span>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead className="text-right">Atual</TableHead>
                        <TableHead className="text-right">Mín</TableHead>
                        <TableHead className="text-right">Disp. origem</TableHead>
                        <TableHead className="text-right">A enviar</TableHead>
                        <TableHead>Un.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.items.map((r) => (
                        <TableRow key={rowKey(r)}>
                          <TableCell>
                            <Checkbox
                              checked={!!selected[rowKey(r)]}
                              onCheckedChange={(v) => setSelected((p) => ({ ...p, [rowKey(r)]: !!v }))}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{r.product_name}</TableCell>
                          <TableCell className="text-right">{Number(r.current_qty).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</TableCell>
                          <TableCell className="text-right">{Number(r.min_qty).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</TableCell>
                          <TableCell className="text-right">{Number(r.origin_available).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</TableCell>
                          <TableCell className="text-right font-semibold text-primary">
                            {Number(r.suggested_qty).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}
                          </TableCell>
                          <TableCell>{r.unit}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
