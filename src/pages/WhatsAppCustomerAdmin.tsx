import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageCircle, RefreshCw, AlertCircle, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

type Store = { id: string; name: string };
type Conv = { id: string; phone: string; customer_name: string | null; status: string; last_message_at: string; store_id: string | null };
type Msg = { id: string; role: string; content: string | null; tool_name: string | null; created_at: string };
type Complaint = { id: string; phone: string; message: string; status: string; created_at: string };
type Cfg = { id?: string; store_id: string; enabled: boolean; system_prompt: string | null; opening_hours: string | null; off_hours_message: string | null; sales_enabled: boolean; sales_off_message: string | null };
type WaOrder = { id: string; status: string; total: number; customer_name: string | null; customer_phone: string | null; created_at: string; order_number: string | null };

export default function WhatsAppCustomerAdmin() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [conversations, setConversations] = useState<Conv[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conv | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [waOrders, setWaOrders] = useState<WaOrder[]>([]);
  const [loading, setLoading] = useState(false);

  // Carrega lojas
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("stores")
        .select("id, name")
        .eq("is_virtual", false)
        .eq("is_active", true)
        .order("name");
      setStores(data || []);
      if (data && data.length > 0) setStoreId(data[0].id);
    })();
  }, []);

  // Config + listas ao mudar loja
  useEffect(() => {
    if (!storeId) return;
    loadAll();
  }, [storeId]);

  async function loadAll() {
    setLoading(true);
    const [cfgRes, convRes, compRes] = await Promise.all([
      supabase.from("whatsapp_customer_config").select("*").eq("store_id", storeId).maybeSingle(),
      supabase.from("whatsapp_customer_conversations").select("*").eq("store_id", storeId).order("last_message_at", { ascending: false }).limit(50),
      supabase.from("whatsapp_customer_complaints").select("*").eq("store_id", storeId).order("created_at", { ascending: false }).limit(30),
    ]);
    setCfg((cfgRes.data as any) || { store_id: storeId, enabled: false, system_prompt: "", opening_hours: "", off_hours_message: "", sales_enabled: false, sales_off_message: "" });
    setConversations(convRes.data || []);
    setComplaints(compRes.data || []);
    const { data: ordersData } = await supabase
      .from("pdv_orders")
      .select("id, status, total, customer_name, customer_phone, created_at, order_number, channel_id, pdv_channels:channel_id(code)")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(30);
    setWaOrders(((ordersData || []) as any[]).filter((o) => o.pdv_channels?.code === "whatsapp"));
    setLoading(false);
  }

  async function openConversation(conv: Conv) {
    setSelectedConv(conv);
    const { data } = await supabase
      .from("whatsapp_customer_messages")
      .select("id, role, content, tool_name, created_at")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true });
    setMessages(data || []);
  }

  async function saveConfig() {
    if (!cfg) return;
    const payload = {
      store_id: storeId,
      enabled: cfg.enabled,
      system_prompt: cfg.system_prompt,
      opening_hours: cfg.opening_hours,
      off_hours_message: cfg.off_hours_message,
      sales_enabled: cfg.sales_enabled,
      sales_off_message: cfg.sales_off_message,
    };
    const { error } = await supabase.from("whatsapp_customer_config").upsert(payload, { onConflict: "store_id" });
    if (error) toast.error("Erro ao salvar: " + error.message);
    else toast.success("Configuração salva");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-xl font-bold flex items-center gap-2">
          <MessageCircle className="md: md: h-6 w-6 md:h-7 md:w-7 text-primary" />
          WhatsApp Cliente (SAC + IA)
        </h1>
        <p className="text-muted-foreground">
          Canal de atendimento ao cliente via WhatsApp. Separado das notificações internas.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        <Label className="md:w-32">Loja</Label>
        <Select value={storeId} onValueChange={setStoreId}>
          <SelectTrigger className="md:w-72"><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={loadAll} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />Recarregar
        </Button>
      </div>

      {/* Config */}
      {cfg && (
        <Card>
          <CardHeader>
            <CardTitle>Configuração do bot</CardTitle>
            <CardDescription>Liga/desliga o atendimento automático desta loja.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Bot ativo</Label>
                <p className="text-xs text-muted-foreground">Quando desligado, o cliente recebe a mensagem fora do horário.</p>
              </div>
              <Switch checked={cfg.enabled} onCheckedChange={(v) => setCfg({ ...cfg, enabled: v })} />
            </div>
            <div>
              <Label>Horário de atendimento</Label>
              <Input value={cfg.opening_hours || ""} onChange={(e) => setCfg({ ...cfg, opening_hours: e.target.value })}
                placeholder="Ex.: Seg–Dom, 11h às 23h" />
            </div>
            <div>
              <Label>Mensagem fora do horário / bot desligado</Label>
              <Textarea value={cfg.off_hours_message || ""} onChange={(e) => setCfg({ ...cfg, off_hours_message: e.target.value })}
                placeholder="Ex.: Estamos fechados, retornamos amanhã às 11h." rows={2} />
            </div>
            <div>
              <Label>Prompt do sistema (avançado)</Label>
              <Textarea value={cfg.system_prompt || ""} onChange={(e) => setCfg({ ...cfg, system_prompt: e.target.value })}
                placeholder="Deixe em branco para usar o prompt padrão da NEXA." rows={6} />
            </div>
            <Button onClick={saveConfig}>Salvar</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* Conversas */}
        <Card>
          <CardHeader>
            <CardTitle>Conversas recentes</CardTitle>
            <CardDescription>Últimas 50 conversas desta loja.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-auto">
              {conversations.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma conversa ainda.</p>
              )}
              {conversations.map((c) => (
                <button key={c.id} onClick={() => openConversation(c)}
                  className="w-full text-left p-3 rounded-md border hover:bg-muted transition">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{c.customer_name || c.phone}</span>
                    <Badge variant="outline" className="text-xs">{c.status}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{c.phone} · {new Date(c.last_message_at).toLocaleString("pt-BR")}</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Mensagens */}
        <Card>
          <CardHeader>
            <CardTitle>{selectedConv ? (selectedConv.customer_name || selectedConv.phone) : "Selecione uma conversa"}</CardTitle>
            <CardDescription>Histórico de mensagens (somente leitura).</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-auto">
              {messages.map((m) => (
                <div key={m.id} className={`p-2 rounded-md text-sm ${
                  m.role === "user" ? "bg-muted" :
                  m.role === "assistant" ? "bg-primary/10" :
                  "bg-accent/20 text-xs"
                }`}>
                  <div className="text-xs text-muted-foreground mb-1">
                    {m.role === "tool" ? `🔧 ${m.tool_name}` : m.role} · {new Date(m.created_at).toLocaleTimeString("pt-BR")}
                  </div>
                  <div className="whitespace-pre-wrap">{m.content || "(sem conteúdo)"}</div>
                </div>
              ))}
              {!selectedConv && <p className="text-sm text-muted-foreground">Clique numa conversa ao lado.</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reclamações */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertCircle className="h-5 w-5 text-warning" />Reclamações pendentes</CardTitle>
        </CardHeader>
        <CardContent>
          {complaints.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem reclamações.</p>
          ) : (
            <div className="space-y-2">
              {complaints.map((c) => (
                <div key={c.id} className="p-3 rounded-md border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{c.phone}</span>
                    <Badge variant={c.status === "resolved" ? "outline" : "destructive"}>{c.status}</Badge>
                  </div>
                  <p className="text-sm">{c.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">{new Date(c.created_at).toLocaleString("pt-BR")}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
