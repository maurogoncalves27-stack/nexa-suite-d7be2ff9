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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Minus, Trash2, ShoppingCart, ArrowLeft, Printer, Check, X, Timer, Hand, CreditCard, QrCode, Utensils, ShoppingBag } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { TefPaymentDialog } from "@/components/tef/TefPaymentDialog";
import { VirtualKeyboard } from "@/components/totem/VirtualKeyboard";
import type { TefPaymentResult, TefPaymentMethod } from "@/lib/tef";
import { loadTefConfig } from "@/lib/tef";
import { closeOrder, createTotemOrderAndClose } from "@/lib/order";
import { loadItemComplements, loadMenuCatalog, type CatalogComplementGroup, type SelectedComplement } from "@/lib/menuCatalog";
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
interface Store {
  id: string; name: string; brand_id: string | null; parent_store_id?: string | null;
  totem_allow_order_type?: boolean | null;
  parent_store?: { name: string; totem_allow_order_type?: boolean | null } | null;
}
interface Category { id: string; name: string; sort_order: number; brand_id: string | null }
interface MenuItem {
  id: string; name: string; description: string | null; price: number;
  category_id: string | null; photo_path: string | null;
  recipe_id?: string | null; photo_url?: string | null;
}
interface CartItem {
  uid: string; menu_item_id: string; name: string; unit_price: number;
  quantity: number; notes?: string; complements: SelectedComplement[];
}

const IDLE_TIMEOUT_MS = 60_000; // 60s sem toque → reset
const PHOTO_BUCKET = "menu-photos";
const DEFAULT_TOTEM_STORE = "asa sul";

// Mapeia email do login de totem → loja física
const TOTEM_LOGIN_STORE_MAP: Record<string, string> = {
  "totemas@aquelaparme.com.br": "asa sul",
  "toteman@aquelaparme.com.br": "114 norte",
  "totemls@aquelaparme.com.br": "lago sul",
  "totemac@aquelaparme.com.br": "aguas claras",
};

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
  const [currentTotemStore, setCurrentTotemStore] = useState<string>(DEFAULT_TOTEM_STORE);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email?.toLowerCase();
      const meta = data.user?.user_metadata as { totem_store?: string } | undefined;
      const fromMeta = meta?.totem_store;
      const fromEmail = email ? TOTEM_LOGIN_STORE_MAP[email] : undefined;
      if (fromMeta) setCurrentTotemStore(fromMeta);
      else if (fromEmail) setCurrentTotemStore(fromEmail);
    });
  }, []);
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
  const [doneCountdown, setDoneCountdown] = useState<number | null>(null);
  const [cpf, setCpf] = useState("");
  const [noteDialog, setNoteDialog] = useState<{
    item: MenuItem; note: string; qty: number; groups: CatalogComplementGroup[];
    selected: Record<string, string[]>; loadingComplements: boolean;
  } | null>(null);
  const [tefOpen, setTefOpen] = useState(false);
  // Enquanto o modal de pagamento (PIX/cartão) está aberto, o app de TEF externo
  // pode roubar o foco e revelar a barra de tarefas do Windows. Reafirmamos o kiosk.
  useEffect(() => {
    if (!tefOpen) return;
    const reassert = () => { void (window as any).electron?.reassertKiosk?.(); };
    reassert();
    const id = setInterval(reassert, 1500);
    return () => { clearInterval(id); reassert(); };
  }, [tefOpen]);

  // Após finalizar a venda (impressão do cupom/NFC-e), o spooler/visualizador do
  // Windows pode roubar o foco e revelar a barra de tarefas. Reafirmamos o kiosk.
  useEffect(() => {
    if (step !== "done") return;
    const reassert = () => { void (window as any).electron?.reassertKiosk?.(); };
    reassert();
    const id = setInterval(reassert, 1500);
    return () => { clearInterval(id); reassert(); };
  }, [step]);




  const [paymentMethod, setPaymentMethod] = useState<TefPaymentMethod | null>(null);
  const [showNoteKb, setShowNoteKb] = useState(false);
  const [showCpfKb, setShowCpfKb] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [customBackgrounds, setCustomBackgrounds] = useState<string[]>([]);
  const [customVideo, setCustomVideo] = useState<string | null>(null);
  const [customLogos, setCustomLogos] = useState<Record<string, string>>({});


  // ----- carregar marcas/lojas + assets do totem
  useEffect(() => {
    void (async () => {
      const [b, s, ta] = await Promise.all([
        supabase.from("brands").select("id,name,slug").eq("is_active", true).not("name", "ilike", "%CD%").not("name", "ilike", "%fabrica%").order("sort_order"),
        supabase.from("stores").select("id,name,brand_id,parent_store_id,totem_allow_order_type,parent_store:parent_store_id(name,totem_allow_order_type)").order("name"),
        (supabase as any).from("totem_assets").select("kind,brand_slug,image_url,sort_order,is_active").eq("is_active", true).order("sort_order"),
      ]);
      setBrands(((b.data ?? []) as Brand[]).filter(x => !/f[áa]brica/i.test(x.name)));
      setStores((s.data ?? []) as Store[]);
      const assets = (ta.data ?? []) as Array<{ kind: string; brand_slug: string | null; image_url: string }>;
      setCustomBackgrounds(assets.filter(a => a.kind === "background").map(a => a.image_url));
      setCustomVideo(assets.find(a => a.kind === "video")?.image_url ?? null);

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
      try {
        const physicalStoreId = selectedStore.parent_store_id ?? selectedStore.id;
        const catalog = await loadMenuCatalog(physicalStoreId, selectedBrand.id);
        setCategories(catalog.categories as Category[]);
        setItems(catalog.items as MenuItem[]);
      } catch (error) {
        console.error(error);
        toast({ title: "Não foi possível carregar o cardápio", variant: "destructive" });
      } finally {
        setLoading(false);
      }
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

  // Após o cupom ser emitido, volta sozinho para a tela inicial em 60s
  useEffect(() => {
    if (step !== "done" || !nfceEmitted) { setDoneCountdown(null); return; }
    setDoneCountdown(60);
    const id = window.setInterval(() => {
      setDoneCountdown((s) => {
        if (s === null) return null;
        if (s <= 1) { window.clearInterval(id); handleReset(); return null; }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [step, nfceEmitted, handleReset]);



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
    // prefere virtual cujo parent bate; senão a própria física com o nome certo; fallback: primeira virtual; depois primeira qualquer
    const matchTotem = (s: Store) =>
      normalize(`${s.name} ${s.parent_store?.name ?? ""}`).includes(currentTotemStore);
    const virtuals = brandStores.filter((s) => !!s.parent_store_id);
    const physicals = brandStores.filter((s) => !s.parent_store_id);
    return (
      virtuals.find(matchTotem) ??
      physicals.find(matchTotem) ??
      virtuals[0] ??
      physicals[0] ??
      null
    );
  }, [stores, currentTotemStore]);

  /** A loja permite o cliente escolher entre comer no local e retirar? (config em Configurações → Totem) */
  const storeAllowsOrderType = useCallback((store: Store) =>
    Boolean(store.totem_allow_order_type ?? store.parent_store?.totem_allow_order_type ?? false),
  []);


  const filteredItems = useMemo(() => items.filter(it => {
    if (activeCat !== "all" && it.category_id !== activeCat) return false;
    if (search && !it.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [items, activeCat, search]);

  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);
  const cartTotal = cart.reduce((s, c) => s + c.unit_price * c.quantity, 0);
  const tefStoreId = selectedStore?.parent_store_id ?? selectedStore?.id;

  const openItem = async (it: MenuItem) => {
    setNoteDialog({ item: it, note: "", qty: 1, groups: [], selected: {}, loadingComplements: true });
    try {
      const groups = await loadItemComplements(it.id);
      setNoteDialog((current) => current?.item.id === it.id ? { ...current, groups, loadingComplements: false } : current);
    } catch (error) {
      console.error(error);
      setNoteDialog((current) => current?.item.id === it.id ? { ...current, loadingComplements: false } : current);
      toast({ title: "Não foi possível carregar os complementos", variant: "destructive" });
    }
  };

  const toggleComplement = (group: CatalogComplementGroup, optionId: string) => {
    setNoteDialog((current) => {
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

  const selectedComplements = (dialog: NonNullable<typeof noteDialog>): SelectedComplement[] =>
    dialog.groups.flatMap((group) => (dialog.selected[group.id] ?? []).flatMap((optionId) => {
      const option = group.options.find((candidate) => candidate.id === optionId);
      return option ? [{
        group_id: group.id, group_name: group.name, option_id: option.id,
        option_name: option.name, extra_price: option.extra_price,
      }] : [];
    }));

  const addItem = (it: MenuItem, complements: SelectedComplement[], note?: string, qty: number = 1) => {
    beep(880, 80);
    const unitPrice = Number(it.price) + complements.reduce((sum, complement) => sum + complement.extra_price, 0);
    const signature = complements.map((complement) => complement.option_id).sort().join("|");
    setCart(prev => {
      const ex = prev.find(c => c.menu_item_id === it.id && (c.notes || "") === (note || "")
        && c.complements.map((complement) => complement.option_id).sort().join("|") === signature);
      if (ex) return prev.map(c => c.uid === ex.uid ? { ...c, quantity: c.quantity + qty } : c);
      return [...prev, {
        uid: crypto.randomUUID(), menu_item_id: it.id, name: it.name,
        unit_price: unitPrice, quantity: qty, notes: note || undefined, complements,
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
    if (!paymentMethod) {
      toast({ title: "Escolha a forma de pagamento", variant: "destructive" });
      return;
    }
    // Abre o pinpad. A persistência só acontece se TEF aprovar.
    setTefOpen(true);
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
      const cfg = await loadTefConfig(selectedStore.parent_store_id ?? selectedStore.id);
      const result = await createTotemOrderAndClose({
        storeId: selectedStore.id,
        storeName: selectedStore.name,
        orderType,
        cartTotal,
        cpf,
        cart,
        tef,
        tefProvider: cfg.provider,
      });

      beep(1200, 120);
      setTimeout(() => beep(1600, 160), 130);
      setPickupCode(result.pickupCode);
      setOrderNumber(result.orderNumber);
      setOrderId(result.orderId);
      setNfceEmitted(false);
      setStep("done");
    } catch (e: any) {
      console.error(e);
      toast({ title: "Erro ao registrar pedido", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleEmitNfce = async () => {
    if (!orderId || !selectedStore) return;
    setEmittingNfce(true);
    try {
      const result = await closeOrder({
        orderId,
        storeId: selectedStore.id,
        channel: "totem",
        storeName: selectedStore.name,
        printTargets: ["nfce"],
      });
      if (result.status === "failed_at_step") throw new Error(result.error ?? "Falha no fechamento");
      if (!result.danfeUrl) {
        toast({
          title: "Cupom em processamento",
          description: "A SEFAZ ainda não autorizou a NFC-e. Peça o cupom no balcão.",
          variant: "destructive",
        });
        return;
      }
      setNfceEmitted(true);
      toast({ title: "Cupom fiscal emitido", description: "Retire o cupom na impressora." });
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
                if (step === "type") setStep("store");
                else if (step === "menu") setStep(selectedStore && storeAllowsOrderType(selectedStore) ? "type" : "store");
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
            {/* vídeo de apresentação, se configurado; senão slideshow de imagens */}
            {customVideo ? (
              <video
                src={customVideo}
                autoPlay
                loop
                muted
                playsInline
                aria-hidden
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (() => {
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
                        if (storeAllowsOrderType(store)) {
                          setOrderType(null);
                          setStep("type");
                        } else {
                          setOrderType("takeout");
                          setStep("menu");
                        }
                      } else {
                        toast({
                          title: "Marca sem loja vinculada",
                          description: `Nenhuma loja virtual da marca "${b.name}" foi encontrada para este totem (${currentTotemStore}). Vincule em Configurações → Lojas.`,
                          variant: "destructive",
                        });
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

        {/* STEP 2: comer no local ou levar (somente lojas configuradas) */}
        {!loading && step === "type" && (
          <div className="h-full flex flex-col items-center justify-center gap-12 p-8 animate-fade-in">
            <h2 className="text-5xl font-bold text-center">Onde você vai comer?</h2>
            <div className="grid grid-cols-2 gap-10 w-full max-w-4xl">
              {([
                { type: "eat_in" as OrderType, label: "Comer no local", icon: Utensils },
                { type: "takeout" as OrderType, label: "Para levar", icon: ShoppingBag },
              ]).map(({ type, label, icon: Icon }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => { setOrderType(type); setStep("menu"); }}
                  className="flex flex-col items-center justify-center gap-6 rounded-3xl border-4 border-primary/30 bg-card p-12 transition-transform hover:scale-105 active:scale-95"
                >
                  <Icon className="h-28 w-28 text-primary" />
                  <span className="text-4xl font-bold">{label}</span>
                </button>
              ))}
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
                      onClick={() => void openItem(it)}>
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
              <div className="absolute bottom-0 left-0 right-0 bg-primary text-primary-foreground shadow-2xl border-t-8 border-primary-foreground/20 z-20 animate-fade-in">
                <button
                  onClick={() => setStep("checkout")}
                  className="w-full px-8 py-10 flex items-center justify-between gap-6 text-3xl font-bold hover:bg-primary/90 transition-colors"
                >
                  <div className="flex items-center gap-5">
                    <div className="relative">
                      <ShoppingCart className="h-12 w-12" />
                      <span className="absolute -top-2 -right-3 bg-destructive text-destructive-foreground rounded-full h-8 min-w-8 px-2 text-base flex items-center justify-center font-bold">
                        {cartCount}
                      </span>
                    </div>
                    <span className="text-2xl">{cartCount} {cartCount === 1 ? "item" : "itens"} no carrinho</span>
                  </div>
                  <div className="flex items-center gap-5">
                    <span className="text-4xl">{fmt(cartTotal)}</span>
                    <span className="bg-primary-foreground text-primary rounded-xl px-8 py-4 text-2xl">
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
                       {c.complements.length > 0 && (
                         <div className="text-sm text-muted-foreground mt-1">
                           {c.complements.map((complement) => complement.option_name).join(" · ")}
                         </div>
                       )}
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

            <Card className="p-6 mb-6">
              <label className="text-lg font-semibold block mb-4">Forma de pagamento</label>
              <div className="grid grid-cols-3 gap-4">
                {([
                  { method: "credit" as TefPaymentMethod, label: "Crédito", icon: CreditCard },
                  { method: "debit" as TefPaymentMethod, label: "Débito", icon: CreditCard },
                  { method: "pix" as TefPaymentMethod, label: "PIX", icon: QrCode },
                ]).map(({ method, label, icon: Icon }) => {
                  const active = paymentMethod === method;
                  return (
                    <button
                      key={method}
                      onClick={() => setPaymentMethod(method)}
                      className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 p-5 transition-all ${
                        active
                          ? "border-primary bg-primary text-primary-foreground shadow-lg scale-105"
                          : "border-muted bg-muted hover:border-primary/50 hover:bg-accent"
                      }`}
                    >
                      <Icon className="h-10 w-10" />
                      <span className="text-xl font-bold">{label}</span>
                    </button>
                  );
                })}
              </div>
            </Card>
            <Button size="lg" className="w-full h-24 text-3xl font-black" onClick={handleConfirmOrder} disabled={busy || cart.length === 0 || !paymentMethod}>
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
                     {c.complements.map((complement) => (
                       <div key={`${c.uid}-${complement.option_id}`} className="text-xs pl-4">
                         + {complement.option_name}
                       </div>
                     ))}
                  </div>
                ))}
                <div className="border-t mt-2 pt-2 flex justify-between font-bold">
                  <span>Total</span><span>{fmt(cartTotal)}</span>
                </div>
              </div>
            </div>
            <div className="no-print flex flex-col items-center gap-4">
              <p className="text-2xl font-semibold">Deseja o cupom fiscal?</p>
              <div className="flex gap-4">
                <Button
                  size="lg"
                  onClick={handleEmitNfce}
                  disabled={emittingNfce || nfceEmitted || !orderId}
                  className="gap-3 h-20 px-10 text-2xl font-bold"
                >
                  <Printer className="h-7 w-7" /> {nfceEmitted ? "Cupom emitido" : emittingNfce ? "Emitindo..." : "Sim, emitir cupom"}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={handleReset}
                  disabled={emittingNfce}
                  className="h-20 px-12 text-2xl font-black"
                >
                  {nfceEmitted ? "Novo pedido" : "Não, obrigado"}
                </Button>
              </div>
              {doneCountdown !== null && (
                <p className="text-xl text-muted-foreground">
                  Voltando à tela inicial em {doneCountdown}s
                </p>
              )}
            </div>

          </div>
        )}
      </main>

      {/* Dialog de complementos, quantidade e observação ao adicionar item */}
      <Dialog open={!!noteDialog} onOpenChange={(o) => { if (!o) { setNoteDialog(null); setShowNoteKb(false); } }}>
        <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto border-primary/30" style={TOTEM_THEME_STYLE}>
          <DialogHeader>
            <DialogTitle className="text-3xl font-black">{noteDialog?.item.name}</DialogTitle>
            <DialogDescription className="text-base">Personalize o item antes de adicionar.</DialogDescription>
          </DialogHeader>
          {noteDialog && (
            <div className="space-y-5">
              {(() => {
                const url = noteDialog.item.photo_url ?? fakePhotoFor(noteDialog.item, selectedBrand);
                return (
                  <img src={url} alt={noteDialog.item.name} className="w-full aspect-video object-cover rounded-md" />
                );
              })()}
              {noteDialog.item.description && (
                <p className="text-lg text-muted-foreground">{noteDialog.item.description}</p>
              )}
              {noteDialog.loadingComplements ? (
                <div className="flex items-center justify-center gap-3 py-6 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" /> Carregando opções...
                </div>
              ) : noteDialog.groups.map((group) => {
                const selected = noteDialog.selected[group.id] ?? [];
                const minimum = Math.max(group.is_required ? 1 : 0, group.min_choices);
                return (
                  <section key={group.id} className="border rounded-md p-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-bold">{group.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {minimum > 0 ? `Escolha pelo menos ${minimum}` : "Opcional"} · máximo {group.max_choices}
                        </p>
                      </div>
                      {minimum > 0 && <Badge variant={selected.length >= minimum ? "secondary" : "destructive"}>Obrigatório</Badge>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {group.options.map((option) => {
                        const active = selected.includes(option.id);
                        return (
                          <Button key={option.id} type="button" variant={active ? "default" : "outline"}
                            className="h-auto min-h-14 justify-between px-4 py-3 text-left"
                            onClick={() => toggleComplement(group, option.id)}>
                            <span className="flex items-center gap-2"><span>{active ? "✓" : "○"}</span>{option.name}</span>
                            <span>{option.extra_price > 0 ? `+ ${fmt(option.extra_price)}` : "Incluso"}</span>
                          </Button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
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
                  {fmt((Number(noteDialog.item.price) + selectedComplements(noteDialog).reduce((sum, item) => sum + item.extra_price, 0)) * noteDialog.qty)}
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-3 mt-2">
            <Button variant="outline" className="h-16 px-8 text-xl font-bold border-primary/40 hover:bg-primary/10" onClick={() => setNoteDialog(null)}>Cancelar</Button>
            <Button className="h-16 px-8 text-xl font-bold" onClick={() => {
              if (!noteDialog) return;
              for (const group of noteDialog.groups) {
                const minimum = Math.max(group.is_required ? 1 : 0, group.min_choices);
                if ((noteDialog.selected[group.id] ?? []).length < minimum) {
                  toast({ title: `Complete o grupo “${group.name}”`, variant: "destructive" });
                  return;
                }
              }
              addItem(noteDialog.item, selectedComplements(noteDialog), noteDialog.note.trim() || undefined, noteDialog.qty);
              setNoteDialog(null);
            }} disabled={noteDialog?.loadingComplements}>
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
          storeId: tefStoreId,
          method: paymentMethod!,
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
