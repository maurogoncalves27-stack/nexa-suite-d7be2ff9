import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Thermometer, RefreshCw, Plus, Settings2, Wifi, WifiOff, Battery, BatteryLow, BatteryMedium, BatteryFull, Store as StoreIcon, Wrench, Trash2 } from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import SmartDevicesPanel from "@/components/nutri/SmartDevicesPanel";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

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
  last_battery_pct: number | null;
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

type EquipType = {
  id: string;
  name: string;
  min_temp_c: number;
  max_temp_c: number;
  sort_order: number;
  active: boolean;
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
  const [editingEms, setEditingEms] = useState<EmsSensor | null>(null);
  const [emsSensors, setEmsSensors] = useState<EmsSensor[]>([]);
  const [equipTypes, setEquipTypes] = useState<EquipType[]>([]);
  const [typesOpen, setTypesOpen] = useState(false);

  async function loadTypes() {
    const { data } = await supabase.from("nutri_equipment_types").select("*").order("sort_order").order("name");
    setEquipTypes((data ?? []) as EquipType[]);
  }



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

  useEffect(() => { load(); loadTypes(); }, []);

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

  // Agrupa TODOS os sensores (EMS-A + Tuya) por loja
  const groupedByStore = useMemo(() => {
    const map = new Map<string, { store: Store | null; ems: EmsSensor[]; tuya: Equip[] }>();
    const bucket = (id: string | null) => {
      const key = id ?? "__unassigned";
      if (!map.has(key)) {
        map.set(key, { store: stores.find((s) => s.id === id) ?? null, ems: [], tuya: [] });
      }
      return map.get(key)!;
    };
    for (const s of emsSensors) bucket(s.store_id).ems.push(s);
    for (const e of equips) bucket(e.store_id).tuya.push(e);
    // ordena: lojas com nome primeiro (alfabético), depois "sem loja"
    return Array.from(map.entries()).sort(([ka, a], [kb, b]) => {
      if (ka === "__unassigned") return 1;
      if (kb === "__unassigned") return -1;
      return (a.store?.name ?? "").localeCompare(b.store?.name ?? "");
    });
  }, [emsSensors, equips, stores]);

  const hasAny = emsSensors.length > 0 || equips.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Thermometer className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Sensores e dispositivos
        </h1>
        <p className="text-muted-foreground">
          Sensores de temperatura (Tuya + EMS-A) e demais dispositivos Smart Life (portas, interruptores, exaustores) agrupados por loja.
        </p>
      </div>

      <Tabs defaultValue="temperature" className="space-y-4">
        <TabsList>
          <TabsTrigger value="temperature">Temperatura</TabsTrigger>
          <TabsTrigger value="others">Outros dispositivos</TabsTrigger>
        </TabsList>

        <TabsContent value="temperature" className="space-y-4">
          <div className="flex gap-2 flex-wrap justify-end">
            <Button variant="outline" onClick={() => setTypesOpen(true)}>
              <Wrench className="h-4 w-4 mr-2" />
              Configurar equipamentos
            </Button>
            <Button variant="outline" onClick={runSync} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
              Sincronizar agora
            </Button>
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar sensor
            </Button>
          </div>



      {loading ? (
        <div className="text-muted-foreground text-sm">Carregando…</div>
      ) : !hasAny ? (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <Thermometer className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Nenhum sensor vinculado ainda.</p>
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4 mr-2" /> Adicionar primeiro sensor
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Accordion type="multiple" defaultValue={groupedByStore.map(([k]) => k)} className="space-y-3">
          {groupedByStore.map(([key, { store, ems, tuya }]) => {
            const total = ems.length + tuya.length;
            let offlineCount = 0;
            let outCount = 0;
            for (const s of ems) {
              const ageMin = s.last_measured_at ? (Date.now() - new Date(s.last_measured_at).getTime()) / 60_000 : Infinity;
              const online = s.last_measurement !== null && ageMin < 30;
              if (!online) offlineCount++;
              else if (s.last_measurement !== null && ((s.min_value !== null && s.last_measurement < Number(s.min_value)) || (s.max_value !== null && s.last_measurement > Number(s.max_value)))) outCount++;
            }
            for (const eq of tuya) {
              if (!eq.last_online) offlineCount++;
              else if (eq.last_temp_c !== null && ((eq.min_temp_c !== null && eq.last_temp_c < Number(eq.min_temp_c)) || (eq.max_temp_c !== null && eq.last_temp_c > Number(eq.max_temp_c)))) outCount++;
            }
            const okCount = total - offlineCount - outCount;
            return (
              <AccordionItem key={key} value={key} className="border rounded-lg bg-card">
                <AccordionTrigger className="px-4 hover:no-underline">
                  <div className="flex items-center gap-2 flex-1 flex-wrap">
                    <StoreIcon className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-semibold text-base">{store?.name ?? "Sem loja vinculada"}</span>
                    <div className="flex items-center gap-1.5 ml-auto mr-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{total} sensor{total === 1 ? "" : "es"}</Badge>
                      {okCount > 0 && <Badge className="bg-success text-success-foreground text-[10px]">{okCount} OK</Badge>}
                      {outCount > 0 && <Badge className="bg-destructive text-destructive-foreground text-[10px]">{outCount} fora da faixa</Badge>}
                      {offlineCount > 0 && <Badge className="bg-muted text-muted-foreground text-[10px]">{offlineCount} offline</Badge>}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-3 pb-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {ems.map((s) => {
                      const temp = s.last_measurement;
                      const ageMin = s.last_measured_at
                        ? (Date.now() - new Date(s.last_measured_at).getTime()) / 60_000
                        : Infinity;
                      const online = temp !== null && ageMin < 30;
                      const outOfRange =
                        temp !== null &&
                        ((s.min_value !== null && temp < Number(s.min_value)) ||
                          (s.max_value !== null && temp > Number(s.max_value)));
                      return (
                        <Card key={s.unique_code} className="overflow-hidden">
                          <CardHeader className="py-2 px-3 pb-1 space-y-0">
                            <div className="flex items-start justify-between gap-2">
                              <CardTitle className="text-sm leading-tight">{s.label ?? s.unique_code}</CardTitle>
                              <div className="flex flex-col gap-0.5 items-end">
                                <Badge className={online ? "bg-success text-success-foreground text-[10px]" : "bg-muted text-muted-foreground text-[10px]"}>
                                  {online ? <Wifi className="h-2.5 w-2.5 mr-1" /> : <WifiOff className="h-2.5 w-2.5 mr-1" />}
                                  {online ? "Online" : "Offline"}
                                </Badge>
                                {online && (
                                  <Badge className={outOfRange ? "bg-destructive text-destructive-foreground text-[10px]" : "bg-success text-success-foreground text-[10px]"}>
                                    {outOfRange ? "Fora" : "OK"}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                              <Badge variant="outline" className="text-[9px] px-1 py-0">EMS-A</Badge>
                              <span>{s.min_value ?? "?"}~{s.max_value ?? "?"}°C</span>
                            </div>
                          </CardHeader>
                          <CardContent className="px-3 py-2 space-y-1">
                            <div className={`text-2xl font-bold leading-none ${outOfRange ? "text-destructive" : ""}`}>
                              {temp !== null ? `${temp.toFixed(1)}°C` : "—"}
                            </div>
                            <div className="text-[10px] text-muted-foreground leading-tight">
                              {s.last_measured_at
                                ? `Atualizado ${formatDistanceToNow(new Date(s.last_measured_at), { addSuffix: true, locale: ptBR })}`
                                : "Sem leituras"}
                            </div>
                            <Button variant="outline" size="sm" className="w-full h-7 text-xs mt-1" onClick={() => setEditingEms(s)}>
                              <Settings2 className="h-3 w-3 mr-1.5" /> Configurar
                            </Button>
                          </CardContent>
                        </Card>
                      );
                    })}

                    {tuya.map((eq) => {
                      const temp = eq.last_temp_c;
                      const outOfRange =
                        temp !== null &&
                        ((eq.min_temp_c !== null && temp < Number(eq.min_temp_c)) ||
                          (eq.max_temp_c !== null && temp > Number(eq.max_temp_c)));
                      const batt = eq.last_battery_pct;
                      const BattIcon = batt == null ? null : batt >= 70 ? BatteryFull : batt >= 30 ? BatteryMedium : batt >= 10 ? BatteryLow : Battery;
                      const battCls = batt == null ? "" : batt >= 30 ? "text-success" : batt >= 15 ? "text-warning" : "text-destructive";
                      return (
                        <Card key={eq.id} className="overflow-hidden">
                          <CardHeader className="py-2 px-3 pb-1 space-y-0">
                            <div className="flex items-start justify-between gap-2">
                              <CardTitle className="text-sm leading-tight">{eq.name}</CardTitle>
                              <div className="flex flex-col gap-0.5 items-end">
                                <Badge className={eq.last_online ? "bg-success text-success-foreground text-[10px]" : "bg-muted text-muted-foreground text-[10px]"}>
                                  {eq.last_online ? <Wifi className="h-2.5 w-2.5 mr-1" /> : <WifiOff className="h-2.5 w-2.5 mr-1" />}
                                  {eq.last_online ? "Online" : "Offline"}
                                </Badge>
                                {eq.last_online && (
                                  <Badge className={outOfRange ? "bg-destructive text-destructive-foreground text-[10px]" : "bg-success text-success-foreground text-[10px]"}>
                                    {outOfRange ? "Fora" : "OK"}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                              <Badge variant="outline" className="text-[9px] px-1 py-0">Tuya</Badge>
                              <span>{eq.min_temp_c ?? "?"}~{eq.max_temp_c ?? "?"}°C</span>
                            </div>
                          </CardHeader>
                          <CardContent className="px-3 py-2 space-y-1">
                            <div className="flex items-center justify-between">
                              <div className={`text-2xl font-bold leading-none ${outOfRange ? "text-destructive" : ""}`}>
                                {temp !== null ? `${Number(temp).toFixed(1)}°C` : "—"}
                              </div>
                              {BattIcon && (
                                <div className={`flex items-center gap-1 text-[10px] font-medium ${battCls}`}>
                                  <BattIcon className="h-3 w-3" />
                                  {batt}%
                                </div>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground leading-tight">
                              {eq.last_reading_at
                                ? `Atualizado ${formatDistanceToNow(new Date(eq.last_reading_at), { addSuffix: true, locale: ptBR })}`
                                : "Sem leituras"}
                            </div>
                            <Button variant="outline" size="sm" className="w-full h-7 text-xs mt-1" onClick={() => setEditing(eq)}>
                              <Settings2 className="h-3 w-3 mr-1.5" /> Configurar
                            </Button>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
        </TabsContent>

        <TabsContent value="others">
          <SmartDevicesPanel />
        </TabsContent>
      </Tabs>

      <AddSensorDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        loading={loadingDevices}
        devices={availableDevices}
        stores={stores}
        types={equipTypes}
        onSaved={() => { setAddOpen(false); load(); }}
      />

      <EditSensorDialog
        equip={editing}
        stores={stores}
        types={equipTypes}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />

      <EditEmsSensorDialog
        sensor={editingEms}
        stores={stores}
        types={equipTypes}
        onOpenChange={(o) => !o && setEditingEms(null)}
        onSaved={() => { setEditingEms(null); load(); }}
      />

      <EquipmentTypesDialog
        open={typesOpen}
        onOpenChange={setTypesOpen}
        types={equipTypes}
        onChanged={loadTypes}
      />
    </div>

  );
}

function EditEmsSensorDialog({
  sensor, stores, onOpenChange, onSaved,
}: {
  sensor: EmsSensor | null;
  stores: Store[];
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState("");
  const [storeId, setStoreId] = useState<string>("");
  const [minV, setMinV] = useState<string>("");
  const [maxV, setMaxV] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sensor) {
      setLabel(sensor.label ?? "");
      setStoreId(sensor.store_id ?? "");
      setMinV(sensor.min_value?.toString() ?? "");
      setMaxV(sensor.max_value?.toString() ?? "");
    }
  }, [sensor]);

  async function save() {
    if (!sensor) return;
    setSaving(true);
    const { error } = await supabase.from("ems_sensors")
      .update({
        label: label || null,
        store_id: storeId || null,
        min_value: minV === "" ? null : Number(minV),
        max_value: maxV === "" ? null : Number(maxV),
      })
      .eq("unique_code", sensor.unique_code);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Sensor atualizado");
    onSaved();
  }

  return (
    <Dialog open={!!sensor} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configurar sensor EMS-A</DialogTitle>
        </DialogHeader>
        {sensor && (
          <div className="space-y-3">
            <div>
              <Label>Apelido</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex: Câmara Fria Cozinha" />
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Temp. mínima (°C)</Label>
                <Input type="number" step="0.1" value={minV} onChange={(e) => setMinV(e.target.value)} />
              </div>
              <div>
                <Label>Temp. máxima (°C)</Label>
                <Input type="number" step="0.1" value={maxV} onChange={(e) => setMaxV(e.target.value)} />
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Código do sensor: <code>{sensor.unique_code}</code>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      equipment_type: type === "freezer" ? "freezer" : "refrigerator",
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
