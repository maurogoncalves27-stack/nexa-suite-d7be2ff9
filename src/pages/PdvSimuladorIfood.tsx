import { useEffect, useState } from "react";
import { Sparkles, Loader2, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { sortStores } from "@/lib/storeSort";

type Store = { id: string; name: string; ifood_merchant_id: string | null };
type Channel = { id: string; store_id: string; code: string; name: string };

export default function PdvSimuladorIfood() {
  const { user } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ orderNumber: string; total: number; at: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("stores")
        .select("id,name,ifood_merchant_id,is_virtual,is_active")
        .eq("is_active", true)
        .or("is_virtual.eq.false,ifood_merchant_id.not.is.null")
        .order("name");
      const list = sortStores((data ?? []) as any) as Store[];
      setStores(list);
      const homolog = list.find((s) => s.name.toLowerCase().includes("homolog"));
      if (homolog) setStoreId(homolog.id);
      else if (list[0]) setStoreId(list[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!storeId) return;
    supabase
      .from("pdv_channels")
      .select("id,store_id,code,name")
      .eq("store_id", storeId)
      .then(({ data }) => setChannels((data ?? []) as Channel[]));
  }, [storeId]);

  const simulate = async () => {
    if (!storeId) return;
    const ifoodChannel = channels.find((c) => c.code === "ifood");
    if (!ifoodChannel) {
      toast({ title: "Canal iFood não configurado", description: "Configure o canal 'ifood' para esta loja.", variant: "destructive" });
      return;
    }
    setBusy(true);
    const orderNumber = `MOCK-${Math.floor(Math.random() * 9000 + 1000)}`;
    const total = Number((Math.random() * 80 + 25).toFixed(2));
    const { error } = await supabase.from("pdv_orders").insert({
      store_id: storeId,
      channel_id: ifoodChannel.id,
      order_number: orderNumber,
      external_order_id: `ifood-mock-${Date.now()}`,
      customer_name: "Cliente iFood (mock)",
      status: "placed",
      order_type: "delivery",
      delivery_by: "IFOOD",
      subtotal: total,
      total,
      created_by: user?.id ?? null,
      source_payload: { mock: true, generated_at: new Date().toISOString() },
    });
    setBusy(false);
    if (error) {
      toast({ title: "Erro ao simular", description: error.message, variant: "destructive" });
      return;
    }
    setLast({ orderNumber, total, at: new Date().toLocaleString("pt-BR") });
    toast({ title: `Pedido ${orderNumber} simulado`, description: "Status inicial: Em análise." });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Simulador iFood
        </h1>
        <p className="text-muted-foreground">
          Gere pedidos fictícios para testar o fluxo de operação do PDV sem depender do webhook real do iFood.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Disparar pedido simulado</CardTitle>
          <CardDescription>O pedido aparece na coluna <strong>Em análise</strong> do PDV (gestor).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Loja</label>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
              <SelectContent>
                {stores.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          <Button size="lg" className="w-full" disabled={busy || !storeId} onClick={simulate}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Simular pedido iFood
          </Button>

          {last && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-primary" />
                <span className="font-semibold">{last.orderNumber}</span>
                <Badge variant="outline">R$ {last.total.toFixed(2)}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Gerado em {last.at}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
