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
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { createMockAdapter } from "@/lib/tef/mockAdapter";
import type { TefStatus, TefPaymentMethod } from "@/lib/tef/types";
import { useSmartPosCart } from "@/hooks/useSmartPosCart";

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

const ALLOWED_STORE_NAMES = ["ASA SUL", "ASA NORTE", "ÁGUAS CLARAS", "AGUAS CLARAS", "LAGO SUL"];

interface Store {
  id: string;
  name: string;
}
interface MenuCategory {
  id: string;
  name: string;
  sort_order: number;
}
interface MenuItem {
  id: string;
  name: string;
  price: number;
  category_id: string | null;
  is_active: boolean;
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

  // TEF state
  const [tefStatus, setTefStatus] = useState<TefStatus>("idle");
  const [tefMsg, setTefMsg] = useState<string>("");
  const [tefMethod, setTefMethod] = useState<TefPaymentMethod>("credit");
  const [lastResult, setLastResult] = useState<{
    nsu?: string;
    brand?: string;
    last4?: string;
    total: number;
    method: TefPaymentMethod;
  } | null>(null);

  const cart = useSmartPosCart();

  // Redireciona se não logado
  useEffect(() => {
    if (!authLoading && !user) navigate("/smartpos/login", { replace: true });
  }, [authLoading, user, navigate]);

  // Carrega lojas permitidas + catálogo
  useEffect(() => {
    void (async () => {
      setLoading(true);
      const [stRes, catRes, itRes] = await Promise.all([
        supabase.from("stores").select("id,name,is_virtual").eq("is_virtual", false).order("name"),
        supabase.from("menu_categories").select("id,name,sort_order").order("sort_order"),
        supabase
          .from("menu_items")
          .select("id,name,price,category_id,is_active")
          .eq("is_active", true)
          .order("sort_order"),
      ]);
      const filteredStores = ((stRes.data ?? []) as Store[]).filter((s) =>
        ALLOWED_STORE_NAMES.some((n) => s.name.toUpperCase().includes(n)),
      );
      setStores(filteredStores);
      if (filteredStores.length === 1) setStoreId(filteredStores[0].id);
      setCategories((catRes.data ?? []) as MenuCategory[]);
      setItems((itRes.data ?? []) as MenuItem[]);
      setLoading(false);
    })();
  }, []);

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (activeCat !== "all" && it.category_id !== activeCat) return false;
      if (search && !it.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [items, activeCat, search]);

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
    const adapter = createMockAdapter({ provider: "mock", agentUrl: "" });
    setTefStatus("connecting");
    setTefMsg("Conectando...");
    const result = await adapter.processPayment(
      { amount: cart.total, method: tefMethod, storeId },
      (s, m) => {
        setTefStatus(s);
        setTefMsg(m ?? "");
      },
    );
    if (result.status === "approved") {
      setLastResult({
        nsu: result.nsu,
        brand: result.cardBrand,
        last4: result.cardLast4,
        total: cart.total,
        method: tefMethod,
      });
      setScreen("receipt");
    } else {
      toast({
        title: "Pagamento não concluído",
        description: result.message ?? result.status,
        variant: "destructive",
      });
      setTefStatus("idle");
    }
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
        <p className="text-xs text-muted-foreground">
          (Impressão de cupom será nativa na Fase 3)
        </p>
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
              TEF em modo simulação (mock)
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
              onClick={() => cart.add(it)}
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
    </div>
  );
}
