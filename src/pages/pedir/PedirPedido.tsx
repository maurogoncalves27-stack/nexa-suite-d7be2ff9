// Página pública de acompanhamento do pedido — polling no status.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, CheckCircle2, ChefHat, Package, XCircle, Clock, MapPin, Phone } from "lucide-react";
import { PedirLayout } from "./PedirLayout";

type OrderStatus = {
  id: string;
  status: string;
  order_number: string | null;
  total: number;
  subtotal: number;
  pickup_eta: string | null;
  confirmed_at: string | null;
  ready_at: string | null;
  brand_breakdown: Record<string, number> | null;
  customer_name: string | null;
  items: { id: string; name: string; quantity: number; unit_price: number; total: number }[];
  store: { display_name: string; address: string | null; phone: string | null; slug: string } | null;
};

const STEPS: { key: string; label: string; icon: typeof Clock }[] = [
  { key: "pending_payment", label: "Aguardando pagamento", icon: Clock },
  { key: "confirmed", label: "Pagamento aprovado", icon: CheckCircle2 },
  { key: "preparing", label: "Em preparo", icon: ChefHat },
  { key: "ready", label: "Pronto para retirada", icon: Package },
];

function stepIndex(status: string) {
  const order = ["pending_payment", "confirmed", "preparing", "ready", "concluded"];
  const i = order.indexOf(status);
  return i < 0 ? 0 : Math.min(i, 3);
}

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
        const url = `https://ixjgmerxxakdkfdzgumy.supabase.co/functions/v1/ecommerce-order-status?id=${id}`;
        const r = await fetch(url, {
          headers: {
            apikey:
              "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4amdtZXJ4eGFrZGtmZHpndW15Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3Nzc0MDcsImV4cCI6MjA5NTM1MzQwN30.P6TOFgTyYCz1BpDiPZKucHwBAE8CMo8JqId7s4sYtAA",
          },
        });
        const j = await r.json();
        if (!alive) return;
        if (j?.order) setOrder(j.order);
        else setErr(j?.error || "Pedido não encontrado");
      } catch (e: any) {
        if (alive) setErr(e?.message || "Erro ao carregar pedido");
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

  const activeIdx = order ? stepIndex(order.status) : 0;
  const cancelled = order?.status === "cancelled" || order?.status === "rejected";

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
              Retirar em <strong>{order.store.display_name}</strong>
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
                  {STEPS.map((s, i) => {
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

            {/* Resumo */}
            <div className="ap-card p-5">
              <div className="mb-3 text-xs font-bold uppercase tracking-wider" style={{ color: "hsl(var(--ap-brown-2))" }}>
                Resumo
              </div>
              <ul className="space-y-1.5 text-sm" style={{ fontFamily: "Bitter, serif", color: "hsl(var(--ap-brown))" }}>
                {order.items.map((it) => (
                  <li key={it.id} className="flex justify-between gap-2">
                    <span>{it.quantity}× {it.name}</span>
                    <span className="tabular-nums">
                      {it.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>
                  </li>
                ))}
              </ul>
              <div
                className="mt-4 flex justify-between border-t pt-3 text-base font-black"
                style={{ borderColor: "hsl(var(--ap-brown) / .15)", color: "hsl(var(--ap-red))" }}
              >
                <span>Total</span>
                <span>{order.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
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
