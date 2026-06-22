// Cardápio unificado por loja — visual inspirado no Totem (cards com foto),
// adaptado para web/mobile: imagens menores, 2-col no celular, 3/4 no desktop.
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Plus, Minus, ImageIcon } from "lucide-react";
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
  photo_url: string | null;
  category_name: string | null;
  category_sort: number;
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

const PHOTO_BUCKET = "menu-photos";
function resolvePhoto(path: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

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
          `id, name, description, price, photo_path, recipe_id, is_active,
           menu_categories(name, sort_order),
           menu_item_brands(brands(slug)),
           menu_item_stores!inner(is_available, store_id)`,
        )
        .eq("is_active", true)
        .eq("menu_item_stores.store_id", (s as EStore).store_id)
        .eq("menu_item_stores.is_available", true)
        .gt("price", 0)
        .order("sort_order", { ascending: true });

      // Resolve fotos: prioriza recipes.photo_path (bucket recipe-photos), fallback menu_items.photo_path
      const recipeIds = Array.from(
        new Set((rows ?? []).map((r: any) => r.recipe_id).filter(Boolean)),
      ) as string[];
      const recipePhotoMap: Record<string, string> = {};
      if (recipeIds.length > 0) {
        const { data: recs } = await supabase
          .from("recipes")
          .select("id, photo_path")
          .in("id", recipeIds);
        for (const r of (recs ?? []) as any[]) {
          if (r.photo_path) {
            recipePhotoMap[r.id] = supabase.storage
              .from("recipe-photos")
              .getPublicUrl(r.photo_path).data.publicUrl;
          }
        }
      }

      const mapped: MenuRow[] = (rows ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        price: Number(r.price),
        photo_url:
          (r.recipe_id ? recipePhotoMap[r.recipe_id] : null) ?? resolvePhoto(r.photo_path),
        category_name: r.menu_categories?.name ?? null,
        category_sort: r.menu_categories?.sort_order ?? 999,
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
        i.brand_codes.some((b) =>
          ["aquela-parme", "aquele-estrogonofe", "box-caipira"].includes(b),
        ),
      );
    }
    return items.filter((i) => i.brand_codes.includes(tab));
  }, [items, tab]);

  const grouped = useMemo(() => {
    const g = new Map<string, { sort: number; items: MenuRow[] }>();
    for (const it of filtered) {
      const k = it.category_name ?? "Outros";
      if (!g.has(k)) g.set(k, { sort: it.category_sort, items: [] });
      g.get(k)!.items.push(it);
    }
    return Array.from(g.entries()).sort((a, b) => a[1].sort - b[1].sort);
  }, [filtered]);

  return (
    <PedirLayout brand={tab} cartCount={cart.totalItems} cartHref={`/pedir/${slug}/carrinho`}>
      {/* Cabeçalho */}
      <div className="mb-5">
        <span className="ap-tag">Retirada no balcão</span>
        <h1 className="ap-display mt-3" style={{ fontSize: "clamp(2rem, 6vw, 2.75rem)" }}>
          {store?.display_name ?? "Carregando…"}
        </h1>
      </div>

      {/* Tabs por marca */}
      <div
        className="sticky top-[3.75rem] z-20 -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 py-2 md:top-[5rem]"
        style={{ background: "rgba(255,255,255,.92)", backdropFilter: "blur(6px)" }}
      >
        {TABS.map((t) => {
          const active = tab === t.code;
          return (
            <button
              key={t.code}
              onClick={() => setTab(t.code)}
              className="flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold transition"
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
                  className="grid h-5 w-5 place-items-center overflow-hidden rounded-full p-0.5"
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
      <div className="space-y-8 pb-28">
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
        {grouped.map(([cat, group]) => (
          <section key={cat}>
            <h2
              className="ap-display mb-3"
              style={{ fontSize: "1.5rem", color: "hsl(var(--ap-brown))" }}
            >
              {cat}
            </h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
              {group.items.map((it) => {
                const inCart = cart.items.find((c) => c.menu_item_id === it.id);
                const brandCode = it.brand_codes.find((b) =>
                  ["aquela-parme", "aquele-estrogonofe", "box-caipira"].includes(b),
                ) as Exclude<BrandCode, "all"> | undefined;
                const qty = inCart?.quantity ?? 0;
                return (
                  <article
                    key={it.id}
                    className="ap-card group relative flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    {/* Badge contador */}
                    {qty > 0 && (
                      <span
                        className="absolute right-2 top-2 z-10 grid h-7 min-w-7 place-items-center rounded-full px-2 text-xs font-black text-white shadow-md"
                        style={{ background: "hsl(var(--ap-red))" }}
                      >
                        {qty}
                      </span>
                    )}

                    {/* Foto quadrada */}
                    <div
                      className="relative aspect-square w-full overflow-hidden"
                      style={{ background: "hsl(var(--ap-cream-2))" }}
                    >
                      {it.photo_url ? (
                        <img
                          src={it.photo_url}
                          alt={it.name}
                          loading="lazy"
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div
                          className="flex h-full w-full items-center justify-center"
                          style={{ color: "hsl(var(--ap-brown) / .25)" }}
                        >
                          <ImageIcon className="h-10 w-10" />
                        </div>
                      )}
                      {brandCode && tab === "all" && (
                        <span
                          className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow"
                          style={{
                            background:
                              brandCode === "aquela-parme"
                                ? "#c93029"
                                : brandCode === "aquele-estrogonofe"
                                  ? "#7a5a3a"
                                  : "#ef6b3a",
                          }}
                        >
                          {BRAND_LABEL[brandCode]}
                        </span>
                      )}
                    </div>

                    {/* Conteúdo */}
                    <div className="flex flex-1 flex-col p-3">
                      <div
                        className="line-clamp-2 text-sm font-bold leading-tight"
                        style={{ color: "hsl(var(--ap-brown))" }}
                      >
                        {it.name}
                      </div>
                      {it.description && (
                        <div
                          className="mt-1 line-clamp-2 text-[11px] leading-snug"
                          style={{
                            color: "hsl(var(--ap-brown-2))",
                            fontFamily: "Bitter, serif",
                          }}
                        >
                          {it.description}
                        </div>
                      )}

                      <div className="mt-auto flex items-center justify-between pt-2.5">
                        <div
                          className="text-base font-black"
                          style={{ color: "hsl(var(--ap-red))" }}
                        >
                          {formatBRL(it.price)}
                        </div>

                        {qty > 0 ? (
                          <div
                            className="flex items-center gap-0.5 rounded-full bg-white px-1 py-0.5"
                            style={{ border: "1px solid hsl(var(--ap-brown) / .15)" }}
                          >
                            <button
                              aria-label="Diminuir"
                              onClick={() => inCart && cart.setQuantity(inCart.id, qty - 1)}
                              className="grid h-7 w-7 place-items-center rounded-full"
                              style={{ background: "hsl(var(--ap-cream))" }}
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="min-w-5 text-center text-sm font-bold">{qty}</span>
                            <button
                              aria-label="Aumentar"
                              onClick={() => inCart && cart.setQuantity(inCart.id, qty + 1)}
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
                            className="grid h-9 w-9 place-items-center rounded-full text-white shadow-md transition hover:-translate-y-px disabled:opacity-40"
                            style={{
                              background: "hsl(var(--ap-red))",
                              boxShadow: "0 8px 18px -10px hsl(var(--ap-red) / .7)",
                            }}
                            aria-label="Adicionar"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Barra flutuante "Ver sacola" */}
      {cart.totalItems > 0 && (
        <div className="sticky bottom-4 z-30 mt-6">
          <a
            href={`/pedir/${slug}/carrinho`}
            className="flex items-center justify-between rounded-full px-5 py-3.5 text-white transition hover:-translate-y-0.5"
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
