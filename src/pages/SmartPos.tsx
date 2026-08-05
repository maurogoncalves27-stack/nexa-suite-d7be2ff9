import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  LogOut,
  CheckCircle2,
  XCircle,
  CreditCard,
  Smartphone,
  Search,
  Printer,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { loadTefConfig, createTefAdapter } from "@/lib/tef";
import type { TefStatus, TefPaymentMethod, TefPaymentResult } from "@/lib/tef/types";
import { logTefTransaction } from "@/lib/tef";
import { useSmartPosCart } from "@/hooks/useSmartPosCart";
import { createDraftOrder, finalizeSale, discardDraftOrder } from "@/lib/smartpos/sale";
import { printTefReceipts } from "@/lib/smartpos/print";
import {
  loadMenuCatalog,
  loadItemComplements,
  type CatalogCategory,
  type CatalogMenuItem,
  type CatalogComplementGroup,
  type SelectedComplement,
} from "@/lib/menuCatalog";

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

const ALLOWED_STORE_NAMES = ["ASA SUL", "114 NORTE", "ASA NORTE", "ÁGUAS CLARAS", "AGUAS CLARAS", "LAGO SUL"];

interface Store {
  id: string;
  name: string;
}
type MenuCategory = CatalogCategory;
type MenuItem = CatalogMenuItem;

interface ComplementDialog {
  item: MenuItem;
  groups: CatalogComplementGroup[];
  selected: Record<string, string[]>;
  loading: boolean;
}


type Screen = "catalog" | "charge" | "receipt";

export default function SmartPos() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [activeCat, setActiveCat] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>("catalog");
  const [cartOpen, setCartOpen] = useState(false);
  const [complementDialog, setComplementDialog] = useState<ComplementDialog | null>(null);

  // TEF state
  const [tefStatus, setTefStatus] = useState<TefStatus>("idle");
  const [tefMsg, setTefMsg] = useState<string>("");
  const [tefMethod, setTefMethod] = useState<TefPaymentMethod>("credit");
  const [tefProvider, setTefProvider] = useState<string>("");
  const [lastResult, setLastResult] = useState<{
    nsu?: string;
    brand?: string;
    last4?: string;
    total: number;
    method: TefPaymentMethod;
    receipt?: Parameters<typeof printTefReceipts>[0];
  } | null>(null);

  const cart = useSmartPosCart();

  // Redireciona se não logado
  useEffect(() => {
    if (!authLoading && !user) navigate("/smartpos/login", { replace: true });
  }, [authLoading, user, navigate]);

  // Carrega lojas permitidas
  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data } = await supabase.from("stores").select("id,name,is_virtual").eq("is_virtual", false).order("name");
      const filteredStores = ((data ?? []) as Store[]).filter((s) =>
        ALLOWED_STORE_NAMES.some((n) => s.name.toUpperCase().includes(n)),
      );
      setStores(filteredStores);
      if (filteredStores.length === 1) setStoreId(filteredStores[0].id);
      setLoading(false);
    })();
  }, []);

  // Catálogo canônico por loja
  useEffect(() => {
    if (!storeId) return;
    void (async () => {
      try {
        const catalog = await loadMenuCatalog(storeId);
        setCategories(catalog.categories);
        setItems(catalog.items);
      } catch (error) {
        console.error(error);
        toast({ title: "Não foi possível carregar o cardápio", variant: "destructive" });
      }
    })();
  }, [storeId]);


  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (activeCat !== "all" && it.category_id !== activeCat) return false;
      if (search && !it.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [items, activeCat, search]);

  const openItem = async (it: MenuItem) => {
    setComplementDialog({ item: it, groups: [], selected: {}, loading: true });
    try {
      const groups = await loadItemComplements(it.id);
      setComplementDialog((current) =>
        current?.item.id === it.id ? { ...current, groups, loading: false } : current,
      );
    } catch (error) {
      console.error(error);
      setComplementDialog((current) =>
        current?.item.id === it.id ? { ...current, loading: false } : current,
      );
      toast({ title: "Não foi possível carregar os complementos", variant: "destructive" });
    }
  };

  const toggleComplement = (group: CatalogComplementGroup, optionId: string) => {
    setComplementDialog((current) => {
      if (!current) return current;
      const selected = current.selected[group.id] ?? [];
      let next: string[];
      if (selected.includes(optionId)) next = selected.filter((id) => id !== optionId);
      else if (group.max_choices <= 1) next = [optionId];
      else if (selected.length < group.max_choices) next = [...selected, optionId];
      else {
        toast({ title: `Escolha no máximo ${group.max_choices} em “${group.name}”`, variant: "destructive" });
        return current;
      }
      return { ...current, selected: { ...current.selected, [group.id]: next } };
    });
  };

  const selectedComplements = (dialog: NonNullable<typeof complementDialog>): SelectedComplement[] =>
    dialog.groups.flatMap((group) =>
      (dialog.selected[group.id] ?? []).flatMap((optionId) => {
        const option = group.options.find((candidate) => candidate.id === optionId);
        return option
          ? [{
              group_id: group.id,
              group_name: group.name,
              option_id: option.id,
              option_name: option.name,
              extra_price: option.extra_price,
            }]
          : [];
      }),
    );

  const addItemToCart = (it: MenuItem, complements: SelectedComplement[]) => {
    const unitPrice = Number(it.price) + complements.reduce((sum, c) => sum + c.extra_price, 0);
    cart.add({
      id: it.id,
      name: it.name,
      price: unitPrice,
      complements: complements.length ? complements : undefined,
    });
  };

  const handleLogout = async () => {

    await supabase.auth.signOut();
    navigate("/smartpos/login", { replace: true });
  };

  const goToCharge = () => {
    if (cart.count === 0) {
      toast({ title: "Carrinho vazio", variant: "destructive" });
      return;
    }
    if (!storeId) {
      toast({ title: "Selecione uma loja", variant: "destructive" });
      return;
    }
    setCartOpen(false);
    setScreen("charge");
    setTefStatus("idle");
  };

  const handleCharge = async () => {
    if (!storeId || cart.count === 0) return;
    setTefStatus("connecting");
    setTefMsg("Abrindo pedido...");

    const storeName = stores.find((s) => s.id === storeId)?.name ?? "NEXA";
    const { order, error } = await createDraftOrder({
      storeId,
      items: cart.items.map((i) => ({
        menu_item_id: i.menu_item_id,
        name: i.name,
        quantity: i.quantity,
        unit_price: i.unit_price,
        notes: i.notes,
        complements: i.complements,
      })),
      userId: user?.id,
      channelCodes: ["smartpos", "balcao", "counter"],
      orderType: "counter",
      source: "smartpos",
    });

    if (!order) {
      setTefStatus("idle");
      toast({ title: "Erro ao abrir pedido", description: error ?? "", variant: "destructive" });
      return;
    }

    const config = await loadTefConfig(storeId);
    const adapter = createTefAdapter(config);
    setTefProvider(config.provider);
    const amount = order.total;

    let result: TefPaymentResult;
    try {
      result = await adapter.processPayment(
        { amount, method: tefMethod, storeId, orderId: order.orderId },
        (s, m) => {
          setTefStatus(s);
          setTefMsg(m ?? "");
        },
      );
    } catch (e) {
      result = {
        status: "error",
        message: e instanceof Error ? e.message : "Falha na comunicação com o pinpad",
      };
    }

    void logTefTransaction({
      orderId: order.orderId,
      storeId,
      provider: config.provider,
      amount,
      status: result.status,
      message: result.message,
      nsu: result.nsu,
      authorizationCode: result.authorizationCode,
      cardBrand: result.cardBrand,
      cardLast4: result.cardLast4,
      installments: result.installments,
      acquirer: result.acquirer ?? config.acquirer,
      method: tefMethod,
      saleId: order.orderNumber,
      raw: result.raw,
    });

    if (result.status === "approved") {
      const fin = await finalizeSale({
        orderId: order.orderId,
        method: tefMethod,
        amount,
        nsu: result.nsu,
        authorizationCode: result.authorizationCode,
      });
      if (!fin.ok) {
        toast({
          title: "Pagamento aprovado, pedido pendente",
          description: `Registre manualmente: ${fin.error ?? ""}`,
          variant: "destructive",
        });
      }
      const receipt = {
        storeName,
        orderNumber: order.orderNumber,
        items: cart.items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          complements: i.complements?.map((c) => ({ option_name: c.option_name, extra_price: c.extra_price })),
        })),
        total: amount,
        method: tefMethod,
        nsu: result.nsu,
        authorizationCode: result.authorizationCode,
        cardBrand: result.cardBrand,
        cardLast4: result.cardLast4,
        installments: result.installments,
        operator: user?.email ?? undefined,
        tefReceipt: result.customerReceipt,
      };

      setLastResult({
        nsu: result.nsu,
        brand: result.cardBrand,
        last4: result.cardLast4,
        total: amount,
        method: tefMethod,
        receipt,
      });
      void printTefReceipts(receipt);
      setScreen("receipt");
    } else {
      await discardDraftOrder(order.orderId, result.message ?? result.status);
      toast({
        title: "Pagamento não concluído",
        description: result.message ?? result.status,
        variant: "destructive",
      });
      setTefStatus("idle");
    }
  };

  const reprintReceipt = async () => {
    if (!lastResult?.receipt) return;
    const r = await printTefReceipts(lastResult.receipt, { merchantCopy: false });
    toast({
      title: r.ok ? "Comprovante enviado para impressão" : "Falha ao imprimir",
      description: r.ok ? undefined : r.error,
      variant: r.ok ? undefined : "destructive",
    });
  };


  const newSale = () => {
    cart.clear();
    setLastResult(null);
    setScreen("catalog");
    setTefStatus("idle");
    setTefMsg("");
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // ===== Tela de comprovante =====
  if (screen === "receipt" && lastResult) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center space-y-6">
        <div className="h-20 w-20 rounded-full bg-success/10 flex items-center justify-center">
          <CheckCircle2 className="h-12 w-12 text-success" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Aprovado</h1>
          <p className="text-muted-foreground">Pagamento confirmado</p>
        </div>
        <div className="w-full max-w-xs space-y-2 text-sm bg-muted/30 rounded-lg p-4">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total</span>
            <span className="font-bold text-lg">{fmt(lastResult.total)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Método</span>
            <span className="font-medium uppercase">{lastResult.method}</span>
          </div>
          {lastResult.brand && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bandeira</span>
              <span className="font-medium">
                {lastResult.brand} •••• {lastResult.last4}
              </span>
            </div>
          )}
          {lastResult.nsu && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">NSU</span>
              <span className="font-mono">{lastResult.nsu}</span>
            </div>
          )}
        </div>
        <Button variant="outline" className="w-full max-w-xs h-12" onClick={reprintReceipt}>
          <Printer className="h-4 w-4 mr-2" />
          Reimprimir comprovante
        </Button>
        <Button className="w-full max-w-xs h-14 text-base" onClick={newSale}>
          Nova venda
        </Button>

      </div>
    );
  }

  // ===== Tela de cobrança =====
  if (screen === "charge") {
    const isProcessing = ["connecting", "waiting_card", "processing"].includes(tefStatus);
    return (
      <div className="min-h-screen bg-background flex flex-col p-4 space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => setScreen("catalog")} disabled={isProcessing}>
            Voltar
          </Button>
          <Badge variant="outline">Cobrança</Badge>
        </div>

        <div className="text-center py-6">
          <p className="text-sm text-muted-foreground">Total a cobrar</p>
          <p className="text-5xl font-bold text-primary mt-2">{fmt(cart.total)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {cart.count} {cart.count === 1 ? "item" : "itens"}
          </p>
        </div>

        {!isProcessing && tefStatus !== "approved" && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {(["credit", "debit", "pix"] as TefPaymentMethod[]).map((m) => (
                <Button
                  key={m}
                  variant={tefMethod === m ? "default" : "outline"}
                  className="h-16 flex flex-col gap-1"
                  onClick={() => setTefMethod(m)}
                >
                  {m === "pix" ? <Smartphone className="h-5 w-5" /> : <CreditCard className="h-5 w-5" />}
                  <span className="text-xs uppercase">{m}</span>
                </Button>
              ))}
            </div>
            <Button className="w-full h-14 text-base" onClick={handleCharge}>
              Cobrar {fmt(cart.total)}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              {tefProvider === "mock"
                ? "TEF em modo simulação (mock) — configure o provider da loja"
                : tefProvider
                  ? `TEF: ${tefProvider.toUpperCase()}`
                  : "TEF configurado por loja"}
            </p>

          </>
        )}

        {isProcessing && (
          <div className="flex-1 flex flex-col items-center justify-center space-y-4 text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <div>
              <p className="font-medium text-lg">{tefMsg || "Processando..."}</p>
              <p className="text-xs text-muted-foreground mt-1 uppercase">{tefStatus}</p>
            </div>
          </div>
        )}

        {tefStatus === "declined" && (
          <div className="flex flex-col items-center text-destructive gap-2">
            <XCircle className="h-10 w-10" />
            <p>{tefMsg || "Negado"}</p>
          </div>
        )}
      </div>
    );
  }

  // ===== Tela de catálogo =====
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card p-3 flex items-center gap-2 sticky top-0 z-10">
        <div className="flex-1 min-w-0">
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Selecione a loja" />
            </SelectTrigger>
            <SelectContent>
              {stores.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="icon" variant="ghost" onClick={handleLogout} title="Sair">
          <LogOut className="h-4 w-4" />
        </Button>
      </header>

      {/* Busca + categorias */}
      <div className="p-3 space-y-2 border-b bg-card">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 pl-8"
          />
        </div>
        <ScrollArea className="w-full">
          <div className="flex gap-2 pb-1">
            <Button
              size="sm"
              variant={activeCat === "all" ? "default" : "outline"}
              onClick={() => setActiveCat("all")}
              className="shrink-0"
            >
              Todos
            </Button>
            {categories.map((c) => (
              <Button
                key={c.id}
                size="sm"
                variant={activeCat === c.id ? "default" : "outline"}
                onClick={() => setActiveCat(c.id)}
                className="shrink-0"
              >
                {c.name}
              </Button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Grid de produtos */}
      <ScrollArea className="flex-1">
        <div className="p-3 grid grid-cols-2 gap-2 pb-24">
          {filteredItems.map((it) => (
            <button
              key={it.id}
              onClick={() => openItem(it)}
              className="border rounded-lg p-3 text-left bg-card hover:border-primary active:scale-95 transition-all min-h-[88px] flex flex-col justify-between"
            >
              <div className="text-sm font-medium line-clamp-2">{it.name}</div>
              <div className="text-primary font-bold text-sm mt-2">{fmt(Number(it.price))}</div>
            </button>
          ))}

          {filteredItems.length === 0 && (
            <div className="col-span-2 text-center text-muted-foreground text-sm py-12">
              Nenhum produto encontrado
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Botão flutuante carrinho */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetTrigger asChild>
          <Button
            className="fixed bottom-4 left-3 right-3 h-14 text-base shadow-lg"
            disabled={cart.count === 0}
          >
            <ShoppingCart className="h-5 w-5 mr-2" />
            <span className="flex-1 text-left">
              {cart.count} {cart.count === 1 ? "item" : "itens"}
            </span>
            <span className="font-bold">{fmt(cart.total)}</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-[80vh] flex flex-col">
          <SheetHeader>
            <SheetTitle>Carrinho</SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-2 py-2">
              {cart.items.map((ci) => (
                <div key={ci.uid} className="flex items-center gap-2 border rounded-lg p-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{ci.name}</div>
                    {ci.complements && ci.complements.length > 0 && (
                      <div className="text-xs text-muted-foreground truncate">
                        {ci.complements.map((c) => c.option_name).join(" · ")}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">{fmt(ci.unit_price)}</div>
                  </div>
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => cart.dec(ci.uid)}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-6 text-center text-sm font-medium">{ci.quantity}</span>
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => cart.inc(ci.uid)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    onClick={() => cart.remove(ci.uid)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}

              {cart.items.length === 0 && (
                <div className="text-center text-muted-foreground py-10 text-sm">
                  Carrinho vazio
                </div>
              )}
            </div>
          </ScrollArea>
          <div className="border-t pt-3 space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-muted-foreground">Total</span>
              <span className="font-bold text-xl text-primary">{fmt(cart.total)}</span>
            </div>
            <Button className="w-full h-12 text-base" onClick={goToCharge} disabled={cart.count === 0}>
              Cobrar
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                cart.clear();
                setCartOpen(false);
              }}
              disabled={cart.count === 0}
            >
              Limpar
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog
        open={!!complementDialog}
        onOpenChange={(open) => {
          if (!open) setComplementDialog(null);
        }}
      >
        <DialogContent className="max-w-sm p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="text-lg">
              {complementDialog?.item.name ?? "Personalizar"}
            </DialogTitle>
            <DialogDescription>
              {fmt(Number(complementDialog?.item.price ?? 0))}
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 max-h-[60vh] overflow-y-auto space-y-4">
            {complementDialog?.loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
            {complementDialog?.groups.map((group) => (
              <div key={group.id}>
                <div className="font-medium text-sm mb-2">
                  {group.name}
                  {group.is_required && <span className="text-destructive ml-1">*</span>}
                  <span className="text-muted-foreground text-xs block font-normal">
                    {group.min_choices === group.max_choices
                      ? `Escolha ${group.min_choices}`
                      : `Escolha de ${group.min_choices} até ${group.max_choices}`}
                  </span>
                </div>
                <div className="space-y-1">
                  {group.options.map((opt) => {
                    const selected = (complementDialog.selected[group.id] ?? []).includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        onClick={() => toggleComplement(group, opt.id)}
                        className={`w-full flex items-center justify-between rounded-lg border p-3 text-left transition-colors ${
                          selected ? "border-primary bg-primary/5" : "border-border bg-card"
                        }`}
                      >
                        <span className="text-sm">{opt.name}</span>
                        <span className="text-sm font-medium text-primary">
                          {opt.extra_price > 0 ? `+ ${fmt(opt.extra_price)}` : "Incluído"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter className="p-4 pt-0 gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setComplementDialog(null)}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                if (!complementDialog) return;
                const missing = complementDialog.groups.filter(
                  (group) =>
                    group.is_required &&
                    (complementDialog.selected[group.id] ?? []).length < group.min_choices,
                );
                if (missing.length) {
                  toast({
                    title: "Escolha obrigatória",
                    description: missing.map((g) => g.name).join(", "),
                    variant: "destructive",
                  });
                  return;
                }
                addItemToCart(complementDialog.item, selectedComplements(complementDialog));
                setComplementDialog(null);
              }}
            >
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

