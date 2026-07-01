import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Thermometer, RefreshCw, Plus, Settings2, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type Store = { id: string; name: string };
type Equip = {
  id: string;
  name: string;
  store_id: string | null;
  tuya_device_id: string | null;
  tuya_sensor_type: string | null;
  min_temp_c: number | null;
  max_temp_c: number | null;
  max_humidity_pct: number | null;
  alert_delay_minutes: number;
  tuya_active: boolean;
  last_reading_at: string | null;
  last_temp_c: number | null;
  last_humidity_pct: number | null;
  last_online: boolean;
};
type TuyaDevice = {
  device_id: string;
  name: string;
  product_name?: string;
  category?: string;
  online?: boolean;
};
type EmsSensor = {
  unique_code: string;
  label: string | null;
  min_value: number | null;
  max_value: number | null;
  store_id: string | null;
  last_measurement: number | null;
  last_measured_at: string | null;
};

const SENSOR_DEFAULTS: Record<string, { min: number; max: number; label: string }> = {
  freezer: { min: -25, max: -15, label: "Congelador" },
  chiller: { min: 0, max: 5, label: "Resfriado" },
  dry: { min: 15, max: 25, label: "Seco" },
  custom: { min: 0, max: 10, label: "Personalizado" },
};

export default function NutriSensors() {
  const [stores, setStores] = useState<Store[]>([]);
  const [equips, setEquips] = useState<Equip[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [devices, setDevices] = useState<TuyaDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [editing, setEditing] = useState<Equip | null>(null);
  const [emsSensors, setEmsSensors] = useState<EmsSensor[]>([]);

  async function load() {
    setLoading(true);
    const [{ data: st }, { data: eq }, { data: ems }] = await Promise.all([
      supabase.from("stores").select("id, name").eq("is_active", true).eq("is_virtual", false).order("name"),
      supabase.from("nutri_equipment").select("*").not("tuya_device_id", "is", null).order("name"),
      supabase.from("ems_sensors").select("unique_code, label, min_value, max_value, store_id").order("label"),
    ]);
    setStores(st ?? []);
    setEquips((eq ?? []) as Equip[]);
    // fetch latest reading for each EMS sensor
    const emsList: EmsSensor[] = await Promise.all(
      (ems ?? []).map(async (s: any) => {
        const { data: r } = await supabase
          .from("ems_sensor_readings")
          .select("measurement, measured_at")
          .eq("sensor_code", s.unique_code)
          .order("measured_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return {
          unique_code: s.unique_code,
          label: s.label,
          min_value: s.min_value,
          max_value: s.max_value,
          store_id: s.store_id,
          last_measurement: r?.measurement != null ? Number(r.measurement) : null,
          last_measured_at: r?.measured_at ?? null,
        };
      })
    );
    setEmsSensors(emsList);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function runSync() {
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke("tuya-sync");
    setSyncing(false);
    if (error) return toast.error("Falha ao sincronizar");
    toast.success(`Sincronizado: ${data?.synced ?? 0} sensor(es), ${data?.alerts ?? 0} alerta(s)`);
    load();
  }

  async function openAdd() {
    setAddOpen(true);
    setLoadingDevices(true);
    const { data, error } = await supabase.functions.invoke("tuya-list-devices");
    setLoadingDevices(false);
    if (error) return toast.error("Não foi possível listar sensores da Tuya");
    setDevices(data?.devices ?? []);
  }

  const linkedIds = useMemo(() => new Set(equips.map((e) => e.tuya_device_id)), [equips]);
  const availableDevices = devices.filter((d) => !linkedIds.has(d.device_id));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Thermometer className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            Sensores de temperatura
          </h1>
          <p className="text-muted-foreground">
            Leituras automáticas dos sensores Tuya Wi-Fi instalados nas câmaras frias. Sincroniza a cada 5 min.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={runSync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            Sincronizar agora
          </Button>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar sensor
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm">Carregando…</div>
      ) : (
        <>
          {emsSensors.length > 0 && (
            <div className="space-y-2">
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Sensores EMS-A (Câmara Fria)</h2>
                <p className="text-xs text-muted-foreground">Ingestão automática via API EMS-A a cada 5 min.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {emsSensors.map((s) => {
                  const store = stores.find((x) => x.id === s.store_id);
                  const temp = s.last_measurement;
                  const ageMin = s.last_measured_at
                    ? (Date.now() - new Date(s.last_measured_at).getTime()) / 60_000
                    : Infinity;
                  const online = temp !== null && ageMin < 30;
                  const outOfRange =
                    temp !== null &&
                    ((s.min_value !== null && temp < Number(s.min_value)) ||
                      (s.max_value !== null && temp > Number(s.max_value)));
                  const status = !online
                    ? { label: "Offline", cls: "bg-muted text-muted-foreground", Icon: WifiOff }
                    : outOfRange
                      ? { label: "Fora da faixa", cls: "bg-destructive text-destructive-foreground", Icon: Wifi }
                      : { label: "OK", cls: "bg-success text-success-foreground", Icon: Wifi };
                  return (
                    <Card key={s.unique_code}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-base">{s.label ?? s.unique_code}</CardTitle>
                          <Badge className={status.cls}>
                            <status.Icon className="h-3 w-3 mr-1" />
                            {status.label}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {store?.name ?? "—"} · Faixa {s.min_value ?? "?"}~{s.max_value ?? "?"}°C · EMS-A
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className={`text-4xl font-bold ${outOfRange ? "text-destructive" : ""}`}>
                          {temp !== null ? `${temp.toFixed(1)}°C` : "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {s.last_measured_at
                            ? `Atualizado ${formatDistanceToNow(new Date(s.last_measured_at), { addSuffix: true, locale: ptBR })}`
                            : "Sem leituras ainda"}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {equips.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Sensores Tuya Wi-Fi</h2>
            </div>
          )}
        </>
      )}

      {!loading && equips.length === 0 && emsSensors.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <Thermometer className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Nenhum sensor Tuya vinculado ainda.</p>
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4 mr-2" /> Adicionar primeiro sensor
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {equips.map((eq) => {
            const store = stores.find((s) => s.id === eq.store_id);
            const temp = eq.last_temp_c;
            const outOfRange =
              temp !== null &&
              ((eq.min_temp_c !== null && temp < Number(eq.min_temp_c)) ||
                (eq.max_temp_c !== null && temp > Number(eq.max_temp_c)));
            const status = !eq.last_online
              ? { label: "Offline", cls: "bg-muted text-muted-foreground", Icon: WifiOff }
              : outOfRange
                ? { label: "Fora da faixa", cls: "bg-destructive text-destructive-foreground", Icon: Wifi }
                : { label: "OK", cls: "bg-success text-success-foreground", Icon: Wifi };
            return (
              <Card key={eq.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{eq.name}</CardTitle>
                    <Badge className={status.cls}>
                      <status.Icon className="h-3 w-3 mr-1" />
                      {status.label}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {store?.name ?? "—"} · Faixa {eq.min_temp_c ?? "?"}~{eq.max_temp_c ?? "?"}°C
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-end gap-3">
                    <div className={`text-4xl font-bold ${outOfRange ? "text-destructive" : ""}`}>
                      {temp !== null ? `${Number(temp).toFixed(1)}°C` : "—"}
                    </div>
                    {eq.last_humidity_pct !== null && (
                      <div className="text-sm text-muted-foreground pb-1">
                        {Number(eq.last_humidity_pct).toFixed(0)}% umid.
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {eq.last_reading_at
                      ? `Atualizado ${formatDistanceToNow(new Date(eq.last_reading_at), { addSuffix: true, locale: ptBR })}`
                      : "Sem leituras ainda"}
                  </div>
                  <Button variant="outline" size="sm" className="w-full" onClick={() => setEditing(eq)}>
                    <Settings2 className="h-4 w-4 mr-2" /> Configurar
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AddSensorDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        loading={loadingDevices}
        devices={availableDevices}
        stores={stores}
        onSaved={() => { setAddOpen(false); load(); }}
      />

      <EditSensorDialog
        equip={editing}
        stores={stores}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
    </div>
  );
}

function AddSensorDialog({
  open, onOpenChange, loading, devices, stores, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  loading: boolean;
  devices: TuyaDevice[];
  stores: Store[];
  onSaved: () => void;
}) {
  const [deviceId, setDeviceId] = useState("");
  const [name, setName] = useState("");
  const [storeId, setStoreId] = useState("");
  const [type, setType] = useState<keyof typeof SENSOR_DEFAULTS>("chiller");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) { setDeviceId(""); setName(""); setStoreId(""); setType("chiller"); }
  }, [open]);

  useEffect(() => {
    const d = devices.find((x) => x.device_id === deviceId);
    if (d && !name) setName(d.name);
  }, [deviceId]);

  async function save() {
    if (!deviceId || !name || !storeId) return toast.error("Preencha todos os campos");
    setSaving(true);
    const def = SENSOR_DEFAULTS[type];
    const { data: user } = await supabase.auth.getUser();
    const { error } = await supabase.from("nutri_equipment").insert({
      name,
      equipment_type: "camara",
      store_id: storeId,
      created_by: user.user!.id,
      tuya_device_id: deviceId,
      tuya_sensor_type: type,
      min_temp_c: def.min,
      max_temp_c: def.max,
      alert_delay_minutes: 15,
      tuya_active: true,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Sensor vinculado");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar sensor Tuya</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="py-6 text-center text-muted-foreground text-sm">Buscando sensores na Tuya…</div>
        ) : devices.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground text-sm">
            Nenhum sensor novo encontrado. Verifique se pareou os sensores no app Smart Life e vinculou a conta no projeto Cloud da Tuya.
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Sensor detectado</Label>
              <Select value={deviceId} onValueChange={setDeviceId}>
                <SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
                <SelectContent>
                  {devices.map((d) => (
                    <SelectItem key={d.device_id} value={d.device_id}>
                      {d.name} {d.online ? "🟢" : "🔴"} — {d.product_name ?? d.category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Apelido (ex: Câmara Congelados)</Label>
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
              <Label>Tipo de câmara</Label>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SENSOR_DEFAULTS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label} ({v.min}~{v.max}°C)</SelectItem>
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

function EditSensorDialog({
  equip, stores, onOpenChange, onSaved,
}: {
  equip: Equip | null;
  stores: Store[];
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [storeId, setStoreId] = useState("");
  const [minTemp, setMinTemp] = useState("");
  const [maxTemp, setMaxTemp] = useState("");
  const [delay, setDelay] = useState("15");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (equip) {
      setName(equip.name);
      setStoreId(equip.store_id ?? "");
      setMinTemp(equip.min_temp_c?.toString() ?? "");
      setMaxTemp(equip.max_temp_c?.toString() ?? "");
      setDelay(equip.alert_delay_minutes.toString());
      setActive(equip.tuya_active);
    }
  }, [equip]);

  async function save() {
    if (!equip) return;
    setSaving(true);
    const { error } = await supabase.from("nutri_equipment").update({
      name,
      store_id: storeId || null,
      min_temp_c: minTemp ? Number(minTemp) : null,
      max_temp_c: maxTemp ? Number(maxTemp) : null,
      alert_delay_minutes: Number(delay) || 15,
      tuya_active: active,
    }).eq("id", equip.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Sensor atualizado");
    onSaved();
  }

  async function remove() {
    if (!equip) return;
    if (!confirm("Desvincular este sensor? As leituras históricas serão mantidas.")) return;
    const { error } = await supabase.from("nutri_equipment")
      .update({ tuya_device_id: null, tuya_active: false })
      .eq("id", equip.id);
    if (error) return toast.error(error.message);
    toast.success("Sensor desvinculado");
    onSaved();
  }

  return (
    <Dialog open={!!equip} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar sensor</DialogTitle>
        </DialogHeader>
        {equip && (
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Mín °C</Label>
                <Input type="number" step="0.1" value={minTemp} onChange={(e) => setMinTemp(e.target.value)} />
              </div>
              <div>
                <Label>Máx °C</Label>
                <Input type="number" step="0.1" value={maxTemp} onChange={(e) => setMaxTemp(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Alertar após (min fora da faixa)</Label>
              <Input type="number" value={delay} onChange={(e) => setDelay(e.target.value)} />
            </div>
            <div className="flex items-center justify-between border rounded-md p-3">
              <div>
                <div className="text-sm font-medium">Monitoramento ativo</div>
                <div className="text-xs text-muted-foreground">Se desligado, sensor não sincroniza nem alerta</div>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
            <div className="text-xs text-muted-foreground">
              Device ID Tuya: <code>{equip.tuya_device_id}</code>
            </div>
          </div>
        )}
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="destructive" onClick={remove} className="sm:mr-auto">Desvincular</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
