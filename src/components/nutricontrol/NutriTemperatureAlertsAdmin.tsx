import { useEffect, useState, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MessageCircle, Send, RefreshCw, CheckCircle2, AlertTriangle, WifiOff, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "react-router-dom";

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

export const NutriTemperatureAlertsAdmin = ({ storeId: _storeId }: Props) => {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { data: a } = await supabase
      .from("nutri_temperature_alerts")
      .select("id, sensor_code, store_id, kind, last_temperature, min_value, max_value, triggered_at, resolved_at, notified_phones")
      .order("triggered_at", { ascending: false })
      .limit(15);
    setAlerts((a ?? []) as AlertRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const runCheck = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("ems-temperature-alert-check", { body: {} });
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
            <Button asChild size="sm" variant="outline" className="gap-1">
              <Link to="/configuracoes?tab=alerts">
                <Settings2 className="h-3.5 w-3.5" />
                Destinatários
              </Link>
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Destinatários agora são gerenciados em <Link to="/configuracoes?tab=alerts" className="underline">Configurações → Alertas → Temperatura</Link>.
        </p>

        {loading ? (
          <p className="text-xs text-muted-foreground mt-3">Carregando...</p>
        ) : alerts.length > 0 && (
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
