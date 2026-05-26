import { useCallback, useEffect, useRef } from "react";
import { driver, type DriveStep, type Config } from "driver.js";
import "driver.js/dist/driver.css";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface UseGuidedTourOptions {
  /** Identificador único do tour (ex: "employee-area-v1"). Versione ao mudar passos significativamente. */
  tourKey: string;
  steps: DriveStep[];
  /** Quando true, dispara automaticamente no primeiro acesso. Default: true. */
  autoStart?: boolean;
  /** Aguarda este ms antes de iniciar (para esperar elementos renderizarem). Default: 800. */
  delayMs?: number;
  /** Sobrescreve config do driver.js. */
  driverConfig?: Partial<Config>;
  /** Só inicia quando este sinalizador for true (ex: dados carregados). */
  ready?: boolean;
}

/**
 * Hook genérico de tour guiado (driver.js) com persistência por usuário.
 *
 * - Lê `user_tour_progress` ao montar; se já houver registro para este `tourKey`,
 *   não dispara automaticamente.
 * - Ao concluir/dispensar, grava timestamp no banco.
 * - Retorna `start()` para refazer manualmente (ex: botão "Refazer tutorial").
 */
export function useGuidedTour({
  tourKey,
  steps,
  autoStart = true,
  delayMs = 800,
  driverConfig,
  ready = true,
}: UseGuidedTourOptions) {
  const { user } = useAuth();
  const startedRef = useRef(false);

  const markCompleted = useCallback(async () => {
    if (!user?.id) return;
    await supabase
      .from("user_tour_progress")
      .upsert(
        { user_id: user.id, tour_key: tourKey, completed_at: new Date().toISOString() },
        { onConflict: "user_id,tour_key" },
      );
  }, [user?.id, tourKey]);

  const start = useCallback(() => {
    const d = driver({
      showProgress: true,
      allowClose: true,
      animate: true,
      smoothScroll: true,
      stagePadding: 6,
      stageRadius: 10,
      overlayOpacity: 0.6,
      nextBtnText: "Próximo →",
      prevBtnText: "← Voltar",
      doneBtnText: "Concluir",
      progressText: "{{current}} de {{total}}",
      steps,
      onDestroyed: () => {
        markCompleted();
      },
      ...driverConfig,
    });
    d.drive();
  }, [steps, driverConfig, markCompleted]);

  useEffect(() => {
    if (!autoStart || !user?.id || !ready || startedRef.current) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_tour_progress")
        .select("id")
        .eq("user_id", user.id)
        .eq("tour_key", tourKey)
        .maybeSingle();
      if (cancelled || data) return;
      startedRef.current = true;
      setTimeout(() => {
        // Confirma que o primeiro elemento existe antes de iniciar
        const first = steps[0]?.element;
        if (typeof first === "string" && !document.querySelector(first)) return;
        start();
      }, delayMs);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, tourKey, autoStart, ready, delayMs, steps, start]);

  return { start, markCompleted };
}
