// Aba "Atendimento manual": cardápio + carrinho + checkout (com complementos estilo iFood)
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Minus, Trash2, ShoppingCart, Loader2, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

interface MenuCategory { id: string; name: string; sort_order: number }
interface MenuItem {
  id: string; name: string; price: number; category_id: string | null;
  photo_path?: string | null; is_active: boolean;
}
interface ComplementOption {
  id: string; name: string; extra_price: number;
}
interface ComplementGroup {
  id: string; name: string; is_required: boolean;
  min_choices: number; max_choices: number;
  options: ComplementOption[];
}
interface SelectedComplement {
  group_id: string; group_name: string;
  option_id: string; option_name: string; extra_price: number;
}
interface CartItem {
  uid: string;            // id local (item + complementos podem repetir)
  menu_item_id: string;
  name: string;
  unit_price: number;     // já inclui complementos
  base_price: number;
  quantity: number;
  complements: SelectedComplement[];
}

type PaymentMethod = "debit" | "credit" | "pix";

interface Props {
  storeId: string;
  channelId: string | null;
  cashSessionId: string | null;
  onOrderCreated?: () => void;
}

export default function BalcaoTab({ storeId, channelId, cashSessionId, onOrderCreated }: Props) {
  const { user } = useAuth();
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [activeCat, setActiveCat] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  // Modal de complementos
  const [compItem, setCompItem] = useState<MenuItem | null>(null);
  const [compGroups, setCompGroups] = useState<ComplementGroup[]>([]);
  const [compLoading, setCompLoading] = useState(false);
  // selected[groupId] = option_id[]
  const [compSelected, setCompSelected] = useState<Record<string, string[]>>({});

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const [cats, its] = await Promise.all([
        supabase.from("menu_categories").select("id,name,sort_order").order("sort_order"),
        supabase.from("menu_items").select("id,name,price,category_id,photo_path,is_active").eq("is_active", true).order("sort_order"),
      ]);
      setCategories((cats.data ?? []) as MenuCategory[]);
      setItems((its.data ?? []) as MenuItem[]);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (activeCat !== "all" && it.category_id !== activeCat) return false;
      if (search && !it.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [items, activeCat, search]);

  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);
  const cartTotal = cart.reduce((s, c) => s + c.unit_price * c.quantity, 0);

  // Ao clicar num item: tenta buscar grupos. Se houver, abre dialog. Senão, adiciona direto.
  const handlePickItem = async (it: MenuItem) => {
    setCompLoading(true);
    setCompItem(it);
    const { data: gs } = await supabase
      .from("menu_item_complement_groups")
      .select("id,name,is_required,min_choices,max_choices,sort_order")
      .eq("menu_item_id", it.id)
      .order("sort_order");
    const groups = (gs ?? []) as any[];
    if (groups.length === 0) {
      // adiciona direto
      addToCart(it, []);
      setCompItem(null);
      setCompLoading(false);
      return;
    }
    const { data: opts } = await supabase
      .from("menu_item_complement_options")
      .select("id,group_id,name,extra_price,is_active,sort_order")
      .in("group_id", groups.map((g) => g.id))
      .eq("is_active", true)
      .order("sort_order");
    const fullGroups: ComplementGroup[] = groups.map((g) => ({
      id: g.id,
      name: g.name,
      is_required: g.is_required,
      min_choices: g.min_choices,
      max_choices: g.max_choices,
      options: ((opts ?? []) as any[])
        .filter((o) => o.group_id === g.id)
        .map((o) => ({ id: o.id, name: o.name, extra_price: Number(o.extra_price) })),
    }));
    setCompGroups(fullGroups);
    setCompSelected({});
    setCompLoading(false);
  };

  const toggleOption = (group: ComplementGroup, optionId: string) => {
    setCompSelected((prev) => {
      const cur = prev[group.id] ?? [];
      const exists = cur.includes(optionId);
      let next: string[];
      if (group.max_choices <= 1) {
        next = exists ? [] : [optionId];
      } else if (exists) {
        next = cur.filter((x) => x !== optionId);
      } else {
        if (cur.length >= group.max_choices) {
          toast({ title: `Máximo ${group.max_choices} no grupo "${group.name}"`, variant: "destructive" });
          return prev;
        }
        next = [...cur, optionId];
      }
      return { ...prev, [group.id]: next };
    });
  };

  const compExtra = useMemo(() => {
    let s = 0;
    for (const g of compGroups) {
      const sel = compSelected[g.id] ?? [];
      for (const oid of sel) {
        const opt = g.options.find((o) => o.id === oid);
        if (opt) s += opt.extra_price;
      }
    }
    return s;
  }, [compGroups, compSelected]);

  const confirmComplements = () => {
    if (!compItem) return;
    // valida min_choices
    for (const g of compGroups) {
      const sel = compSelected[g.id] ?? [];
      if (g.is_required && sel.length < Math.max(1, g.min_choices)) {
        toast({ title: `Selecione ao menos ${Math.max(1, g.min_choices)} em "${g.name}"`, variant: "destructive" });
        return;
      }
      if (sel.length < g.min_choices) {
        toast({ title: `Selecione ao menos ${g.min_choices} em "${g.name}"`, variant: "destructive" });
        return;
      }
    }
    const selected: SelectedComplement[] = [];
    for (const g of compGroups) {
      for (const oid of compSelected[g.id] ?? []) {
        const opt = g.options.find((o) => o.id === oid);
        if (opt) selected.push({
          group_id: g.id, group_name: g.name,
          option_id: opt.id, option_name: opt.name, extra_price: opt.extra_price,
        });
      }
    }
    addToCart(compItem, selected);
    setCompItem(null);
    setCompGroups([]);
    setCompSelected({});
  };

  const addToCart = (it: MenuItem, comps: SelectedComplement[]) => {
    const extra = comps.reduce((s, c) => s + c.extra_price, 0);
    const base = Number(it.price);
    const unit = base + extra;
    const sig = comps.map((c) => c.option_id).sort().join("|");
    const uid = `${it.id}__${sig}`;
    setCart((prev) => {
      const found = prev.find((p) => p.uid === uid);
      if (found) {
        return prev.map((p) => (p.uid === uid ? { ...p, quantity: p.quantity + 1 } : p));
      }
      return [
        ...prev,
        { uid, menu_item_id: it.id, name: it.name, base_price: base, unit_price: unit, quantity: 1, complements: comps },
      ];
    });
  };

  const updateQty = (uid: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((p) => (p.uid === uid ? { ...p, quantity: p.quantity + delta } : p))
        .filter((p) => p.quantity > 0),
    );
  };

  const removeItem = (uid: string) => setCart((prev) => prev.filter((p) => p.uid !== uid));

  const openCheckout = () => {
    if (cart.length === 0) {
      toast({ title: "Carrinho vazio", variant: "destructive" });
      return;
    }
    if (!channelId) {
      toast({ title: "Sem canal Balcão", description: "Crie um canal 'Balcão' nesta loja.", variant: "destructive" });
      return;
    }
    if (!cashSessionId) {
      toast({ title: "Sessão de caixa não inicializada", variant: "destructive" });
      return;
    }
    setCheckoutOpen(true);
  };

  const finalize = async () => {
    if (!channelId || !cashSessionId) return;
    setBusy(true);
    try {
      const { data: order, error: ordErr } = await supabase
        .from("pdv_orders")
        .insert({
          store_id: storeId,
          channel_id: channelId,
          cash_session_id: cashSessionId,
          status: "concluded",
          order_type: "counter",
          subtotal: cartTotal,
          total: cartTotal,
          opened_at: new Date().toISOString(),
          confirmed_at: new Date().toISOString(),
          concluded_at: new Date().toISOString(),
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();

      if (ordErr) throw ordErr;

      const itemsPayload = cart.map((c) => ({
        order_id: order.id,
        menu_item_id: c.menu_item_id,
        name: c.name,
        quantity: c.quantity,
        unit_price: c.unit_price,
        total: c.unit_price * c.quantity,
        complements: c.complements.length ? (c.complements as unknown as any) : null,
      }));
      const { error: itErr } = await supabase.from("pdv_order_items").insert(itemsPayload);
      if (itErr) throw itErr;

      const { error: payErr } = await supabase.from("pdv_payments").insert({
        order_id: order.id,
        method,
        amount: cartTotal,
        change_amount: 0,
      });
      if (payErr) throw payErr;

      toast({ title: "Venda finalizada!" });
      setCart([]);
      setCheckoutOpen(false);
      setCartOpen(false);
      onOrderCreated?.();
    } catch (e) {
      toast({
        title: "Erro ao finalizar",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-3">
      {!channelId && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs">
          ⚠️ Esta loja não tem canal "Balcão" cadastrado.
        </div>
      )}

      <Input
        placeholder="Buscar produto…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        inputMode="none"
        autoComplete="off"
        className="h-12 text-base"
      />

      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-2 pb-2">
          <Button size="sm" variant={activeCat === "all" ? "default" : "outline"} onClick={() => setActiveCat("all")}>
            Todos
          </Button>
          {categories.map((c) => (
            <Button key={c.id} size="sm" variant={activeCat === c.id ? "default" : "outline"} onClick={() => setActiveCat(c.id)}>
              {c.name}
            </Button>
          ))}
        </div>
      </ScrollArea>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {filtered.length === 0 ? (
          <p className="col-span-full text-sm text-muted-foreground text-center py-8">
            Nenhum produto encontrado.
          </p>
        ) : (
          filtered.map((it) => (
            <button
              key={it.id}
              onClick={() => handlePickItem(it)}
              className="text-left rounded-md border bg-card hover:bg-accent transition p-3 active:scale-95"
            >
              <p className="font-medium text-sm line-clamp-2">{it.name}</p>
              <p className="text-primary font-semibold text-sm mt-1">{fmt(Number(it.price))}</p>
            </button>
          ))
        )}
      </div>

      {/* Carrinho */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetTrigger asChild>
          <Button className="fixed bottom-4 right-4 z-40 shadow-lg h-14 px-5 rounded-full" disabled={cart.length === 0}>
            <ShoppingCart className="h-5 w-5 mr-2" />
            {cartCount > 0 && <Badge variant="secondary" className="mr-2">{cartCount}</Badge>}
            {fmt(cartTotal)}
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle>Carrinho</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto py-4 space-y-2">
            {cart.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Carrinho vazio</p>
            ) : (
              cart.map((c) => (
                <div key={c.uid} className="border-b pb-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{fmt(c.unit_price)} × {c.quantity}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(c.uid, -1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-sm">{c.quantity}</span>
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(c.uid, 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeItem(c.uid)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {c.complements.length > 0 && (
                    <ul className="mt-1 ml-1 space-y-0.5">
                      {c.complements.map((cp) => (
                        <li key={cp.option_id} className="text-[11px] text-muted-foreground">
                          + {cp.option_name}{cp.extra_price > 0 ? ` (${fmt(cp.extra_price)})` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
            )}
          </div>
          <div className="border-t pt-3 space-y-2">
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span className="text-primary">{fmt(cartTotal)}</span>
            </div>
            <Button className="w-full" size="lg" disabled={cart.length === 0} onClick={openCheckout}>
              Finalizar venda
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Dialog complementos */}
      <Dialog open={!!compItem} onOpenChange={(v) => !v && setCompItem(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{compItem?.name}</DialogTitle>
            <DialogDescription>Escolha os complementos</DialogDescription>
          </DialogHeader>
          {compLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="space-y-3">
              {compGroups.map((g) => {
                const sel = compSelected[g.id] ?? [];
                return (
                  <div key={g.id} className="border rounded-md p-2">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-medium text-sm">{g.name}</p>
                      <span className="text-[11px] text-muted-foreground">
                        {g.is_required ? "Obrigatório • " : ""}
                        {g.max_choices > 1 ? `escolha até ${g.max_choices}` : "escolha 1"}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {g.options.map((o) => {
                        const checked = sel.includes(o.id);
                        return (
                          <button
                            type="button"
                            key={o.id}
                            onClick={() => toggleOption(g, o.id)}
                            className={`w-full flex items-center justify-between text-sm rounded px-2 py-1.5 border transition-colors ${
                              checked ? "bg-primary/10 border-primary" : "hover:bg-muted"
                            }`}
                          >
                            <span>{o.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {o.extra_price > 0 ? `+${fmt(o.extra_price)}` : "—"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompItem(null)}>Cancelar</Button>
            <Button onClick={confirmComplements} disabled={compLoading}>
              Adicionar — {fmt((Number(compItem?.price ?? 0)) + compExtra)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Checkout */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pagamento — {fmt(cartTotal)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Forma de pagamento</Label>
              <Tabs value={method} onValueChange={(v) => setMethod(v as PaymentMethod)} className="mt-2">
                <TabsList className="grid grid-cols-3 w-full">
                  <TabsTrigger value="pix">Pix</TabsTrigger>
                  <TabsTrigger value="debit">Débito</TabsTrigger>
                  <TabsTrigger value="credit">Crédito</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckoutOpen(false)} disabled={busy}>
              <X className="h-4 w-4 mr-1" /> Cancelar
            </Button>
            <Button onClick={finalize} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Confirmar venda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
