// Cardápio unificado por loja — visual inspirado no Totem (cards com foto),
// adaptado para web/mobile: imagens menores, 2-col no celular, 3/4 no desktop.
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Plus, Minus, ImageIcon, Ticket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PedirLayout, BrandCode } from "./PedirLayout";
import { useEcommerceCart, formatBRL } from "@/hooks/useEcommerceCart";
import { parmeAssets } from "@/assets/parme-assets";
import { loadMenuCatalog } from "@/lib/menuCatalog";
import YoloCodeDialog from "@/components/yolo/YoloCodeDialog";

type EStore = {
  id: string;
  slug: string;
  display_name: string;
  store_id: string;
  accepts_pickup: boolean;
  accepts_delivery: boolean;
};
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
  const [yoloUnlocked, setYoloUnlocked] = useState(false);
  const [yoloOpen, setYoloOpen] = useState(false);
  const cart = useEcommerceCart(slug);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: s } = await supabase
        .from("ecommerce_stores")
        .select("id, slug, display_name, store_id, accepts_pickup, accepts_delivery")
        .eq("slug", slug)
        .maybeSingle();
      if (!s) {
        setLoading(false);
        return;
      }
      setStore(s as EStore);

      const catalog = await loadMenuCatalog((s as EStore).store_id, null, {
        channel: "site",
        yoloUnlocked,
      });
      const itemIds = catalog.items.map((item) => item.id);
      const { data: brandRows } = itemIds.length
        ? await supabase.from("menu_item_brands").select("menu_item_id,brands(slug)").in("menu_item_id", itemIds)
        : { data: [] };
      const brandCodes = new Map<string, string[]>();
      for (const row of (brandRows ?? []) as any[]) {
        const slugValue = row.brands?.slug;
        if (!slugValue) continue;
        brandCodes.set(row.menu_item_id, [...(brandCodes.get(row.menu_item_id) ?? []), slugValue]);
      }
      const categoryMap = new Map(catalog.categories.map((category) => [category.id, category]));
      const mapped: MenuRow[] = catalog.items.filter((item) => item.price > 0).map((item) => {
        const category = item.category_id ? categoryMap.get(item.category_id) : null;
        return {
          id: item.id,
          name: item.name,
          description: item.description,
          price: item.price,
          photo_url: item.photo_url ?? null,
          category_name: category?.name ?? null,
          category_sort: category?.sort_order ?? 999,
          brand_codes: brandCodes.get(item.id) ?? [],
        };
      });
      setItems(mapped);
      setLoading(false);
    })();
  }, [slug, yoloUnlocked]);

  // Dedup por nome+preço (mesmo prato compartilhado entre marcas aparece 1x)
  const filtered = useMemo(() => {
    const validBrands = ["aquela-parme", "aquele-estrogonofe", "box-caipira"];
    const seen = new Map<string, MenuRow>();
    for (const i of items) {
      if (!i.brand_codes.some((b) => validBrands.includes(b))) continue;
      const key = `${i.name.trim().toLowerCase()}|${i.price}`;
      if (!seen.has(key)) seen.set(key, i);
    }
    return Array.from(seen.values());
  }, [items]);

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
    <PedirLayout brand="all" cartCount={cart.totalItems} cartHref={`/pedir/${slug}/carrinho`}>
      {/* Cabeçalho */}
      <div className="mb-5">
        <span className="ap-tag">
          {store?.accepts_delivery
            ? store.accepts_pickup
              ? "Retirada ou entrega"
              : "Entrega"
            : "Retirada no balcão"}
        </span>
        <h1 className="ap-display mt-3" style={{ fontSize: "clamp(2rem, 6vw, 2.75rem)" }}>
          {store?.display_name ?? "Carregando…"}
        </h1>
        {!yoloUnlocked && (
          <button
            onClick={() => setYoloOpen(true)}
            className="mt-3 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold"
            style={{ borderColor: "hsl(var(--ap-red) / .35)", color: "hsl(var(--ap-red))" }}
          >
            <Ticket className="h-4 w-4" /> Tenho código Yolo
          </button>
        )}
      </div>

      <YoloCodeDialog
        open={yoloOpen}
        onOpenChange={setYoloOpen}
        storeId={store?.store_id ?? ""}
        channel="online"
        onUnlocked={() => setYoloUnlocked(true)}
      />


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
                      {brandCode && (
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
