import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentPosition, haversineDistanceMeters } from "@/lib/timeClock";
import { isSuperUserId } from "@/hooks/useAuth";
import { isStoreLoginId } from "@/lib/storeLogins";

export interface StoreGeofenceResult {
  /** true enquanto verifica a localização */
  loading: boolean;
  /** true se o usuário está dentro do raio de pelo menos uma das lojas informadas */
  inside: boolean;
  /** menor distância (m) até alguma das lojas, quando disponível */
  distanceM: number | null;
  /** mensagem amigável do motivo (negado, sem GPS, fora etc.) */
  reason: string | null;
  /** força nova verificação */
  refresh: () => void;
}

/**
 * Verifica se o usuário está fisicamente próximo de pelo menos uma das lojas.
 * Considera o raio de geofence definido em `stores.geofence_radius_m` (padrão 200m).
 */
export function useStoreGeofence(storeIds: (string | null | undefined)[]): StoreGeofenceResult {
  const [loading, setLoading] = useState(true);
  const [inside, setInside] = useState(false);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const ids = storeIds.filter(Boolean) as string[];
  const idsKey = ids.join(",");

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Bypass: super-usuárias OU usuárias com bypass via user_access_overrides.
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;

      let bypass = isSuperUserId(user?.id) || isStoreLoginId(user?.id);
      if (!bypass && user?.id) {
        const { data: bp } = await supabase.rpc("has_geofence_bypass", { _user_id: user.id });
        bypass = bp === true;
      }

      if (bypass) {
        setLoading(false);
        setInside(true);
        setDistanceM(0);
        setReason(null);
        return;
      }

      if (ids.length === 0) {
        setLoading(false);
        setInside(false);
        setReason("Sem loja vinculada.");
        return;
      }

      setLoading(true);
      setReason(null);

      const position = await getCurrentPosition();
      if (cancelled) return;

      if (!position?.coords) {
        setInside(false);
        setDistanceM(null);
        setReason("Não foi possível obter sua localização. Ative o GPS e permita o acesso.");
        setLoading(false);
        return;
      }

      const { data: stores } = await supabase
        .from("stores")
        .select("id, latitude, longitude, geofence_radius_m")
        .in("id", ids);

      if (cancelled) return;

      let best: number | null = null;
      let within = false;

      for (const s of stores ?? []) {
        if (s.latitude == null || s.longitude == null) continue;
        const d = haversineDistanceMeters(
          position.coords.latitude,
          position.coords.longitude,
          Number(s.latitude),
          Number(s.longitude),
        );
        const radius = s.geofence_radius_m ?? 200;
        if (best == null || d < best) best = d;
        if (d <= radius) within = true;
      }

      setInside(within);
      setDistanceM(best);
      if (!within) {
        setReason(
          best != null
            ? `Você está a ${Math.round(best)}m da loja. Aproxime-se para liberar.`
            : "Loja sem geolocalização cadastrada.",
        );
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, tick]);

  return { loading, inside, distanceM, reason, refresh };
}
