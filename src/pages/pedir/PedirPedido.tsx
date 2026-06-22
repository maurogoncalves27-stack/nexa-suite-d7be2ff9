// Página pública de acompanhamento do pedido — polling no status.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, CheckCircle2, ChefHat, Package, XCircle, Clock } from "lucide-react";
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
      <div className="mx-auto max-w-md space-y-4">
        <div className="rounded-2xl border bg-white p-6 text-center">
          <p className="text-xs uppercase tracking-wider opacity-60">Pedido</p>
          <h1 className="mt-1 text-2xl font-black">
            #{order?.order_number || id?.slice(0, 8).toUpperCase()}
          </h1>
          {order?.store && (
            <p className="mt-1 text-sm opacity-70">Retirar em {order.store.display_name}</p>
          )}
        </div>

        {loading && !order ? (
          <div className="flex items-center justify-center rounded-2xl border bg-white p-8">
            <Loader2 className="h-5 w-5 animate-spin opacity-60" />
          </div>
        ) : err ? (
          <div className="rounded-2xl border bg-white p-6 text-center text-sm text-red-600">{err}</div>
        ) : order ? (
          <>
            <div className="rounded-2xl border bg-white p-4">
              {cancelled ? (
                <div className="flex items-center gap-3 text-red-600">
                  <XCircle className="h-6 w-6" />
                  <div>
                    <div className="font-bold">Pedido cancelado</div>
                    <div className="text-xs opacity-70">Pagamento não foi concluído.</div>
                  </div>
                </div>
              ) : (
                <ol className="space-y-3">
                  {STEPS.map((s, i) => {
                    const Icon = s.icon;
                    const done = i < activeIdx;
                    const active = i === activeIdx;
                    return (
                      <li key={s.key} className="flex items-center gap-3">
                        <div
                          className={`grid h-8 w-8 place-items-center rounded-full ${
                            done
                              ? "bg-green-600 text-white"
                              : active
                                ? "bg-zinc-900 text-white"
                                : "bg-zinc-100 text-zinc-400"
                          }`}
                        >
                          {active && i === 0 ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Icon className="h-4 w-4" />
                          )}
                        </div>
                        <span className={`text-sm ${active ? "font-bold" : done ? "" : "opacity-50"}`}>
                          {s.label}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            <div className="rounded-2xl border bg-white p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider opacity-60">
                Resumo
              </div>
              <ul className="space-y-1 text-sm">
                {order.items.map((it) => (
                  <li key={it.id} className="flex justify-between gap-2">
                    <span>
                      {it.quantity}× {it.name}
                    </span>
                    <span className="tabular-nums">
                      {it.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex justify-between border-t pt-2 text-sm font-bold">
                <span>Total</span>
                <span>
                  {order.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </div>
            </div>

            {order.store && (
              <div className="rounded-2xl border bg-white p-4 text-sm">
                <div className="font-semibold">{order.store.display_name}</div>
                {order.store.address && <div className="opacity-70">{order.store.address}</div>}
                {order.store.phone && <div className="opacity-70">{order.store.phone}</div>}
              </div>
            )}
          </>
        ) : null}
      </div>
    </PedirLayout>
  );
}
