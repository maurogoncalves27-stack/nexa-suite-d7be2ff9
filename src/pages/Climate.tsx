import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CalendarClock, HeartHandshake } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useClimateStatus } from "@/hooks/useClimateStatus";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import ClimateRespond from "@/components/climate/ClimateRespond";
import ClimateResults from "@/components/climate/ClimateResults";
import ClimateCampaigns from "@/components/climate/ClimateCampaigns";
import ClimateQuestionsPanel from "@/components/climate/ClimateQuestionsPanel";
import ClimateComparativo from "@/components/climate/ClimateComparativo";

export interface ClimateSurvey {
  id: string;
  name: string;
  semester: number;
  year: number;
  start_date: string;
  end_date: string;
  status: "draft" | "open" | "closed";
}

export interface ClimateQuestion {
  id: string;
  dimension: "Liderança" | "Ambiente" | "Reconhecimento" | "Orgulho" | "Geral";
  text: string;
  question_type: "scale_1_5" | "enps_0_10" | "open_text";
  display_order: number;
  is_active: boolean;
}

export default function Climate({ embedded = false }: { embedded?: boolean } = {}) {
  const { isAdmin, isManager } = useAuth();
  const canManage = isAdmin || isManager;
  const climateStatus = useClimateStatus();
  // Só mostra a aba "Responder" para gestores quando eles ainda têm resposta pendente.
  const showRespondTab = !canManage || climateStatus.pendingResponse;
  const defaultTab = showRespondTab ? "respond" : (canManage ? "results" : "respond");
  const [tab, setTab] = useState<string>(defaultTab);
  // Quando o status de clima terminar de carregar e houver resposta pendente, priorizar aba Responder.
  useEffect(() => {
    if (!climateStatus.loading && climateStatus.pendingResponse) {
      setTab("respond");
    }
  }, [climateStatus.loading, climateStatus.pendingResponse]);
  const [loading, setLoading] = useState(true);
  const [openSurvey, setOpenSurvey] = useState<ClimateSurvey | null>(null);
  const [questions, setQuestions] = useState<ClimateQuestion[]>([]);

  const load = async () => {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: surveys }, { data: qs }] = await Promise.all([
      supabase
        .from("climate_surveys")
        .select("*")
        .eq("status", "open")
        .lte("start_date", today)
        .gte("end_date", today)
        .order("year", { ascending: false })
        .order("semester", { ascending: false })
        .limit(1),
      supabase
        .from("climate_questions")
        .select("*")
        .eq("is_active", true)
        .order("display_order"),
    ]);
    setOpenSurvey(((surveys ?? [])[0] as ClimateSurvey) ?? null);
    setQuestions((qs ?? []) as ClimateQuestion[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <HeartHandshake className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            Clima Organizacional
          </h1>
          <p className="text-muted-foreground">
            Pesquisa <strong>trimestral</strong>, totalmente anônima, com 4 dimensões: Liderança, Ambiente, Reconhecimento e Orgulho.
          </p>
        </div>
      )}

      {!climateStatus.loading && (
        <Card>
          <CardContent className="py-4 flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarClock className="h-4 w-4" />
            {climateStatus.nextDueDate ? (
              <span>
                Próxima pesquisa: <strong>{format(parseISO(climateStatus.nextDueDate), "dd/MM/yyyy")}</strong>
              </span>
            ) : (
              <span>Próxima pesquisa: <strong>sem data programada</strong></span>
            )}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full h-auto flex-wrap justify-start gap-1 sm:w-auto sm:inline-flex sm:flex-nowrap">
            {showRespondTab && <TabsTrigger value="respond" className="flex-1 sm:flex-none text-xs sm:text-sm">Responder</TabsTrigger>}
            {canManage && <TabsTrigger value="results" className="flex-1 sm:flex-none text-xs sm:text-sm">Resultados</TabsTrigger>}
            {canManage && <TabsTrigger value="comparativo" className="flex-1 sm:flex-none text-xs sm:text-sm">Comparativo</TabsTrigger>}
            {canManage && <TabsTrigger value="campaigns" className="flex-1 sm:flex-none text-xs sm:text-sm">Campanhas</TabsTrigger>}
            {canManage && <TabsTrigger value="questions" className="flex-1 sm:flex-none text-xs sm:text-sm">Perguntas</TabsTrigger>}
          </TabsList>

          {showRespondTab && (
            <TabsContent value="respond" className="mt-4">
              <ClimateRespond survey={openSurvey} questions={questions} onSubmitted={load} />
            </TabsContent>
          )}

          {canManage && (
            <TabsContent value="results" className="mt-4">
              <ClimateResults questions={questions} />
            </TabsContent>
          )}
          {canManage && (
            <TabsContent value="comparativo" className="mt-4">
              <ClimateComparativo questions={questions} />
            </TabsContent>
          )}
          {canManage && (
            <TabsContent value="campaigns" className="mt-4">
              <ClimateCampaigns onChanged={load} />
            </TabsContent>
          )}
          {canManage && (
            <TabsContent value="questions" className="mt-4">
              <ClimateQuestionsPanel onChanged={load} />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}
