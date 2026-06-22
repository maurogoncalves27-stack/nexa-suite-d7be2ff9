import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CalendarClock, MapPin, Video, Clock } from "lucide-react";
import { format, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Appointment {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  meeting_url: string | null;
  start_at: string;
  end_at: string | null;
  scope: string;
}

interface Props {
  employeeId: string;
  storeId: string;
  allocatedStoreId: string | null;
}

export default function UpcomingAppointmentsCard({ employeeId, storeId, allocatedStoreId }: Props) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) {
        setAppointments([]);
        setLoading(false);
        return;
      }

      const now = new Date();
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

      const { data } = await supabase
        .from("appointments")
        .select("id, title, description, location, meeting_url, start_at, end_at, scope, employee_id, store_id, status, created_by")
        .eq("status", "scheduled")
        .eq("created_by", uid)
        .gte("start_at", now.toISOString())
        .lte("start_at", weekEnd.toISOString())
        .order("start_at", { ascending: true });

      setAppointments((data ?? []) as Appointment[]);
      setLoading(false);
    };
    load();
  }, [employeeId, storeId, allocatedStoreId]);

  if (loading || appointments.length === 0) return null;

  return (
    <Card className="border-primary/20">
      <CardContent className="p-2 sm:p-3">
        <Accordion type="single" collapsible>
          <AccordionItem value="appts" className="border-0">
            <AccordionTrigger className="py-1.5 hover:no-underline">
              <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                <div className="h-8 w-8 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0">
                  <CalendarClock className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold text-foreground">
                    Compromissos da semana
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {appointments.length === 1
                      ? "1 compromisso agendado"
                      : `${appointments.length} compromissos agendados`}
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0">{appointments.length}</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-2">
              <div className="space-y-3 pt-1">
                {appointments.map((a) => {
                  const start = new Date(a.start_at);
                  const end = a.end_at ? new Date(a.end_at) : null;
                  return (
                    <div key={a.id} className="rounded-lg border bg-card p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-semibold text-sm sm:text-base leading-tight">{a.title}</h4>
                        <Badge variant="outline" className="shrink-0 capitalize">
                          {format(start, "EEE", { locale: ptBR })}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {format(start, "dd/MM 'às' HH:mm", { locale: ptBR })}
                          {end && ` – ${format(end, "HH:mm")}`}
                        </span>
                      </div>
                      {a.description && (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{a.description}</p>
                      )}
                      {a.location && (
                        <div className="flex items-center gap-1.5 text-sm">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span>{a.location}</span>
                        </div>
                      )}
                      {a.meeting_url && (
                        <a
                          href={a.meeting_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                        >
                          <Video className="h-3.5 w-3.5" />
                          Entrar na reunião
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
