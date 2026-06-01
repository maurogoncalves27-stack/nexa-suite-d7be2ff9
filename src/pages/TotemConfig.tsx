// Configuração visual do Totem: fundos do atrai + logos por marca.
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Monitor, Trash2, Upload, ImageIcon, ExternalLink } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface Brand { id: string; name: string; slug: string }
interface TotemAsset {
  id: string;
  kind: "background" | "logo";
  brand_slug: string | null;
  image_url: string;
  storage_path: string | null;
  sort_order: number;
  is_active: boolean;
}

const BUCKET = "totem-backgrounds";

export default function TotemConfig() {
  const { user } = useAuth();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [assets, setAssets] = useState<TotemAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingKind, setUploadingKind] = useState<"background" | "logo" | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<string>("");
  const bgInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const [b, a] = await Promise.all([
      supabase.from("brands").select("id,name,slug").eq("is_active", true).order("sort_order"),
      (supabase as any).from("totem_assets").select("*").order("sort_order"),
    ]);
    setBrands(((b.data ?? []) as Brand[]).filter((x) => !/f[áa]brica/i.test(x.name)));
    setAssets((a.data ?? []) as TotemAsset[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const backgrounds = useMemo(() => assets.filter((a) => a.kind === "background"), [assets]);
  const logos = useMemo(() => assets.filter((a) => a.kind === "logo"), [assets]);

  const handleUpload = async (
    file: File,
    kind: "background" | "logo",
    brandSlug: string | null,
  ) => {
    if (kind === "logo" && !brandSlug) {
      toast({ title: "Selecione a marca antes de subir a logo", variant: "destructive" });
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast({ title: "Arquivo precisa ser uma imagem", variant: "destructive" });
      return;
    }
    setUploadingKind(kind);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
      const path = `${kind}/${brandSlug ?? "_geral"}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
      if (up.error) throw up.error;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const { error } = await (supabase as any).from("totem_assets").insert({
        kind,
        brand_slug: brandSlug,
        image_url: pub.publicUrl,
        storage_path: path,
        sort_order: assets.filter((a) => a.kind === kind).length,
        is_active: true,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      toast({ title: "Imagem enviada" });
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao enviar", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setUploadingKind(null);
    }
  };

  const toggleActive = async (a: TotemAsset) => {
    const { error } = await (supabase as any)
      .from("totem_assets")
      .update({ is_active: !a.is_active })
      .eq("id", a.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setAssets((prev) => prev.map((x) => (x.id === a.id ? { ...x, is_active: !a.is_active } : x)));
  };

  const removeAsset = async (a: TotemAsset) => {
    if (!confirm("Remover esta imagem do totem?")) return;
    try {
      if (a.storage_path) {
        await supabase.storage.from(BUCKET).remove([a.storage_path]);
      }
      const { error } = await (supabase as any).from("totem_assets").delete().eq("id", a.id);
      if (error) throw error;
      setAssets((prev) => prev.filter((x) => x.id !== a.id));
      toast({ title: "Imagem removida" });
    } catch (e: any) {
      toast({ title: "Erro ao remover", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Monitor className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            Configuração do Totem
          </h1>
          <p className="text-muted-foreground">
            Personalize as imagens de fundo da tela de atrair e as logos das marcas exibidas no totem.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href="/totem" target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4 mr-1" /> Abrir totem
          </a>
        </Button>
      </div>

      {/* FUNDOS */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">Fundos da tela inicial</h2>
            <p className="text-sm text-muted-foreground">
              Imagens que entram no slideshow do "Toque na tela para começar". Use fotos em alta resolução (mínimo 1920×1080).
            </p>
          </div>
          <input
            ref={bgInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUpload(f, "background", null);
              e.target.value = "";
            }}
          />
          <Button
            onClick={() => bgInputRef.current?.click()}
            disabled={uploadingKind === "background"}
          >
            {uploadingKind === "background" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Enviar fundo
          </Button>
        </div>

        {backgrounds.length === 0 ? (
          <div className="text-sm text-muted-foreground border border-dashed rounded p-6 text-center flex flex-col items-center gap-2">
            <ImageIcon className="h-8 w-8" />
            Nenhum fundo personalizado. O totem está usando as imagens padrão.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {backgrounds.map((a) => (
              <div key={a.id} className="border rounded-md overflow-hidden bg-muted">
                <div className="aspect-video bg-muted relative">
                  <img src={a.image_url} alt="" className="w-full h-full object-cover" />
                  {!a.is_active && (
                    <div className="absolute inset-0 bg-background/70 flex items-center justify-center text-sm font-semibold">
                      Desativada
                    </div>
                  )}
                </div>
                <div className="p-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Switch checked={a.is_active} onCheckedChange={() => toggleActive(a)} />
                    <span className="text-xs text-muted-foreground">
                      {a.is_active ? "Ativa" : "Inativa"}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeAsset(a)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* LOGOS */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">Logos das marcas</h2>
            <p className="text-sm text-muted-foreground">
              Logo exibida no botão de seleção de marca dentro do totem. Use PNG com fundo transparente.
            </p>
          </div>
          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <Label className="text-xs">Marca</Label>
              <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Selecione a marca" />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.slug}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/svg+xml,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUpload(f, "logo", selectedBrand || null);
                e.target.value = "";
              }}
            />
            <Button
              onClick={() => {
                if (!selectedBrand) {
                  toast({ title: "Selecione a marca antes", variant: "destructive" });
                  return;
                }
                logoInputRef.current?.click();
              }}
              disabled={uploadingKind === "logo"}
            >
              {uploadingKind === "logo" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Enviar logo
            </Button>
          </div>
        </div>

        {logos.length === 0 ? (
          <div className="text-sm text-muted-foreground border border-dashed rounded p-6 text-center flex flex-col items-center gap-2">
            <ImageIcon className="h-8 w-8" />
            Nenhuma logo personalizada. O totem está usando as logos padrão.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {logos.map((a) => {
              const brand = brands.find((b) => b.slug === a.brand_slug);
              return (
                <div key={a.id} className="border rounded-md overflow-hidden bg-card">
                  <div className="aspect-square bg-muted flex items-center justify-center p-4 relative">
                    <img src={a.image_url} alt="" className="max-w-full max-h-full object-contain" />
                    {!a.is_active && (
                      <div className="absolute inset-0 bg-background/70 flex items-center justify-center text-sm font-semibold">
                        Desativada
                      </div>
                    )}
                  </div>
                  <div className="p-2 space-y-1">
                    <div className="text-xs font-medium truncate">{brand?.name ?? a.brand_slug ?? "—"}</div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Switch checked={a.is_active} onCheckedChange={() => toggleActive(a)} />
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => removeAsset(a)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
