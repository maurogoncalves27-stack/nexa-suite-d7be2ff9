// Página pública de acompanhamento do pedido — polling no status.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Loader2,
  CheckCircle2,
  ChefHat,
  Package,
  XCircle,
  Clock,
  MapPin,
  Phone,
  Bike,
  ExternalLink,
} from "lucide-react";
import { PedirLayout } from "./PedirLayout";

type DeliveryInfo = {
  fee: number;
  address_label: string | null;
  tracking_url: string | null;
  job_status: string | null;
  driver_name: string | null;
  eta_minutes: number | null;
  picked_up_at: string | null;
  delivered_at: string | null;
};

type OrderStatus = {
  id: string;
  status: string;
  order_number: string | null;
  total: number;
  subtotal: number;
  order_type: string | null;
  delivery_fee: number | null;
  pickup_eta: string | null;
  confirmed_at: string | null;
  ready_at: string | null;
  dispatched_at: string | null;
  concluded_at: string | null;
  brand_breakdown: Record<string, number> | null;
  customer_name: string | null;
  items: { id: string; name: string; quantity: number; unit_price: number; total: number }[];
  store: { display_name: string; address: string | null; phone: string | null; slug: string } | null;
  delivery: DeliveryInfo | null;
};

type Step = { key: string; label: string; icon: typeof Clock };

const PICKUP_STEPS: Step[] = [
  { key: "awaiting_payment", label: "Aguardando pagamento", icon: Clock },
  { key: "confirmed", label: "Pagamento aprovado", icon: CheckCircle2 },
  { key: "preparing", label: "Em preparo", icon: ChefHat },
  { key: "ready", label: "Pronto para retirada", icon: Package },
];

const DELIVERY_STEPS: Step[] = [
  { key: "awaiting_payment", label: "Aguardando pagamento", icon: Clock },
  { key: "confirmed", label: "Pagamento aprovado", icon: CheckCircle2 },
  { key: "preparing", label: "Em preparo", icon: ChefHat },
  { key: "dispatched", label: "Saiu para entrega", icon: Bike },
  { key: "concluded", label: "Entregue", icon: CheckCircle2 },
];

// `awaiting_payment` é o status gravado pelo checkout do site;
// `pending_payment` vem do fluxo do WhatsApp.
function stepIndex(status: string, steps: Step[]) {
  const normalized = status === "pending_payment" ? "awaiting_payment" : status;
  const flow = ["awaiting_payment", "confirmed", "preparing", "ready", "dispatched", "concluded"];
  const current = flow.indexOf(normalized);
  if (current < 0) return 0;
  // Último passo alcançado dentro dos passos exibidos nesta modalidade.
  let idx = 0;
  steps.forEach((s, i) => {
    if (flow.indexOf(s.key) <= current) idx = i;
  });
  return idx;
}

const BRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const SUPABASE_URL = "https://ixjgmerxxakdkfdzgumy.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4amdtZXJ4eGFrZGtmZHpndW15Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3Nzc0MDcsImV4cCI6MjA5NTM1MzQwN30.P6TOFgTyYCz1BpDiPZKucHwBAE8CMo8JqId7s4sYtAA";

export default function PedirPedido() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    async function load() {
      try {
        const url = `${SUPABASE_URL}/functions/v1/ecommerce-order-status?id=${id}`;
        const r = await fetch(url, { headers: { apikey: SUPABASE_ANON } });
        const j = await r.json();
        if (!alive) return;
        if (j?.order) setOrder(j.order);
        else setErr(j?.error || "Pedido não encontrado");
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : "Erro ao carregar pedido");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id]);

  const isDelivery = order?.order_type === "delivery";
  const steps = isDelivery ? DELIVERY_STEPS : PICKUP_STEPS;
  const activeIdx = order ? stepIndex(order.status, steps) : 0;
  const cancelled = order?.status === "cancelled" || order?.status === "rejected";
  const delivery = order?.delivery ?? null;

  return (
    <PedirLayout>
      <div className="mx-auto max-w-lg space-y-5">
        {/* Cabeçalho do pedido */}
        <div className="ap-card p-6 text-center">
          <span className="ap-tag">Pedido</span>
          <h1
            className="ap-display mt-3"
            style={{ fontSize: "clamp(2rem, 6vw, 3rem)" }}
          >
            #{order?.order_number || id?.slice(0, 8).toUpperCase()}
          </h1>
          {order?.store && (
            <p
              className="mt-2 text-sm"
              style={{ color: "hsl(var(--ap-brown-2))", fontFamily: "Bitter, serif" }}
            >
              {isDelivery ? "Entrega de" : "Retirar em"} <strong>{order.store.display_name}</strong>
            </p>
          )}
          {isDelivery && delivery?.address_label && (
            <p className="mt-1 text-xs" style={{ color: "hsl(var(--ap-brown-2))" }}>
              {delivery.address_label}
            </p>
          )}
          {order?.customer_name && (
            <p className="mt-1 text-xs" style={{ color: "hsl(var(--ap-brown-2))" }}>
              {order.customer_name}
            </p>
          )}
        </div>

        {loading && !order ? (
          <div className="ap-card flex items-center justify-center p-8">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "hsl(var(--ap-red))" }} />
          </div>
        ) : err ? (
          <div className="ap-card p-6 text-center text-sm" style={{ color: "hsl(var(--ap-red))" }}>
            {err}
          </div>
        ) : order ? (
          <>
            {/* Timeline */}
            <div className="ap-card p-5">
              {cancelled ? (
                <div className="flex items-center gap-3" style={{ color: "hsl(var(--ap-red))" }}>
                  <XCircle className="h-7 w-7" />
                  <div>
                    <div className="font-bold">Pedido cancelado</div>
                    <div className="text-xs opacity-70">Pagamento não foi concluído.</div>
                  </div>
                </div>
              ) : (
                <ol className="space-y-4">
                  {steps.map((s, i) => {
                    const Icon = s.icon;
                    const done = i < activeIdx;
                    const active = i === activeIdx;
                    const bg = done
                      ? "hsl(var(--ap-red))"
                      : active
                        ? "hsl(var(--ap-mustard))"
                        : "hsl(var(--ap-brown) / .1)";
                    const fg = done || active ? "#fff" : "hsl(var(--ap-brown-2))";
                    return (
                      <li key={s.key} className="flex items-center gap-3">
                        <div
                          className="grid h-10 w-10 place-items-center rounded-full shadow-sm"
                          style={{ background: bg, color: fg }}
                        >
                          {active && i === 0 ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <Icon className="h-5 w-5" />
                          )}
                        </div>
                        <span
                          className="text-sm"
                          style={{
                            fontFamily: "Bitter, serif",
                            fontWeight: active ? 700 : done ? 600 : 500,
                            color: active
                              ? "hsl(var(--ap-brown))"
                              : done
                                ? "hsl(var(--ap-brown))"
                                : "hsl(var(--ap-brown-2))",
                            opacity: done || active ? 1 : 0.65,
                          }}
                        >
                          {s.label}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            {/* Entrega */}
            {isDelivery && delivery && !cancelled && (
              <div className="ap-card p-5">
                <div
                  className="mb-3 text-xs font-bold uppercase tracking-wider"
                  style={{ color: "hsl(var(--ap-brown-2))" }}
                >
                  Entrega
                </div>
                <div className="space-y-1.5 text-sm" style={{ fontFamily: "Bitter, serif" }}>
                  {delivery.driver_name ? (
                    <div className="flex items-center gap-1.5" style={{ color: "hsl(var(--ap-brown))" }}>
                      <Bike className="h-4 w-4" style={{ color: "hsl(var(--ap-red))" }} />
                      Entregador: <strong>{delivery.driver_name}</strong>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5" style={{ color: "hsl(var(--ap-brown-2))" }}>
                      <Bike className="h-4 w-4" />
                      Procurando um entregador…
                    </div>
                  )}
                  {delivery.eta_minutes ? (
                    <div className="flex items-center gap-1.5" style={{ color: "hsl(var(--ap-brown-2))" }}>
                      <Clock className="h-4 w-4" />
                      Estimativa de ~{delivery.eta_minutes} min
                    </div>
                  ) : null}
                </div>
                {delivery.tracking_url && (
                  <a
                    href={delivery.tracking_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold"
                    style={{ color: "hsl(var(--ap-red))" }}
                  >
                    Acompanhar entregador no mapa
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            )}

            {/* Resumo */}
            <div className="ap-card p-5">
              <div className="mb-3 text-xs font-bold uppercase tracking-wider" style={{ color: "hsl(var(--ap-brown-2))" }}>
                Resumo
              </div>
              <ul className="space-y-1.5 text-sm" style={{ fontFamily: "Bitter, serif", color: "hsl(var(--ap-brown))" }}>
                {order.items.map((it) => (
                  <li key={it.id} className="flex justify-between gap-2">
                    <span>{it.quantity}× {it.name}</span>
                    <span className="tabular-nums">{BRL(it.total)}</span>
                  </li>
                ))}
              </ul>
              {isDelivery && Number(order.delivery_fee ?? 0) > 0 && (
                <div
                  className="mt-3 flex justify-between border-t pt-3 text-sm"
                  style={{ borderColor: "hsl(var(--ap-brown) / .15)", color: "hsl(var(--ap-brown-2))" }}
                >
                  <span>Entrega</span>
                  <span className="tabular-nums">{BRL(Number(order.delivery_fee))}</span>
                </div>
              )}
              <div
                className="mt-4 flex justify-between border-t pt-3 text-base font-black"
                style={{ borderColor: "hsl(var(--ap-brown) / .15)", color: "hsl(var(--ap-red))" }}
              >
                <span>Total</span>
                <span>{BRL(order.total)}</span>
              </div>
            </div>

            {/* Loja */}
            {order.store && (
              <div className="ap-card p-5 text-sm" style={{ fontFamily: "Bitter, serif" }}>
                <div className="ap-display" style={{ fontSize: "1.25rem" }}>
                  {order.store.display_name}
                </div>
                {order.store.address && (
                  <div className="mt-2 flex items-start gap-1.5" style={{ color: "hsl(var(--ap-brown-2))" }}>
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{order.store.address}</span>
                  </div>
                )}
                {order.store.phone && (
                  <div className="mt-1 flex items-center gap-1.5" style={{ color: "hsl(var(--ap-brown-2))" }}>
                    <Phone className="h-4 w-4" />
                    <a href={`tel:${order.store.phone}`} className="ap-footer-link" style={{ color: "hsl(var(--ap-red))" }}>
                      {order.store.phone}
                    </a>
                  </div>
                )}
              </div>
            )}
          </>
        ) : null}
      </div>
    </PedirLayout>
  );
}
