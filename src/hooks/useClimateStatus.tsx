import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface ClimateStatus {
  /** Pesquisa atualmente aberta (dentro do período e status open). */
  openSurvey: { id: string; name: string; start_date: string; end_date: string } | null;
  /** O usuário ainda precisa responder a pesquisa aberta? */
  pendingResponse: boolean;
  /** Última data em que o usuário respondeu qualquer pesquisa. */
  lastAnsweredAt: string | null;
  /** Próxima data prevista (6 meses após a última resposta). */
  nextDueDate: string | null;
  /** Dias restantes até a próxima pesquisa obrigatória (ou negativo se atrasada). */
  daysUntilNext: number | null;
  loading: boolean;
  refresh: () => void;
}

const QUARTER_MS = 1000 * 60 * 60 * 24 * 91; // ~3 meses (trimestral)

export function useClimateStatus(): ClimateStatus {
  const { user } = useAuth();
  const [openSurvey, setOpenSurvey] = useState<ClimateStatus["openSurvey"]>(null);
  const [pendingResponse, setPendingResponse] = useState(false);
  const [lastAnsweredAt, setLastAnsweredAt] = useState<string | null>(null);
  const [nextDueDate, setNextDueDate] = useState<string | null>(null);
  const [daysUntilNext, setDaysUntilNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const today = new Date().toISOString().slice(0, 10);

      const [{ data: surveys }, { data: tokens }] = await Promise.all([
        supabase
          .from("climate_surveys")
          .select("id, name, start_date, end_date")
          .eq("status", "open")
          .lte("start_date", today)
          .gte("end_date", today)
          .order("start_date", { ascending: false })
          .limit(1),
        supabase
          .from("climate_response_tokens")
          .select("survey_id, submitted_at")
          .eq("user_id", user.id)
          .order("submitted_at", { ascending: false }),
      ]);

      if (cancelled) return;

      const survey = (surveys ?? [])[0] ?? null;
      const last = (tokens ?? [])[0] ?? null;
      const respondedToCurrent = !!survey && !!(tokens ?? []).find((t) => t.survey_id === survey.id);

      setOpenSurvey(survey);
      setPendingResponse(!!survey && !respondedToCurrent);
      setLastAnsweredAt(last?.submitted_at ?? null);

      if (last?.submitted_at) {
        const next = new Date(new Date(last.submitted_at).getTime() + SIX_MONTHS_MS);
        const nextStr = next.toISOString().slice(0, 10);
        setNextDueDate(nextStr);
        const diff = Math.ceil((next.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        setDaysUntilNext(diff);
      } else {
        setNextDueDate(null);
        setDaysUntilNext(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, tick]);

  return { openSurvey, pendingResponse, lastAnsweredAt, nextDueDate, daysUntilNext, loading, refresh };
}
