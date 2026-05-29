/**
 * NEXA Garçom — app mobile para Gertec GPOS780 (PayGo Integrado).
 * Fluxo: mapa de mesas → abrir → lançar rodada → ver conta → cobrar.
 * Fase 1: TEF mock; PayGo entra na Fase 3.
 */
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  LogOut,
  Plus,
  Minus,
  Trash2,
  Send,
  Search,
  Receipt,
  CreditCard,
  Users,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { createMockAdapter } from "@/lib/tef/mockAdapter";
import type { TefStatus } from "@/lib/tef/types";

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

const ALLOWED = ["ASA SUL", "ASA NORTE", "ÁGUAS CLARAS", "AGUAS CLARAS", "LAGO SUL"];

interface Store { id: string; name: string }
interface Mesa {
  id: string;
  number: number;
  label: string | null;
  seats: number;
  area: string | null;
  store_id: string;
}
interface Session {
  id: string;
  table_id: string;
  guests: number;
  status: string;
  opened_at: string;
}
interface MenuCat { id: string; name: string; sort_order: number }
interface MenuItem {
  id: string;
  name: string;
  price: number;
  category_id: string | null;
}
interface Round {
  id: string;
  round_number: number;
  status: string;
  sent_at: string;
}
interface RoundItem {
  id: string;
  round_id: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
}
interface CartItem {
  uid: string;
  menu_item_id: string;
  name: string;
  unit_price: number;
  quantity: number;
}

type Screen = "map" | "session" | "catalog" | "bill" | "charge" | "done";

export default function Garcom() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [tables, setTables] = useState<Mesa[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [categories, setCategories] = useState<MenuCat[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [screen, setScreen] = useState<Screen>("map");
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [activeTable, setActiveTable] = useState<Mesa | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [roundItems, setRoundItems] = useState<RoundItem[]>([]);

  // open dialog
  const [openDialog, setOpenDialog] = useState<{ table: Mesa | null }>({ table: null });
  const [openGuests, setOpenGuests] = useState(1);

  // new table dialog
  const [newTableOpen, setNewTableOpen] = useState(false);
  const [newTableNumber, setNewTableNumber] = useState("");
  const [newTableSeats, setNewTableSeats] = useState("4");

  // catalog
  const [activeCat, setActiveCat] = useState("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);

  // charge
  const [tefStatus, setTefStatus] = useState<TefStatus>("idle");
  const [tefMsg, setTefMsg] = useState("");

  useEffect(() => {
    if (!authLoading && !user) navigate("/smartpos/login", { replace: true });
  }, [authLoading, user, navigate]);

  // Lojas + catálogo
  useEffect(() => {
    void (async () => {
      setLoading(true);
      const [st, cat, it] = await Promise.all([
        supabase.from("stores").select("id,name,is_virtual").eq("is_virtual", false).order("name"),
        supabase.from("menu_categories").select("id,name,sort_order").order("sort_order"),
        supabase.from("menu_items").select("id,name,price,category_id,is_active").eq("is_active", true).order("sort_order"),
      ]);
      const filtered = ((st.data ?? []) as Store[]).filter((s) =>
        ALLOWED.some((n) => s.name.toUpperCase().includes(n)),
      );
      setStores(filtered);
      if (filtered.length) {
        const norte = filtered.find((s) => s.name.toUpperCase().includes("ASA NORTE"));
        setStoreId(norte?.id ?? filtered[0].id);
      }
      setCategories((cat.data ?? []) as MenuCat[]);
      setItems((it.data ?? []) as MenuItem[]);
      setLoading(false);
    })();
  }, []);

  // Mesas + sessões abertas da loja
  useEffect(() => {
    if (!storeId) return;
    void loadTables();
  }, [storeId]);

  const loadTables = async () => {
    if (!storeId) return;
    const [tb, ss] = await Promise.all([
      supabase.from("pdv_tables").select("*").eq("store_id", storeId).eq("is_active", true).order("number"),
      supabase
        .from("pdv_table_sessions")
        .select("id,table_id,guests,status,opened_at")
        .eq("store_id", storeId)
        .in("status", ["open", "bill_requested"]),
    ]);
    setTables((tb.data ?? []) as Mesa[]);
    setSessions((ss.data ?? []) as Session[]);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/smartpos/login", { replace: true });
  };

  const sessionOf = (tableId: string) => sessions.find((s) => s.table_id === tableId);

  // Abrir mesa
  const confirmOpenTable = async () => {
    if (!openDialog.table || !storeId) return;
    const { data, error } = await supabase
      .from("pdv_table_sessions")
      .insert({
        table_id: openDialog.table.id,
        store_id: storeId,
        waiter_id: user?.id ?? null,
        guests: openGuests,
        status: "open",
      })
      .select("id,table_id,guests,status,opened_at")
      .single();
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setOpenDialog({ table: null });
    setActiveTable(openDialog.table);
    setActiveSession(data as Session);
    setScreen("session");
    setRounds([]);
    setRoundItems([]);
    setCart([]);
    await loadTables();
  };

  // Entrar em mesa já aberta
  const enterTable = async (mesa: Mesa) => {
    const s = sessionOf(mesa.id);
    if (!s) {
      setOpenDialog({ table: mesa });
      setOpenGuests(mesa.seats);
      return;
    }
    setActiveTable(mesa);
    setActiveSession(s);
    setScreen("session");
    await loadSessionDetail(s.id);
  };

  const loadSessionDetail = async (sessionId: string) => {
    const { data: rd } = await supabase
      .from("pdv_table_rounds")
      .select("id,round_number,status,sent_at")
      .eq("session_id", sessionId)
      .order("round_number");
    const roundIds = (rd ?? []).map((r) => r.id);
    let its: RoundItem[] = [];
    if (roundIds.length) {
      const { data: itd } = await supabase
        .from("pdv_order_items")
        .select("id,round_id,name,quantity,unit_price,total")
        .in("round_id", roundIds);
      its = (itd ?? []) as RoundItem[];
    }
    setRounds((rd ?? []) as Round[]);
    setRoundItems(its);
  };

  // catálogo
  const filteredItems = useMemo(
    () =>
      items.filter((it) => {
        if (activeCat !== "all" && it.category_id !== activeCat) return false;
        if (search && !it.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }),
    [items, activeCat, search],
  );

  const addToCart = (it: MenuItem) =>
    setCart((prev) => {
      const ex = prev.find((p) => p.menu_item_id === it.id);
      if (ex) return prev.map((p) => (p.uid === ex.uid ? { ...p, quantity: p.quantity + 1 } : p));
      return [...prev, { uid: crypto.randomUUID(), menu_item_id: it.id, name: it.name, unit_price: Number(it.price) || 0, quantity: 1 }];
    });
  const incCart = (uid: string) => setCart((p) => p.map((c) => (c.uid === uid ? { ...c, quantity: c.quantity + 1 } : c)));
  const decCart = (uid: string) =>
    setCart((p) => p.map((c) => (c.uid === uid ? { ...c, quantity: c.quantity - 1 } : c)).filter((c) => c.quantity > 0));
  const rmCart = (uid: string) => setCart((p) => p.filter((c) => c.uid !== uid));

  const cartTotal = cart.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  // Enviar rodada para cozinha
  const sendRound = async () => {
    if (!activeSession || cart.length === 0) return;
    const nextRound = (rounds[rounds.length - 1]?.round_number ?? 0) + 1;
    const { data: round, error: er } = await supabase
      .from("pdv_table_rounds")
      .insert({ session_id: activeSession.id, round_number: nextRound, status: "sent" })
      .select("id,round_number,status,sent_at")
      .single();
    if (er || !round) {
      toast({ title: "Erro ao criar rodada", description: er?.message, variant: "destructive" });
      return;
    }
    // garante "order" da sessão
    let orderId: string | null = null;
    const { data: sess } = await supabase.from("pdv_table_sessions").select("order_id,store_id").eq("id", activeSession.id).single();
    orderId = sess?.order_id ?? null;
    if (!orderId) {
      // pega canal "Salão" da loja (fallback: primeiro canal)
      const { data: ch } = await supabase
        .from("pdv_channels")
        .select("id,kind")
        .eq("store_id", storeId)
        .limit(1)
        .maybeSingle();
      const { data: ord } = await supabase
        .from("pdv_orders")
        .insert({
          store_id: storeId,
          channel_id: ch?.id ?? null,
          order_type: "dinein",
          status: "open",
          subtotal: 0, total: 0,
        })
        .select("id")
        .single();
      orderId = ord?.id ?? null;
      if (orderId) {
        await supabase.from("pdv_table_sessions").update({ order_id: orderId }).eq("id", activeSession.id);
      }
    }
    if (!orderId) {
      toast({ title: "Não foi possível criar o pedido", variant: "destructive" });
      return;
    }
    const rows = cart.map((c) => ({
      order_id: orderId!,
      menu_item_id: c.menu_item_id,
      round_id: round.id,
      name: c.name,
      quantity: c.quantity,
      unit_price: c.unit_price,
      total: c.unit_price * c.quantity,
    }));
    await supabase.from("pdv_order_items").insert(rows);
    // atualiza total do pedido
    const newSubtotal = (await supabase
      .from("pdv_order_items")
      .select("total")
      .eq("order_id", orderId)).data?.reduce((s, r: { total: number }) => s + Number(r.total), 0) ?? 0;
    await supabase.from("pdv_orders").update({ subtotal: newSubtotal, total: newSubtotal }).eq("id", orderId);

    toast({ title: `Rodada ${round.round_number} enviada para a cozinha` });
    setCart([]);
    await loadSessionDetail(activeSession.id);
    setScreen("session");
  };

  // Cobrar
  const sessionTotal = roundItems.reduce((s, i) => s + Number(i.total), 0);
  const handleCharge = async () => {
    if (!activeSession) return;
    setScreen("charge");
    const adapter = createMockAdapter({ provider: "mock", agentUrl: "" });
    setTefStatus("connecting");
    const result = await adapter.processPayment(
      { amount: sessionTotal, method: "credit", storeId },
      (s, m) => { setTefStatus(s); setTefMsg(m ?? ""); },
    );
    if (result.status === "approved") {
      await supabase
        .from("pdv_table_sessions")
        .update({ status: "paid", closed_at: new Date().toISOString() })
        .eq("id", activeSession.id);
      const { data: sess } = await supabase
        .from("pdv_table_sessions").select("order_id").eq("id", activeSession.id).single();
      if (sess?.order_id) {
        await supabase.from("pdv_orders").update({ status: "concluded", concluded_at: new Date().toISOString() }).eq("id", sess.order_id);
      }
      setScreen("done");
    } else {
      toast({ title: "Pagamento não concluído", description: result.message, variant: "destructive" });
      setScreen("bill");
    }
  };

  const finishAndBack = async () => {
    setActiveSession(null);
    setActiveTable(null);
    setRounds([]);
    setRoundItems([]);
    setCart([]);
    setScreen("map");
    setTefStatus("idle");
    await loadTables();
  };

  const createTable = async () => {
    const num = parseInt(newTableNumber, 10);
    const seats = parseInt(newTableSeats, 10) || 4;
    if (!num || !storeId) return;
    const { error } = await supabase.from("pdv_tables").insert({
      store_id: storeId, number: num, seats, area: "salao",
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setNewTableOpen(false);
    setNewTableNumber("");
    setNewTableSeats("4");
    await loadTables();
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // ====== TELA: pagamento aprovado ======
  if (screen === "done") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center space-y-6">
        <div className="h-20 w-20 rounded-full bg-success/10 flex items-center justify-center">
          <CheckCircle2 className="h-12 w-12 text-success" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Mesa fechada</h1>
          <p className="text-muted-foreground">Pagamento aprovado</p>
        </div>
        <div className="text-3xl font-bold text-primary">{fmt(sessionTotal)}</div>
        <Button className="w-full max-w-xs h-14 text-base" onClick={finishAndBack}>Voltar ao mapa</Button>
      </div>
    );
  }

  // ====== TELA: cobrando ======
  if (screen === "charge") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="font-medium text-lg">{tefMsg || "Processando..."}</p>
        <p className="text-xs text-muted-foreground uppercase">{tefStatus}</p>
        {tefStatus === "declined" && (
          <div className="flex flex-col items-center text-destructive gap-2">
            <XCircle className="h-10 w-10" />
            <p>{tefMsg || "Negado"}</p>
          </div>
        )}
      </div>
    );
  }

  // ====== TELA: conta ======
  if (screen === "bill" && activeSession && activeTable) {
    const groupedByRound = rounds.map((r) => ({
      round: r,
      items: roundItems.filter((it) => it.round_id === r.id),
    }));
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b bg-card p-3 flex items-center gap-2 sticky top-0 z-10">
          <Button size="icon" variant="ghost" onClick={() => setScreen("session")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <div className="text-sm font-bold">Conta · Mesa {activeTable.number}</div>
            <div className="text-xs text-muted-foreground">{activeSession.guests} pessoas</div>
          </div>
        </header>
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-4 pb-32">
            {groupedByRound.map(({ round, items }) => (
              <div key={round.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline">Rodada {round.round_number}</Badge>
                  <Badge>{round.status}</Badge>
                </div>
                <div className="space-y-1 text-sm">
                  {items.map((i) => (
                    <div key={i.id} className="flex justify-between">
                      <span>{i.quantity}× {i.name}</span>
                      <span className="font-medium">{fmt(Number(i.total))}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {groupedByRound.length === 0 && (
              <div className="text-center text-muted-foreground py-10 text-sm">Nenhum item lançado</div>
            )}
          </div>
        </ScrollArea>
        <div className="fixed bottom-0 left-0 right-0 border-t bg-card p-3 space-y-2">
          <div className="flex justify-between items-baseline">
            <span className="text-muted-foreground">Total</span>
            <span className="font-bold text-2xl text-primary">{fmt(sessionTotal)}</span>
          </div>
          <Button className="w-full h-14 text-base" disabled={sessionTotal <= 0} onClick={handleCharge}>
            <CreditCard className="h-5 w-5 mr-2" /> Cobrar
          </Button>
        </div>
      </div>
    );
  }

  // ====== TELA: catálogo (nova rodada) ======
  if (screen === "catalog" && activeSession && activeTable) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b bg-card p-3 flex items-center gap-2 sticky top-0 z-10">
          <Button size="icon" variant="ghost" onClick={() => { setCart([]); setScreen("session"); }}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <div className="text-sm font-bold">Nova rodada · Mesa {activeTable.number}</div>
          </div>
        </header>
        <div className="p-3 space-y-2 border-b bg-card">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 pl-8" />
          </div>
          <ScrollArea className="w-full">
            <div className="flex gap-2 pb-1">
              <Button size="sm" variant={activeCat === "all" ? "default" : "outline"} onClick={() => setActiveCat("all")} className="shrink-0">Todos</Button>
              {categories.map((c) => (
                <Button key={c.id} size="sm" variant={activeCat === c.id ? "default" : "outline"} onClick={() => setActiveCat(c.id)} className="shrink-0">
                  {c.name}
                </Button>
              ))}
            </div>
          </ScrollArea>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-3 grid grid-cols-2 gap-2 pb-40">
            {filteredItems.map((it) => (
              <button
                key={it.id}
                onClick={() => addToCart(it)}
                className="border rounded-lg p-3 text-left bg-card hover:border-primary active:scale-95 transition-all min-h-[88px] flex flex-col justify-between"
              >
                <div className="text-sm font-medium line-clamp-2">{it.name}</div>
                <div className="text-primary font-bold text-sm mt-2">{fmt(Number(it.price))}</div>
              </button>
            ))}
            {filteredItems.length === 0 && (
              <div className="col-span-2 text-center text-muted-foreground text-sm py-12">Nenhum produto</div>
            )}
          </div>
        </ScrollArea>
        {cart.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 border-t bg-card p-3 space-y-2 max-h-[55vh] overflow-hidden flex flex-col">
            <ScrollArea className="flex-1">
              <div className="space-y-2 pr-2">
                {cart.map((ci) => (
                  <div key={ci.uid} className="flex items-center gap-2 border rounded-lg p-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{ci.name}</div>
                      <div className="text-xs text-muted-foreground">{fmt(ci.unit_price)}</div>
                    </div>
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => decCart(ci.uid)}><Minus className="h-3 w-3" /></Button>
                    <span className="w-6 text-center text-sm font-medium">{ci.quantity}</span>
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => incCart(ci.uid)}><Plus className="h-3 w-3" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => rmCart(ci.uid)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-muted-foreground">{cartCount} {cartCount === 1 ? "item" : "itens"}</span>
              <span className="font-bold text-lg text-primary">{fmt(cartTotal)}</span>
            </div>
            <Button className="w-full h-12 text-base" onClick={sendRound}>
              <Send className="h-4 w-4 mr-2" /> Enviar para cozinha
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ====== TELA: sessão aberta ======
  if (screen === "session" && activeSession && activeTable) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b bg-card p-3 flex items-center gap-2 sticky top-0 z-10">
          <Button size="icon" variant="ghost" onClick={finishAndBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <div className="text-sm font-bold">Mesa {activeTable.number}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" /> {activeSession.guests}
            </div>
          </div>
          <Badge variant="outline">{rounds.length} rodada(s)</Badge>
        </header>
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-3 pb-32">
            {rounds.length === 0 ? (
              <div className="text-center text-muted-foreground py-12 text-sm">
                Nenhuma rodada ainda. Toque em "Nova rodada".
              </div>
            ) : (
              rounds.map((r) => {
                const its = roundItems.filter((i) => i.round_id === r.id);
                const tot = its.reduce((s, i) => s + Number(i.total), 0);
                return (
                  <div key={r.id} className="border rounded-lg p-3">
                    <div className="flex justify-between items-center mb-2">
                      <Badge variant="outline">Rodada {r.round_number}</Badge>
                      <Badge>{r.status}</Badge>
                    </div>
                    <div className="space-y-1 text-sm">
                      {its.map((i) => (
                        <div key={i.id} className="flex justify-between">
                          <span>{i.quantity}× {i.name}</span>
                          <span>{fmt(Number(i.total))}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between text-sm font-medium mt-2 pt-2 border-t">
                      <span>Subtotal</span><span>{fmt(tot)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
        <div className="fixed bottom-0 left-0 right-0 border-t bg-card p-3 grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-14" onClick={() => { setCart([]); setActiveCat("all"); setSearch(""); setScreen("catalog"); }}>
            <Plus className="h-5 w-5 mr-1" /> Nova rodada
          </Button>
          <Button className="h-14" onClick={() => setScreen("bill")} disabled={rounds.length === 0}>
            <Receipt className="h-5 w-5 mr-1" /> Conta
          </Button>
        </div>
      </div>
    );
  }

  // ====== TELA: mapa de mesas ======
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card p-3 flex items-center gap-2 sticky top-0 z-10">
        <UtensilsCrossed className="h-5 w-5 text-primary" />
        <div className="flex-1 min-w-0">
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger className="h-10"><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
            <SelectContent>
              {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button size="icon" variant="ghost" onClick={handleLogout} title="Sair">
          <LogOut className="h-4 w-4" />
        </Button>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-3">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h1 className="text-lg font-bold">Mesas</h1>
              <p className="text-xs text-muted-foreground">
                Toque na mesa para abrir ou continuar
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setNewTableOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Mesa
            </Button>
          </div>

          {tables.length === 0 ? (
            <div className="text-center text-muted-foreground py-12 text-sm">
              Nenhuma mesa cadastrada. Toque em "+ Mesa".
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {tables.map((m) => {
                const s = sessionOf(m.id);
                const occupied = !!s;
                return (
                  <button
                    key={m.id}
                    onClick={() => enterTable(m)}
                    className={`border rounded-lg p-3 aspect-square flex flex-col items-center justify-center transition-all active:scale-95 ${
                      occupied
                        ? "border-warning bg-warning/10 hover:border-warning"
                        : "border-input bg-card hover:border-primary"
                    }`}
                  >
                    <div className="text-2xl font-bold">{m.number}</div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
                      <Users className="h-3 w-3" /> {m.seats}
                    </div>
                    {occupied && (
                      <Badge className="mt-1 text-[10px] px-1 py-0">aberta</Badge>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Dialog abrir mesa */}
      <Dialog open={!!openDialog.table} onOpenChange={(o) => !o && setOpenDialog({ table: null })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Abrir mesa {openDialog.table?.number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Pessoas</label>
            <Input
              type="number" min={1} max={20}
              value={openGuests}
              onChange={(e) => setOpenGuests(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="h-12 text-lg"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenDialog({ table: null })}>Cancelar</Button>
            <Button onClick={confirmOpenTable}>Abrir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog nova mesa */}
      <Dialog open={newTableOpen} onOpenChange={setNewTableOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova mesa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Número</label>
              <Input type="number" value={newTableNumber} onChange={(e) => setNewTableNumber(e.target.value)} className="h-12" />
            </div>
            <div>
              <label className="text-sm font-medium">Lugares</label>
              <Input type="number" value={newTableSeats} onChange={(e) => setNewTableSeats(e.target.value)} className="h-12" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewTableOpen(false)}>Cancelar</Button>
            <Button onClick={createTable}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
