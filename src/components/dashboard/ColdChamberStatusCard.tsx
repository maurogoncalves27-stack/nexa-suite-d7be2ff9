import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Snowflake, Radio, Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

// Sensor EMS-A da Câmara Fria - Asa Sul
const SENSOR_CODE = "87510296";

export default function ColdChamberStatusCard() {
  const { data } = useQuery({
    queryKey: ["cold-chamber-asa-sul", SENSOR_CODE],
    queryFn: async () => {
      const [{ data: sensor }, { data: reading }] = await Promise.all([
        supabase
          .from("ems_sensors")
          .select("label, min_value, max_value")
          .eq("unique_code", SENSOR_CODE)
          .maybeSingle(),
        supabase
          .from("ems_sensor_readings")
          .select("measurement, measured_at")
          .eq("sensor_code", SENSOR_CODE)
          .order("measured_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      return { sensor, reading };
    },
    refetchInterval: 60_000,
  });

  const reading = data?.reading;
  const sensor = data?.sensor;
  const ageMin = reading ? (Date.now() - new Date(reading.measured_at).getTime()) / 60_000 : Infinity;
  const isOnline = !!reading && ageMin < 30;
  const limitLabel = sensor?.max_value != null ? `até ${Number(sensor.max_value)}°C` : "até 0°C";
  const temp = reading ? Number(reading.measurement) : null;
  const out =
    temp != null &&
    sensor &&
    ((sensor.min_value != null && temp < Number(sensor.min_value)) ||
      (sensor.max_value != null && temp > Number(sensor.max_value)));

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="p-3 border-b border-border space-y-2">
        <div className="text-base font-semibold text-foreground">Câmara Fria · Asa Sul</div>
        <div className="flex items-center gap-2 flex-wrap">
          <Snowflake className="h-4 w-4 text-primary shrink-0" />
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            Congelador · {limitLabel}
          </Badge>
        </div>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1 text-primary border-primary/40">
          <Radio className="h-2.5 w-2.5" /> Automático (EMS-A)
        </Badge>
      </div>

      <div className="flex items-center justify-between gap-3 p-3">
        <Badge
          variant="outline"
          className={`gap-1 ${
            isOnline ? "border-success/60 text-success" : "border-muted-foreground/40 text-muted-foreground"
          }`}
        >
          {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {isOnline ? "online" : "offline"}
        </Badge>
        <div className="text-right">
          {reading ? (
            <>
              <div className={`text-2xl font-bold ${out ? "text-destructive" : "text-foreground"}`}>
                {temp!.toFixed(1)}°C
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(reading.measured_at), { locale: ptBR, addSuffix: true })}
              </div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground">Sem leitura recente</div>
          )}
        </div>
      </div>
    </div>
  );
}
