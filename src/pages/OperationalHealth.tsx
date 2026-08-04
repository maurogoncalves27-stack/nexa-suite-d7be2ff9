import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Radar,
  RefreshCw,
  ShoppingBag,
  ReceiptText,
  CreditCard,
  Printer,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface StoreHealth {
  store_id: string;
  store_name: string;
  last_order_at: string | null;
  orders_today: number;
  revenue_today: number;
  last_invoice_at: string | null;
  last_invoice_status: string | null;
  invoice_errors_24h: number;
  tef_provider: string | null;
  tef_environment: string | null;
  tef_active: boolean;
  last_tef_at: string | null;
  last_tef_status: string | null;
  tef_errors_24h: number;
  printers_active: number;
  allow_order_type: boolean;
}

type Level = "ok" | "warn" | "down" | "idle";

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const minutesSince = (iso: string | null): number | null => {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
};

const relative = (iso: string | null): string => {
  const m = minutesSince(iso);
  if (m === null) return "sem registro";
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
};

const INVOICE_LABEL: Record<string, string> = {
  authorized: "Autorizada",
  rejected: "Rejeitada",
  error: "Erro",
  pending: "Pendente",
  cancelled: "Cancelada",
  processing: "Processando",
};

const TEF_LABEL: Record<string, string> = {
  approved: "Aprovada",
  declined: "Negada",
  error: "Erro",
  cancelled: "Cancelada",
  pending_confirmation: "Aguardando confirmação",
};

const PROVIDER_LABEL: Record<string, string> = {
  paygo: "PayGo",
  payer: "Payer",
  sitef: "SiTef",
  mock: "Simulado",
};

/** Nível geral da loja: pior sinal entre venda, fiscal e pagamento. */
function storeLevel(s: StoreHealth): Level {
  const orderAge = minutesSince(s.last_order_at);
  const signals: Level[] = [];

  if (orderAge === null) signals.push("idle");
  else if (orderAge > 60 * 24) signals.push("idle");
  else if (orderAge > 180) signals.push("warn");
  else signals.push("ok");

  if (s.invoice_errors_24h > 0) signals.push(s.invoice_errors_24h >= 3 ? "down" : "warn");
  if (s.last_invoice_status === "error" || s.last_invoice_status === "rejected") signals.push("down");
  if (s.tef_errors_24h >= 3) signals.push("down");
  else if (s.tef_errors_24h > 0) signals.push("warn");
  if (!s.tef_active) signals.push("warn");

  if (signals.includes("down")) return "down";
  if (signals.includes("warn")) return "warn";
  if (signals.every((x) => x === "idle")) return "idle";
  return "ok";
}

const LEVEL_STYLE: Record<Level, { label: string; badge: string; ring: string; Icon: typeof CheckCircle2 }> = {
  ok: {
    label: "Operando",
    badge: "bg-success/15 text-success border-success/30",
    ring: "border-success/40",
    Icon: CheckCircle2,
  },
  warn: {
    label: "Atenção",
    badge: "bg-warning/15 text-warning border-warning/30",
    ring: "border-warning/40",
    Icon: AlertTriangle,
  },
  down: {
    label: "Falha",
    badge: "bg-destructive/15 text-destructive border-destructive/30",
    ring: "border-destructive/40",
    Icon: XCircle,
  },
  idle: {
    label: "Sem movimento",
    badge: "bg-muted text-muted-foreground border-border",
    ring: "border-border",
    Icon: Clock,
  },
};

function Metric({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof ShoppingBag;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warn" | "down";
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3">
      <Icon
        className={cn(
          "h-4 w-4 mt-0.5 shrink-0",
          tone === "down" ? "text-destructive" : tone === "warn" ? "text-warning" : "text-muted-foreground",
        )}
      />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            "text-sm font-medium truncate",
            tone === "down" && "text-destructive",
            tone === "warn" && "text-warning",
          )}
        >
          {value}
        </p>
        {hint && <p className="text-xs text-muted-foreground truncate">{hint}</p>}
      </div>
    </div>
  );
}

export default function OperationalHealth() {
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["operational-health"],
    queryFn: async (): Promise<StoreHealth[]> => {
      const { data, error } = await supabase.rpc("operational_health");
      if (error) throw error;
      return (data ?? []) as StoreHealth[];
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const stores = useMemo(() => data ?? [], [data]);
  const summary = useMemo(() => {
    const acc = { ok: 0, warn: 0, down: 0, idle: 0 };
    stores.forEach((s) => {
      acc[storeLevel(s)] += 1;
    });
    return acc;
  }, [stores]);

  const ordersToday = stores.reduce((a, s) => a + (s.orders_today || 0), 0);
  const revenueToday = stores.reduce((a, s) => a + Number(s.revenue_today || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Radar className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            Saúde operacional
          </h1>
          <p className="text-muted-foreground">
            Venda, emissão fiscal e maquininha de cada ponto de venda, atualizado a cada minuto.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="w-full md:w-auto">
          <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">
            Não foi possível carregar os indicadores: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Lojas operando</p>
            <p className="text-2xl font-bold text-success">{summary.ok}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Com atenção / falha</p>
            <p className="text-2xl font-bold text-warning">
              {summary.warn}
              <span className="text-destructive"> / {summary.down}</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Pedidos hoje</p>
            <p className="text-2xl font-bold">{ordersToday}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Vendido hoje</p>
            <p className="text-2xl font-bold">{brl(revenueToday)}</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : stores.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Nenhum ponto de venda ativo encontrado.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {stores.map((s) => {
            const level = storeLevel(s);
            const st = LEVEL_STYLE[level];
            const invoiceTone =
              s.last_invoice_status === "error" || s.last_invoice_status === "rejected"
                ? "down"
                : s.invoice_errors_24h > 0
                  ? "warn"
                  : "default";
            const tefTone =
              s.tef_errors_24h >= 3 ? "down" : s.tef_errors_24h > 0 || !s.tef_active ? "warn" : "default";

            return (
              <Card key={s.store_id} className={cn("border-2", st.ring)}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base truncate">{s.store_name}</CardTitle>
                    <Badge variant="outline" className={cn("shrink-0 gap-1", st.badge)}>
                      <st.Icon className="h-3 w-3" />
                      {st.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Última venda {relative(s.last_order_at)}
                    {s.allow_order_type && " · comer no local ativo"}
                  </p>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Metric
                    icon={ShoppingBag}
                    label="Pedidos hoje"
                    value={String(s.orders_today)}
                    hint={brl(Number(s.revenue_today || 0))}
                  />
                  <Metric
                    icon={ReceiptText}
                    label="Última NFC-e"
                    value={
                      s.last_invoice_status
                        ? (INVOICE_LABEL[s.last_invoice_status] ?? s.last_invoice_status)
                        : "sem emissão"
                    }
                    hint={
                      s.invoice_errors_24h > 0
                        ? `${s.invoice_errors_24h} falha(s) em 24h · ${relative(s.last_invoice_at)}`
                        : relative(s.last_invoice_at)
                    }
                    tone={invoiceTone}
                  />
                  <Metric
                    icon={CreditCard}
                    label={`Maquininha${s.tef_provider ? ` · ${PROVIDER_LABEL[s.tef_provider] ?? s.tef_provider}` : ""}`}
                    value={
                      !s.tef_provider
                        ? "não configurada"
                        : !s.tef_active
                          ? "desativada"
                          : (TEF_LABEL[s.last_tef_status ?? ""] ?? "sem transação")
                    }
                    hint={
                      s.tef_errors_24h > 0
                        ? `${s.tef_errors_24h} falha(s) em 24h · ${relative(s.last_tef_at)}`
                        : `${s.tef_environment === "production" ? "produção" : (s.tef_environment ?? "—")} · ${relative(s.last_tef_at)}`
                    }
                    tone={tefTone}
                  />
                  <Metric
                    icon={Printer}
                    label="Impressoras ativas"
                    value={String(s.printers_active)}
                    hint={s.printers_active === 0 ? "nenhuma cadastrada" : undefined}
                    tone={s.printers_active === 0 ? "warn" : "default"}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
