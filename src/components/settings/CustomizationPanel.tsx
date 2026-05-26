import { useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Moon, Sun, Upload, RotateCcw, Palette, Type, Layout, Globe, Loader2 } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";


const PRESET_COLORS: { name: string; hsl: string }[] = [
  { name: "Azul (padrão)", hsl: "222 78% 42%" },
  { name: "Índigo", hsl: "243 75% 55%" },
  { name: "Roxo", hsl: "270 70% 50%" },
  { name: "Rosa", hsl: "330 81% 55%" },
  { name: "Vermelho", hsl: "0 75% 50%" },
  { name: "Laranja", hsl: "25 95% 53%" },
  { name: "Verde", hsl: "142 71% 38%" },
  { name: "Teal", hsl: "175 75% 38%" },
  { name: "Cinza", hsl: "215 16% 35%" },
];

const PRESET_BG: { name: string; hsl: string }[] = [
  { name: "Padrão", hsl: "210 40% 98%" },
  { name: "Cinza claro", hsl: "0 0% 96%" },
  { name: "Bege", hsl: "40 30% 96%" },
  { name: "Azul claro", hsl: "210 60% 97%" },
  { name: "Verde claro", hsl: "140 30% 97%" },
  { name: "Branco puro", hsl: "0 0% 100%" },
];

const PRESET_SIDEBAR: { name: string; hsl: string }[] = [
  { name: "Escuro (padrão)", hsl: "222 47% 11%" },
  { name: "Preto", hsl: "0 0% 8%" },
  { name: "Azul escuro", hsl: "222 70% 15%" },
  { name: "Verde escuro", hsl: "150 40% 12%" },
  { name: "Roxo escuro", hsl: "270 40% 15%" },
  { name: "Cinza grafite", hsl: "215 15% 18%" },
];

const FONT_OPTIONS = [
  "Inter",
  "Roboto",
  "Poppins",
  "Open Sans",
  "Montserrat",
  "Lato",
  "Nunito",
  "system-ui",
];

const RADIUS_OPTIONS = [
  { label: "Quadrado", value: "0rem" },
  { label: "Sutil", value: "0.25rem" },
  { label: "Padrão", value: "0.6rem" },
  { label: "Arredondado", value: "1rem" },
  { label: "Pílula", value: "1.5rem" },
];

const hslToHex = (hsl: string): string => {
  const m = hsl.match(/(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/);
  if (!m) return "#3b82f6";
  const h = parseFloat(m[1]) / 360, s = parseFloat(m[2]) / 100, l = parseFloat(m[3]) / 100;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  let r: number, g: number, b: number;
  if (s === 0) r = g = b = l;
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1/3);
  }
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const hexToHsl = (hex: string): string => {
  const v = hex.replace("#", "");
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};

const ColorPickerRow = ({ label, value, onChange }: { label: string; value: string; onChange: (hsl: string) => void }) => (
  <div className="flex items-center gap-3">
    <Label className="shrink-0 w-32 text-sm">{label}</Label>
    <Input
      type="color"
      value={hslToHex(value)}
      onChange={(e) => onChange(hexToHsl(e.target.value))}
      className="h-10 w-16 p-1 cursor-pointer"
    />
    <code className="text-xs text-muted-foreground truncate">hsl({value})</code>
  </div>
);

const PresetGrid = ({ presets, current, onPick }: { presets: { name: string; hsl: string }[]; current: string; onPick: (hsl: string) => void }) => (
  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
    {presets.map((c) => (
      <button
        key={c.hsl}
        type="button"
        onClick={() => onPick(c.hsl)}
        className={`h-10 rounded-md border-2 transition-all ${current === c.hsl ? "border-foreground scale-105" : "border-border"}`}
        style={{ backgroundColor: `hsl(${c.hsl})` }}
        title={c.name}
        aria-label={c.name}
      />
    ))}
  </div>
);

const CustomizationPanel = () => {
  const t = useTheme();
  const { isAdmin } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [resettingGlobal, setResettingGlobal] = useState(false);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 500_000) {
      toast({ title: "Logo muito grande", description: "Selecione uma imagem com menos de 500KB.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      t.setLogoUrl(reader.result as string);
      toast({ title: "Logo atualizado" });
    };
    reader.readAsDataURL(f);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl md:text-2xl font-bold">Personalização</h2>
        <p className="text-muted-foreground text-sm">Ajuste cores, tipografia, layout e logo do sistema.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t.mode === "dark" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            Modo escuro
          </CardTitle>
          <CardDescription>Alterne entre tema claro e escuro.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <Label htmlFor="dark-mode">Ativar modo escuro</Label>
            <Switch id="dark-mode" checked={t.mode === "dark"} onCheckedChange={(v) => t.setMode(v ? "dark" : "light")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Palette className="h-5 w-5" /> Cores</CardTitle>
          <CardDescription>Personalize as cores principais do sistema.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Cor principal</Label>
            <PresetGrid presets={PRESET_COLORS} current={t.primary} onPick={t.setPrimary} />
            <ColorPickerRow label="Personalizada" value={t.primary} onChange={t.setPrimary} />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Cor de destaque (accent)</Label>
            <PresetGrid presets={PRESET_COLORS} current={t.accent} onPick={t.setAccent} />
            <ColorPickerRow label="Personalizada" value={t.accent} onChange={t.setAccent} />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Fundo do sistema (modo claro)</Label>
            <PresetGrid presets={PRESET_BG} current={t.background} onPick={t.setBackground} />
            <ColorPickerRow label="Personalizado" value={t.background} onChange={t.setBackground} />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Cor do menu lateral</Label>
            <PresetGrid presets={PRESET_SIDEBAR} current={t.sidebarBg} onPick={t.setSidebarBg} />
            <ColorPickerRow label="Personalizada" value={t.sidebarBg} onChange={t.setSidebarBg} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Type className="h-5 w-5" /> Tipografia</CardTitle>
          <CardDescription>Escolha a fonte e o tamanho global.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Fonte</Label>
            <Select value={t.fontFamily} onValueChange={t.setFontFamily}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map((f) => (
                  <SelectItem key={f} value={f}><span style={{ fontFamily: f }}>{f}</span></SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Tamanho do texto</Label>
              <span className="text-xs text-muted-foreground">{Math.round(t.fontScale * 100)}%</span>
            </div>
            <Slider
              value={[t.fontScale]}
              min={0.85}
              max={1.25}
              step={0.05}
              onValueChange={([v]) => t.setFontScale(v)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Layout className="h-5 w-5" /> Layout</CardTitle>
          <CardDescription>Defina o estilo dos cantos arredondados.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {RADIUS_OPTIONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => t.setRadius(r.value)}
                className={`p-3 border-2 transition-all text-xs ${t.radius === r.value ? "border-primary bg-primary/5" : "border-border"}`}
                style={{ borderRadius: r.value }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logotipo</CardTitle>
          <CardDescription>Personalize o logo exibido no menu lateral (PNG/SVG, máx. 500KB).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-lg border bg-muted flex items-center justify-center overflow-hidden">
              <img src={t.logoUrl || "/apple-touch-icon.png"} alt="Preview do logo" className="h-full w-full object-contain" />
            </div>
            <div className="flex flex-col gap-2">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={handleLogoUpload} />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="gap-2">
                <Upload className="h-4 w-4" /> Enviar logo
              </Button>
              {t.logoUrl && (
                <Button variant="ghost" size="sm" onClick={() => t.setLogoUrl(null)}>
                  Remover logo personalizado
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5 text-primary" /> Padrão global do sistema</CardTitle>
            <CardDescription>
              Aplica a personalização atual para <strong>todos os usuários</strong> do sistema. Apenas administradores podem alterar.
              {t.hasGlobalOverride && <span className="block mt-1 text-xs text-primary">✓ Existe um padrão global ativo no momento.</span>}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={async () => {
                setSavingGlobal(true);
                const r = await t.applyAsGlobal();
                setSavingGlobal(false);
                if (r.ok) toast({ title: "Aplicado globalmente", description: "Todos os usuários verão essa personalização." });
                else toast({ title: "Erro ao salvar", description: r.error, variant: "destructive" });
              }}
              disabled={savingGlobal}
              className="gap-2"
            >
              {savingGlobal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
              Aplicar como padrão global
            </Button>
            {t.hasGlobalOverride && (
              <Button
                variant="outline"
                onClick={async () => {
                  setResettingGlobal(true);
                  const r = await t.resetGlobal();
                  setResettingGlobal(false);
                  if (r.ok) toast({ title: "Padrão global removido", description: "Cada usuário voltará à sua personalização local." });
                  else toast({ title: "Erro", description: r.error, variant: "destructive" });
                }}
                disabled={resettingGlobal}
                className="gap-2"
              >
                {resettingGlobal ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Remover padrão global
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Restaurar padrão</CardTitle>
          <CardDescription>Volta todas as personalizações para os valores originais.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => { t.resetCustomization(); toast({ title: "Personalização restaurada" }); }} className="gap-2">
            <RotateCcw className="h-4 w-4" /> Restaurar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default CustomizationPanel;
