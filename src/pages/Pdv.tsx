import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingCart, RefreshCw, Loader2, CheckCircle2, AlertCircle, Link2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import UnlinkedItemsPanel from "@/components/pdv/UnlinkedItemsPanel";
import { sortStores } from "@/lib/storeSort";

interface Store { id: string; name: string }
interface Sale {
  id: string;
  store_id: string;
  order_number: string | null;
  sold_at: string;
  total_amount: number;
  payment_method: string | null;
  status: string;
  stock_applied: boolean;
}
interface SyncLog {
  id: string;
  started_at: string;
  finished_at: string | null;
  sales_imported: number;
  items_matched: number;
  items_unmatched: number;
  status: string;
  error_message: string | null;
  trigger_type: string;
}

export default function Pdv() {
  const { user } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [sales, setSales] = useState<Sale[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [storesRes, salesRes, logsRes] = await Promise.all([
      supabase.from("stores").select("id, name, store_type").eq("is_virtual", false).order("name"),
      supabase
        .from("pos_sales")
        .select("id, store_id, order_number, sold_at, total_amount, payment_method, status, stock_applied")
        .order("sold_at", { ascending: false })
        .limit(100),
      supabase
        .from("pos_sync_logs")
        .select("id, started_at, finished_at, sales_imported, items_matched, items_unmatched, status, error_message, trigger_type")
        .order("started_at", { ascending: false })
        .limit(20),
    ]);
    setStores(sortStores(storesRes.data ?? []));
    setSales(salesRes.data ?? []);
    setLogs(logsRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const runSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("saipos-sync", {
        body: {
          store_id: storeFilter === "all" ? null : storeFilter,
          trigger_type: "manual",
          user_id: user?.id ?? null,
        },
      });
      if (error) throw error;
      toast({
        title: "Sincronização concluída",
        description: `${data?.sales_imported ?? 0} vendas importadas. ${data?.items_matched ?? 0} itens vinculados, ${data?.items_unmatched ?? 0} sem match.`,
      });
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast({ title: "Falha na sincronização", description: msg, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const filteredSales = storeFilter === "all" ? sales : sales.filter((s) => s.store_id === storeFilter);
  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? "—";
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtDate = (iso: string) => new Date(iso).toLocaleString("pt-BR");

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
        <strong>Página arquivada.</strong> A importação Saipos foi desligada. Os dados aqui são apenas histórico — vendas novas vão para{" "}
        <a href="/pdv-novo" className="underline font-medium">PDV próprio</a>.
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <ShoppingCart className="h-7 w-7 text-primary" />
            PDV / Vendas
          </h1>
          <p className="text-muted-foreground">Integração com Saipos: importação de vendas e baixa de estoque.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder="Loja" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as lojas</SelectItem>
              {stores.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={runSync} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Sincronizar agora
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status da integração</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>• A sincronização automática roda <strong>diariamente às 03:00</strong>.</p>
          <p>• Vendas são importadas pelo identificador externo (não duplicam).</p>
          <p>• Itens são vinculados aos produtos do inventário por <strong>match automático por nome</strong>.</p>
          <p>• Para itens vinculados, é gerada baixa de estoque automática (movimento "saída").</p>
        </CardContent>
      </Card>

      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales">Vendas importadas</TabsTrigger>
          <TabsTrigger value="unlinked" className="gap-1">
            <Link2 className="h-3 w-3" /> Itens sem vínculo
          </TabsTrigger>
          <TabsTrigger value="logs">Histórico de sincronizações</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : filteredSales.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Nenhuma venda importada ainda. Clique em "Sincronizar agora" para buscar do Saipos.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pedido</TableHead>
                        <TableHead>Loja</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Pagamento</TableHead>
                        <TableHead>Estoque</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSales.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.order_number ?? s.id.slice(0, 8)}</TableCell>
                          <TableCell>{storeName(s.store_id)}</TableCell>
                          <TableCell>{fmtDate(s.sold_at)}</TableCell>
                          <TableCell className="text-muted-foreground">{s.payment_method ?? "—"}</TableCell>
                          <TableCell>
                            {s.stock_applied ? (
                              <Badge variant="default" className="gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Baixado
                              </Badge>
                            ) : (
                              <Badge variant="outline">Pendente</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold">{fmt(s.total_amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="unlinked" className="mt-4">
          <UnlinkedItemsPanel />
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma sincronização registrada.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Início</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Vendas</TableHead>
                        <TableHead>Itens vinculados</TableHead>
                        <TableHead>Sem match</TableHead>
                        <TableHead>Erro</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell>{fmtDate(l.started_at)}</TableCell>
                          <TableCell><Badge variant="outline">{l.trigger_type}</Badge></TableCell>
                          <TableCell>
                            {l.status === "success" ? (
                              <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> sucesso</Badge>
                            ) : l.status === "error" ? (
                              <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> erro</Badge>
                            ) : (
                              <Badge variant="secondary">{l.status}</Badge>
                            )}
                          </TableCell>
                          <TableCell>{l.sales_imported}</TableCell>
                          <TableCell className="text-success">{l.items_matched}</TableCell>
                          <TableCell className="text-destructive">{l.items_unmatched}</TableCell>
                          <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground" title={l.error_message ?? ""}>
                            {l.error_message ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
