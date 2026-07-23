import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DoorOpen, DoorClosed, Power, Fan, Plug, RefreshCw, Plus, Settings2,
  Wifi, WifiOff, Store as StoreIcon, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type Store = { id: string; name: string };
type SmartDevice = {
  id: string;
  tuya_device_id: string;
  name: string;
  store_id: string | null;
  kind: "door" | "switch" | "plug" | "exhaust" | "other";
  category: string | null;
  product_name: string | null;
  active: boolean;
  last_online: boolean;
  last_state: Record<string, unknown> | null;
  last_seen_at: string | null;
};
type TuyaDevice = {
  device_id: string;
  name: string;
  product_name?: string;
  category?: string;
  online?: boolean;
};

const KIND_LABEL: Record<SmartDevice["kind"], string> = {
  door: "Controle de porta",
  switch: "Interruptor",
  plug: "Tomada",
  exhaust: "Exaustor",
  other: "Outro",
};

function guessKind(category?: string, product?: string): SmartDevice["kind"] {
  const c = (category ?? "").toLowerCase();
  const p = (product ?? "").toLowerCase();
  // ckmkzq = garage door controller / opener (tem control open/close)
  if (c === "ckmkzq" || /garage|opener|abridor/.test(p)) return "door";
  if (c === "mcs" || /door|porta|janela|window/.test(p)) return "door";
  if (/exaust|fan|ventil/.test(p)) return "exhaust";
  if (c === "cz" || c === "pc" || /plug|tomada|socket|outlet/.test(p)) return "plug";
  if (c === "kg" || c === "tgq" || /switch|interruptor|light/.test(p)) return "switch";
  return "other";
}

function readSwitchState(state: SmartDevice["last_state"]): boolean | null {
  if (!state) return null;
  for (const [k, v] of Object.entries(state)) {
    if (/^switch/i.test(k) && typeof v === "boolean") return v;
  }
  return null;
}
function readDoorOpen(state: SmartDevice["last_state"]): boolean | null {
  if (!state) return null;
  for (const [k, v] of Object.entries(state)) {
    if (/doorcontact|contact_state|door/i.test(k)) {
      if (typeof v === "boolean") return v;
      if (typeof v === "string") return /open|true/i.test(v);
    }
  }
  return null;
}

export default function SmartDevicesPanel() {
  const [stores, setStores] = useState<Store[]>([]);
  const [devices, setDevices] = useState<SmartDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [tuyaDevices, setTuyaDevices] = useState<TuyaDevice[]>([]);
  const [loadingTuya, setLoadingTuya] = useState(false);
  const [editing, setEditing] = useState<SmartDevice | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: st }, { data: sd }] = await Promise.all([
      supabase.from("stores").select("id, name").eq("is_active", true).eq("is_virtual", false).order("name"),
      supabase.from("smart_devices").select("*").order("name"),
    ]);
    setStores(st ?? []);
    setDevices((sd ?? []) as SmartDevice[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function runSync() {
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke("tuya-sync-smart");
    setSyncing(false);
    if (error) return toast.error("Falha ao sincronizar");
    toast.success(`Sincronizado: ${data?.synced ?? 0} dispositivo(s)`);
    load();
  }

  async function openAdd() {
    setAddOpen(true);
    setLoadingTuya(true);
    const { data, error } = await supabase.functions.invoke("tuya-list-devices");
    setLoadingTuya(false);
    if (error) return toast.error("Não foi possível listar dispositivos da Tuya");
    setTuyaDevices(data?.devices ?? []);
  }

  async function toggleSwitch(d: SmartDevice, next: boolean) {
    setToggling(d.id);
    const { data, error } = await supabase.functions.invoke("tuya-switch-command", {
      body: { device_id: d.tuya_device_id, value: next },
    });
    setToggling(null);
    if (error || !data?.ok) {
      toast.error("Falha ao enviar comando");
      return;
    }
    toast.success(next ? "Ligado" : "Desligado");
    // optimistic
    setDevices((prev) => prev.map((x) => x.id === d.id
      ? { ...x, last_state: { ...(x.last_state ?? {}), [data.code ?? "switch_1"]: next } }
      : x));
    setTimeout(() => runSync(), 1500);
  }

  const linkedIds = useMemo(() => new Set(devices.map((d) => d.tuya_device_id)), [devices]);

  const grouped = useMemo(() => {
    const map = new Map<string, { store: Store | null; items: SmartDevice[] }>();
    const bucket = (id: string | null) => {
      const key = id ?? "__unassigned";
      if (!map.has(key)) {
        map.set(key, { store: stores.find((s) => s.id === id) ?? null, items: [] });
      }
      return map.get(key)!;
    };
    for (const d of devices) bucket(d.store_id).items.push(d);
    return Array.from(map.entries()).sort(([ka, a], [kb, b]) => {
      if (ka === "__unassigned") return 1;
      if (kb === "__unassigned") return -1;
      return (a.store?.name ?? "").localeCompare(b.store?.name ?? "");
    });
  }, [devices, stores]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Sensores de porta, interruptores, tomadas e exaustores pareados no Smart Life.
        </p>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={runSync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            Sincronizar
          </Button>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar dispositivo
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm">Carregando…</div>
      ) : devices.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <Plug className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Nenhum dispositivo vinculado ainda.</p>
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4 mr-2" /> Adicionar dispositivo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(([key, { store, items }]) => (
            <section key={key} className="space-y-3">
              <div className="flex items-center gap-2 border-b border-border pb-2">
                <StoreIcon className="h-4 w-4 text-primary" />
                <h2 className="text-base font-semibold">{store?.name ?? "Sem loja vinculada"}</h2>
                <Badge variant="outline" className="ml-auto text-xs">
                  {items.length} dispositivo{items.length === 1 ? "" : "s"}
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {items.map((d) => {
                  const isSwitchLike = d.kind === "switch" || d.kind === "plug" || d.kind === "exhaust";
                  const swState = isSwitchLike ? readSwitchState(d.last_state) : null;
                  const doorOpen = d.kind === "door" ? readDoorOpen(d.last_state) : null;
                  const Icon = d.kind === "door"
                    ? (doorOpen ? DoorOpen : DoorClosed)
                    : d.kind === "exhaust" ? Fan
                    : d.kind === "plug" ? Plug
                    : Power;
                  const statusBadge = d.last_online
                    ? { label: "Online", cls: "bg-success text-success-foreground", Icon: Wifi }
                    : { label: "Offline", cls: "bg-muted text-muted-foreground", Icon: WifiOff };
                  return (
                    <Card key={d.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Icon className={`h-5 w-5 ${d.kind === "door" && doorOpen ? "text-warning" : "text-primary"}`} />
                            {d.name}
                          </CardTitle>
                          <Badge className={statusBadge.cls}>
                            <statusBadge.Icon className="h-3 w-3 mr-1" />
                            {statusBadge.label}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">{KIND_LABEL[d.kind]}</Badge>
                          {d.product_name && <span className="truncate">{d.product_name}</span>}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {d.kind === "door" && (
                          <div className="space-y-2">
                            <div className={`text-3xl font-bold ${doorOpen ? "text-warning" : ""}`}>
                              {doorOpen === null ? "—" : doorOpen ? "Aberta" : "Fechada"}
                            </div>
                            <Button
                              variant="default"
                              size="sm"
                              className="w-full"
                              disabled={toggling === d.id}
                              onClick={() => toggleSwitch(d, true)}
                            >
                              {toggling === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><DoorOpen className="h-4 w-4 mr-1" /> Abrir</>}
                            </Button>
                            <p className="text-[10px] text-muted-foreground">
                              A porta fecha automaticamente após a abertura.
                            </p>
                            {!d.last_online && (
                              <p className="text-[10px] text-warning">
                                Dispositivo reportado offline pela Tuya. O comando será tentado mesmo assim — controles de portão às vezes ficam em standby até receberem ordem.
                              </p>
                            )}
                          </div>
                        )}

                        {isSwitchLike && (
                          <div className="flex items-center justify-between border rounded-md p-3">
                            <div>
                              <div className="text-sm font-medium">
                                {swState === null ? "Estado desconhecido" : swState ? "Ligado" : "Desligado"}
                              </div>
                              <div className="text-xs text-muted-foreground">Toque para {swState ? "desligar" : "ligar"}</div>
                            </div>
                            {toggling === d.id ? (
                              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            ) : (
                              <Switch
                                checked={!!swState}
                                disabled={!d.last_online}
                                onCheckedChange={(v) => toggleSwitch(d, v)}
                              />
                            )}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {d.last_seen_at
                            ? `Atualizado ${formatDistanceToNow(new Date(d.last_seen_at), { addSuffix: true, locale: ptBR })}`
                            : "Sem sincronização ainda"}
                        </div>
                        <Button variant="outline" size="sm" className="w-full" onClick={() => setEditing(d)}>
                          <Settings2 className="h-4 w-4 mr-2" /> Configurar
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <AddSmartDeviceDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        loading={loadingTuya}
        devices={tuyaDevices}
        linkedIds={linkedIds}
        stores={stores}
        onSaved={() => { setAddOpen(false); load(); }}
      />

      <EditSmartDeviceDialog
        device={editing}
        stores={stores}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
    </div>
  );
}

function AddSmartDeviceDialog({
  open, onOpenChange, loading, devices, linkedIds, stores, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  loading: boolean;
  devices: TuyaDevice[];
  linkedIds: Set<string | null>;
  stores: Store[];
  onSaved: () => void;
}) {
  const [deviceId, setDeviceId] = useState("");
  const [name, setName] = useState("");
  const [storeId, setStoreId] = useState("");
  const [kind, setKind] = useState<SmartDevice["kind"]>("switch");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) { setDeviceId(""); setName(""); setStoreId(""); setKind("switch"); }
  }, [open]);

  useEffect(() => {
    const d = devices.find((x) => x.device_id === deviceId);
    if (d) {
      if (!name) setName(d.name);
      setKind(guessKind(d.category, d.product_name));
    }
  }, [deviceId]);

  async function save() {
    if (!deviceId || !name || !storeId) return toast.error("Preencha todos os campos");
    setSaving(true);
    const { data: user } = await supabase.auth.getUser();
    const d = devices.find((x) => x.device_id === deviceId);
    const { error } = await supabase.from("smart_devices").insert({
      tuya_device_id: deviceId,
      name,
      store_id: storeId,
      kind,
      category: d?.category ?? null,
      product_name: d?.product_name ?? null,
      created_by: user.user!.id,
      active: true,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Dispositivo vinculado");
    // trigger a sync to grab initial state
    supabase.functions.invoke("tuya-sync-smart").catch(() => {});
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar dispositivo Smart Life</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="py-6 text-center text-muted-foreground text-sm">Buscando dispositivos…</div>
        ) : devices.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground text-sm">
            Nenhum dispositivo encontrado na conta Tuya. Pareie no app Smart Life e confirme que a conta está vinculada ao projeto Cloud.
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Dispositivo detectado ({devices.length} total)</Label>
              <Select value={deviceId} onValueChange={setDeviceId}>
                <SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
                <SelectContent>
                  {devices.map((d) => {
                    const already = linkedIds.has(d.device_id);
                    return (
                      <SelectItem key={d.device_id} value={d.device_id} disabled={already}>
                        {d.name} {d.online ? "🟢" : "🔴"} — {d.product_name ?? d.category}
                        {already ? " ✓ já vinculado" : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Não aparece o exaustor? Confirme que ele está pareado nesta mesma conta Smart Life vinculada ao Cloud Project da Tuya.
              </p>
            </div>
            <div>
              <Label>Apelido (ex: Exaustor Cozinha)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Loja</Label>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
                <SelectContent>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as SmartDevice["kind"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(KIND_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving || !deviceId}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditSmartDeviceDialog({
  device, stores, onOpenChange, onSaved,
}: {
  device: SmartDevice | null;
  stores: Store[];
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [storeId, setStoreId] = useState("");
  const [kind, setKind] = useState<SmartDevice["kind"]>("switch");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (device) {
      setName(device.name);
      setStoreId(device.store_id ?? "");
      setKind(device.kind);
      setActive(device.active);
    }
  }, [device]);

  async function save() {
    if (!device) return;
    setSaving(true);
    const { error } = await supabase.from("smart_devices").update({
      name, store_id: storeId || null, kind, active,
    }).eq("id", device.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Dispositivo atualizado");
    onSaved();
  }

  async function remove() {
    if (!device) return;
    if (!confirm("Remover este dispositivo? O pareamento no Smart Life continua.")) return;
    const { error } = await supabase.from("smart_devices").delete().eq("id", device.id);
    if (error) return toast.error(error.message);
    toast.success("Dispositivo removido");
    onSaved();
  }

  return (
    <Dialog open={!!device} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar dispositivo</DialogTitle>
        </DialogHeader>
        {device && (
          <div className="space-y-3">
            <div>
              <Label>Apelido</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Loja</Label>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as SmartDevice["kind"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(KIND_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between border rounded-md p-3">
              <div>
                <div className="text-sm font-medium">Monitoramento ativo</div>
                <div className="text-xs text-muted-foreground">Se desligado, não sincroniza estado</div>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
            <div className="text-xs text-muted-foreground">
              Device ID Tuya: <code>{device.tuya_device_id}</code>
            </div>
          </div>
        )}
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="destructive" onClick={remove} className="sm:mr-auto">Remover</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
