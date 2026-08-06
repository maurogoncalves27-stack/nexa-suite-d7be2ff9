// Avaliação da entrega pelo cliente — acesso por link com token, sem login.
import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Loader2, Star, CheckCircle2 } from "lucide-react";
import { PedirLayout } from "./PedirLayout";
import { invokeEdge } from "@/lib/edgeInvoke";
import { toast } from "@/hooks/use-toast";

type RatingOrder = {
  id: string;
  order_number: string | null;
  status: string;
  customer_name: string | null;
  store_name: string | null;
  delivered: boolean;
};

const ERRORS: Record<string, string> = {
  invalid_token: "Este link de avaliação não é válido.",
  not_found: "Pedido não encontrado.",
  not_a_delivery: "Este pedido não foi uma entrega.",
  delivery_not_completed: "A entrega ainda não foi concluída.",
};

const STARS = [1, 2, 3, 4, 5];

export default function PedirAvaliar() {
  const { id = "" } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const token = params.get("t") ?? "";

  const [order, setOrder] = useState<RatingOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await invokeEdge<{
        order?: RatingOrder;
        rating?: { rating: number; comment: string | null } | null;
        error?: string;
      }>("ecommerce-delivery-rating", { action: "load", order_id: id, token });
      const data = res.data;
      if (data?.error) {
        setErr(ERRORS[data.error] ?? "Não foi possível abrir a avaliação.");
        return;
      }
      if (!data?.order) {
        setErr("Pedido não encontrado.");
        return;
      }
      setOrder(data.order);
      if (data.rating) {
        setRating(data.rating.rating);
        setComment(data.rating.comment ?? "");
        setSaved(true);
      }
    } catch {
      setErr("Não foi possível abrir a avaliação.");
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    if (!id || !token) {
      setErr("Link de avaliação incompleto.");
      setLoading(false);
      return;
    }
    load();
  }, [id, token, load]);

  async function submit() {
    if (rating < 1 || saving) return;
    setSaving(true);
    try {
      const res = await invokeEdge<{ ok?: boolean; error?: string }>("ecommerce-delivery-rating", {
        action: "save",
        order_id: id,
        token,
        rating,
        comment: comment.trim() || undefined,
      });
      const data = res.data;
      if (data?.error) throw new Error(ERRORS[data.error] ?? data.error);
      setSaved(true);
      toast({ title: "Obrigado pela avaliação!" });
    } catch (e) {
      toast({
        title: "Não foi possível enviar",
        description: e instanceof Error ? e.message : "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <PedirLayout>
      <div className="mx-auto max-w-md space-y-5">
        {loading ? (
          <div className="ap-card flex items-center justify-center p-10">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "hsl(var(--ap-red))" }} />
          </div>
        ) : err ? (
          <div className="ap-card p-8 text-center">
            <p className="text-sm font-semibold" style={{ color: "hsl(var(--ap-red))" }}>
              {err}
            </p>
            <Link to="/pedir" className="ap-btn-primary mt-5 inline-flex">
              Fazer um pedido
            </Link>
          </div>
        ) : (
          <>
            <div className="ap-card p-6 text-center">
              <span className="ap-tag">Avaliação</span>
              <h1 className="ap-display mt-3" style={{ fontSize: "clamp(1.75rem, 5vw, 2.5rem)" }}>
                Como foi sua entrega?
              </h1>
              <p
                className="mt-2 text-sm"
                style={{ color: "hsl(var(--ap-brown-2))", fontFamily: "Bitter, serif" }}
              >
                Pedido #{order?.order_number || id.slice(0, 8).toUpperCase()}
                {order?.store_name ? ` · ${order.store_name}` : ""}
              </p>
            </div>

            <div className="ap-card space-y-4 p-6">
              <div className="flex items-center justify-center gap-1.5">
                {STARS.map((n) => {
                  const filled = (hover || rating) >= n;
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-label={`${n} ${n === 1 ? "estrela" : "estrelas"}`}
                      onClick={() => setRating(n)}
                      onMouseEnter={() => setHover(n)}
                      onMouseLeave={() => setHover(0)}
                      className="p-1 transition-transform hover:scale-110"
                    >
                      <Star
                        className="h-9 w-9"
                        style={{
                          color: "hsl(var(--ap-mustard))",
                          fill: filled ? "hsl(var(--ap-mustard))" : "transparent",
                        }}
                      />
                    </button>
                  );
                })}
              </div>

              <div>
                <label
                  className="block text-xs font-semibold"
                  style={{ color: "hsl(var(--ap-brown-2))" }}
                >
                  Quer contar mais? (opcional)
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="Chegou quentinho? O entregador foi atencioso?"
                  className="mt-1 w-full resize-none rounded-xl bg-white px-3 py-2.5 text-sm outline-none"
                  style={{ border: "1px solid hsl(var(--ap-brown) / .2)" }}
                />
              </div>

              <button
                type="button"
                onClick={submit}
                disabled={rating < 1 || saving}
                className="ap-btn-primary flex w-full items-center justify-center gap-2 py-3 text-base disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saved ? "Atualizar avaliação" : "Enviar avaliação"}
              </button>

              {saved && (
                <p
                  className="flex items-center justify-center gap-1.5 text-center text-xs font-semibold"
                  style={{ color: "hsl(var(--ap-brown-2))" }}
                >
                  <CheckCircle2 className="h-4 w-4" style={{ color: "hsl(var(--ap-red))" }} />
                  Avaliação registrada. Obrigado!
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </PedirLayout>
  );
}
