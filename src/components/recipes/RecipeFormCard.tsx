import { useEffect, useState } from "react";
import { Loader2, ChefHat, ListPlus, Trash2, Copy, BookOpen, Upload, ImageIcon } from "lucide-react";
import { generateRecipeBookFromRecipe } from "@/lib/recipeBook";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import RecipeIngredientsDialog from "./RecipeIngredientsDialog";
import RecipeYieldCostPanel from "./RecipeYieldCostPanel";
import RecipeMenuItemsSection from "./RecipeMenuItemsSection";

const UNITS = ["UN", "KG", "G", "L", "ML", "CX", "PCT", "FD", "DZ", "MT", "PORCAO"];

interface Product { id: string; name: string; unit: string; category: string | null; }
interface Brand { id: string; name: string; }
interface MenuItemRow { id: string; name: string; }

const isFactoryBrandName = (n: string) => /f[áa]brica|pr[eé]\s*preparo/i.test(n);

// Cores fixas por marca (conforme planilha das abas)
// bg + text com bom contraste
const BRAND_COLORS: { match: RegExp; bg: string; text: string }[] = [
  { match: /pr[eé]\s*preparo|f[aá]brica/i, bg: "#22c55e", text: "#ffffff" }, // verde
  { match: /preparo\s*loja/i,              bg: "#2563eb", text: "#ffffff" }, // azul
  { match: /milanesa/i,                    bg: "#ec4899", text: "#ffffff" }, // magenta
  { match: /massa/i,                       bg: "#facc15", text: "#1f2937" }, // amarelo
  { match: /parmegian/i,                   bg: "#ef4444", text: "#ffffff" }, // vermelho
  { match: /estrogonofe/i,                 bg: "#92400e", text: "#ffffff" }, // marrom
  { match: /\bbox\b/i,                     bg: "#f97316", text: "#ffffff" }, // laranja
];

const colorForBrand = (name: string) => {
  const found = BRAND_COLORS.find((c) => c.match.test(name));
  if (found) return found;
  // fallback: hash simples para gerar tonalidade estável
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return { bg: `hsl(${h} 65% 50%)`, text: "#ffffff" };
};

const emptyForm = {
  name: "",
  output_product_id: "",
  yield_quantity: 1,
  yield_unit: "UN",
  shelf_life_hours: null as number | null,
  is_active: true,
  category: "" as "" | "individual" | "casal" | "familia",
  ncm: "",
  cest: "",
  cfop: "5102",
  origem_mercadoria: 0 as number,
  csosn: "102",
  unidade_comercial: "UN",
  ean: "",
};

const CATEGORY_LABEL: Record<string, string> = {
  individual: "Individual",
  casal: "Casal",
  familia: "Família",
};

const CATEGORY_COLOR: Record<string, { bg: string; text: string }> = {
  individual: { bg: "#0ea5e9", text: "#ffffff" },
  casal: { bg: "#a855f7", text: "#ffffff" },
  familia: { bg: "#f59e0b", text: "#1f2937" },
};

interface Props {
  recipeId: string | null;
  defaultOpen?: boolean;
  initialBrandId?: string | null;
  onSaved?: (newId?: string) => void;
  onCancelNew?: () => void;
  onDeleted?: () => void;
  onDuplicated?: (newId: string) => void;
}

const RecipeFormCard = ({ recipeId, defaultOpen, initialBrandId, onSaved, onCancelNew, onDeleted, onDuplicated }: Props) => {
  const { user } = useAuth();
  const isNew = !recipeId;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  const [form, setForm] = useState(emptyForm);
  const [menuItems, setMenuItems] = useState<MenuItemRow[]>([]);
  const [linkedMenuItemId, setLinkedMenuItemId] = useState<string>("");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [openValue, setOpenValue] = useState<string | undefined>(defaultOpen ? "open" : undefined);
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  const [generatingBook, setGeneratingBook] = useState(false);

  const isFactory = brands.some((b) => selectedBrands.has(b.id) && isFactoryBrandName(b.name));

  const photoUrl = photoPath
    ? supabase.storage.from("recipe-photos").getPublicUrl(photoPath).data.publicUrl
    : null;

  const handlePhotoUpload = async (file: File) => {
    if (!recipeId) {
      toast.error("Salve a ficha antes de enviar a foto");
      return;
    }
    setUploadingPhoto(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${recipeId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("recipe-photos")
        .upload(path, file, { upsert: false, contentType: file.type || "image/jpeg" });
      if (upErr) throw upErr;
      if (photoPath) {
        await supabase.storage.from("recipe-photos").remove([photoPath]);
      }
      const { error: updErr } = await supabase.from("recipes").update({ photo_path: path }).eq("id", recipeId);
      if (updErr) throw updErr;
      setPhotoPath(path);
      toast.success("Foto atualizada");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar foto");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handlePhotoRemove = async () => {
    if (!recipeId || !photoPath) return;
    await supabase.storage.from("recipe-photos").remove([photoPath]);
    await supabase.from("recipes").update({ photo_path: null }).eq("id", recipeId);
    setPhotoPath(null);
  };

  const handleGenerateBook = async () => {
    if (!recipeId) return;
    setGeneratingBook(true);
    try {
      await generateRecipeBookFromRecipe(recipeId);
      toast.success("Receituário gerado");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao gerar receituário");
    } finally {
      setGeneratingBook(false);
    }
  };

  useEffect(() => {
    void supabase
      .from("inventory_products")
      .select("id, name, unit, category")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setProducts((data as Product[]) ?? []));
    void supabase
      .from("brands")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => setBrands((data as Brand[]) ?? []));
    void supabase
      .from("menu_items")
      .select("id, name")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setMenuItems((data as MenuItemRow[]) ?? []));
  }, []);

  useEffect(() => {
    if (!recipeId) {
      setForm(emptyForm);
      setPhotoPath(null);
      setSelectedBrands(initialBrandId ? new Set([initialBrandId]) : new Set());
      setLinkedMenuItemId("");
      return;
    }
    setLoading(true);
    Promise.all([
      supabase.from("recipes").select("*").eq("id", recipeId).maybeSingle(),
      supabase.from("recipe_brands").select("brand_id").eq("recipe_id", recipeId),
      supabase.from("menu_items").select("id").eq("recipe_id", recipeId).limit(1),
    ]).then(([{ data: r }, { data: rb }, { data: mi }]) => {
      if (r) {
        setForm({
          name: r.name,
          output_product_id: r.output_product_id ?? "",
          yield_quantity: Number(r.yield_quantity),
          yield_unit: r.yield_unit,
          shelf_life_hours: r.shelf_life_hours,
          is_active: r.is_active,
          category: ((r as any).category ?? "") as "" | "individual" | "casal" | "familia",
          ncm: (r as any).ncm ?? "",
          cest: (r as any).cest ?? "",
          cfop: (r as any).cfop ?? "5102",
          origem_mercadoria: (r as any).origem_mercadoria ?? 0,
          csosn: (r as any).csosn ?? "102",
          unidade_comercial: (r as any).unidade_comercial ?? "UN",
          ean: (r as any).ean ?? "",
        });
        setPhotoPath((r as any).photo_path ?? null);
      }
      setSelectedBrands(new Set((rb ?? []).map((x: any) => x.brand_id)));
      setLinkedMenuItemId(((mi ?? [])[0] as any)?.id ?? "");
      setLoading(false);
    });
  }, [recipeId, initialBrandId]);

  const toggleBrand = (id: string) => {
    setSelectedBrands((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const syncBrands = async (rid: string) => {
    await supabase.from("recipe_brands").delete().eq("recipe_id", rid);
    if (selectedBrands.size > 0) {
      const rows = Array.from(selectedBrands).map((brand_id) => ({ recipe_id: rid, brand_id }));
      await supabase.from("recipe_brands").insert(rows);
    }
  };

  const syncMenuLink = async (rid: string) => {
    // Limpa qualquer item de cardápio antes vinculado a esta ficha
    await supabase
      .from("menu_items")
      .update({ recipe_id: null })
      .eq("recipe_id", rid)
      .neq("id", linkedMenuItemId || "00000000-0000-0000-0000-000000000000");
    if (linkedMenuItemId) {
      await supabase.from("menu_items").update({ recipe_id: rid }).eq("id", linkedMenuItemId);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Informe o nome da ficha"); return; }
    if (isFactory) {
      if (!form.output_product_id) { toast.error("Selecione o produto final"); return; }
    } else {
      if (!linkedMenuItemId) { toast.error("Selecione o item de cardápio"); return; }
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        output_product_id: isFactory ? form.output_product_id : null,
        yield_quantity: form.yield_quantity,
        yield_unit: form.yield_unit,
        shelf_life_hours: form.shelf_life_hours,
        is_active: form.is_active,
        category: form.category || null,
        ncm: form.ncm.trim() || null,
        cest: form.cest.trim() || null,
        cfop: form.cfop.trim() || "5102",
        origem_mercadoria: Number(form.origem_mercadoria) || 0,
        csosn: form.csosn.trim() || "102",
        unidade_comercial: form.unidade_comercial.trim() || "UN",
        ean: form.ean.trim() || null,
      } as any;
      if (recipeId) {
        const { error } = await supabase.from("recipes").update(payload).eq("id", recipeId);
        if (error) throw error;
        await syncBrands(recipeId);
        if (!isFactory) await syncMenuLink(recipeId);
        toast.success("Ficha atualizada");
        onSaved?.();
      } else {
        const { data, error } = await supabase
          .from("recipes")
          .insert({ ...payload, created_by: user?.id })
          .select("id")
          .single();
        if (error) throw error;
        await syncBrands(data.id);
        if (!isFactory) await syncMenuLink(data.id);
        toast.success("Ficha criada");
        onSaved?.(data.id);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async () => {
    if (!recipeId) return;
    setDuplicating(true);
    try {
      // 1. clone recipe row
      const { data: orig, error: e1 } = await supabase
        .from("recipes").select("*").eq("id", recipeId).single();
      if (e1 || !orig) throw e1 ?? new Error("Ficha não encontrada");
      const { id: _omit, created_at: _c, updated_at: _u, ...rest } = orig as any;
      const { data: newRec, error: e2 } = await supabase
        .from("recipes")
        .insert({ ...rest, name: `${orig.name} (cópia)`, created_by: user?.id })
        .select("id").single();
      if (e2 || !newRec) throw e2 ?? new Error("Falha ao duplicar");

      // 2. clone ingredients
      const { data: ings } = await supabase
        .from("recipe_ingredients").select("*").eq("recipe_id", recipeId);
      if (ings && ings.length) {
        const rows = ings.map((i: any) => {
          const { id, recipe_id, created_at, updated_at, ...r } = i;
          return { ...r, recipe_id: newRec.id };
        });
        await supabase.from("recipe_ingredients").insert(rows);
      }

      // 3. clone brand links
      const { data: rb } = await supabase
        .from("recipe_brands").select("brand_id").eq("recipe_id", recipeId);
      if (rb && rb.length) {
        await supabase.from("recipe_brands").insert(
          rb.map((x: any) => ({ recipe_id: newRec.id, brand_id: x.brand_id }))
        );
      }

      toast.success("Ficha duplicada");
      onDuplicated?.(newRec.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao duplicar");
    } finally {
      setDuplicating(false);
    }
  };

  const handleDelete = async () => {
    if (!recipeId) return;
    const { error } = await supabase.from("recipes").delete().eq("id", recipeId);
    if (error) { toast.error(error.message); return; }
    toast.success("Ficha excluída");
    onDeleted?.();
  };

  const productLabel = products.find((p) => p.id === form.output_product_id)?.name;
  const brandLabels = brands.filter((b) => selectedBrands.has(b.id)).map((b) => b.name);

  return (
    <>
      <Accordion type="single" collapsible value={openValue} onValueChange={setOpenValue} className="border rounded-md bg-card">
        <AccordionItem value="open" className="border-b-0">
          <AccordionTrigger className="px-3 py-10 hover:no-underline">
            <div className="flex flex-col gap-3 flex-1 min-w-0 text-left w-full h-full">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <ChefHat className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground shrink-0" />
                <span className="text-xl sm:text-2xl font-semibold truncate flex-1">
                  {form.name || (isNew ? "Nova ficha técnica" : "—")}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {form.category && (
                  <Badge
                    className="text-[10px] px-1.5 py-0 border-transparent"
                    style={{
                      backgroundColor: CATEGORY_COLOR[form.category].bg,
                      color: CATEGORY_COLOR[form.category].text,
                    }}
                  >
                    {CATEGORY_LABEL[form.category]}
                  </Badge>
                )}
                {brandLabels.slice(0, 3).map((b) => {
                  const c = colorForBrand(b);
                  return (
                    <Badge
                      key={b}
                      className="text-[10px] px-1.5 py-0 border-transparent hover:opacity-90"
                      style={{ backgroundColor: c.bg, color: c.text }}
                    >
                      {b}
                    </Badge>
                  );
                })}
                {brandLabels.length > 3 && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{brandLabels.length - 3}</Badge>
                )}
                {!form.is_active && <Badge variant="outline" className="text-[10px]">Inativa</Badge>}
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-3">
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Foto do prato</Label>
                  <div className="flex items-center gap-3">
                    {photoUrl ? (
                      <img src={photoUrl} alt={form.name} className="h-20 w-20 rounded object-cover border" />
                    ) : (
                      <div className="h-20 w-20 rounded border bg-muted flex items-center justify-center text-muted-foreground">
                        <ImageIcon className="h-6 w-6" />
                      </div>
                    )}
                    <div className="flex flex-col gap-1.5">
                      <label>
                        <Button asChild size="sm" variant="outline" disabled={uploadingPhoto || isNew}>
                          <span className="cursor-pointer gap-1">
                            {uploadingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                            {photoPath ? "Trocar foto" : "Enviar foto"}
                          </span>
                        </Button>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void handlePhotoUpload(f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      {photoPath && !isNew && (
                        <Button size="sm" variant="ghost" className="text-destructive gap-1" onClick={handlePhotoRemove}>
                          <Trash2 className="h-4 w-4" /> Remover
                        </Button>
                      )}
                      {isNew && (
                        <p className="text-[11px] text-muted-foreground">Salve a ficha para enviar uma foto.</p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Nome *</Label>
                  <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Produto final (que será adicionado ao estoque) *</Label>
                  <Select value={form.output_product_id} onValueChange={(v) => setForm((f) => ({ ...f, output_product_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                    <SelectContent>
                      {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.unit})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label>Rendimento *</Label>
                    <Input type="number" step="0.01" min="0.01" value={form.yield_quantity}
                      onChange={(e) => setForm((f) => ({ ...f, yield_quantity: Number(e.target.value) }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Unidade</Label>
                    <Select value={form.yield_unit} onValueChange={(v) => setForm((f) => ({ ...f, yield_unit: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Validade (dias)</Label>
                    <Input type="number" min="0"
                      value={form.shelf_life_hours != null ? Math.round(form.shelf_life_hours / 24) : ""}
                      onChange={(e) => setForm((f) => ({
                        ...f, shelf_life_hours: e.target.value ? Number(e.target.value) * 24 : null,
                      }))} />
                  </div>
                </div>

                {recipeId && <RecipeYieldCostPanel recipeId={recipeId} />}

                <div className="space-y-1">
                  <Label>Categoria</Label>
                  <Select
                    value={form.category || "__none"}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        category: (v === "__none" ? "" : v) as typeof f.category,
                      }))
                    }
                  >
                    <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Sem categoria</SelectItem>
                      <SelectItem value="individual">Individual</SelectItem>
                      <SelectItem value="casal">Casal</SelectItem>
                      <SelectItem value="familia">Família</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Accordion type="single" collapsible className="border rounded-md">
                  <AccordionItem value="fiscal" className="border-b-0">
                    <AccordionTrigger className="px-3 py-2 text-sm hover:no-underline">
                      Dados fiscais (NFC-e)
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3 space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">NCM *</Label>
                          <Input
                            value={form.ncm}
                            maxLength={8}
                            placeholder="21069090"
                            inputMode="numeric"
                            onChange={(e) => setForm((f) => ({ ...f, ncm: e.target.value.replace(/\D/g, "") }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">CEST</Label>
                          <Input
                            value={form.cest}
                            maxLength={7}
                            placeholder="opcional"
                            inputMode="numeric"
                            onChange={(e) => setForm((f) => ({ ...f, cest: e.target.value.replace(/\D/g, "") }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">CFOP *</Label>
                          <Input
                            value={form.cfop}
                            maxLength={4}
                            inputMode="numeric"
                            onChange={(e) => setForm((f) => ({ ...f, cfop: e.target.value.replace(/\D/g, "") }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">CSOSN *</Label>
                          <Select value={form.csosn} onValueChange={(v) => setForm((f) => ({ ...f, csosn: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="101">101 - Tributada Simples c/ crédito</SelectItem>
                              <SelectItem value="102">102 - Tributada Simples s/ crédito</SelectItem>
                              <SelectItem value="103">103 - Isenção (faixa receita bruta)</SelectItem>
                              <SelectItem value="201">201 - Tributada c/ ST e crédito</SelectItem>
                              <SelectItem value="202">202 - Tributada c/ ST s/ crédito</SelectItem>
                              <SelectItem value="203">203 - Isenção c/ ST</SelectItem>
                              <SelectItem value="300">300 - Imune</SelectItem>
                              <SelectItem value="400">400 - Não tributada</SelectItem>
                              <SelectItem value="500">500 - ICMS já cobrado por ST</SelectItem>
                              <SelectItem value="900">900 - Outros</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Origem</Label>
                          <Select
                            value={String(form.origem_mercadoria)}
                            onValueChange={(v) => setForm((f) => ({ ...f, origem_mercadoria: Number(v) }))}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">0 - Nacional</SelectItem>
                              <SelectItem value="1">1 - Estrangeira (importação direta)</SelectItem>
                              <SelectItem value="2">2 - Estrangeira (mercado interno)</SelectItem>
                              <SelectItem value="3">3 - Nacional, conteúdo &gt; 40% importado</SelectItem>
                              <SelectItem value="4">4 - Nacional, processos básicos</SelectItem>
                              <SelectItem value="5">5 - Nacional, conteúdo ≤ 40% importado</SelectItem>
                              <SelectItem value="6">6 - Estrangeira (importação direta, sem similar)</SelectItem>
                              <SelectItem value="7">7 - Estrangeira (mercado interno, sem similar)</SelectItem>
                              <SelectItem value="8">8 - Nacional, conteúdo &gt; 70% importado</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Unidade comercial</Label>
                          <Select value={form.unidade_comercial} onValueChange={(v) => setForm((f) => ({ ...f, unidade_comercial: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1 col-span-2 sm:col-span-3">
                          <Label className="text-xs">EAN / GTIN</Label>
                          <Input
                            value={form.ean}
                            maxLength={14}
                            placeholder="código de barras (opcional)"
                            inputMode="numeric"
                            onChange={(e) => setForm((f) => ({ ...f, ean: e.target.value.replace(/\D/g, "") }))}
                          />
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        NCM e CFOP são obrigatórios para emitir NFC-e. CSOSN padrão <strong>102</strong> (Simples sem crédito).
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                <div className="space-y-1.5">
                  <Label>Marcas que usam esta ficha</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {brands.map((b) => {
                      const active = selectedBrands.has(b.id);
                      const c = colorForBrand(b.name);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => toggleBrand(b.id)}
                          className={`text-xs px-2.5 py-1 rounded-full border transition ${
                            active
                              ? "border-transparent shadow-sm"
                              : "bg-background text-muted-foreground border-border hover:bg-muted"
                          }`}
                          style={
                            active ? { backgroundColor: c.bg, color: c.text } : undefined
                          }
                        >
                          {b.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {!isNew && recipeId && (
                  <RecipeMenuItemsSection recipeId={recipeId} />
                )}

                {!isNew && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto gap-2"
                    onClick={() => setIngredientsOpen(true)}
                  >
                    <ListPlus className="h-4 w-4" /> Ingredientes / Embalagens
                  </Button>
                )}

                <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t">
                  <div className="flex items-center gap-2">
                    <Switch checked={form.is_active}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
                    <Label className="text-xs">Ativa</Label>
                  </div>
                  <div className="flex items-center gap-2 justify-end flex-wrap">
                    {!isNew && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        onClick={handleDuplicate}
                        disabled={duplicating}
                      >
                        {duplicating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                        Duplicar
                      </Button>
                    )}
                    {!isNew && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-destructive gap-1">
                            <Trash2 className="h-4 w-4" /> Excluir
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir ficha técnica?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação não pode ser desfeita. O histórico de produções existente será preservado.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    {isNew && (
                      <Button variant="outline" size="sm" onClick={onCancelNew}>Cancelar</Button>
                    )}
                    {!isNew && (
                      <Button variant="outline" size="sm" onClick={handleGenerateBook} disabled={generatingBook} className="gap-1">
                        {generatingBook ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
                        Gerar receituário
                      </Button>
                    )}
                    <Button size="sm" onClick={handleSave} disabled={saving || loading}>
                      {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Salvar ficha
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {recipeId && (
        <RecipeIngredientsDialog
          open={ingredientsOpen}
          onOpenChange={setIngredientsOpen}
          recipeId={recipeId}
          recipeName={form.name}
          yieldQuantity={form.yield_quantity}
          yieldUnit={form.yield_unit}
        />
      )}
    </>
  );
};

export default RecipeFormCard;
