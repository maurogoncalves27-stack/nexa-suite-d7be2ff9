import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, MapPin, AlertTriangle, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ENTRY_TYPE_LABEL, TimeClockEntryType } from "@/lib/timeClock";

interface Entry {
  id: string;
  entry_at: string;
  entry_type: TimeClockEntryType;
  reference_date: string;
  is_manual: boolean;
  is_outside_geofence: boolean;
  distance_from_store_m: number | null;
  notes: string | null;
}

interface Props {
  employeeId: string;
}

export default function EmployeePunchHistory({ employeeId }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("time_clock_entries")
        .select("id, entry_at, entry_type, reference_date, is_manual, is_outside_geofence, distance_from_store_m, notes")
        .eq("employee_id", employeeId)
        .order("entry_at", { ascending: false })
        .limit(30);
      if (!alive) return;
      setEntries((data ?? []) as Entry[]);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [employeeId]);

  const shown = expanded ? entries : entries.slice(0, 5);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" /> Histórico de Ponto
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : entries.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma batida registrada ainda.</p>
        ) : (
          <>
            <div className="divide-y divide-border">
              {shown.map((e) => (
                <div key={e.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="text-center min-w-[3rem]">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {format(new Date(e.entry_at), "dd/MMM", { locale: ptBR })}
                    </p>
                    <p className="text-sm font-semibold tabular-nums">
                      {format(new Date(e.entry_at), "HH:mm")}
                    </p>
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm font-medium">{ENTRY_TYPE_LABEL[e.entry_type]}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {e.is_manual && <Badge variant="outline" className="text-[10px]">Manual</Badge>}
                      {e.is_outside_geofence && (
                        <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30 gap-1">
                          <AlertTriangle className="h-2.5 w-2.5" /> Fora da loja
                        </Badge>
                      )}
                      {e.distance_from_store_m != null && !e.is_outside_geofence && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <MapPin className="h-2.5 w-2.5" />
                          {Math.round(e.distance_from_store_m)} m
                        </Badge>
                      )}
                    </div>
                    {e.notes && <p className="text-xs text-muted-foreground line-clamp-2">{e.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
            {entries.length > 5 && (
              <div className="border-t border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full rounded-none text-xs"
                  onClick={() => setExpanded((v) => !v)}
                >
                  {expanded
                    ? <>Mostrar menos <ChevronUp className="h-3 w-3 ml-1" /></>
                    : <>Ver todas ({entries.length}) <ChevronDown className="h-3 w-3 ml-1" /></>}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
