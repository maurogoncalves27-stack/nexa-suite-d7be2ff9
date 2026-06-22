// Cardápio unificado por loja com abas por marca (Tudo / Parmê / Estrogonofe / Box).
// Cliente pode misturar itens das 3 marcas em um único pedido.
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Plus, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PedirLayout, BrandCode } from "./PedirLayout";
import { useEcommerceCart, formatBRL } from "@/hooks/useEcommerceCart";
import { parmeAssets } from "@/assets/parme-assets";

type EStore = { id: string; slug: string; display_name: string; store_id: string };
type MenuRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  photo_path: string | null;
  category_name: string | null;
  brand_codes: string[];
};

const TABS: { code: BrandCode; label: string; logo?: string; bg: string }[] = [
  { code: "all", label: "Tudo", bg: "#2a140c" },
  { code: "aquela-parme", label: "Parmê", logo: parmeAssets.Logo_Aquela_Parme, bg: "#c93029" },
  { code: "aquele-estrogonofe", label: "Estrogonofe", logo: parmeAssets.Logo_Aquele_estrogonofe, bg: "#bba07a" },
  { code: "box-caipira", label: "Box Caipira", logo: parmeAssets.Logo_Box_Caipira, bg: "#ef6b3a" },
];

const BRAND_LABEL: Record<Exclude<BrandCode, "all">, string> = {
  "aquela-parme": "Parmê",
  "aquele-estrogonofe": "Estrogonofe",
  "box-caipira": "Box Caipira",
};

export default function PedirLoja() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [store, setStore] = useState<EStore | null>(null);
  const [items, setItems] = useState<MenuRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<BrandCode>("all");
  const cart = useEcommerceCart(slug);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: s } = await supabase
        .from("ecommerce_stores")
        .select("id, slug, display_name, store_id")
        .eq("slug", slug)
        .maybeSingle();
      if (!s) {
        setLoading(false);
        return;
      }
      setStore(s as EStore);

      const { data: rows } = await supabase
        .from("menu_items")
        .select(
          `id, name, description, price, photo_path, is_active,
           menu_categories(name),
           menu_item_brands(brands(slug)),
           menu_item_stores!inner(is_available, store_id)`,
        )
        .eq("is_active", true)
        .eq("menu_item_stores.store_id", (s as EStore).store_id)
        .eq("menu_item_stores.is_available", true)
        .gt("price", 0)
        .order("sort_order", { ascending: true });

      const mapped: MenuRow[] = (rows ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        price: Number(r.price),
        photo_path: r.photo_path,
        category_name: r.menu_categories?.name ?? null,
        brand_codes: (r.menu_item_brands ?? [])
          .map((mib: any) => mib.brands?.slug)
          .filter(Boolean),
      }));
      setItems(mapped);
      setLoading(false);
    })();
  }, [slug]);

  const filtered = useMemo(() => {
    if (tab === "all") {
      return items.filter((i) =>
        i.brand_codes.some((b) => b === "aquela-parme" || b === "aquele-estrogonofe" || b === "box-caipira"),
      );
    }
    return items.filter((i) => i.brand_codes.includes(tab));
  }, [items, tab]);

  const grouped = useMemo(() => {
    const g = new Map<string, MenuRow[]>();
    for (const it of filtered) {
      const k = it.category_name ?? "Outros";
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push(it);
    }
    return Array.from(g.entries());
  }, [filtered]);

  return (
    <PedirLayout brand={tab} cartCount={cart.totalItems} cartHref={`/pedir/${slug}/carrinho`}>
      {/* Cabeçalho da loja */}
      <div className="mb-5">
        <span className="ap-tag">Retirada no balcão</span>
        <h1 className="ap-display mt-3" style={{ fontSize: "clamp(2rem, 6vw, 2.75rem)" }}>
          {store?.display_name ?? "Carregando…"}
        </h1>
      </div>

      {/* Tabs por marca - pílulas */}
      <div className="-mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => {
          const active = tab === t.code;
          return (
            <button
              key={t.code}
              onClick={() => setTab(t.code)}
              className="group flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition"
              style={{
                background: active ? t.bg : "transparent",
                color: active ? "#fff" : "hsl(var(--ap-brown))",
                border: `1px solid ${active ? t.bg : "hsl(var(--ap-brown) / .25)"}`,
                fontFamily: "Bitter, sans-serif",
                boxShadow: active ? `0 6px 16px -8px ${t.bg}` : "none",
              }}
            >
              {t.logo && (
                <span
                  className="grid h-6 w-6 place-items-center overflow-hidden rounded-full p-0.5"
                  style={{ background: active ? "rgba(255,255,255,.18)" : t.bg }}
                >
                  <img src={t.logo} alt="" className="max-h-full max-w-full object-contain" />
                </span>
              )}
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Lista */}
      <div className="space-y-7">
        {loading && (
          <div className="text-center text-sm" style={{ color: "hsl(var(--ap-brown-2))" }}>
            Carregando cardápio…
          </div>
        )}
        {!loading && grouped.length === 0 && (
          <div className="ap-card p-8 text-center text-sm" style={{ color: "hsl(var(--ap-brown-2))" }}>
            Nenhum item disponível.
          </div>
        )}
        {grouped.map(([cat, list]) => (
          <section key={cat}>
            <h2
              className="ap-display mb-3"
              style={{ fontSize: "1.25rem", color: "hsl(var(--ap-brown))" }}
            >
              {cat}
            </h2>
            <div className="space-y-3">
              {list.map((it) => {
                const inCart = cart.items.find((c) => c.menu_item_id === it.id);
                const brandCode = it.brand_codes.find((b) =>
                  ["aquela-parme", "aquele-estrogonofe", "box-caipira"].includes(b),
                ) as Exclude<BrandCode, "all"> | undefined;
                return (
                  <div key={it.id} className="ap-card flex items-stretch gap-3 overflow-hidden p-3">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-center gap-2">
                        <div
                          className="text-[15px] font-bold leading-tight"
                          style={{ color: "hsl(var(--ap-brown))" }}
                        >
                          {it.name}
                        </div>
                        {brandCode && tab === "all" && (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                            style={{
                              background: "hsl(var(--ap-mustard) / .25)",
                              color: "hsl(var(--ap-red))",
                            }}
                          >
                            {BRAND_LABEL[brandCode]}
                          </span>
                        )}
                      </div>
                      {it.description && (
                        <div
                          className="mt-1 line-clamp-2 text-xs"
                          style={{ color: "hsl(var(--ap-brown-2))", fontFamily: "Bitter, serif" }}
                        >
                          {it.description}
                        </div>
                      )}
                      <div
                        className="mt-auto pt-2 text-base font-black"
                        style={{ color: "hsl(var(--ap-red))" }}
                      >
                        {formatBRL(it.price)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center">
                      {inCart ? (
                        <div
                          className="flex items-center gap-1 rounded-full bg-white px-1.5 py-1"
                          style={{ border: "1px solid hsl(var(--ap-brown) / .15)" }}
                        >
                          <button
                            aria-label="Diminuir"
                            onClick={() => cart.setQuantity(inCart.id, inCart.quantity - 1)}
                            className="grid h-7 w-7 place-items-center rounded-full"
                            style={{ background: "hsl(var(--ap-cream))", color: "hsl(var(--ap-brown))" }}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="min-w-6 text-center text-sm font-bold">{inCart.quantity}</span>
                          <button
                            aria-label="Aumentar"
                            onClick={() => cart.setQuantity(inCart.id, inCart.quantity + 1)}
                            className="grid h-7 w-7 place-items-center rounded-full text-white"
                            style={{ background: "hsl(var(--ap-red))" }}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          disabled={!brandCode}
                          onClick={() =>
                            brandCode &&
                            cart.addItem({
                              menu_item_id: it.id,
                              brand_code: brandCode,
                              item_name: it.name,
                              unit_price: it.price,
                            })
                          }
                          className="grid h-10 w-10 place-items-center rounded-full text-white shadow-md transition hover:-translate-y-px disabled:opacity-40"
                          style={{
                            background: "hsl(var(--ap-red))",
                            boxShadow: "0 8px 18px -10px hsl(var(--ap-red) / .7)",
                          }}
                          aria-label="Adicionar"
                        >
                          <Plus className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Barra flutuante "Ver sacola" */}
      {cart.totalItems > 0 && (
        <div className="sticky bottom-4 z-20 mt-8">
          <a
            href={`/pedir/${slug}/carrinho`}
            className="flex items-center justify-between rounded-full px-5 py-3.5 text-white shadow-2xl transition hover:-translate-y-0.5"
            style={{
              background: "hsl(var(--ap-red))",
              boxShadow: "0 18px 32px -14px hsl(var(--ap-red) / .65)",
              fontFamily: "Bitter, sans-serif",
            }}
          >
            <span className="text-sm font-bold">
              Ver sacola · {cart.totalItems} {cart.totalItems === 1 ? "item" : "itens"}
            </span>
            <span className="text-base font-black">{formatBRL(cart.subtotal)}</span>
          </a>
        </div>
      )}
    </PedirLayout>
  );
}
