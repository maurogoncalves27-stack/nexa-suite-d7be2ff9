import { useEffect, useState, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MessageCircle, Plus, Trash2, Send, RefreshCw, CheckCircle2, AlertTriangle, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Recipient {
  id: string;
  name: string;
  phone: string;
  store_id: string | null;
  active: boolean;
}

interface AlertRow {
  id: string;
  sensor_code: string;
  store_id: string | null;
  kind: string;
  last_temperature: number | null;
  min_value: number | null;
  max_value: number | null;
  triggered_at: string;
  resolved_at: string | null;
  notified_phones: Array<{ name: string; phone: string; ok: boolean; error?: string }>;
}

interface Props {
  storeId: string | null;
}

export const NutriTemperatureAlertsAdmin = ({ storeId }: Props) => {
  const { user } = useAuth();
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formScope, setFormScope] = useState<"store" | "all">("store");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: r }, { data: a }] = await Promise.all([
      supabase
        .from("nutri_temperature_alert_recipients")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("nutri_temperature_alerts")
        .select("id, sensor_code, store_id, kind, last_temperature, min_value, max_value, triggered_at, resolved_at, notified_phones")
        .order("triggered_at", { ascending: false })
        .limit(15),
    ]);
    setRecipients((r ?? []) as Recipient[]);
    setAlerts((a ?? []) as AlertRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const addRecipient = async () => {
    const name = formName.trim();
    const phone = formPhone.replace(/\D+/g, "");
    if (!name || phone.length < 10) {
      toast.error("Informe nome e telefone com DDD");
      return;
    }
    const { error } = await supabase.from("nutri_temperature_alert_recipients").insert({
      name,
      phone,
      store_id: formScope === "all" ? null : storeId,
      created_by: user?.id ?? null,
    });
    if (error) {
      toast.error("Erro ao salvar destinatário");
      return;
    }
    toast.success("Destinatário cadastrado");
    setFormName("");
    setFormPhone("");
    setFormScope("store");
    setOpen(false);
    fetchAll();
  };

  const toggleActive = async (r: Recipient) => {
    await supabase
      .from("nutri_temperature_alert_recipients")
      .update({ active: !r.active })
      .eq("id", r.id);
    fetchAll();
  };

  const removeRecipient = async (id: string) => {
    if (!confirm("Remover este destinatário?")) return;
    await supabase.from("nutri_temperature_alert_recipients").delete().eq("id", id);
    fetchAll();
  };

  const runCheck = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("ems-temperature-alert-check", {
        body: {},
      });
      if (error) throw error;
      const results = (data as any)?.results ?? [];
      const sent = results.filter((r: any) => r.recipients > 0).length;
      toast.success(sent > 0 ? `${sent} alerta(s) enviado(s)` : "Nada para enviar agora");
      fetchAll();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao executar verificação");
    } finally {
      setRunning(false);
    }
  };

  const filtered = recipients.filter((r) => !r.store_id || r.store_id === storeId);

  return (
    <div className="space-y-4 mt-6">
      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Alertas WhatsApp</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={runCheck} disabled={running} className="gap-1">
              <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
              Verificar agora
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  Destinatário
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Novo destinatário WhatsApp</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Nome</Label>
                    <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
                  </div>
                  <div>
                    <Label>WhatsApp (com DDD)</Label>
                    <Input
                      placeholder="61 99999-0000"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Escopo</Label>
                    <Select value={formScope} onValueChange={(v) => setFormScope(v as "store" | "all")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="store" disabled={!storeId}>Somente esta loja</SelectItem>
                        <SelectItem value="all">Todas as lojas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button onClick={addRecipient}>Salvar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {loading ? (
          <p className="text-xs text-muted-foreground">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhum destinatário cadastrado. Adicione números para receber alertas quando um sensor sair da faixa.
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => (
              <div key={r.id} className="flex items-center gap-2 bg-card border border-border rounded p-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.phone}{r.store_id ? "" : " · todas as lojas"}
                  </div>
                </div>
                <Switch checked={r.active} onCheckedChange={() => toggleActive(r)} />
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeRecipient(r.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {alerts.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-semibold text-muted-foreground mb-2">Últimos alertas</div>
            <div className="space-y-1.5">
              {alerts.map((a) => {
                const Icon = a.kind === "out_of_range" ? AlertTriangle : a.kind === "offline" ? WifiOff : CheckCircle2;
                const color = a.kind === "recovered" ? "text-success" : "text-destructive";
                const sent = a.notified_phones.filter((p) => p.ok).length;
                return (
                  <div key={a.id} className="flex items-start gap-2 text-xs bg-muted/30 rounded p-2">
                    <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">
                        {a.kind === "out_of_range" ? "Fora da faixa" : a.kind === "offline" ? "Offline" : "Normalizado"}
                        {a.last_temperature != null && ` · ${Number(a.last_temperature).toFixed(1)}°C`}
                      </div>
                      <div className="text-muted-foreground">
                        {formatDistanceToNow(new Date(a.triggered_at), { locale: ptBR, addSuffix: true })}
                        {" · "}
                        <Send className="inline h-3 w-3" /> {sent}/{a.notified_phones.length}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
