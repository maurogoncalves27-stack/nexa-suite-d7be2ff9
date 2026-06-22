// Revisão da sacola + dados do cliente + checkout Mercado Pago.
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Trash2, Minus, Plus, Loader2, ArrowLeft } from "lucide-react";
import { PedirLayout } from "./PedirLayout";
import { useEcommerceCart, formatBRL } from "@/hooks/useEcommerceCart";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function PedirCarrinho() {
  const { slug = "" } = useParams<{ slug: string }>();
  const nav = useNavigate();
  const cart = useEcommerceCart(slug);
  const [name, setName] = useState(cart.state.customer_name ?? "");
  const [phone, setPhone] = useState(cart.state.customer_phone ?? "");
  const [submitting, setSubmitting] = useState(false);

  const empty = cart.items.length === 0;

  async function handleCheckout(e: React.FormEvent) {
    e.preventDefault();
    if (empty || submitting) return;
    const form = e.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const customerName = String(formData.get("customer_name") || name).trim();
    const customerPhone = String(formData.get("customer_phone") || phone).trim();
    if (!customerName || !customerPhone) {
      toast({ title: "Preencha nome e telefone", variant: "destructive" });
      return;
    }
    setName(customerName);
    setPhone(customerPhone);
    cart.updateCustomer({ customer_name: customerName, customer_phone: customerPhone });
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("ecommerce-checkout", {
        body: {
          storeSlug: slug,
          customer_name: customerName,
          customer_phone: customerPhone.replace(/\D/g, ""),
          items: cart.items.map((it) => ({
            menu_item_id: it.menu_item_id,
            name: it.item_name,
            brand_code: it.brand_code,
            unit_price: it.unit_price,
            quantity: it.quantity,
            notes: it.notes,
          })),
        },
      });
      if (error) throw error;
      if (data?.mp_configured === false) {
        toast({
          title: "Pagamento ainda não está ligado",
          description: "O token do Mercado Pago não está configurado. Pedido salvo como rascunho.",
          variant: "destructive",
        });
        setSubmitting(false);
        return;
      }
      if (!data?.init_point) throw new Error("Sem link de pagamento");
      cart.clear();
      window.location.href = data.init_point;
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Não foi possível iniciar o pagamento",
        description: err?.message || "Tente novamente em instantes.",
        variant: "destructive",
      });
      setSubmitting(false);
    }
  }

  return (
    <PedirLayout cartCount={cart.totalItems}>
      <div className="mb-5 flex items-center gap-2">
        <Link
          to={`/pedir/${slug}`}
          className="inline-flex items-center gap-1 text-sm font-semibold"
          style={{ color: "hsl(var(--ap-brown-2))" }}
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao cardápio
        </Link>
      </div>

      <h1 className="ap-display mb-5" style={{ fontSize: "clamp(2rem, 5vw, 2.75rem)" }}>
        Sua sacola
      </h1>

      {empty ? (
        <div className="ap-card p-10 text-center">
          <p className="text-base" style={{ color: "hsl(var(--ap-brown-2))" }}>
            Sua sacola está vazia.
          </p>
          <button
            onClick={() => nav(`/pedir/${slug}`)}
            className="ap-btn-primary mt-5 inline-flex"
          >
            Ver cardápio
          </button>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-[1fr,360px]">
          {/* Itens */}
          <div className="space-y-3">
            {cart.items.map((it) => (
              <div key={it.id} className="ap-card flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold leading-tight" style={{ color: "hsl(var(--ap-brown))" }}>
                    {it.item_name}
                  </div>
                  <div className="mt-1 text-xs" style={{ color: "hsl(var(--ap-brown-2))" }}>
                    {formatBRL(it.unit_price)} · un.
                  </div>
                </div>
                <div
                  className="flex items-center gap-1 rounded-full bg-white px-1.5 py-1"
                  style={{ border: "1px solid hsl(var(--ap-brown) / .15)" }}
                >
                  <button
                    aria-label="Diminuir"
                    onClick={() => cart.setQuantity(it.id, it.quantity - 1)}
                    className="grid h-6 w-6 place-items-center rounded-full"
                    style={{ background: "hsl(var(--ap-cream))", color: "hsl(var(--ap-brown))" }}
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="min-w-5 text-center text-sm font-bold">{it.quantity}</span>
                  <button
                    aria-label="Aumentar"
                    onClick={() => cart.setQuantity(it.id, it.quantity + 1)}
                    className="grid h-6 w-6 place-items-center rounded-full text-white"
                    style={{ background: "hsl(var(--ap-red))" }}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <button
                  aria-label="Remover"
                  onClick={() => cart.removeItem(it.id)}
                  className="grid h-8 w-8 place-items-center rounded-full"
                  style={{ color: "hsl(var(--ap-brown-2))" }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Resumo + form */}
          <aside className="space-y-4">
            <div className="ap-card p-4">
              <div className="flex items-center justify-between">
                <span style={{ color: "hsl(var(--ap-brown-2))" }}>Subtotal</span>
                <span className="text-lg font-black" style={{ color: "hsl(var(--ap-red))" }}>
                  {formatBRL(cart.subtotal)}
                </span>
              </div>
              {Object.keys(cart.brandBreakdown).length > 1 && (
                <div
                  className="mt-3 space-y-1 border-t pt-3 text-xs"
                  style={{ color: "hsl(var(--ap-brown-2))", borderColor: "hsl(var(--ap-brown) / .15)" }}
                >
                  {Object.entries(cart.brandBreakdown).map(([brand, val]) => (
                    <div key={brand} className="flex items-center justify-between">
                      <span className="capitalize">{brand.replace(/-/g, " ")}</span>
                      <span>{formatBRL(val)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form onSubmit={handleCheckout} className="ap-card ap-form space-y-3 p-4">
              <h2 className="ap-display" style={{ fontSize: "1.5rem" }}>
                Seus dados
              </h2>
              <div>
                <label className="block text-xs font-semibold" style={{ color: "hsl(var(--ap-brown-2))" }}>
                  Nome
                </label>
                <input
                  name="customer_name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome completo"
                  className="mt-1 w-full rounded-xl bg-white px-3 py-2.5 text-sm outline-none"
                  style={{ border: "1px solid hsl(var(--ap-brown) / .2)" }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold" style={{ color: "hsl(var(--ap-brown-2))" }}>
                  WhatsApp
                </label>
                <input
                  name="customer_phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(61) 9 9999-9999"
                  inputMode="tel"
                  className="mt-1 w-full rounded-xl bg-white px-3 py-2.5 text-sm outline-none"
                  style={{ border: "1px solid hsl(var(--ap-brown) / .2)" }}
                />
              </div>
              <button
                type="submit"
                aria-disabled={submitting}
                className="ap-btn-primary flex w-full items-center justify-center gap-2 py-3 text-base"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? "Processando…" : `Pagar ${formatBRL(cart.subtotal)}`}
              </button>
              <p
                className="text-center text-[11px]"
                style={{ color: "hsl(var(--ap-brown-2))" }}
              >
                Pagamento processado pelo Mercado Pago.
                <br />
                A cozinha só recebe o pedido após o pagamento aprovado.
              </p>
            </form>
          </aside>
        </div>
      )}
    </PedirLayout>
  );
}
