import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save, Bot, Palette, Plug, Star, MessageCircle, RefreshCw, Trash2, Plus, Settings, Copy, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type SettingsKey = "branding" | "agent" | "reservations" | "google_places";

async function loadSetting<T>(key: SettingsKey, fallback: T): Promise<T> {
  const { data } = await supabase
    .from("parme_site_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return ((data?.value as T) ?? fallback) as T;
}

async function saveSetting(key: SettingsKey, value: unknown) {
  const { error } = await supabase
    .from("parme_site_settings")
    .upsert({ key, value: value as any, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
}

/* ============================================================ */
/* Personalizar (branding + hero)                                */
/* ============================================================ */

type Branding = {
  brandName?: string;
  tagline?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  logoUrl?: string;
  primaryColor?: string;
  whatsappPublic?: string;
  instagramUrl?: string;
};

export function PersonalizePanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<Branding>({});

  useEffect(() => {
    void (async () => {
      try {
        setData(await loadSetting<Branding>("branding", {}));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await saveSetting("branding", data);
      toast.success("Personalização salva");
    } catch (e: any) {
      toast.error("Erro ao salvar", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const set = <K extends keyof Branding>(k: K, v: Branding[K]) => setData((d) => ({ ...d, [k]: v }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Palette className="h-4 w-4 text-primary" />Marca</CardTitle>
          <CardDescription>Identidade visual exibida no site público.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome da marca</Label>
            <Input value={data.brandName ?? ""} onChange={(e) => set("brandName", e.target.value)} placeholder="Aquela Parmê" />
          </div>
          <div className="space-y-1.5">
            <Label>Slogan</Label>
            <Input value={data.tagline ?? ""} onChange={(e) => set("tagline", e.target.value)} placeholder="O parmegiana mais querido de Brasília" />
          </div>
          <div className="space-y-1.5">
            <Label>Logo (URL)</Label>
            <Input value={data.logoUrl ?? ""} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-1.5">
            <Label>Cor primária</Label>
            <div className="flex gap-2">
              <Input type="color" value={data.primaryColor ?? "#c0392b"} onChange={(e) => set("primaryColor", e.target.value)} className="w-16 h-10 p-1" />
              <Input value={data.primaryColor ?? ""} onChange={(e) => set("primaryColor", e.target.value)} placeholder="#c0392b" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hero & contatos</CardTitle>
          <CardDescription>Textos do topo da home e links sociais.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Título principal (hero)</Label>
            <Input value={data.heroTitle ?? ""} onChange={(e) => set("heroTitle", e.target.value)} placeholder="O parmegiana de Brasília" />
          </div>
          <div className="space-y-1.5">
            <Label>Subtítulo</Label>
            <Textarea rows={2} value={data.heroSubtitle ?? ""} onChange={(e) => set("heroSubtitle", e.target.value)} placeholder="Quatro endereços, três marcas, um só parmegiana." />
          </div>
          <div className="space-y-1.5">
            <Label>WhatsApp (público)</Label>
            <Input value={data.whatsappPublic ?? ""} onChange={(e) => set("whatsappPublic", e.target.value)} placeholder="556199999999" />
          </div>
          <div className="space-y-1.5">
            <Label>Instagram (URL)</Label>
            <Input value={data.instagramUrl ?? ""} onChange={(e) => set("instagramUrl", e.target.value)} placeholder="https://instagram.com/aquelaparme" />
          </div>
        </CardContent>
      </Card>

      <div className="lg:col-span-2 flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar personalização
        </Button>
      </div>
    </div>
  );
}

/* ============================================================ */
/* Agente IA (system prompt da Giana)                            */
/* ============================================================ */

const DEFAULT_PROMPT = `Você é a Giana, atendente virtual da Aquela Parmê (Brasília-DF).
Seja simpática, breve e objetiva. Sempre em português do Brasil.
Use as ferramentas disponíveis para consultar cardápio, recomendar pratos, criar reservas, registrar problemas de pedido e sugerir o iFood quando o cliente quiser pedir delivery.`;

type AgentCfg = {
  systemPrompt?: string;
  welcomeMessage?: string;
};

export function AgentPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<AgentCfg>({});

  useEffect(() => {
    void (async () => {
      try {
        setData(await loadSetting<AgentCfg>("agent", {}));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await saveSetting("agent", data);
      toast.success("Agente atualizado");
    } catch (e: any) {
      toast.error("Erro ao salvar", { description: e.message });
    } finally {
      setSaving(false);
    }
  };


  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Bot className="h-4 w-4 text-primary" />Giana — comportamento</CardTitle>
          <CardDescription>
            Prompt-base usado pelo chat público (Gemini 3 Flash). Vazio = comportamento padrão.
            As ferramentas (cardápio, reserva, ticket, iFood) continuam ativas independente do prompt.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Mensagem de boas-vindas (chat widget)</Label>
            <Input
              value={data.welcomeMessage ?? ""}
              onChange={(e) => setData((d) => ({ ...d, welcomeMessage: e.target.value }))}
              placeholder="Oi! Sou a Giana, da Aquela Parmê. Como posso te ajudar?"
            />
          </div>
          <div className="space-y-1.5">
            <Label>System prompt</Label>
            <Textarea
              rows={14}
              value={data.systemPrompt ?? ""}
              onChange={(e) => setData((d) => ({ ...d, systemPrompt: e.target.value }))}
              placeholder={DEFAULT_PROMPT}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              {(data.systemPrompt ?? "").length} caracteres
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar agente
        </Button>
      </div>
    </div>
  );
}

/* ============================================================ */
/* Integrações (WhatsApp + Google Places)                        */
/* ============================================================ */

type ReservationsCfg = {
  whatsappStorePhone?: string;
  notifyEnabled?: boolean;
};

type GoogleUnit = { label: string; place_id: string };
type GooglePlacesCfg = {
  cache_hours?: number;
  min_rating?: number;
  units?: GoogleUnit[];
};

export function IntegrationsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reservations, setReservations] = useState<ReservationsCfg>({ notifyEnabled: true });
  const [google, setGoogle] = useState<GooglePlacesCfg>({ cache_hours: 24, min_rating: 4, units: [] });

  useEffect(() => {
    void (async () => {
      try {
        const [r, g] = await Promise.all([
          loadSetting<ReservationsCfg>("reservations", { notifyEnabled: true }),
          loadSetting<GooglePlacesCfg>("google_places", { cache_hours: 24, min_rating: 4, units: [] }),
        ]);
        setReservations(r);
        setGoogle({
          cache_hours: g.cache_hours ?? 24,
          min_rating: g.min_rating ?? 4,
          units: g.units ?? [],
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await Promise.all([
        saveSetting("reservations", reservations),
        saveSetting("google_places", google),
      ]);
      toast.success("Integrações atualizadas");
    } catch (e: any) {
      toast.error("Erro ao salvar", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const addUnit = () =>
    setGoogle((g) => ({ ...g, units: [...(g.units ?? []), { label: "", place_id: "" }] }));
  const removeUnit = (i: number) =>
    setGoogle((g) => ({ ...g, units: (g.units ?? []).filter((_, idx) => idx !== i) }));
  const updateUnit = (i: number, patch: Partial<GoogleUnit>) =>
    setGoogle((g) => ({
      ...g,
      units: (g.units ?? []).map((u, idx) => (idx === i ? { ...u, ...patch } : u)),
    }));

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><MessageCircle className="h-4 w-4 text-primary" />WhatsApp da loja</CardTitle>
          <CardDescription>
            Número que recebe avisos de novas reservas feitas pelo chat ou formulário público
            (envia via Z-API com as credenciais ZAPI_CUSTOMER_* configuradas no backend).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Notificar a loja por WhatsApp</div>
              <div className="text-xs text-muted-foreground">Desligar pausa o envio sem apagar o número.</div>
            </div>
            <Switch
              checked={reservations.notifyEnabled !== false}
              onCheckedChange={(v) => setReservations((r) => ({ ...r, notifyEnabled: v }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Número (com DDI, só dígitos)</Label>
            <Input
              value={reservations.whatsappStorePhone ?? ""}
              onChange={(e) => setReservations((r) => ({ ...r, whatsappStorePhone: e.target.value.replace(/\D+/g, "") }))}
              placeholder="556199999999"
              inputMode="numeric"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Star className="h-4 w-4 text-primary" />Google Reviews</CardTitle>
          <CardDescription>
            Place IDs das unidades cujas avaliações aparecem no site. Reviews ficam em cache no
            banco (tabela <code className="text-xs">google_reviews</code>) e são atualizadas pela função
            <code className="text-xs"> parme-google-reviews</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Cache (horas)</Label>
              <Input
                type="number"
                min={1}
                value={google.cache_hours ?? 24}
                onChange={(e) => setGoogle((g) => ({ ...g, cache_hours: Number(e.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nota mínima exibida</Label>
              <Input
                type="number"
                min={1}
                max={5}
                step="0.1"
                value={google.min_rating ?? 4}
                onChange={(e) => setGoogle((g) => ({ ...g, min_rating: Number(e.target.value) || 0 }))}
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Unidades</Label>
              <Button type="button" variant="outline" size="sm" onClick={addUnit}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
              </Button>
            </div>
            {(google.units ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma unidade cadastrada.</p>
            )}
            {(google.units ?? []).map((u, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-start">
                <Input
                  className="col-span-4"
                  placeholder="Nome (ex.: Asa Sul)"
                  value={u.label}
                  onChange={(e) => updateUnit(i, { label: e.target.value })}
                />
                <Input
                  className="col-span-7 font-mono text-xs"
                  placeholder="ChIJ... (Place ID)"
                  value={u.place_id}
                  onChange={(e) => updateUnit(i, { place_id: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="col-span-1 text-destructive"
                  onClick={() => removeUnit(i)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Plug className="h-4 w-4 text-primary" />Status das integrações</CardTitle>
          <CardDescription>Clique na engrenagem para ver/configurar as credenciais de cada integração.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row
            label="WhatsApp Z-API (notificações da loja)"
            status={reservations.whatsappStorePhone ? "ok" : "warn"}
            hint="Configurar número acima"
            secrets={[
              { name: "ZAPI_CUSTOMER_INSTANCE_ID" },
              { name: "ZAPI_CUSTOMER_TOKEN" },
              { name: "ZAPI_CUSTOMER_CLIENT_TOKEN" },
            ]}
            docs="https://z-api.io/"
          />
          <Row
            label="WhatsApp UAZAPI"
            status="warn"
            hint="Configurar token da instância"
            secrets={[
              { name: "UAZAPI_BASE_URL", note: "Ex.: https://free.uazapi.com" },
              { name: "UAZAPI_INSTANCE_TOKEN", note: "Token da instância (Bearer)" },
              { name: "UAZAPI_ADMIN_TOKEN", note: "Opcional, p/ criar/gerenciar instâncias" },
            ]}
            docs="https://docs.uazapi.com/"
          />
          <Row
            label="Reservas (banco local)"
            status="ok"
            hint="Tabela reservations"
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar integrações
        </Button>
      </div>
    </div>
  );
}

type RowSecret = { name: string; note?: string };

function Row({
  label,
  status,
  hint,
  secrets,
  docs,
}: {
  label: string;
  status: "ok" | "warn" | "off";
  hint: string;
  secrets?: RowSecret[];
  docs?: string;
}) {
  const map = {
    ok: { dot: "bg-success", text: "text-success" },
    warn: { dot: "bg-warning", text: "text-warning" },
    off: { dot: "bg-muted-foreground", text: "text-muted-foreground" },
  } as const;
  const [open, setOpen] = useState(false);
  const hasConfig = !!secrets && secrets.length > 0;

  return (
    <>
      <div className="flex items-center justify-between rounded-md border p-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-2 w-2 rounded-full shrink-0 ${map[status].dot}`} />
          <span className="text-sm truncate">{label}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground hidden sm:inline">{hint}</span>
          {hasConfig && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setOpen(true)}
              aria-label={`Configurar ${label}`}
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {hasConfig && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{label}</DialogTitle>
              <DialogDescription>
                Credenciais usadas pelo backend (edge functions). As chaves ficam em <strong>Backend → Secrets</strong> e nunca aparecem no app.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              {secrets!.map((s) => (
                <div key={s.name} className="rounded-md border p-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-xs font-mono break-all">{s.name}</code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(s.name);
                        toast.success("Nome copiado");
                      }}
                      aria-label="Copiar nome"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {s.note && <p className="text-xs text-muted-foreground">{s.note}</p>}
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              Para adicionar ou trocar um secret, abra <strong>Backend → Secrets</strong>, cole o nome acima e o novo valor. Depois recarregue a página.
            </p>

            <DialogFooter className="flex gap-2 sm:justify-between">
              {docs ? (
                <Button asChild variant="outline" size="sm">
                  <a href={docs} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 mr-1" /> Documentação
                  </a>
                </Button>
              ) : <span />}
              <Button size="sm" onClick={() => setOpen(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
