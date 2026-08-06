// Revisão da sacola + retirada/entrega + dados do cliente + checkout Mercado Pago.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Trash2, Minus, Plus, Loader2, ArrowLeft, Bike, Store, MapPin } from "lucide-react";
import { PedirLayout } from "./PedirLayout";
import { useEcommerceCart, formatBRL, type DeliveryAddress, type OrderType } from "@/hooks/useEcommerceCart";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdge } from "@/lib/edgeInvoke";

type EStore = {
  id: string;
  store_id: string;
  slug: string;
  display_name: string;
  accepts_pickup: boolean;
  accepts_delivery: boolean;
  min_pickup_minutes: number;
};

type Quote = {
  provider: string;
  quote_id: string;
  fee_cents: number;
  eta_minutes: number;
  expires_at?: string;
};

const UF_RE = /^[A-Za-z]{2}$/;

const CHECKOUT_ERRORS: Record<string, string> = {
  store_closed: "A loja está fechada agora.",
  store_not_found: "Loja não encontrada.",
  channel_not_configured: "Canal do site não configurado para esta loja.",
  delivery_not_available: "Esta loja ainda não faz entrega.",
  pickup_not_available: "Esta loja não faz retirada no balcão.",
  invalid_delivery_address: "Endereço de entrega incompleto.",
  imprecise_delivery_address:
    "Não conseguimos localizar esse endereço no mapa. Revise a rua e o número.",
  delivery_unavailable: "Nenhum entregador disponível para esse endereço.",
  invalid_payload: "Dados do pedido incompletos.",
};

const inputStyle = { border: "1px solid hsl(var(--ap-brown) / .2)" } as const;
const inputCls = "mt-1 w-full rounded-xl bg-white px-3 py-2.5 text-sm outline-none";

function labelCls() {
  return "block text-xs font-semibold";
}

function errMessage(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}

export default function PedirCarrinho() {
  const { slug = "" } = useParams<{ slug: string }>();
  const nav = useNavigate();
  const cart = useEcommerceCart(slug);

  const [store, setStore] = useState<EStore | null>(null);
  const [loadingStore, setLoadingStore] = useState(true);

  const [name, setName] = useState(cart.state.customer_name ?? "");
  const [phone, setPhone] = useState(cart.state.customer_phone ?? "");
  const [submitting, setSubmitting] = useState(false);

  const saved = cart.state.delivery_address;
  const [orderType, setOrderType] = useState<OrderType>(cart.state.order_type ?? "pickup");
  const [cep, setCep] = useState(saved?.postal_code ?? "");
  const [street, setStreet] = useState(saved?.street ?? "");
  const [number, setNumber] = useState(saved?.number ?? "");
  const [complement, setComplement] = useState(saved?.complement ?? "");
  const [neighborhood, setNeighborhood] = useState(saved?.neighborhood ?? "");
  const [city, setCity] = useState(saved?.city ?? "");
  const [uf, setUf] = useState(saved?.state ?? "");
  const [addressNotes, setAddressNotes] = useState(saved?.notes ?? "");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(
    saved?.latitude != null && saved?.longitude != null
      ? { latitude: saved.latitude, longitude: saved.longitude }
      : null,
  );
  const [precision, setPrecision] = useState<DeliveryAddress["geo_precision"]>(saved?.geo_precision);

  const [geocoding, setGeocoding] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const lastGeocodedCep = useRef<string>("");

  const empty = cart.items.length === 0;
  const isDelivery = orderType === "delivery";

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("ecommerce_stores")
        .select("id, store_id, slug, display_name, accepts_pickup, accepts_delivery, min_pickup_minutes")
        .eq("slug", slug)
        .maybeSingle();
      if (!alive) return;
      const s = (data ?? null) as EStore | null;
      setStore(s);
      setLoadingStore(false);
      // Loja só entrega: já abre no modo entrega. Só retira: força retirada.
      if (s && !s.accepts_pickup && s.accepts_delivery) setOrderType("delivery");
      if (s && !s.accepts_delivery) setOrderType("pickup");
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  const addressReady =
    street.trim().length > 1 &&
    number.trim().length > 0 &&
    city.trim().length > 1 &&
    UF_RE.test(uf.trim()) &&
    cep.replace(/\D/g, "").length === 8 &&
    coords != null;

  const buildDropoff = useCallback((): DeliveryAddress => {
    return {
      street: street.trim(),
      number: number.trim() || undefined,
      complement: complement.trim() || undefined,
      neighborhood: neighborhood.trim() || undefined,
      city: city.trim(),
      state: uf.trim().toUpperCase(),
      postal_code: cep.replace(/\D/g, ""),
      country: "BR",
      latitude: coords?.latitude,
      longitude: coords?.longitude,
      geo_precision: precision,
      notes: addressNotes.trim() || undefined,
    };
  }, [street, number, complement, neighborhood, city, uf, cep, coords, precision, addressNotes]);

  // Qualquer mudança no endereço invalida a cotação anterior.
  const invalidateQuote = useCallback(() => {
    setQuote(null);
    setQuoteError(null);
  }, []);

  async function resolveCep(raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length !== 8 || digits === lastGeocodedCep.current) return;
    lastGeocodedCep.current = digits;
    setGeocoding(true);
    invalidateQuote();
    try {
      const res = await invokeEdge<{ address?: DeliveryAddress; detail?: string }>("geocode-address", {
        postal_code: digits,
        number,
        complement,
        street,
        neighborhood,
        city,
        state: uf,
      });
      const addr = res.data?.address;
      if (!addr) throw new Error(res.data?.detail || "CEP não encontrado");
      if (addr.street) setStreet(addr.street);
      if (addr.neighborhood) setNeighborhood(addr.neighborhood);
      if (addr.city) setCity(addr.city);
      if (addr.state) setUf(addr.state);
      if (addr.latitude != null && addr.longitude != null) {
        setCoords({ latitude: addr.latitude, longitude: addr.longitude });
        setPrecision(addr.geo_precision);
      }
    } catch (err) {
      lastGeocodedCep.current = "";
      setCoords(null);
      setPrecision(undefined);
      toast({
        title: "Não encontramos esse CEP",
        description: errMessage(err, "Confira o CEP e tente novamente."),
        variant: "destructive",
      });
    } finally {
      setGeocoding(false);
    }
  }

  // Refina as coordenadas com rua + número antes de cotar (precisão de fachada).
  async function refineCoords(): Promise<DeliveryAddress> {
    const dropoff = buildDropoff();
    try {
      const res = await invokeEdge<{ address?: DeliveryAddress }>("geocode-address", {
        postal_code: dropoff.postal_code,
        street: dropoff.street,
        number: dropoff.number,
        neighborhood: dropoff.neighborhood,
        city: dropoff.city,
        state: dropoff.state,
      });
      const addr = res.data?.address;
      if (addr?.latitude != null && addr?.longitude != null) {
        setCoords({ latitude: addr.latitude, longitude: addr.longitude });
        setPrecision(addr.geo_precision);
        return {
          ...dropoff,
          latitude: addr.latitude,
          longitude: addr.longitude,
          geo_precision: addr.geo_precision,
        };
      }
    } catch {
      /* mantém as coordenadas do CEP */
    }
    return dropoff;
  }

  async function handleQuote() {
    if (!store || !addressReady || quoting) return;
    setQuoting(true);
    setQuoteError(null);
    try {
      const dropoff = await refineCoords();
      // Centróide de cidade mandaria o entregador para o lugar errado.
      if (dropoff.geo_precision === "city") {
        throw new Error(
          "Não conseguimos localizar esse endereço no mapa. Revise a rua e o número.",
        );
      }
      const res = await invokeEdge<{
        best?: Quote;
        quotes?: { error?: string }[];
        error?: string;
      }>("delivery-quote", {
        store_id: store.store_id,
        dropoff,
        order_value_cents: Math.round(cart.subtotal * 100),
      });
      const best = res.data?.best;
      if (!best) {
        const firstErr = (res.data?.quotes ?? []).find((q) => q?.error)?.error;
        throw new Error(firstErr || res.data?.error || "Nenhum provedor disponível para esse endereço");
      }
      setQuote({
        provider: best.provider,
        quote_id: best.quote_id,
        fee_cents: best.fee_cents,
        eta_minutes: best.eta_minutes,
        expires_at: best.expires_at,
      });
    } catch (err) {
      console.error(err);
      setQuote(null);
      setQuoteError(errMessage(err, "Não foi possível calcular o frete agora."));
    } finally {
      setQuoting(false);
    }
  }

  const deliveryFee = isDelivery && quote ? quote.fee_cents / 100 : 0;
  const total = cart.subtotal + deliveryFee;

  const canSubmit = useMemo(() => {
    if (empty || submitting) return false;
    if (!isDelivery) return true;
    return addressReady && quote != null;
  }, [empty, submitting, isDelivery, addressReady, quote]);

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
    if (isDelivery && !addressReady) {
      toast({ title: "Complete o endereço de entrega", variant: "destructive" });
      return;
    }
    if (isDelivery && !quote) {
      toast({ title: "Calcule o frete antes de pagar", variant: "destructive" });
      return;
    }

    const dropoff = isDelivery ? buildDropoff() : undefined;
    setName(customerName);
    setPhone(customerPhone);
    cart.updateCustomer({
      customer_name: customerName,
      customer_phone: customerPhone,
      order_type: orderType,
      delivery_address: dropoff,
    });
    setSubmitting(true);
    try {
      const res = await invokeEdge<{
        error?: string;
        detail?: string;
        delivery_fee_cents?: number;
        quote_id?: string;
        mp_configured?: boolean;
        init_point?: string;
      }>("ecommerce-checkout", {
        storeSlug: slug,
        customer_name: customerName,
        customer_phone: customerPhone.replace(/\D/g, ""),
        order_type: orderType,
        ...(isDelivery
          ? {
              delivery_address: {
                ...dropoff,
                contact_name: customerName,
                contact_phone: customerPhone.replace(/\D/g, ""),
              },
              delivery_quote: {
                quote_id: quote!.quote_id,
                provider: quote!.provider,
                fee_cents: quote!.fee_cents,
              },
            }
          : {}),
        items: cart.items.map((it) => ({
          menu_item_id: it.menu_item_id,
          name: it.item_name,
          brand_code: it.brand_code,
          unit_price: it.unit_price,
          quantity: it.quantity,
          notes: it.notes,
        })),
      });
      const data = res.data;

      if (data?.error === "delivery_fee_changed" && data.delivery_fee_cents != null) {
        const newFee = data.delivery_fee_cents;
        setQuote((q) => (q ? { ...q, fee_cents: newFee, quote_id: data.quote_id ?? q.quote_id } : q));
        toast({
          title: "O frete foi atualizado",
          description: `Novo valor: ${formatBRL(newFee / 100)}. Confira o total e toque em pagar novamente.`,
        });
        setSubmitting(false);
        return;
      }
      if (data?.error) {
        throw new Error(CHECKOUT_ERRORS[data.error] || data.detail || data.error);
      }
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
    } catch (err) {
      console.error(err);
      toast({
        title: "Não foi possível iniciar o pagamento",
        description: errMessage(err, "Tente novamente em instantes."),
        variant: "destructive",
      });
      setSubmitting(false);
    }
  }

  const showToggle = !!store?.accepts_delivery && !!store?.accepts_pickup;

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
        <div className="grid gap-5 md:grid-cols-[1fr,380px]">
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
            {/* Retirada x Entrega */}
            {!loadingStore && showToggle && (
              <div className="ap-card p-4">
                <h2 className="ap-display" style={{ fontSize: "1.25rem" }}>
                  Como você quer receber?
                </h2>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {([
                    { key: "pickup" as OrderType, label: "Retirar", icon: Store },
                    { key: "delivery" as OrderType, label: "Entrega", icon: Bike },
                  ]).map((opt) => {
                    const Icon = opt.icon;
                    const active = orderType === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => {
                          setOrderType(opt.key);
                          invalidateQuote();
                        }}
                        className="flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition"
                        style={
                          active
                            ? { background: "hsl(var(--ap-red))", color: "#fff" }
                            : {
                                background: "#fff",
                                color: "hsl(var(--ap-brown-2))",
                                border: "1px solid hsl(var(--ap-brown) / .2)",
                              }
                        }
                      >
                        <Icon className="h-4 w-4" />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {!isDelivery && store && (
                  <p className="mt-3 text-xs" style={{ color: "hsl(var(--ap-brown-2))" }}>
                    Pronto em ~{store.min_pickup_minutes} min para retirada no balcão.
                  </p>
                )}
              </div>
            )}

            {/* Endereço de entrega */}
            {isDelivery && (
              <div className="ap-card ap-form space-y-3 p-4">
                <h2 className="ap-display flex items-center gap-2" style={{ fontSize: "1.25rem" }}>
                  <MapPin className="h-4 w-4" style={{ color: "hsl(var(--ap-red))" }} />
                  Endereço de entrega
                </h2>

                <div className="grid grid-cols-[1fr,100px] gap-2">
                  <div>
                    <label className={labelCls()} style={{ color: "hsl(var(--ap-brown-2))" }}>
                      CEP
                    </label>
                    <input
                      value={cep}
                      onChange={(e) => {
                        setCep(e.target.value);
                        invalidateQuote();
                      }}
                      onBlur={(e) => resolveCep(e.target.value)}
                      placeholder="71925-540"
                      inputMode="numeric"
                      className={inputCls}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className={labelCls()} style={{ color: "hsl(var(--ap-brown-2))" }}>
                      Número
                    </label>
                    <input
                      value={number}
                      onChange={(e) => {
                        setNumber(e.target.value);
                        invalidateQuote();
                      }}
                      placeholder="123"
                      inputMode="numeric"
                      className={inputCls}
                      style={inputStyle}
                    />
                  </div>
                </div>

                {geocoding && (
                  <div className="flex items-center gap-2 text-xs" style={{ color: "hsl(var(--ap-brown-2))" }}>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Buscando endereço…
                  </div>
                )}

                <div>
                  <label className={labelCls()} style={{ color: "hsl(var(--ap-brown-2))" }}>
                    Rua
                  </label>
                  <input
                    value={street}
                    onChange={(e) => {
                      setStreet(e.target.value);
                      invalidateQuote();
                    }}
                    placeholder="Rua / Quadra"
                    className={inputCls}
                    style={inputStyle}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls()} style={{ color: "hsl(var(--ap-brown-2))" }}>
                      Complemento
                    </label>
                    <input
                      value={complement}
                      onChange={(e) => setComplement(e.target.value)}
                      placeholder="Apto / Bloco"
                      className={inputCls}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className={labelCls()} style={{ color: "hsl(var(--ap-brown-2))" }}>
                      Bairro
                    </label>
                    <input
                      value={neighborhood}
                      onChange={(e) => {
                        setNeighborhood(e.target.value);
                        invalidateQuote();
                      }}
                      placeholder="Bairro"
                      className={inputCls}
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-[1fr,80px] gap-2">
                  <div>
                    <label className={labelCls()} style={{ color: "hsl(var(--ap-brown-2))" }}>
                      Cidade
                    </label>
                    <input
                      value={city}
                      onChange={(e) => {
                        setCity(e.target.value);
                        invalidateQuote();
                      }}
                      placeholder="Cidade"
                      className={inputCls}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className={labelCls()} style={{ color: "hsl(var(--ap-brown-2))" }}>
                      UF
                    </label>
                    <input
                      value={uf}
                      onChange={(e) => {
                        setUf(e.target.value.toUpperCase().slice(0, 2));
                        invalidateQuote();
                      }}
                      placeholder="DF"
                      maxLength={2}
                      className={inputCls}
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelCls()} style={{ color: "hsl(var(--ap-brown-2))" }}>
                    Referência para o entregador
                  </label>
                  <input
                    value={addressNotes}
                    onChange={(e) => setAddressNotes(e.target.value)}
                    placeholder="Portão azul, falar com o porteiro…"
                    className={inputCls}
                    style={inputStyle}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleQuote}
                  disabled={!addressReady || quoting}
                  className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition disabled:opacity-50"
                  style={{ background: "hsl(var(--ap-mustard))", color: "hsl(var(--ap-brown))" }}
                >
                  {quoting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bike className="h-4 w-4" />}
                  {quote ? "Recalcular frete" : "Calcular frete"}
                </button>

                {!addressReady && (
                  <p className="text-[11px]" style={{ color: "hsl(var(--ap-brown-2))" }}>
                    Informe CEP e número para calcular o frete.
                  </p>
                )}
                {quoteError && (
                  <p className="text-[11px] font-semibold" style={{ color: "hsl(var(--ap-red))" }}>
                    {quoteError}
                  </p>
                )}
              </div>
            )}

            {/* Totais */}
            <div className="ap-card p-4">
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: "hsl(var(--ap-brown-2))" }}>Subtotal</span>
                <span className="font-bold" style={{ color: "hsl(var(--ap-brown))" }}>
                  {formatBRL(cart.subtotal)}
                </span>
              </div>
              {isDelivery && (
                <div className="mt-1.5 flex items-center justify-between text-sm">
                  <span style={{ color: "hsl(var(--ap-brown-2))" }}>Entrega</span>
                  <span className="font-bold" style={{ color: "hsl(var(--ap-brown))" }}>
                    {quote ? formatBRL(deliveryFee) : "—"}
                  </span>
                </div>
              )}
              <div
                className="mt-3 flex items-center justify-between border-t pt-3"
                style={{ borderColor: "hsl(var(--ap-brown) / .15)" }}
              >
                <span className="font-bold" style={{ color: "hsl(var(--ap-brown))" }}>
                  Total
                </span>
                <span className="text-lg font-black" style={{ color: "hsl(var(--ap-red))" }}>
                  {formatBRL(total)}
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
                <label className={labelCls()} style={{ color: "hsl(var(--ap-brown-2))" }}>
                  Nome
                </label>
                <input
                  name="customer_name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome completo"
                  className={inputCls}
                  style={inputStyle}
                />
              </div>
              <div>
                <label className={labelCls()} style={{ color: "hsl(var(--ap-brown-2))" }}>
                  WhatsApp
                </label>
                <input
                  name="customer_phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(61) 9 9999-9999"
                  inputMode="tel"
                  className={inputCls}
                  style={inputStyle}
                />
              </div>
              <button
                type="submit"
                aria-disabled={!canSubmit}
                disabled={!canSubmit}
                className="ap-btn-primary flex w-full items-center justify-center gap-2 py-3 text-base disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? "Processando…" : `Pagar ${formatBRL(total)}`}
              </button>
              <p
                className="text-center text-[11px]"
                style={{ color: "hsl(var(--ap-brown-2))" }}
              >
                Pagamento processado pelo Mercado Pago.
                <br />
                {isDelivery
                  ? "A cozinha e o entregador são acionados após o pagamento aprovado."
                  : "A cozinha só recebe o pedido após o pagamento aprovado."}
              </p>
            </form>
          </aside>
        </div>
      )}
    </PedirLayout>
  );
}
