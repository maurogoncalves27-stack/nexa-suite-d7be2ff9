import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Router, Plus, Copy, RefreshCw, Trash2, Phone, WifiOff, Wifi, Signal, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type Store = { id: string; name: string };
type Device = {
  id: string; store_id: string; name: string; webhook_token: string;
  wan_primary_label: string; wan_secondary_label: string;
  heartbeat_interval_seconds: number; heartbeat_tolerance_seconds: number; flap_debounce_seconds: number;
  current_status: "unknown" | "online_primary" | "online_secondary" | "offline";
  last_heartbeat_at: string | null; last_public_ip: string | null; last_event_at: string | null;
  notes: string | null; is_active: boolean;
};
type Event = {
  id: string; device_id: string; store_id: string; event_type: string;
  wan_active: string | null; public_ip: string | null; duration_seconds: number | null;
  suppressed: boolean; created_at: string;
};
type Recipient = { id: string; store_id: string | null; name: string; phone: string; is_active: boolean };

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL || "https://ixjgmerxxakdkfdzgumy.supabase.co"}/functions/v1/mikrotik-wan-alert`;

const STATUS_META: Record<Device["current_status"], { label: string; badge: string; icon: any }> = {
  unknown: { label: "Aguardando", badge: "bg-muted text-muted-foreground", icon: Signal },
  online_primary: { label: "Fibra OK", badge: "bg-success/15 text-success border-success/30", icon: Wifi },
  online_secondary: { label: "Usando 4G", badge: "bg-warning/15 text-warning border-warning/30", icon: ShieldAlert },
  offline: { label: "Offline", badge: "bg-destructive/15 text-destructive border-destructive/30", icon: WifiOff },
};

const EVENT_LABEL: Record<string, string> = {
  wan_down: "WAN principal caiu",
  wan_up: "WAN principal voltou",
  heartbeat_ok: "Heartbeat",
  heartbeat_lost: "Heartbeat perdido",
  heartbeat_restored: "Heartbeat restaurado",
  offline: "Mikrotik offline",
  online: "Mikrotik online",
  failover: "Failover 4G",
  recovery: "Recuperado",
  info: "Info",
};

function since(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR }); }
  catch { return "—"; }
}

function buildMikrotikScript(device: Device) {
  const url = FUNCTIONS_URL;
  const t = device.webhook_token;
  return `# ===== NEXA - Monitoramento WAN =====
# Cole no Winbox / WebFig em System > Scripts (rodar 1 vez)
# ou direto no terminal do RouterOS.

/tool netwatch
remove [find comment~"nexa-wan"]
add host=8.8.8.8 interval=15s timeout=2s comment="nexa-wan" \\
  up-script=":do {/tool fetch url=\\"${url}\\" http-method=post \\
    http-header-field=\\"Content-Type:application/json\\" \\
    http-data=\\"{\\\\\\"token\\\\\\":\\\\\\"${t}\\\\\\",\\\\\\"event\\\\\\":\\\\\\"wan_up\\\\\\"}\\" \\
    keep-result=no} on-error={}" \\
  down-script=":do {/tool fetch url=\\"${url}\\" http-method=post \\
    http-header-field=\\"Content-Type:application/json\\" \\
    http-data=\\"{\\\\\\"token\\\\\\":\\\\\\"${t}\\\\\\",\\\\\\"event\\\\\\":\\\\\\"wan_down\\\\\\"}\\" \\
    keep-result=no} on-error={}"

/system scheduler
remove [find name="nexa-heartbeat"]
add name=nexa-heartbeat interval=${Math.max(60, device.heartbeat_interval_seconds)}s \\
  on-event=":do {/tool fetch url=\\"${url}\\" http-method=post \\
    http-header-field=\\"Content-Type:application/json\\" \\
    http-data=\\"{\\\\\\"token\\\\\\":\\\\\\"${t}\\\\\\",\\\\\\"event\\\\\\":\\\\\\"heartbeat\\\\\\"}\\" \\
    keep-result=no} on-error={}"

# Pronto! O Nexa vai receber down/up quando a WAN principal cair/voltar,
# e um heartbeat a cada ${device.heartbeat_interval_seconds}s pra saber que o
# Mikrotik continua vivo.`;
}

export default function NetworkMonitor() {
  const [stores, setStores] = useState<Store[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [scriptDeviceId, setScriptDeviceId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, d, e, r] = await Promise.all([
      supabase.from("stores").select("id,name").eq("is_virtual", false).order("name"),
      supabase.from("network_devices").select("*").order("name"),
      supabase.from("network_wan_events").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("network_alert_recipients").select("*").order("name"),
    ]);
    setStores((s.data as Store[]) || []);
    setDevices((d.data as Device[]) || []);
    setEvents((e.data as Event[]) || []);
    setRecipients((r.data as Recipient[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const storeName = useCallback(
    (id: string) => stores.find((s) => s.id === id)?.name || "—",
    [stores],
  );

  const eventsByDevice = useMemo(() => {
    const m = new Map<string, Event[]>();
    for (const ev of events) {
      if (!m.has(ev.device_id)) m.set(ev.device_id, []);
      m.get(ev.device_id)!.push(ev);
    }
    return m;
  }, [events]);

  const uptimeByDevice = useMemo(() => {
    // % de tempo em WAN principal nos últimos 7 dias, baseado nos eventos wan_down/wan_up.
    const map = new Map<string, number>();
    const now = Date.now();
    const since = now - 7 * 24 * 3600 * 1000;
    for (const d of devices) {
      const evs = (eventsByDevice.get(d.id) || [])
        .filter((e) => (e.event_type === "wan_down" || e.event_type === "wan_up") && !e.suppressed)
        .filter((e) => new Date(e.created_at).getTime() >= since)
        .reverse();
      // walk events; suppose primary at start; sum down duration
      let downMs = 0;
      let downStart: number | null = null;
      for (const e of evs) {
        const t = new Date(e.created_at).getTime();
        if (e.event_type === "wan_down" && downStart === null) downStart = t;
        else if (e.event_type === "wan_up" && downStart !== null) { downMs += t - downStart; downStart = null; }
      }
      if (downStart !== null && d.current_status === "online_secondary") downMs += now - downStart;
      const total = now - since;
      map.set(d.id, Math.max(0, Math.min(100, (1 - downMs / total) * 100)));
    }
    return map;
  }, [devices, eventsByDevice]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Router className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            Rede das lojas
          </h1>
          <p className="text-muted-foreground">
            Monitore os Mikrotiks das 4 lojas. O Nexa avisa no sino e no WhatsApp quando a internet principal cai ou volta.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
          <AddDeviceDialog stores={stores} devices={devices} open={addOpen} setOpen={setAddOpen} onDone={load} />
        </div>
      </div>

      <Tabs defaultValue="devices">
        <TabsList>
          <TabsTrigger value="devices">Mikrotiks</TabsTrigger>
          <TabsTrigger value="events">Eventos recentes</TabsTrigger>
          <TabsTrigger value="recipients">Alertas WhatsApp</TabsTrigger>
        </TabsList>

        <TabsContent value="devices" className="mt-4 space-y-3">
          {loading && <p className="text-muted-foreground text-sm">Carregando…</p>}
          {!loading && devices.length === 0 && (
            <Card>
              <CardContent className="p-6 text-center space-y-3">
                <p className="text-muted-foreground">
                  Nenhum Mikrotik cadastrado ainda. Cadastre 1 por loja pra começar.
                </p>
                <Button onClick={() => setAddOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" /> Cadastrar Mikrotik
                </Button>
              </CardContent>
            </Card>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {devices.map((d) => {
              const meta = STATUS_META[d.current_status];
              const Icon = meta.icon;
              const uptime = uptimeByDevice.get(d.id) ?? 100;
              return (
                <Card key={d.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Icon className="h-4 w-4" /> {storeName(d.store_id)}
                        </CardTitle>
                        <CardDescription>{d.name}</CardDescription>
                      </div>
                      <Badge variant="outline" className={meta.badge}>{meta.label}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div>Último heartbeat: <span className="text-foreground">{since(d.last_heartbeat_at)}</span></div>
                      <div>Último evento: <span className="text-foreground">{since(d.last_event_at)}</span></div>
                      <div>IP público: <span className="text-foreground font-mono">{d.last_public_ip ?? "—"}</span></div>
                      <div>Uptime 7d: <span className="text-foreground">{uptime.toFixed(2)}%</span></div>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => setScriptDeviceId(d.id)} className="gap-1">
                        <Copy className="h-3.5 w-3.5" /> Script Mikrotik
                      </Button>
                      <Button size="sm" variant="ghost" onClick={async () => {
                        if (!confirm("Gerar novo token invalida o script antigo. Continuar?")) return;
                        const { error } = await supabase.rpc("gen_random_uuid" as any); // fallback
                        // just update with a new uuid via update (Postgres generates)
                        const { data, error: e2 } = await supabase
                          .from("network_devices")
                          .update({ webhook_token: crypto.randomUUID() })
                          .eq("id", d.id)
                          .select().single();
                        if (e2) toast.error("Erro ao gerar novo token"); else { toast.success("Novo token gerado"); load(); }
                      }} className="gap-1">
                        <RefreshCw className="h-3.5 w-3.5" /> Regenerar token
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive gap-1" onClick={async () => {
                        if (!confirm(`Remover Mikrotik "${d.name}"?`)) return;
                        const { error } = await supabase.from("network_devices").delete().eq("id", d.id);
                        if (error) toast.error(error.message); else { toast.success("Removido"); load(); }
                      }}>
                        <Trash2 className="h-3.5 w-3.5" /> Remover
                      </Button>
                    </div>

                    <details className="pt-1">
                      <summary className="text-xs text-muted-foreground cursor-pointer">Últimos eventos</summary>
                      <div className="mt-2 space-y-1 max-h-40 overflow-auto">
                        {(eventsByDevice.get(d.id) || []).slice(0, 15).map((e) => (
                          <div key={e.id} className="flex items-center justify-between text-xs border-b last:border-0 pb-1">
                            <span>{EVENT_LABEL[e.event_type] ?? e.event_type}{e.suppressed ? " (debounce)" : ""}</span>
                            <span className="text-muted-foreground">{since(e.created_at)}</span>
                          </div>
                        ))}
                        {(eventsByDevice.get(d.id) || []).length === 0 && (
                          <p className="text-xs text-muted-foreground">Sem eventos ainda.</p>
                        )}
                      </div>
                    </details>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="events" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {events.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum evento ainda.</p>}
                {events.map((e) => (
                  <div key={e.id} className="p-3 flex items-center justify-between gap-3 text-sm">
                    <div className="flex-1">
                      <div className="font-medium">{storeName(e.store_id)} — {EVENT_LABEL[e.event_type] ?? e.event_type}</div>
                      <div className="text-xs text-muted-foreground">
                        {e.duration_seconds ? `Duração: ${Math.floor(e.duration_seconds / 60)}min ${e.duration_seconds % 60}s · ` : ""}
                        {e.public_ip ? `IP: ${e.public_ip} · ` : ""}
                        {e.suppressed ? "silenciado (debounce)" : ""}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">{since(e.created_at)}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recipients" className="mt-4">
          <RecipientsPanel stores={stores} recipients={recipients} onDone={load} />
        </TabsContent>
      </Tabs>

      {/* Script dialog */}
      <Dialog open={!!scriptDeviceId} onOpenChange={(o) => !o && setScriptDeviceId(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Script Mikrotik pronto pra colar</DialogTitle>
            <DialogDescription>
              No RouterOS, abra Winbox/WebFig → <strong>New Terminal</strong> e cole o bloco abaixo. Ele registra o
              netwatch de queda/retorno + heartbeat, todos apontando pro token único desta loja.
            </DialogDescription>
          </DialogHeader>
          {scriptDeviceId && (() => {
            const d = devices.find((x) => x.id === scriptDeviceId);
            if (!d) return null;
            const script = buildMikrotikScript(d);
            return (
              <div className="space-y-3">
                <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-[50vh] whitespace-pre-wrap font-mono">{script}</pre>
                <div className="flex justify-between items-center">
                  <div className="text-xs text-muted-foreground">
                    URL do webhook: <span className="font-mono">{FUNCTIONS_URL}</span>
                  </div>
                  <Button onClick={() => { navigator.clipboard.writeText(script); toast.success("Script copiado"); }} className="gap-2">
                    <Copy className="h-4 w-4" /> Copiar script
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddDeviceDialog({ stores, devices, open, setOpen, onDone }: {
  stores: Store[]; devices: Device[]; open: boolean; setOpen: (b: boolean) => void; onDone: () => void;
}) {
  const [storeId, setStoreId] = useState("");
  const [name, setName] = useState("Mikrotik principal");
  const [primary, setPrimary] = useState("Fibra");
  const [secondary, setSecondary] = useState("4G");
  const [saving, setSaving] = useState(false);

  const usedStores = new Set(devices.map((d) => d.store_id));
  const available = stores.filter((s) => !usedStores.has(s.id));

  async function submit() {
    if (!storeId || !name) return;
    setSaving(true);
    const { error } = await supabase.from("network_devices").insert({
      store_id: storeId, name, wan_primary_label: primary, wan_secondary_label: secondary,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Mikrotik cadastrado");
    setOpen(false); setStoreId(""); setName("Mikrotik principal");
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> Novo Mikrotik</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cadastrar Mikrotik da loja</DialogTitle>
          <DialogDescription>1 Mikrotik por loja. Depois você copia o script pra colar no RouterOS.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Loja</Label>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
              <SelectContent>
                {available.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                {available.length === 0 && <div className="p-2 text-xs text-muted-foreground">Todas as lojas já têm Mikrotik.</div>}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Nome do equipamento</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>WAN principal</Label>
              <Input value={primary} onChange={(e) => setPrimary(e.target.value)} />
            </div>
            <div>
              <Label>WAN secundária</Label>
              <Input value={secondary} onChange={(e) => setSecondary(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || !storeId}>{saving ? "Salvando…" : "Cadastrar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecipientsPanel({ stores, recipients, onDone }: {
  stores: Store[]; recipients: Recipient[]; onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [storeId, setStoreId] = useState<string>("all");
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!name || !phone) return;
    setSaving(true);
    const { error } = await supabase.from("network_alert_recipients").insert({
      name, phone, store_id: storeId === "all" ? null : storeId,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Adicionado");
    setName(""); setPhone(""); setStoreId("all"); onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Phone className="h-4 w-4" /> Quem recebe alerta no WhatsApp</CardTitle>
        <CardDescription>Adicione um telefone com DDD (ex.: 61999990000). Deixe "Todas as lojas" pra receber alertas globais.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <Input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Telefone (11 dígitos)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as lojas</SelectItem>
              {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={add} disabled={saving || !name || !phone}>Adicionar</Button>
        </div>
        <div className="divide-y border rounded">
          {recipients.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhum destinatário cadastrado.</p>}
          {recipients.map((r) => (
            <div key={r.id} className="p-3 flex items-center justify-between text-sm gap-2">
              <div>
                <div className="font-medium">{r.name} <span className="text-xs text-muted-foreground font-mono">{r.phone}</span></div>
                <div className="text-xs text-muted-foreground">
                  {r.store_id ? (stores.find((s) => s.id === r.store_id)?.name || "—") : "Todas as lojas"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={r.is_active} onCheckedChange={async (v) => {
                  await supabase.from("network_alert_recipients").update({ is_active: v }).eq("id", r.id);
                  onDone();
                }} />
                <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => {
                  if (!confirm("Remover destinatário?")) return;
                  await supabase.from("network_alert_recipients").delete().eq("id", r.id);
                  onDone();
                }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
