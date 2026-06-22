// Revisão da sacola + dados do cliente + checkout Mercado Pago.
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Trash2, Minus, Plus, Loader2 } from "lucide-react";
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
    if (empty) return;
    if (!name.trim() || !phone.trim()) {
      toast({ title: "Preencha nome e telefone", variant: "destructive" });
      return;
    }
    cart.updateCustomer({ customer_name: name.trim(), customer_phone: phone.trim() });
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("ecommerce-checkout", {
        body: {
          storeSlug: slug,
          customer_name: name.trim(),
          customer_phone: phone.trim().replace(/\D/g, ""),
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
      // redireciona pro checkout do MP
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
      <div className="mb-4">
        <Link to={`/pedir/${slug}`} className="text-sm opacity-70 hover:opacity-100">
          ← Voltar ao cardápio
        </Link>
        <h1 className="mt-2 text-xl font-black">Sua sacola</h1>
      </div>

      {empty ? (
        <div className="rounded-2xl border bg-white p-8 text-center">
          <p className="opacity-70">Sua sacola está vazia.</p>
          <button
            onClick={() => nav(`/pedir/${slug}`)}
            className="mt-4 rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white"
          >
            Ver cardápio
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            {cart.items.map((it) => (
              <div key={it.id} className="flex items-center gap-3 rounded-xl border bg-white p-3">
                <div className="flex-1">
                  <div className="text-sm font-semibold leading-tight">{it.item_name}</div>
                  <div className="mt-1 text-xs opacity-70">{formatBRL(it.unit_price)} cada</div>
                </div>
                <div className="flex items-center gap-1 rounded-full border px-1.5 py-1">
                  <button
                    aria-label="Diminuir"
                    onClick={() => cart.setQuantity(it.id, it.quantity - 1)}
                    className="grid h-6 w-6 place-items-center rounded-full bg-zinc-100"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="min-w-5 text-center text-sm font-bold">{it.quantity}</span>
                  <button
                    aria-label="Aumentar"
                    onClick={() => cart.setQuantity(it.id, it.quantity + 1)}
                    className="grid h-6 w-6 place-items-center rounded-full bg-zinc-900 text-white"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <button
                  aria-label="Remover"
                  onClick={() => cart.removeItem(it.id)}
                  className="grid h-8 w-8 place-items-center rounded-full text-zinc-400 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="opacity-70">Subtotal</span>
              <span className="font-bold">{formatBRL(cart.subtotal)}</span>
            </div>
            {Object.keys(cart.brandBreakdown).length > 1 && (
              <div className="mt-2 space-y-0.5 border-t pt-2 text-xs opacity-70">
                {Object.entries(cart.brandBreakdown).map(([brand, val]) => (
                  <div key={brand} className="flex items-center justify-between">
                    <span className="capitalize">{brand.replace("-", " ")}</span>
                    <span>{formatBRL(val)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={handleCheckout} className="space-y-3 rounded-xl border bg-white p-4">
            <h2 className="text-sm font-bold">Seus dados</h2>
            <div>
              <label className="block text-xs font-semibold opacity-70">Nome</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome completo"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold opacity-70">Telefone (WhatsApp)</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(61) 9 9999-9999"
                inputMode="tel"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                required
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {submitting ? "Processando…" : `Pagar ${formatBRL(cart.subtotal)} (em breve via Mercado Pago)`}
            </button>
            <p className="text-center text-[11px] opacity-60">
              O pedido só vai pra cozinha após o pagamento ser confirmado.
            </p>
          </form>
        </div>
      )}
    </PedirLayout>
  );
}
