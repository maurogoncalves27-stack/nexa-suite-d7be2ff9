// Cardápio unificado por loja com abas por marca (Tudo / Parmê / Estrogonofe / Box).
// Cliente pode misturar itens das 3 marcas em um único pedido.
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Plus, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PedirLayout, BrandCode } from "./PedirLayout";
import { useEcommerceCart, formatBRL } from "@/hooks/useEcommerceCart";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

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

      // Itens disponíveis nesta loja física + marca
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
      <div className="mb-4">
        <h1 className="text-xl font-black">{store?.display_name ?? "Loja"}</h1>
        <p className="text-xs opacity-70">Retirada no balcão</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as BrandCode)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">Tudo</TabsTrigger>
          <TabsTrigger value="aquela-parme">Parmê</TabsTrigger>
          <TabsTrigger value="aquele-estrogonofe">Estro</TabsTrigger>
          <TabsTrigger value="box-caipira">Box</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4 space-y-6">
          {loading && <div className="text-sm opacity-60">Carregando cardápio…</div>}
          {!loading && grouped.length === 0 && (
            <div className="rounded-xl border bg-white p-6 text-center text-sm opacity-70">
              Nenhum item disponível.
            </div>
          )}
          {grouped.map(([cat, list]) => (
            <section key={cat}>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide opacity-70">{cat}</h2>
              <div className="space-y-2">
                {list.map((it) => {
                  const inCart = cart.items.find((c) => c.menu_item_id === it.id);
                  const brandCode = it.brand_codes.find((b) =>
                    ["aquela-parme", "aquele-estrogonofe", "box-caipira"].includes(b),
                  ) as Exclude<BrandCode, "all"> | undefined;
                  return (
                    <div
                      key={it.id}
                      className="flex items-start gap-3 rounded-xl border bg-white p-3"
                      style={{ borderColor: "hsl(var(--brand-accent) / 0.2)" }}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className="font-semibold leading-tight">{it.name}</div>
                          {brandCode && tab === "all" && (
                            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                              {BRAND_LABEL[brandCode]}
                            </span>
                          )}
                        </div>
                        {it.description && (
                          <div className="mt-0.5 text-xs opacity-70 line-clamp-2">{it.description}</div>
                        )}
                        <div className="mt-2 text-sm font-bold" style={{ color: "hsl(var(--brand-accent))" }}>
                          {formatBRL(it.price)}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {inCart ? (
                          <div className="flex items-center gap-1.5 rounded-full border px-1.5 py-1">
                            <button
                              aria-label="Diminuir"
                              onClick={() => cart.setQuantity(inCart.id, inCart.quantity - 1)}
                              className="grid h-6 w-6 place-items-center rounded-full"
                              style={{ background: "hsl(var(--brand-accent) / 0.1)" }}
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="min-w-5 text-center text-sm font-bold">{inCart.quantity}</span>
                            <button
                              aria-label="Aumentar"
                              onClick={() => cart.setQuantity(inCart.id, inCart.quantity + 1)}
                              className="grid h-6 w-6 place-items-center rounded-full text-white"
                              style={{ background: "hsl(var(--brand-accent))" }}
                            >
                              <Plus className="h-3 w-3" />
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
                            className="grid h-9 w-9 place-items-center rounded-full text-white disabled:opacity-40"
                            style={{ background: "hsl(var(--brand-accent))" }}
                            aria-label="Adicionar"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </TabsContent>
      </Tabs>

      {cart.totalItems > 0 && (
        <div className="sticky bottom-3 mt-6">
          <a
            href={`/pedir/${slug}/carrinho`}
            className="flex items-center justify-between rounded-full px-5 py-3 text-white shadow-lg"
            style={{ background: "hsl(var(--brand-accent))" }}
          >
            <span className="text-sm font-semibold">
              Ver sacola · {cart.totalItems} {cart.totalItems === 1 ? "item" : "itens"}
            </span>
            <span className="text-sm font-bold">{formatBRL(cart.subtotal)}</span>
          </a>
        </div>
      )}
    </PedirLayout>
  );
}
