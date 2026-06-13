// Totem de auto-atendimento (kiosk) — Fase D (UX)
// Idle screen, timeout de inatividade, fotos grandes, categorias visuais,
// observação por item, CPF na nota, bip ao adicionar.
import { useEffect, useMemo, useRef, useState, useCallback, type CSSProperties } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Minus, Trash2, ShoppingCart, ArrowLeft, Printer, Check, X, Timer, Hand } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { TefPaymentDialog } from "@/components/tef/TefPaymentDialog";
import { VirtualKeyboard } from "@/components/totem/VirtualKeyboard";
import type { TefPaymentResult } from "@/lib/tef";
import { isElectron } from "@/lib/electronBridge";
import logoAquelaParme from "@/assets/logo-aquela-parme.png";
import logoBoxCaipira from "@/assets/logo-box-caipira.png";
import logoEstrogonofe from "@/assets/logo-estrogonofe.png";
import fakeParme from "@/assets/totem-fake-parme.jpg";
import fakeBox from "@/assets/totem-fake-box.jpg";
import fakeEstrogonofe from "@/assets/totem-fake-estrogonofe.jpg";

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

// Máscara CPF
const maskCpf = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};
const isValidCpf = (cpf: string): boolean => {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(d[i]) * (10 - i);
  let r = (s * 10) % 11; if (r === 10) r = 0;
  if (r !== parseInt(d[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(d[i]) * (11 - i);
  r = (s * 10) % 11; if (r === 10) r = 0;
  return r === parseInt(d[10]);
};

type Step = "idle" | "store" | "type" | "menu" | "checkout" | "done";
type OrderType = "eat_in" | "takeout";

interface Brand { id: string; name: string; slug?: string }
interface Store { id: string; name: string; brand_id: string | null; parent_store_id?: string | null; parent_store?: { name: string } | null }
interface Category { id: string; name: string; sort_order: number; brand_id: string | null }
interface MenuItem {
  id: string; name: string; description: string | null; price: number;
  category_id: string | null; photo_path: string | null;
  recipe_id?: string | null; photo_url?: string | null;
}
interface CartItem {
  uid: string; menu_item_id: string; name: string; unit_price: number;
  quantity: number; notes?: string;
}

const IDLE_TIMEOUT_MS = 60_000; // 60s sem toque → reset
const PHOTO_BUCKET = "menu-photos";
const CURRENT_TOTEM_STORE = "asa sul";

const TOTEM_THEME_STYLE = {
  "--primary": "0 82% 43%",
  "--primary-foreground": "0 0% 100%",
  "--primary-glow": "0 88% 56%",
  "--accent": "6 84% 54%",
  "--accent-foreground": "0 0% 100%",
  "--ring": "0 82% 43%",
} as CSSProperties;

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const buildBrandLogoResolver = (
  customLogos: Record<string, string>,
  brandSlugById: Record<string, string>,
) => (brand: { id?: string; name: string }): { src: string; scale: number } | null => {
  const slug = brand.id ? brandSlugById[brand.id] : undefined;
  const custom = slug ? customLogos[slug] : undefined;
  if (custom) return { src: custom, scale: 1 };
  const n = normalize(brand.name);
  if (n.includes("box") || n.includes("caipira")) return { src: logoBoxCaipira, scale: 0.86 };
  if (n.includes("estrog")) return { src: logoEstrogonofe, scale: 0.78 };
  if (n.includes("parme")) return { src: logoAquelaParme, scale: 2.2 };
  return null;
};

const fakePhotoFor = (item: MenuItem, brand?: Brand | null) => {
  const key = normalize(`${brand?.name ?? ""} ${item.name} ${item.description ?? ""}`);
  if (key.includes("box") || key.includes("caipira")) return fakeBox;
  if (key.includes("estrog")) return fakeEstrogonofe;
  return fakeParme;
};

// Beep curto via WebAudio (sem precisar de arquivo)
let _audioCtx: AudioContext | null = null;
const beep = (freq = 880, ms = 90) => {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = _audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = "sine";
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    setTimeout(() => { osc.stop(); }, ms);
  } catch { /* ignore */ }
};

// Resolve URL pública da foto
const photoUrl = (path: string | null): string | null => {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
};

export default function Totem() {
  const [step, setStep] = useState<Step>("idle");
  const [idleSlide, setIdleSlide] = useState(0);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [orderType, setOrderType] = useState<OrderType | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [activeCat, setActiveCat] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pickupCode, setPickupCode] = useState<string>("");
  const [orderNumber, setOrderNumber] = useState<string>("");
  const [orderId, setOrderId] = useState<string>("");
  const [emittingNfce, setEmittingNfce] = useState(false);
  const [nfceEmitted, setNfceEmitted] = useState(false);
  const [cpf, setCpf] = useState("");
  const [noteDialog, setNoteDialog] = useState<{ item: MenuItem; note: string; qty: number } | null>(null);
  const [tefOpen, setTefOpen] = useState(false);
  const [showNoteKb, setShowNoteKb] = useState(false);
  const [showCpfKb, setShowCpfKb] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [customBackgrounds, setCustomBackgrounds] = useState<string[]>([]);
  const [customLogos, setCustomLogos] = useState<Record<string, string>>({});

  // ----- carregar marcas/lojas + assets do totem
  useEffect(() => {
    void (async () => {
      const [b, s, ta] = await Promise.all([
        supabase.from("brands").select("id,name,slug").eq("is_active", true).not("name", "ilike", "%fábrica%").not("name", "ilike", "%fabrica%").order("sort_order"),
        supabase.from("stores").select("id,name,brand_id,parent_store_id,parent_store:parent_store_id(name)").eq("is_virtual", true).order("name"),
        (supabase as any).from("totem_assets").select("kind,brand_slug,image_url,sort_order,is_active").eq("is_active", true).order("sort_order"),
      ]);
      setBrands(((b.data ?? []) as Brand[]).filter(x => !/f[áa]brica/i.test(x.name)));
      setStores((s.data ?? []) as Store[]);
      const assets = (ta.data ?? []) as Array<{ kind: string; brand_slug: string | null; image_url: string }>;
      setCustomBackgrounds(assets.filter(a => a.kind === "background").map(a => a.image_url));
      const logoMap: Record<string, string> = {};
      assets.filter(a => a.kind === "logo" && a.brand_slug).forEach(a => { logoMap[a.brand_slug!] = a.image_url; });
      setCustomLogos(logoMap);
    })();
  }, []);

  // ----- carregar cardápio (marca + loja física do totem)
  useEffect(() => {
    if (step !== "menu" || !selectedBrand || !selectedStore) return;
    void (async () => {
      setLoading(true);
      // loja física = parent_store_id da virtual (ou a própria, se já for física)
      const physicalStoreId = selectedStore.parent_store_id ?? selectedStore.id;
      const [cats, mib, mis] = await Promise.all([
        supabase.from("menu_categories").select("id,name,sort_order,brand_id")
          .or(`brand_id.eq.${selectedBrand.id},brand_id.is.null`).order("sort_order"),
        supabase.from("menu_item_brands").select("menu_item_id").eq("brand_id", selectedBrand.id),
        (supabase as any).from("menu_item_stores").select("menu_item_id")
          .eq("store_id", physicalStoreId).eq("is_available", true),
      ]);
      const brandIds = new Set((mib.data ?? []).map((r: any) => r.menu_item_id));
      const storeIds = new Set((mis.data ?? []).map((r: any) => r.menu_item_id));
      const itemIds = Array.from(brandIds).filter((id) => storeIds.has(id));
      let itemsData: MenuItem[] = [];
      if (itemIds.length > 0) {
        const { data } = await supabase.from("menu_items")
          .select("id,name,description,price,category_id,photo_path,recipe_id")
          .in("id", itemIds).eq("is_active", true).order("sort_order");
        itemsData = (data ?? []) as MenuItem[];

        // foto única: usa recipes.photo_path (mesma do /cardapio); fallback p/ menu_items.photo_path
        const recipeIds = Array.from(new Set(itemsData.map((i) => i.recipe_id).filter(Boolean) as string[]));
        const recipePhotoMap: Record<string, string> = {};
        if (recipeIds.length > 0) {
          const { data: recs } = await supabase.from("recipes").select("id,photo_path").in("id", recipeIds);
          for (const r of (recs ?? []) as any[]) {
            if (r.photo_path) {
              recipePhotoMap[r.id] = supabase.storage.from("recipe-photos").getPublicUrl(r.photo_path).data.publicUrl;
            }
          }
        }
        itemsData = itemsData.map((it) => ({
          ...it,
          photo_url:
            (it.recipe_id ? recipePhotoMap[it.recipe_id] : null) ??
            photoUrl(it.photo_path),
        }));
      }
      setCategories((cats.data ?? []) as Category[]);
      setItems(itemsData);
      setLoading(false);
    })();
  }, [step, selectedBrand, selectedStore]);


  // ----- timeout de inatividade
  const idleRef = useRef<number | null>(null);
  const handleReset = useCallback(() => {
    setStep("idle");
    setSelectedBrand(null);
    setSelectedStore(null);
    setOrderType(null);
    setCart([]);
    setSearch("");
    setActiveCat("all");
    setPickupCode("");
    setOrderNumber("");
    setCpf("");
    setNoteDialog(null);
    setShowCpfKb(false);
    setShowNoteKb(false);
  }, []);

  // Slideshow do idle
  useEffect(() => {
    if (step !== "idle") return;
    const id = window.setInterval(() => setIdleSlide(s => s + 1), 4000);
    return () => window.clearInterval(id);
  }, [step]);

  const resetIdle = useCallback(() => {
    if (idleRef.current) window.clearTimeout(idleRef.current);
    if (step === "idle" || step === "done") return;
    idleRef.current = window.setTimeout(() => {
      handleReset();
      toast({ title: "Sessão reiniciada por inatividade" });
    }, IDLE_TIMEOUT_MS);
  }, [step, handleReset]);

  useEffect(() => {
    resetIdle();
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart"];
    events.forEach(e => window.addEventListener(e, resetIdle));
    return () => {
      if (idleRef.current) window.clearTimeout(idleRef.current);
      events.forEach(e => window.removeEventListener(e, resetIdle));
    };
  }, [resetIdle]);

  useEffect(() => {
    if (step !== "checkout") setShowCpfKb(false);
    if (!noteDialog) setShowNoteKb(false);
  }, [step, noteDialog]);

  const brandSlugById = useMemo(() => {
    const map: Record<string, string> = {};
    brands.forEach((b) => { if (b.slug) map[b.id] = b.slug; });
    return map;
  }, [brands]);

  const brandLogo = useMemo(
    () => buildBrandLogoResolver(customLogos, brandSlugById),
    [customLogos, brandSlugById]
  );

  const displayedBrands = useMemo(
    () => brands.filter((b) => !!brandLogo(b)),
    [brands, brandLogo]
  );

  const storesForBrand = useMemo(
    () => selectedBrand ? stores.filter(s => s.brand_id === selectedBrand.id) : [],
    [stores, selectedBrand]
  );

  const pickStoreForBrand = useCallback((brand: Brand) => {
    const brandStores = stores.filter((s) => s.brand_id === brand.id);
    return brandStores.find((s) => normalize(`${s.name} ${s.parent_store?.name ?? ""}`).includes(CURRENT_TOTEM_STORE)) ?? brandStores[0] ?? null;
  }, [stores]);

  const filteredItems = useMemo(() => items.filter(it => {
    if (activeCat !== "all" && it.category_id !== activeCat) return false;
    if (search && !it.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [items, activeCat, search]);

  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);
  const cartTotal = cart.reduce((s, c) => s + c.unit_price * c.quantity, 0);

  const addItem = (it: MenuItem, note?: string, qty: number = 1) => {
    beep(880, 80);
    setCart(prev => {
      const ex = prev.find(c => c.menu_item_id === it.id && (c.notes || "") === (note || ""));
      if (ex) return prev.map(c => c.uid === ex.uid ? { ...c, quantity: c.quantity + qty } : c);
      return [...prev, {
        uid: crypto.randomUUID(), menu_item_id: it.id, name: it.name,
        unit_price: Number(it.price), quantity: qty, notes: note || undefined,
      }];
    });
  };
  const incItem = (uid: string) => { beep(660, 50); setCart(p => p.map(c => c.uid === uid ? { ...c, quantity: c.quantity + 1 } : c)); };
  const decItem = (uid: string) => { beep(440, 50); setCart(p => p.flatMap(c => c.uid === uid
    ? (c.quantity <= 1 ? [] : [{ ...c, quantity: c.quantity - 1 }]) : [c])); };
  const removeItem = (uid: string) => { beep(330, 70); setCart(p => p.filter(c => c.uid !== uid)); };

  const handleConfirmOrder = () => {
    if (!selectedStore || !selectedBrand || !orderType || cart.length === 0) return;
    if (cpf && !isValidCpf(cpf)) {
      toast({ title: "CPF inválido", description: "Confira ou deixe em branco.", variant: "destructive" });
      return;
    }
    // Abre o pinpad. A persistência só acontece se TEF aprovar.
    setTefOpen(true);
  };

  const emitAndPrintNfce = async (id: string) => {
    const { data, error } = await supabase.functions.invoke("nfce-emit", { body: { order_id: id } });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || "Falha ao emitir cupom fiscal");
    setNfceEmitted(true);
    let danfeUrl = data?.danfe_url || null;
    if (!danfeUrl && data?.status === "processing" && data?.invoice_id) {
      for (let i = 0; i < 6 && !danfeUrl; i += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        const { data: statusData } = await supabase.functions.invoke("nfce-status", { body: { invoice_id: data.invoice_id } });
        if (statusData?.danfe_url) danfeUrl = statusData.danfe_url;
      }
    }
    if (danfeUrl && isElectron() && window.electron?.printUrl) {
      await window.electron.printUrl({ url: danfeUrl });
    }
    return data;
  };

  const finalizeOrder = async (tef: TefPaymentResult) => {
    setTefOpen(false);
    if (tef.status !== "approved") {
      toast({
        title: tef.status === "declined" ? "Pagamento negado" :
               tef.status === "cancelled" ? "Pagamento cancelado" :
               "Falha no pagamento",
        description: tef.message,
        variant: "destructive",
      });
      return;
    }
    if (!selectedStore || !selectedBrand || !orderType) return;

    setBusy(true);
    try {
      const { data: ch } = await supabase.from("pdv_channels")
        .select("id").eq("store_id", selectedStore.id).eq("code", "balcao").maybeSingle();
      let channelId = ch?.id;
      if (!channelId) {
        const { data: nc, error: ce } = await supabase.from("pdv_channels")
          .insert({ store_id: selectedStore.id, code: "balcao", name: "Balcão", sort_order: 0 })
          .select("id").single();
        if (ce) throw ce;
        channelId = nc.id;
      }

      const code = String(Math.floor(100 + Math.random() * 900));
      const { data: order, error: oe } = await supabase.from("pdv_orders").insert({
        store_id: selectedStore.id,
        channel_id: channelId,
        status: "confirmed",
        order_type: orderType === "eat_in" ? "dine_in" : "takeout",
        subtotal: cartTotal,
        total: cartTotal,
        pickup_code: code,
        notes: `Totem · ${orderType === "eat_in" ? "Comer aqui" : "Para levar"}`,
        customer_document: cpf ? cpf.replace(/\D/g, "") : null,
        confirmed_at: new Date().toISOString(),
      } as any).select("id, order_number").single();
      if (oe) throw oe;

      const itemsPayload = cart.map(c => ({
        order_id: order.id,
        menu_item_id: c.menu_item_id,
        name: c.name,
        quantity: c.quantity,
        unit_price: c.unit_price,
        total: c.unit_price * c.quantity,
        notes: c.notes ?? null,
      }));
      const { error: ie } = await supabase.from("pdv_order_items").insert(itemsPayload);
      if (ie) throw ie;

      await supabase.from("pdv_payments").insert({
        order_id: order.id,
        method: tef.cardBrand ? "credit" : "credit",
        amount: cartTotal,
        status: "approved",
        external_id: tef.nsu ?? null,
      } as any);

      beep(1200, 120);
      setTimeout(() => beep(1600, 160), 130);
      setPickupCode(code);
      setOrderNumber(order.order_number || order.id.slice(0, 8));
      setOrderId(order.id);
      setNfceEmitted(false);
      setStep("done");

      // Emite NFC-e automaticamente e imprime somente o DANFE/cupom fiscal.
      void (async () => {
        try {
          await emitAndPrintNfce(order.id);
        } catch (e) {
          console.warn("[totem] auto-nfce falhou", e);
        }
      })();
    } catch (e: any) {
      console.error(e);
      toast({ title: "Erro ao registrar pedido", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleEmitNfce = async () => {
    if (!orderId) return;
    setEmittingNfce(true);
    try {
      await emitAndPrintNfce(orderId);
      toast({ title: "Cupom fiscal emitido", description: "NFC-e enviada à SEFAZ. Será impressa em instantes." });
    } catch (e: any) {
      toast({ title: "Erro ao emitir cupom fiscal", description: e.message, variant: "destructive" });
    } finally {
      setEmittingNfce(false);
    }
  };

  // ------------------- RENDER -------------------
  return (
    <div className="fixed inset-0 bg-background flex flex-col overflow-hidden" style={TOTEM_THEME_STYLE}>

      {/* Header (não aparece no idle/done) */}
      {step !== "idle" && step !== "store" && (
        <header className="h-20 px-6 flex items-center justify-between border-b bg-card no-print">
          <div className="flex items-center gap-3">
              {step !== "done" && (
              <Button variant="ghost" size="icon" className="h-12 w-12" onClick={() => {
                if (step === "menu") setStep("store");
                else if (step === "checkout") setStep("menu");
              }}>
                <ArrowLeft className="h-6 w-6" />
              </Button>
            )}
            <h1 className="text-2xl font-bold">
              {selectedBrand?.name ?? "Auto-Atendimento"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {step === "menu" && (
              <Button size="lg" className="h-14 px-6 text-lg gap-2"
                onClick={() => setStep("checkout")} disabled={cart.length === 0}>
                <ShoppingCart className="h-5 w-5" /> {cartCount} · {fmt(cartTotal)}
              </Button>
            )}
            {step !== "done" && (
              <Button variant="ghost" size="icon" className="h-12 w-12" onClick={handleReset} title="Cancelar">
                <X className="h-6 w-6" />
              </Button>
            )}
          </div>
        </header>
      )}

      {/* Botão fechar flutuante na tela de marcas (sem header com título) */}
      {step === "store" && (
        <button
          onClick={handleReset}
          className="absolute top-4 right-4 z-30 h-14 w-14 rounded-full bg-background/80 backdrop-blur border-2 border-border flex items-center justify-center hover:bg-background"
          aria-label="Cancelar"
        >
          <X className="h-7 w-7" />
        </button>
      )}

      {/* Conteúdo */}
      <main className="flex-1 overflow-hidden">
        {loading && (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="animate-spin h-12 w-12 text-muted-foreground" />
          </div>
        )}

        {/* STEP 0: idle / atrair */}
        {!loading && step === "idle" && (
          <button
            type="button"
            onClick={() => setStep("store")}
            className="absolute inset-0 w-full h-full overflow-hidden text-left"
          >
            {/* slideshow de fundo (usa imagens do banco se configuradas, senão fallback) */}
            {(() => {
              const slides = customBackgrounds.length > 0 ? customBackgrounds : [fakeParme, fakeBox, fakeEstrogonofe];
              return slides.map((src, i) => (
                <img
                  key={`${src}-${i}`}
                  src={src}
                  alt=""
                  aria-hidden
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
                    idleSlide % slides.length === i ? "opacity-100" : "opacity-0"
                  }`}
                />
              ));
            })()}
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/90" />
            <div className="relative h-full flex flex-col items-center justify-center text-white px-8 gap-12">
              <div className="text-center">
                <h1
                  className="text-[14rem] font-black leading-none tracking-tight animate-pulse"
                  style={{
                    textShadow: "0 6px 24px rgba(0,0,0,0.95), 0 2px 6px rgba(0,0,0,0.95), 0 0 80px rgba(0,0,0,0.7)",
                    WebkitTextStroke: "2px rgba(0,0,0,0.5)",
                  }}
                >
                  PEÇA AQUI
                </h1>
                <div
                  className="mt-10 inline-flex items-center gap-5 bg-primary text-primary-foreground rounded-full px-12 py-6 text-5xl font-black shadow-2xl ring-4 ring-white/30"
                  style={{ textShadow: "0 3px 10px rgba(0,0,0,0.6)" }}
                >
                  <Timer className="h-16 w-16" />
                  <span>Seu pedido em 15 min</span>
                </div>
              </div>
              <div className="absolute bottom-12 inline-flex items-center gap-3 text-2xl font-semibold animate-bounce">
                <Hand className="h-8 w-8" />
                <span>Toque na tela para começar</span>
              </div>
            </div>
          </button>
        )}

        {/* STEP 1: marca/loja — logos empilhadas, grandes */}
        {!loading && step === "store" && (
          <div className="h-full overflow-auto p-8 flex items-center justify-center animate-fade-in">
            <div className="flex flex-col gap-12 w-full max-w-4xl mx-auto">
              {displayedBrands.map(b => {
                const logo = brandLogo(b);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      setSelectedBrand(b);
                      const store = pickStoreForBrand(b);
                      if (store) {
                        setSelectedStore(store);
                        setOrderType("takeout");
                        setStep("menu");
                      }
                    }}
                    className="flex items-center justify-center h-56 transition-transform hover:scale-105 active:scale-95 overflow-visible"
                    aria-label={b.name}
                  >
                    {logo ? (
                      <img
                        src={logo.src}
                        alt={b.name}
                        className="h-40 w-[34rem] object-contain"
                        style={{ transform: `scale(${logo.scale})` }}
                      />
                    ) : (
                      <div className="text-5xl font-bold">{b.name}</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 3: cardápio */}
        {!loading && step === "menu" && (
          <div className="h-full flex flex-col overflow-hidden relative">
            {/* Tiles de categoria no topo */}
            <div className="border-b bg-card p-3 overflow-x-auto">
              <div className="flex gap-3 min-w-max">
                <CategoryTile label="Todos" count={items.length} active={activeCat === "all"}
                  onClick={() => {
                    setActiveCat("all");
                    document.getElementById("totem-scroll-top")?.scrollIntoView({ behavior: "smooth" });
                  }} />
                {categories.map(c => {
                  const cnt = items.filter(it => it.category_id === c.id).length;
                  if (cnt === 0) return null;
                  return (
                    <CategoryTile key={c.id} label={c.name} count={cnt} active={activeCat === c.id}
                      onClick={() => {
                        setActiveCat(c.id);
                        const el = sectionRefs.current[c.id];
                        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                      }} />
                  );
                })}
              </div>
            </div>
            <div className="p-4 border-b">
              <Input placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)}
                className="text-lg h-14" />
            </div>
            <ScrollArea className="flex-1 p-4">
              <div id="totem-scroll-top" />
              {(() => {
                const renderCard = (it: MenuItem) => {
                  const url = it.photo_url ?? fakePhotoFor(it, selectedBrand);
                  const inCart = cart.filter(c => c.menu_item_id === it.id).reduce((s, c) => s + c.quantity, 0);
                  return (
                    <Card key={it.id}
                      className="overflow-hidden cursor-pointer bg-card hover:bg-card transition-all hover:scale-[1.02] hover:shadow-lg flex flex-col relative"
                      onClick={() => setNoteDialog({ item: it, note: "", qty: 1 })}>
                      {inCart > 0 && (
                        <Badge className="absolute top-2 right-2 z-10 h-8 min-w-8 rounded-full text-base shadow-lg">
                          {inCart}
                        </Badge>
                      )}
                      <div className="aspect-square bg-muted relative overflow-hidden">
                        {url ? (
                          <img src={url} alt={it.name} loading="lazy"
                            className="w-full h-full object-cover" />
                        ) : (
                          <img src={fakePhotoFor(it, selectedBrand)} alt={it.name} loading="lazy" width={1024} height={1024} className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="p-3 flex-1 flex flex-col">
                        <div className="font-semibold mb-1 line-clamp-2">{it.name}</div>
                        {it.description && <div className="text-xs text-muted-foreground line-clamp-2 mb-2">{it.description}</div>}
                        <div className="flex items-center justify-between mt-auto">
                          <div className="text-primary font-bold text-xl">{fmt(Number(it.price))}</div>
                          <div className="rounded-full bg-primary text-primary-foreground h-10 w-10 flex items-center justify-center shadow">
                            <Plus className="h-5 w-5" />
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                };

                if (filteredItems.length === 0) {
                  return <p className="text-center text-muted-foreground py-12">Nenhum item encontrado.</p>;
                }

                if (activeCat !== "all" || search) {
                  return (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-32">
                      {filteredItems.map(renderCard)}
                    </div>
                  );
                }

                const groups: { id: string; name: string; items: MenuItem[] }[] = [];
                categories.forEach(c => {
                  const its = filteredItems.filter(it => it.category_id === c.id);
                  if (its.length > 0) groups.push({ id: c.id, name: c.name, items: its });
                });
                const semCat = filteredItems.filter(it => !it.category_id || !categories.some(c => c.id === it.category_id));
                if (semCat.length > 0) groups.push({ id: "_sem", name: "Outros", items: semCat });

                return (
                  <div className="space-y-8 pb-32">
                    {groups.map(g => (
                      <section key={g.id} ref={(el) => { sectionRefs.current[g.id] = el; }}>
                        <h2 className="text-2xl font-bold mb-3 sticky top-0 bg-background/95 backdrop-blur py-2 z-10">
                          {g.name}
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                          {g.items.map(renderCard)}
                        </div>
                      </section>
                    ))}
                  </div>
                );
              })()}
            </ScrollArea>

            {/* Barra fixa do carrinho — bem visível */}
            {cart.length > 0 && (
              <div className="absolute bottom-0 left-0 right-0 bg-primary text-primary-foreground shadow-2xl border-t-4 border-primary-foreground/20 z-20 animate-fade-in">
                <button
                  onClick={() => setStep("checkout")}
                  className="w-full px-8 py-6 flex items-center justify-between gap-6 text-2xl font-bold hover:bg-primary/90 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <ShoppingCart className="h-10 w-10" />
                      <span className="absolute -top-2 -right-3 bg-destructive text-destructive-foreground rounded-full h-7 min-w-7 px-2 text-sm flex items-center justify-center font-bold">
                        {cartCount}
                      </span>
                    </div>
                    <span className="text-xl">{cartCount} {cartCount === 1 ? "item" : "itens"} no carrinho</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-3xl">{fmt(cartTotal)}</span>
                    <span className="bg-primary-foreground text-primary rounded-xl px-6 py-3 text-xl">
                      Finalizar →
                    </span>
                  </div>
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 4: checkout */}
        {!loading && step === "checkout" && (
          <div className="h-full overflow-auto p-8 max-w-4xl mx-auto animate-fade-in">
            <h2 className="text-5xl font-black mb-6">Confira seu pedido</h2>
            <Card className="p-6 mb-6">
              <div className="text-base text-muted-foreground mb-4">
                {selectedBrand?.name} · {selectedStore?.name} · {orderType === "eat_in" ? "Comer aqui" : "Para levar"}
              </div>
              <div className="space-y-4">
                {cart.map(c => (
                  <div key={c.uid} className="flex items-center gap-4 border-b pb-4 last:border-b-0">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-xl">{c.name}</div>
                      <div className="text-base text-muted-foreground">{fmt(c.unit_price)}</div>
                      {c.notes && <div className="text-sm italic text-amber-600 mt-1">📝 {c.notes}</div>}
                    </div>
                    <Button size="icon" variant="outline" className="h-12 w-12" onClick={() => decItem(c.uid)}><Minus className="h-6 w-6" /></Button>
                    <Badge variant="secondary" className="text-2xl px-4 py-2 min-w-[3.5rem] justify-center">{c.quantity}</Badge>
                    <Button size="icon" variant="outline" className="h-12 w-12" onClick={() => incItem(c.uid)}><Plus className="h-6 w-6" /></Button>
                    <div className="w-32 text-right font-bold text-xl">{fmt(c.unit_price * c.quantity)}</div>
                    <Button size="icon" variant="ghost" className="h-12 w-12" onClick={() => removeItem(c.uid)}><Trash2 className="h-6 w-6 text-destructive" /></Button>
                  </div>
                ))}
              </div>
              <div className="border-t mt-6 pt-6 flex justify-between text-4xl font-black">
                <span>Total</span>
                <span>{fmt(cartTotal)}</span>
              </div>
            </Card>

            <Card className="p-6 mb-6">
              <label className="text-lg font-semibold block mb-3">CPF na nota (opcional)</label>
              <Input
                value={cpf}
                onChange={e => setCpf(maskCpf(e.target.value))}
                onPointerDown={() => setShowCpfKb(true)}
                onClick={() => setShowCpfKb(true)}
                placeholder="000.000.000-00"
                inputMode="none"
                readOnly
                className="h-16 text-2xl focus-visible:ring-primary"
              />
              {showCpfKb && (
                <div className="mt-4 flex justify-center">
                  <div className="max-w-md w-full">
                    <VirtualKeyboard
                      layout="numeric"
                      onKey={(k) => setCpf(prev => maskCpf((prev || "") + k))}
                      onBackspace={() => setCpf(prev => maskCpf((prev || "").replace(/\D/g, "").slice(0, -1)))}
                      onEnter={() => setShowCpfKb(false)}
                    />
                  </div>
                </div>
              )}
            </Card>

            <Card className="p-6 mb-6 bg-muted">
              <p className="text-lg">
                💳 <strong>Pagamento na maquininha</strong> — siga as instruções no pinpad.
              </p>
            </Card>
            <Button size="lg" className="w-full h-24 text-3xl font-black" onClick={handleConfirmOrder} disabled={busy || cart.length === 0}>
              {busy ? <Loader2 className="animate-spin mr-3 h-8 w-8" /> : <Check className="mr-3 h-8 w-8" />}
              Confirmar e pagar {fmt(cartTotal)}
            </Button>
          </div>
        )}

        {/* STEP 5: senha */}
        {!loading && step === "done" && (
          <div className="h-full flex flex-col items-center justify-center p-8 gap-8 animate-scale-in">
            <div className="text-center print-area">
              <Check className="h-40 w-40 mx-auto text-green-600 mb-6 no-print" />
              <p className="text-5xl font-black mb-3">Pedido confirmado!</p>
              <p className="text-xl text-muted-foreground mb-8">{selectedBrand?.name} · {selectedStore?.name}</p>
              <p className="text-3xl font-semibold">Sua senha</p>
              <div className="text-[16rem] font-black text-primary my-4 leading-none">{pickupCode}</div>
              <p className="text-2xl text-muted-foreground">Pedido #{orderNumber}</p>
              <p className="text-2xl text-muted-foreground">{orderType === "eat_in" ? "Comer aqui" : "Para levar"}</p>
              {cpf && <p className="text-muted-foreground text-lg mt-2">CPF: {cpf}</p>}
              <div className="mt-6 text-left max-w-xs mx-auto print-only">
                {cart.map(c => (
                  <div key={c.uid} className="text-sm">
                    <div className="flex justify-between">
                      <span>{c.quantity}× {c.name}</span><span>{fmt(c.unit_price * c.quantity)}</span>
                    </div>
                    {c.notes && <div className="text-xs italic pl-4">- {c.notes}</div>}
                  </div>
                ))}
                <div className="border-t mt-2 pt-2 flex justify-between font-bold">
                  <span>Total</span><span>{fmt(cartTotal)}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-4 no-print">
              <Button
                size="lg"
                variant="outline"
                onClick={handleEmitNfce}
                disabled={emittingNfce || nfceEmitted || !orderId}
                className="gap-3 h-20 px-10 text-2xl font-bold"
              >
                <Printer className="h-7 w-7" /> {nfceEmitted ? "Cupom fiscal emitido" : emittingNfce ? "Emitindo..." : "Imprimir cupom fiscal"}
              </Button>
              <Button size="lg" onClick={handleReset} className="h-20 px-12 text-2xl font-black">Novo pedido</Button>
            </div>
          </div>
        )}
      </main>

      {/* Dialog de observação ao adicionar item */}
      <Dialog open={!!noteDialog} onOpenChange={(o) => { if (!o) { setNoteDialog(null); setShowNoteKb(false); } }}>
        <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto border-primary/30" style={TOTEM_THEME_STYLE}>
          <DialogHeader>
            <DialogTitle className="text-3xl font-black">{noteDialog?.item.name}</DialogTitle>
          </DialogHeader>
          {noteDialog && (
            <div className="space-y-5">
              {(() => {
                const url = photoUrl(noteDialog.item.photo_path) ?? fakePhotoFor(noteDialog.item, selectedBrand);
                return (
                  <img src={url} alt={noteDialog.item.name} className="w-full aspect-video object-cover rounded-md" />
                );
              })()}
              {noteDialog.item.description && (
                <p className="text-lg text-muted-foreground">{noteDialog.item.description}</p>
              )}
              <div>
                <label className="text-lg font-semibold block mb-3">Observação (opcional)</label>
                <Textarea
                  value={noteDialog.note}
                  onChange={e => setNoteDialog(n => n ? { ...n, note: e.target.value } : n)}
                  onPointerDown={() => setShowNoteKb(true)}
                  onClick={() => setShowNoteKb(true)}
                  placeholder="Ex: sem cebola, ponto da carne, etc."
                  rows={2}
                  readOnly
                  className="text-2xl min-h-[104px] cursor-pointer focus-visible:ring-primary"
                />
                {showNoteKb && (
                  <div className="mt-3">
                    <VirtualKeyboard
                      onKey={(k) => setNoteDialog(n => n ? { ...n, note: (n.note || "") + k.toLowerCase() } : n)}
                      onSpace={() => setNoteDialog(n => n ? { ...n, note: (n.note || "") + " " } : n)}
                      onBackspace={() => setNoteDialog(n => n ? { ...n, note: (n.note || "").slice(0, -1) } : n)}
                      onEnter={() => setShowNoteKb(false)}
                    />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Button size="icon" variant="outline" className="h-16 w-16"
                    onClick={() => setNoteDialog(n => n ? { ...n, qty: Math.max(1, n.qty - 1) } : n)}>
                    <Minus className="h-7 w-7" />
                  </Button>
                  <span className="text-4xl font-black w-16 text-center">{noteDialog.qty}</span>
                  <Button size="icon" variant="outline" className="h-16 w-16"
                    onClick={() => setNoteDialog(n => n ? { ...n, qty: n.qty + 1 } : n)}>
                    <Plus className="h-7 w-7" />
                  </Button>
                </div>
                <div className="text-4xl font-black text-primary">
                  {fmt(Number(noteDialog.item.price) * noteDialog.qty)}
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-3 mt-2">
            <Button variant="outline" className="h-16 px-8 text-xl font-bold border-primary/40 hover:bg-primary/10" onClick={() => setNoteDialog(null)}>Cancelar</Button>
            <Button className="h-16 px-8 text-xl font-bold" onClick={() => {
              if (!noteDialog) return;
              addItem(noteDialog.item, noteDialog.note.trim() || undefined, noteDialog.qty);
              setNoteDialog(null);
            }}>
              <Plus className="mr-2 h-6 w-6" /> Adicionar ao carrinho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body, html { background: white !important; }
        }
        .print-only { display: none; }
      `}</style>

      {/* TEF: pinpad para pagamento */}
      <TefPaymentDialog
        open={tefOpen}
        request={tefOpen ? {
          amount: cartTotal,
          storeId: selectedStore?.id,
        } : null}
        onClose={() => setTefOpen(false)}
        onResult={finalizeOrder}
      />
    </div>
  );
}

function CategoryTile({ label, count, active, onClick }: { label: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-4 rounded-xl font-semibold text-base whitespace-nowrap transition-all flex items-center gap-2 ${
        active
          ? "bg-primary text-primary-foreground shadow-md scale-105"
          : "bg-muted hover:bg-accent"
      }`}
    >
      <span>{label}</span>
      {typeof count === "number" && (
        <span className={`text-xs px-2 py-0.5 rounded-full ${active ? "bg-primary-foreground/20" : "bg-background/60"}`}>
          {count}
        </span>
      )}
    </button>
  );
}
