import { useState, useEffect, useCallback } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, Trash2, Thermometer, Clock, Pencil, Snowflake, AlertTriangle, RefreshCw, Radio, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { NutriTemperatureAlertsAdmin } from "./NutriTemperatureAlertsAdmin";

type EquipmentType = "freezer" | "refrigerator";

interface Equipment {
  id: string;
  name: string;
  created_by: string;
  equipment_type: EquipmentType;
  store_id: string | null;
  ems_sensor_code: string | null;
  tuya_device_id: string | null;
  tuya_sensor_type: string | null;
  last_temp_c: number | null;
  last_humidity_pct: number | null;
  last_reading_at: string | null;
  last_online: boolean;
}

interface EmsSensor {
  unique_code: string;
  label: string;
  sensor_type: string;
}

interface TemperatureReading {
  id: string;
  equipment_id: string;
  temperature: number;
  recorded_at: string;
  date: string;
  user_id: string;
  note: string;
  store_id: string;
}

interface Props {
  currentDate: Date;
  storeId: string | null;
}

const isOutOfRange = (type: EquipmentType, temp: number) => {
  if (type === "freezer") return temp > 0;
  return temp > 8;
};

export const NutriTemperatureControl = ({ currentDate, storeId }: Props) => {
  const { user, isAdmin } = useAuth();
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [readings, setReadings] = useState<TemperatureReading[]>([]);
  const [temperatureInputs, setTemperatureInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [sensors, setSensors] = useState<EmsSensor[]>([]);
  const [liveBySensor, setLiveBySensor] = useState<Record<string, { temperature: number; measured_at: string }>>({});
  const [statsBySensor, setStatsBySensor] = useState<Record<string, { count: number; min: number; max: number }>>({});


  // Dialog de criação/edição
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<EquipmentType>("refrigerator");
  const [formSensorCode, setFormSensorCode] = useState<string>("none");
  // "none" | equipment_id (origem do device Tuya que será movido para este equipamento)
  const [formTuyaSourceId, setFormTuyaSourceId] = useState<string>("none");

  const dateKey = format(currentDate, "yyyy-MM-dd");

  const fetchEquipment = useCallback(async () => {
    if (!storeId) {
      setEquipment([]);
      return;
    }
    // Cada loja vê APENAS seus próprios equipamentos
    const { data, error } = await supabase
      .from("nutri_equipment")
      .select("*")
      .eq("store_id", storeId)
      .order("created_at");
    if (error) {
      toast.error("Erro ao carregar equipamentos");
      return;
    }
    setEquipment((data ?? []) as Equipment[]);
  }, [storeId]);

  const fetchReadings = useCallback(async () => {
    if (!user || !storeId) {
      setReadings([]);
      return;
    }
    const { data, error } = await supabase
      .from("nutri_temperature_readings")
      .select("*")
      .eq("store_id", storeId)
      .eq("date", dateKey)
      .order("recorded_at", { ascending: false });
    if (error) {
      toast.error("Erro ao carregar leituras");
      return;
    }
    setReadings(data ?? []);
  }, [user, dateKey, storeId]);

  const fetchSensors = useCallback(async () => {
    if (!storeId) { setSensors([]); return; }
    const { data } = await supabase
      .from("ems_sensors")
      .select("unique_code, label, sensor_type")
      .eq("store_id", storeId)
      .eq("active", true)
      .order("label");
    setSensors((data ?? []) as EmsSensor[]);
  }, [storeId]);
  const fetchLive = useCallback(async (codes: string[]) => {
    if (!codes.length) { setLiveBySensor({}); setStatsBySensor({}); return; }
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from("ems_sensor_readings")
      .select("sensor_code, measurement, measured_at")
      .in("sensor_code", codes)
      .gte("measured_at", since)
      .order("measured_at", { ascending: false })
      .limit(5000);
    const live: Record<string, { temperature: number; measured_at: string }> = {};
    const stats: Record<string, { count: number; min: number; max: number }> = {};
    (data ?? []).forEach((r: any) => {
      const t = Number(r.measurement);
      if (!live[r.sensor_code]) {
        live[r.sensor_code] = { temperature: t, measured_at: r.measured_at };
      }
      const s = stats[r.sensor_code];
      if (!s) {
        stats[r.sensor_code] = { count: 1, min: t, max: t };
      } else {
        s.count++;
        if (t < s.min) s.min = t;
        if (t > s.max) s.max = t;
      }
    });
    setLiveBySensor(live);
    setStatsBySensor(stats);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchEquipment(), fetchReadings(), fetchSensors()]).finally(() => setLoading(false));
  }, [fetchEquipment, fetchReadings, fetchSensors]);

  // Auto-sync silencioso de sensores EMS-A: dispara ao montar e a cada 60s
  useEffect(() => {
    if (!storeId) return;
    const codes = equipment.map((e) => e.ems_sensor_code).filter(Boolean) as string[];
    if (!codes.length) return;

    const runSync = async () => {
      try {
        await supabase.functions.invoke("ems-sync-temperature", {
          body: { store_id: storeId, date: dateKey },
        });
        await Promise.all([fetchReadings(), fetchLive(codes)]);
      } catch {
        // silencioso — o botão "Sincronizar agora" mostra erros explícitos
      }
    };

    runSync();
    const interval = setInterval(runSync, 60_000);
    return () => clearInterval(interval);
  }, [storeId, equipment, dateKey, fetchReadings, fetchLive]);


  const openCreate = () => {
    setEditingId(null);
    setFormName("");
    setFormType("refrigerator");
    setFormSensorCode("none");
    setFormTuyaSourceId("none");
    setDialogOpen(true);
  };

  const openEdit = (eq: Equipment) => {
    setEditingId(eq.id);
    setFormName(eq.name);
    setFormType(eq.equipment_type);
    setFormSensorCode(eq.ems_sensor_code ?? "none");
    // se este equipamento já tem sensor Tuya vinculado, "origem" é ele mesmo
    setFormTuyaSourceId(eq.tuya_device_id ? eq.id : "none");
    setDialogOpen(true);
  };

  const saveEquipment = async () => {
    const name = formName.trim();
    if (!name || !user) return;
    if (!storeId && !editingId) {
      toast.error("Selecione uma loja antes de cadastrar equipamentos");
      return;
    }
    const sensorCode = formSensorCode === "none" ? null : formSensorCode;
    if (editingId) {
      const { error } = await supabase
        .from("nutri_equipment")
        .update({ name, equipment_type: formType, ems_sensor_code: sensorCode })
        .eq("id", editingId);
      if (error) {
        toast.error("Erro ao atualizar equipamento");
        return;
      }

      // Transferência de sensor Tuya vindo de outro equipamento -> este
      const sourceId = formTuyaSourceId;
      if (sourceId && sourceId !== "none" && sourceId !== editingId) {
        const source = equipment.find((e) => e.id === sourceId);
        if (source?.tuya_device_id) {
          const tuyaFields = {
            tuya_device_id: source.tuya_device_id,
            tuya_sensor_type: source.tuya_sensor_type,
            last_temp_c: source.last_temp_c,
            last_humidity_pct: source.last_humidity_pct,
            last_reading_at: source.last_reading_at,
            last_online: source.last_online,
          };
          // 1) libera o device na origem para não violar UNIQUE(tuya_device_id)
          const { error: e1 } = await supabase
            .from("nutri_equipment")
            .update({
              tuya_device_id: null,
              tuya_sensor_type: null,
              last_temp_c: null,
              last_humidity_pct: null,
              last_reading_at: null,
            })
            .eq("id", sourceId);
          if (e1) { toast.error("Erro ao liberar sensor de origem"); return; }
          // 2) vincula no destino
          const { error: e2 } = await supabase
            .from("nutri_equipment")
            .update(tuyaFields)
            .eq("id", editingId);
          if (e2) { toast.error("Erro ao vincular sensor Tuya"); return; }
          // 3) remove o equipamento "vazio" que era só o placeholder do sensor
          const isPlaceholder = /^refrigerador\s*\d+$/i.test(source.name) || /^sensor/i.test(source.name);
          if (isPlaceholder) {
            await supabase.from("nutri_equipment").delete().eq("id", sourceId);
          }
          toast.success("Sensor Tuya vinculado ao equipamento");
        }
      } else if (sourceId === "none") {
        // desvincula tuya deste equipamento (se tinha)
        const cur = equipment.find((e) => e.id === editingId);
        if (cur?.tuya_device_id) {
          await supabase
            .from("nutri_equipment")
            .update({ tuya_device_id: null, tuya_sensor_type: null })
            .eq("id", editingId);
        }
      }
      toast.success("Equipamento atualizado");
    } else {
      const { error } = await supabase.from("nutri_equipment").insert({
        name,
        equipment_type: formType,
        store_id: storeId,
        ems_sensor_code: sensorCode,
        created_by: user.id,
      });
      if (error) {
        toast.error("Erro ao adicionar equipamento");
        return;
      }
      toast.success("Equipamento cadastrado");
    }
    setDialogOpen(false);
    fetchEquipment();
  };

  const syncEms = async () => {
    if (!storeId) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("ems-sync-temperature", {
        body: { store_id: storeId, date: dateKey },
      });
      if (error) throw error;
      const inserted = (data as any)?.inserted ?? 0;
      toast.success(inserted > 0 ? `${inserted} leitura(s) sincronizada(s)` : "Nenhuma nova leitura");
      fetchReadings();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao sincronizar EMS-A");
    } finally {
      setSyncing(false);
    }
  };

  const removeEquipment = async (id: string) => {
    if (!confirm("Excluir este equipamento? Os registros de temperatura serão mantidos no histórico.")) return;
    const { error } = await supabase.from("nutri_equipment").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir equipamento");
      return;
    }
    fetchEquipment();
    fetchReadings();
  };

  const addReading = async (eq: Equipment) => {
    if (!user) return;
    const tempStr = temperatureInputs[eq.id];
    if (!tempStr || isNaN(parseFloat(tempStr))) {
      toast.error("Informe uma temperatura válida");
      return;
    }
    const temperature = parseFloat(tempStr);
    if (!storeId) {
      toast.error("Selecione uma loja");
      return;
    }
    const { error } = await supabase.from("nutri_temperature_readings").insert({
      equipment_id: eq.id,
      store_id: storeId,
      temperature,
      date: dateKey,
      user_id: user.id,
      recorded_at: new Date().toISOString(),
    });
    if (error) {
      toast.error("Erro ao registrar temperatura");
      return;
    }
    setTemperatureInputs((prev) => ({ ...prev, [eq.id]: "" }));
    fetchReadings();
    if (isOutOfRange(eq.equipment_type, temperature)) {
      toast.warning(
        eq.equipment_type === "freezer"
          ? `⚠️ ${eq.name}: temperatura acima de 0°C — verifique possível necessidade de manutenção`
          : `⚠️ ${eq.name}: temperatura acima de 8°C — verifique possível necessidade de manutenção`,
        { duration: 6000 },
      );
    } else {
      toast.success("Temperatura registrada!");
    }
  };

  const removeReading = async (id: string) => {
    const { error } = await supabase.from("nutri_temperature_readings").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir leitura");
      return;
    }
    fetchReadings();
  };

  if (loading) {
    return <p className="text-center text-muted-foreground py-12 text-sm">Carregando...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          {equipment.length} equipamento(s) cadastrado(s)
        </p>
        <div className="flex items-center gap-2">
          {equipment.some((e) => e.ems_sensor_code) && (
            <Button size="sm" variant="outline" onClick={syncEms} disabled={syncing || !storeId} className="gap-1">
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              Sincronizar agora
            </Button>
          )}
          <Button size="sm" onClick={openCreate} disabled={!storeId} className="gap-1">
            <Plus className="h-4 w-4" />
            Novo equipamento
          </Button>
        </div>
      </div>

      {!storeId && (
        <p className="text-center text-muted-foreground py-6 text-sm">
          Selecione uma loja para visualizar os equipamentos.
        </p>
      )}

      {storeId && equipment.length === 0 && (
        <p className="text-center text-muted-foreground py-12 text-sm">
          Nenhum equipamento cadastrado para esta loja.
        </p>
      )}

      {equipment.map((eq) => {
        const eqReadings = readings.filter((r) => r.equipment_id === eq.id);
        const Icon = eq.equipment_type === "freezer" ? Snowflake : Thermometer;
        const typeLabel = eq.equipment_type === "freezer" ? "Congelador" : "Refrigerador";
        const limitLabel = eq.equipment_type === "freezer" ? "até 0°C" : "até 8°C";
        const isTuya = !!eq.tuya_device_id;
        const isAuto = !!eq.ems_sensor_code || isTuya;
        const emsLive = eq.ems_sensor_code ? liveBySensor[eq.ems_sensor_code] : null;
        const tuyaLive = isTuya && eq.last_temp_c != null && eq.last_reading_at
          ? { temperature: Number(eq.last_temp_c), measured_at: eq.last_reading_at }
          : null;
        const live = emsLive ?? tuyaLive;
        const stats = eq.ems_sensor_code ? statsBySensor[eq.ems_sensor_code] : null;
        const liveAgeMin = live ? (Date.now() - new Date(live.measured_at).getTime()) / 60000 : Infinity;
        const isOnline = isTuya ? (eq.last_online && liveAgeMin < 30) : (!!live && liveAgeMin < 30);

        const isColdChamber = /c[âa]mara\s*fria/i.test(eq.name);
        const hideManageButtons = isColdChamber;

        if (isAuto) {
          const out = live ? isOutOfRange(eq.equipment_type, live.temperature) : false;

          return (
            <div key={eq.id} className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="p-3 border-b border-border space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-base font-semibold text-foreground">{eq.name}</span>
                  {!hideManageButtons && (

                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(eq)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeEquipment(eq.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Icon className="h-4 w-4 text-primary shrink-0" />
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {typeLabel} · {limitLabel}
                  </Badge>
                </div>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1 text-primary border-primary/40">
                  <Radio className="h-2.5 w-2.5" /> Automático ({isTuya ? "Tuya" : "EMS-A"})
                </Badge>
              </div>


              <div className="flex items-start justify-between gap-3 p-3">
                <Badge
                  variant="outline"
                  className={`gap-1 ${isOnline ? "border-success/60 text-success" : "border-muted-foreground/40 text-muted-foreground"}`}
                >
                  {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                  {isOnline ? "online" : "offline"}
                </Badge>
                <div className="text-right">
                  {live ? (
                    <>
                      <div className={`text-2xl font-bold ${out ? "text-destructive" : "text-foreground"}`}>
                        {live.temperature.toFixed(1)}°C
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(live.measured_at), { locale: ptBR, addSuffix: true })}
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground">Sem leitura recente</div>
                  )}
                </div>
              </div>

              {stats && stats.count > 0 && (
                <div className="px-3 pb-3 text-xs text-muted-foreground">
                  {stats.count} leituras nas últimas 24h · mín {stats.min.toFixed(1)}°C · máx {stats.max.toFixed(1)}°C
                </div>
              )}
            </div>
          );
        }

        return (
          <div key={eq.id} className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="flex items-center gap-3 p-3 border-b border-border">
              <Icon className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-foreground">{eq.name}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {typeLabel} · {limitLabel}
                  </Badge>
                </div>
              </div>
              {!hideManageButtons && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(eq)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeEquipment(eq.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>


            <div className="flex items-center gap-2 p-3 border-b border-border/50">
              <Input
                type="number"
                step="0.1"
                placeholder="°C"
                value={temperatureInputs[eq.id] ?? ""}
                onChange={(e) => setTemperatureInputs((prev) => ({ ...prev, [eq.id]: e.target.value }))}
                className="h-8"
              />
              <Button size="sm" onClick={() => addReading(eq)} disabled={!temperatureInputs[eq.id]}>
                Registrar
              </Button>
            </div>

            {eqReadings.length > 0 ? (
              <div className="divide-y divide-border/50">
                {eqReadings.map((reading) => {
                  const out = isOutOfRange(eq.equipment_type, reading.temperature);
                  return (
                    <div key={reading.id} className="flex items-center gap-2 px-3 py-2">
                      <span className={`text-sm font-medium ${out ? "text-destructive" : "text-foreground"}`}>
                        {reading.temperature}°C
                      </span>
                      {out && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0 gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Fora do limite
                        </Badge>
                      )}
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {format(new Date(reading.recorded_at), "HH:mm", { locale: ptBR })}
                      </span>
                      <span className="flex-1" />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => removeReading(reading.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground px-3 py-2">Nenhum registro hoje.</p>
            )}
          </div>
        );
      })}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar equipamento" : "Novo equipamento"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="eq-name">Nome do equipamento</Label>
              <Input
                id="eq-name"
                placeholder="Ex: Freezer F1"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={formType} onValueChange={(v) => setFormType(v as EquipmentType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="refrigerator">Refrigerador (até 8°C)</SelectItem>
                  <SelectItem value="freezer">Congelador (até 0°C)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Radio className="h-3.5 w-3.5 text-primary" /> Sensor EMS-A (opcional)
              </Label>
              <Select value={formSensorCode} onValueChange={setFormSensorCode}>
                <SelectTrigger>
                  <SelectValue placeholder="Sem sensor automático" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem sensor (registro manual)</SelectItem>
                  {sensors.map((s) => (
                    <SelectItem key={s.unique_code} value={s.unique_code}>
                      {s.label} <span className="text-muted-foreground text-xs ml-1">({s.unique_code})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {sensors.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Nenhum sensor EMS-A cadastrado para esta loja.
                </p>
              )}
            </div>
            {editingId && (() => {
              // Todos os sensores Tuya vinculados nesta loja (inclui o próprio equipamento se já tiver)
              const tuyaOptions = equipment.filter((e) => !!e.tuya_device_id);
              return (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Radio className="h-3.5 w-3.5 text-primary" /> Sensor Tuya (opcional)
                  </Label>
                  <Select value={formTuyaSourceId} onValueChange={setFormTuyaSourceId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sem sensor Tuya" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {tuyaOptions.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.id === editingId ? "(vinculado atualmente)" : `Mover de "${e.name}"`}
                          <span className="text-muted-foreground text-xs ml-2">{e.tuya_device_id?.slice(0, 10)}…</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {tuyaOptions.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      Nenhum sensor Tuya pareado nesta loja. Pareie em Sensores IoT.
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Selecione um sensor pareado para transferi-lo para este equipamento. O equipamento origem é removido se for apenas um placeholder do sensor.
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveEquipment} disabled={!formName.trim()}>
              {editingId ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NutriTemperatureAlertsAdmin storeId={storeId} />
    </div>
  );
};
