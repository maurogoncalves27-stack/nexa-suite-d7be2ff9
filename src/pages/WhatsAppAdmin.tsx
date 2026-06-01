import { useEffect, useState } from "react";
import { MessageCircle, Send, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

type LogRow = {
  id: string;
  phone: string | null;
  message: string;
  category: string | null;
  status: string;
  provider: string;
  error: string | null;
  created_at: string;
};

export default function WhatsAppAdmin() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState("Teste de envio NEXA Suite ✅");
  const [sending, setSending] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("whatsapp_notifications_log")
      .select("id, phone, message, category, status, provider, error, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    setLoading(false);
    if (error) {
      toast({ title: "Erro ao carregar log", description: error.message, variant: "destructive" });
      return;
    }
    setLogs((data ?? []) as LogRow[]);
  };

  useEffect(() => {
    load();
  }, []);

  const sendTest = async () => {
    if (!phone.trim() || !msg.trim()) return;
    setSending(true);
    const { data, error } = await supabase.functions.invoke("send-whatsapp", {
      body: { phone: phone.trim(), message: msg.trim(), category: "test", tag: "admin-test" },
    });
    setSending(false);
    if (error) {
      toast({ title: "Falha no envio", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Solicitação enviada", description: JSON.stringify(data) });
      load();
    }
  };

  const statusVariant = (s: string) =>
    s === "sent" ? "default" : s === "failed" ? "destructive" : "secondary";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-xl font-bold flex items-center gap-2">
          <MessageCircle className="md: md: h-6 w-6 md:h-7 md:w-7 text-primary" />
          Notificações WhatsApp
        </h1>
        <p className="text-muted-foreground">
          Canal adicional ao push para avisar colaboradores. Provedor atual: Z-API (não-oficial), ponte temporária até API oficial Meta Cloud.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Enviar teste</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="phone">Telefone (com DDD)</Label>
              <Input id="phone" placeholder="61999999999" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="msg">Mensagem</Label>
            <Textarea id="msg" rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} />
          </div>
          <Button onClick={sendTest} disabled={sending || !phone.trim() || !msg.trim()}>
            <Send className="h-4 w-4 mr-2" />
            {sending ? "Enviando..." : "Enviar"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Últimos 50 envios</CardTitle>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum envio ainda.</p>
          ) : (
            <div className="space-y-2">
              {logs.map((l) => (
                <div key={l.id} className="rounded-md border p-3 text-sm space-y-1">
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={statusVariant(l.status) as any}>{l.status}</Badge>
                      <span className="text-muted-foreground text-xs">{l.provider}</span>
                      {l.category && <span className="text-muted-foreground text-xs">· {l.category}</span>}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(l.created_at), "dd/MM HH:mm:ss")}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">Para: {l.phone ?? "—"}</div>
                  <div className="whitespace-pre-wrap line-clamp-3">{l.message}</div>
                  {l.error && <div className="text-xs text-destructive">Erro: {l.error}</div>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
