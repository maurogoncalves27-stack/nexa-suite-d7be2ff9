import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bike, Loader2, RefreshCw, AlertCircle, Globe } from "lucide-react";
import { toast } from "sonner";
import { invokeEdge } from "@/lib/edgeInvoke";

type Store = { id: string; name: string };
type Provider = "lalamove" | "uber_direct" | "mock";

type Cfg = {
  id?: string;
  store_id: string;
  provider: Provider;
  is_active: boolean;
  priority: number;
  service_type: string;
  pickup_address: PickupAddress | null;
};

type PickupAddress = {
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  contact_name?: string;
  contact_phone?: string;
};

type Job = {
  id: string;
  provider: Provider;
  status: string;
  fee_cents: number | null;
  eta_minutes: number | null;
  driver_name: string | null;
  tracking_url: string | null;
  created_at: string;
};

type EcomStore = {
  id: string;
  slug: string;
  display_name: string;
  accepts_pickup: boolean;
  accepts_delivery: boolean;
};

type ServiceTypesResult = {
  ok?: boolean;
  error?: string;
  detail?: string;
  market?: string;
  env?: string;
  cities?: { locode: string; name: string; service_types: string[] }[];
};

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: "lalamove", label: "Lalamove" },
  { value: "uber_direct", label: "Uber Direct" },
  { value: "mock", label: "Simulado (testes)" },
];

const STATUS_LABEL: Record<string, string> = {
  quoted: "Cotado",
  requested: "Solicitado",
  assigned: "Motoboy a caminho",
  picked_up: "Coletado",
  delivered: "Entregue",
  cancelled: "Cancelado",
  failed: "Falhou",
  expired: "Expirou",
};

const fmtBRL = (cents: number | null) =>
  cents == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

export default function DeliverySettings() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [configs, setConfigs] = useState<Cfg[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [testCep, setTestCep] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<unknown>(null);
  const [ecomStore, setEcomStore] = useState<EcomStore | null>(null);
  const [serviceTypes, setServiceTypes] = useState<ServiceTypesResult | null>(null);
  const [loadingServices, setLoadingServices] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("stores")
        .select("id, name")
        .eq("is_virtual", false)
        .eq("is_active", true)
        .order("name");
      setStores(data || []);
      if (data && data.length > 0) setStoreId(data[0].id);
    })();
  }, []);

  useEffect(() => {
    if (storeId) loadAll();
  }, [storeId]);

  async function loadAll() {
    setLoading(true);
    const [cfgRes, jobRes, ecomRes] = await Promise.all([
      supabase
        .from("delivery_provider_config")
        .select("*")
        .eq("store_id", storeId)
        .order("priority"),
      supabase
        .from("delivery_jobs")
        .select("id, provider, status, fee_cents, eta_minutes, driver_name, tracking_url, created_at")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("ecommerce_stores")
        .select("id, slug, display_name, accepts_pickup, accepts_delivery")
        .eq("store_id", storeId)
        .maybeSingle(),
    ]);
    setConfigs(((cfgRes.data ?? []) as unknown) as Cfg[]);
    setJobs(((jobRes.data ?? []) as unknown) as Job[]);
    setEcomStore((ecomRes.data as EcomStore | null) ?? null);
    setLoading(false);
  }

  const missing = useMemo(() => {
    const have = new Set(configs.map((c) => c.provider));
    return PROVIDERS.filter((p) => !have.has(p.value));
  }, [configs]);

  // Lalamove/Uber recusam stops sem coordenadas, então a coleta precisa ter lat/lng.
  const hasActiveProviderWithCoords = useMemo(
    () =>
      configs.some(
        (c) =>
          c.is_active &&
          typeof c.pickup_address?.latitude === "number" &&
          typeof c.pickup_address?.longitude === "number",
      ),
    [configs],
  );

  async function upsertConfig(cfg: Cfg) {
    const payload = {
      store_id: cfg.store_id,
      provider: cfg.provider,
      is_active: cfg.is_active,
      priority: cfg.priority,
      service_type: cfg.service_type,
      pickup_address: cfg.pickup_address,
    };
    const { error } = cfg.id
      ? await supabase.from("delivery_provider_config").update(payload).eq("id", cfg.id)
      : await supabase.from("delivery_provider_config").insert(payload);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    toast.success("Configuração salva");
    loadAll();
  }

  async function removeConfig(id: string) {
    if (!confirm("Remover este provedor desta loja?")) return;
    const { error } = await supabase.from("delivery_provider_config").delete().eq("id", id);
    if (error) toast.error(error.message);
    else loadAll();
  }

  async function addProvider(provider: Provider) {
    const newCfg: Cfg = {
      store_id: storeId,
      provider,
      is_active: true,
      priority: (configs[configs.length - 1]?.priority ?? 0) + 1,
      service_type: "LALAGO",
      pickup_address: null,
    };
    await upsertConfig(newCfg);
  }

  async function runTestQuote() {
    if (!testCep) {
      toast.error("Informe um CEP de destino");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      // Lalamove exige coordenadas: resolve o CEP antes de cotar.
      const geo = await invokeEdge<{ address?: Record<string, unknown>; detail?: string }>(
        "geocode-address",
        { postal_code: testCep, number: "1" },
      );
      const dropoff = geo.data?.address;
      if (!dropoff) throw new Error(geo.data?.detail || "Não foi possível resolver o CEP");

      const res = await invokeEdge("delivery-quote", { store_id: storeId, dropoff });
      setTestResult(res.data);
    } catch (e) {
      toast.error("Erro no teste: " + (e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  async function loadServiceTypes() {
    setLoadingServices(true);
    try {
      const res = await invokeEdge<ServiceTypesResult>("delivery-service-types");
      setServiceTypes(res.data);
    } catch (e) {
      toast.error("Erro ao consultar Lalamove: " + (e as Error).message);
    } finally {
      setLoadingServices(false);
    }
  }

  async function saveSiteChannel(patch: Partial<Pick<EcomStore, "accepts_delivery" | "accepts_pickup">>) {
    if (!ecomStore) return;
    const { error } = await supabase
      .from("ecommerce_stores")
      .update(patch)
      .eq("id", ecomStore.id);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    setEcomStore({ ...ecomStore, ...patch });
    toast.success("Canal do site atualizado");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-xl font-bold flex items-center gap-2">
          <Bike className="md: md: h-6 w-6 md:h-7 md:w-7 text-primary" />
          Entregas — Motoboy
        </h1>
        <p className="text-muted-foreground">
          Configuração dos provedores de motoboy (Lalamove, Uber Direct). Atende os pedidos com entrega
          do site (<code>/pedir</code>) e do canal WhatsApp.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Loja</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
            <SelectContent>
              {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Provedores configurados</CardTitle>
            <CardDescription>
              Prioridade 1 = primário. Se falhar, tenta o próximo. Cotação automática usa o mais barato dos ativos.
            </CardDescription>
          </div>
          <Button size="sm" variant="ghost" onClick={loadAll} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {configs.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum provedor configurado ainda.</p>
          )}
          {configs.map((cfg) => (
            <ProviderCard
              key={cfg.id}
              cfg={cfg}
              onSave={upsertConfig}
              onRemove={() => cfg.id && removeConfig(cfg.id)}
            />
          ))}
          {missing.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <span className="text-sm text-muted-foreground self-center">Adicionar:</span>
              {missing.map((p) => (
                <Button key={p.value} size="sm" variant="outline" onClick={() => addProvider(p.value)}>
                  + {p.label}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            Canal do site (/pedir)
          </CardTitle>
          <CardDescription>
            Ligue a entrega só nas lojas com provedor ativo e endereço de coleta com coordenadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!ecomStore ? (
            <p className="text-sm text-muted-foreground">
              Esta loja não está publicada no site. Cadastre-a em <code>ecommerce_stores</code> para vender pelo <code>/pedir</code>.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Loja no site: <strong>{ecomStore.display_name}</strong> (<code>/pedir/{ecomStore.slug}</code>)
              </p>
              <Label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch
                  checked={ecomStore.accepts_pickup}
                  onCheckedChange={(v) => saveSiteChannel({ accepts_pickup: v })}
                />
                Aceita retirada no balcão
              </Label>
              <Label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch
                  checked={ecomStore.accepts_delivery}
                  onCheckedChange={(v) => saveSiteChannel({ accepts_delivery: v })}
                />
                Aceita entrega (aciona o motoboy no pagamento aprovado)
              </Label>
              {ecomStore.accepts_delivery && !hasActiveProviderWithCoords && (
                <p className="text-sm text-warning flex items-start gap-1.5">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  Entrega ligada, mas nenhum provedor ativo tem endereço de coleta com lat/lng. A cotação
                  vai falhar no checkout.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Tipos de serviço da Lalamove</CardTitle>
            <CardDescription>
              Os valores válidos de <code>serviceType</code> variam por cidade. Consulte antes de configurar.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={loadServiceTypes} disabled={loadingServices}>
            {loadingServices ? <Loader2 className="h-4 w-4 animate-spin" /> : "Consultar"}
          </Button>
        </CardHeader>
        <CardContent>
          {!serviceTypes ? (
            <p className="text-sm text-muted-foreground">
              Consulte para listar as cidades habilitadas na sua conta.
            </p>
          ) : serviceTypes.error ? (
            <p className="text-sm text-destructive">{serviceTypes.detail || serviceTypes.error}</p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Mercado {serviceTypes.market} · ambiente {serviceTypes.env}
              </p>
              {(serviceTypes.cities ?? []).map((c) => (
                <div key={c.locode} className="text-sm">
                  <span className="font-medium">{c.name}</span>{" "}
                  <span className="text-xs text-muted-foreground">({c.locode})</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {c.service_types.map((s) => (
                      <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Teste de cotação</CardTitle>
          <CardDescription>
            Resolve o CEP em coordenadas e cota nos provedores ativos, igual ao checkout do site.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col md:flex-row gap-2">
            <Input
              placeholder="CEP destino (ex: 71925-540)"
              value={testCep}
              onChange={(e) => setTestCep(e.target.value)}
              className="md:max-w-xs"
            />
            <Button onClick={runTestQuote} disabled={testing || !storeId}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Cotar
            </Button>
          </div>
          {testResult ? (
            <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-64">
              {JSON.stringify(testResult, null, 2)}
            </pre>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimas corridas</CardTitle>
          <CardDescription>50 mais recentes desta loja.</CardDescription>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem corridas registradas.</p>
          ) : (
            <div className="space-y-2">
              {jobs.map((j) => (
                <div key={j.id} className="border rounded-md p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="uppercase text-[10px]">{j.provider}</Badge>
                    <Badge variant={j.status === "delivered" ? "default" : j.status === "cancelled" || j.status === "failed" ? "destructive" : "secondary"}>
                      {STATUS_LABEL[j.status] ?? j.status}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {new Date(j.created_at).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span>{fmtBRL(j.fee_cents)}</span>
                    {j.eta_minutes ? <span>· ETA {j.eta_minutes}min</span> : null}
                    {j.driver_name ? <span>· {j.driver_name}</span> : null}
                    {j.tracking_url ? (
                      <a className="text-primary underline" href={j.tracking_url} target="_blank" rel="noreferrer">
                        Rastrear
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-warning/50 bg-warning/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-warning">
            <AlertCircle className="h-4 w-4" />
            Status das credenciais
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <p>
            · <strong>Lalamove</strong>: secrets <code>LALAMOVE_API_KEY</code>,{" "}
            <code>LALAMOVE_API_SECRET</code>, <code>LALAMOVE_MARKET</code> (BR),{" "}
            <code>LALAMOVE_ENV</code> (sandbox/production) e <code>LALAMOVE_WEBHOOK_SECRET</code>.
          </p>
          <p>· <strong>Uber Direct</strong>: aguardando OAuth credentials (stub).</p>
          <p>· <strong>Mock</strong>: sempre disponível para testes sem credencial.</p>
          <p className="text-xs text-muted-foreground pt-2">
            Webhook Lalamove (o Partner Portal não envia headers, então o secret vai na URL):<br />
            <code>/functions/v1/delivery-webhook-lalamove?secret=$LALAMOVE_WEBHOOK_SECRET</code><br />
            Uber Direct → <code>/functions/v1/delivery-webhook-uber</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ProviderCard({ cfg, onSave, onRemove }: {
  cfg: Cfg;
  onSave: (c: Cfg) => void;
  onRemove: () => void;
}) {
  const [local, setLocal] = useState<Cfg>(cfg);
  useEffect(() => setLocal(cfg), [cfg]);

  const addr = local.pickup_address ?? {};

  const updateAddr = (k: keyof PickupAddress, v: string) => {
    setLocal({
      ...local,
      pickup_address: { ...addr, [k]: k === "latitude" || k === "longitude" ? (v ? Number(v) : undefined) : v },
    });
  };

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Badge className="uppercase">{local.provider}</Badge>
          <Label className="flex items-center gap-2 text-sm cursor-pointer">
            <Switch
              checked={local.is_active}
              onCheckedChange={(v) => setLocal({ ...local, is_active: v })}
            />
            Ativo
          </Label>
        </div>
        <Button size="sm" variant="ghost" onClick={onRemove}>Remover</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Prioridade</Label>
          <Input
            type="number"
            min={1}
            value={local.priority}
            onChange={(e) => setLocal({ ...local, priority: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label className="text-xs">Tipo de serviço</Label>
          <Input
            value={local.service_type}
            onChange={(e) => setLocal({ ...local, service_type: e.target.value })}
          />
          {local.provider === "lalamove" && (
            <p className="text-[11px] text-muted-foreground mt-1">
              No Brasil: <code>LALAGO</code> (mais barato), <code>HATCHBACK</code>, <code>CAR</code>,{" "}
              <code>VAN</code>. <code>MOTORCYCLE</code> não existe aqui.
            </p>
          )}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium mb-2">Endereço de coleta</p>
        {(typeof addr.latitude !== "number" || typeof addr.longitude !== "number") && (
          <p className="text-xs text-warning flex items-start gap-1.5 mb-2">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Sem lat/lng a cotação falha: Lalamove e Uber exigem coordenadas em todos os pontos.
          </p>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Input placeholder="Rua" value={addr.street ?? ""} onChange={(e) => updateAddr("street", e.target.value)} className="md:col-span-2" />
          <Input placeholder="Nº" value={addr.number ?? ""} onChange={(e) => updateAddr("number", e.target.value)} />
          <Input placeholder="Bairro" value={addr.neighborhood ?? ""} onChange={(e) => updateAddr("neighborhood", e.target.value)} />
          <Input placeholder="Cidade" value={addr.city ?? ""} onChange={(e) => updateAddr("city", e.target.value)} />
          <Input placeholder="UF" value={addr.state ?? ""} onChange={(e) => updateAddr("state", e.target.value)} />
          <Input placeholder="CEP" value={addr.postal_code ?? ""} onChange={(e) => updateAddr("postal_code", e.target.value)} />
          <Input placeholder="Lat" value={addr.latitude ?? ""} onChange={(e) => updateAddr("latitude", e.target.value)} />
          <Input placeholder="Lng" value={addr.longitude ?? ""} onChange={(e) => updateAddr("longitude", e.target.value)} />
          <Input placeholder="Contato (nome)" value={addr.contact_name ?? ""} onChange={(e) => updateAddr("contact_name", e.target.value)} className="md:col-span-2" />
          <Input placeholder="Telefone" value={addr.contact_phone ?? ""} onChange={(e) => updateAddr("contact_phone", e.target.value)} className="md:col-span-2" />
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => onSave(local)}>Salvar</Button>
      </div>
    </div>
  );
}
