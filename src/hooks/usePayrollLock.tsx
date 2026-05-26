import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

const HEARTBEAT_MS = 60_000; // 1 min
const STALE_MINUTES = 5;

export type PayrollLock = {
  id: string;
  reference_year: number;
  reference_month: number;
  user_id: string;
  user_name: string | null;
  acquired_at: string;
  last_heartbeat: string;
};

export function usePayrollLock(year: number, month: number) {
  const { user } = useAuth();
  const [lock, setLock] = useState<PayrollLock | null>(null);
  const [loading, setLoading] = useState(true);
  const heartbeatRef = useRef<number | null>(null);

  const isStale = useCallback((l: PayrollLock | null) => {
    if (!l) return true;
    const ageMs = Date.now() - new Date(l.last_heartbeat).getTime();
    return ageMs > STALE_MINUTES * 60_000;
  }, []);

  const ownsLock = !!user && !!lock && lock.user_id === user.id && !isStale(lock);
  const blockedByOther = !!lock && lock.user_id !== user?.id && !isStale(lock);

  const fetchLock = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("payroll_edit_locks")
      .select("*")
      .eq("reference_year", year)
      .eq("reference_month", month)
      .maybeSingle();
    setLock((data as PayrollLock) ?? null);
    setLoading(false);
  }, [year, month]);

  // realtime
  useEffect(() => {
    fetchLock();
    const channel = supabase
      .channel(`payroll-lock-${year}-${month}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "payroll_edit_locks",
          filter: `reference_year=eq.${year}`,
        },
        (payload: any) => {
          const row = (payload.new ?? payload.old) as PayrollLock | undefined;
          if (!row || row.reference_month !== month) return;
          if (payload.eventType === "DELETE") setLock(null);
          else setLock(payload.new as PayrollLock);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [year, month, fetchLock]);

  const acquire = useCallback(async (force = false): Promise<boolean> => {
    if (!user) return false;
    const userName =
      (user.user_metadata as any)?.full_name ||
      (user.user_metadata as any)?.name ||
      user.email ||
      "Usuário";

    const now = new Date().toISOString();

    // Fetch current
    const { data: current } = await (supabase as any)
      .from("payroll_edit_locks")
      .select("*")
      .eq("reference_year", year)
      .eq("reference_month", month)
      .maybeSingle();

    if (current) {
      const stale =
        Date.now() - new Date(current.last_heartbeat).getTime() > STALE_MINUTES * 60_000;
      if (current.user_id === user.id || stale || force) {
        const { error } = await (supabase as any)
          .from("payroll_edit_locks")
          .update({
            user_id: user.id,
            user_name: userName,
            acquired_at: now,
            last_heartbeat: now,
          })
          .eq("id", current.id);
        if (error) return false;
        await fetchLock();
        return true;
      }
      return false;
    }

    const { error } = await (supabase as any).from("payroll_edit_locks").insert({
      reference_year: year,
      reference_month: month,
      user_id: user.id,
      user_name: userName,
      acquired_at: now,
      last_heartbeat: now,
    });
    if (error) {
      // race: someone else inserted first
      await fetchLock();
      return false;
    }
    await fetchLock();
    return true;
  }, [user, year, month, fetchLock]);

  const release = useCallback(async () => {
    if (!user || !lock || lock.user_id !== user.id) return;
    await (supabase as any)
      .from("payroll_edit_locks")
      .delete()
      .eq("id", lock.id);
  }, [user, lock]);

  // Heartbeat while owning
  useEffect(() => {
    if (!ownsLock || !lock) {
      if (heartbeatRef.current) {
        window.clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      return;
    }
    const tick = async () => {
      await (supabase as any)
        .from("payroll_edit_locks")
        .update({ last_heartbeat: new Date().toISOString() })
        .eq("id", lock.id);
    };
    heartbeatRef.current = window.setInterval(tick, HEARTBEAT_MS);
    return () => {
      if (heartbeatRef.current) {
        window.clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [ownsLock, lock]);

  // Release on unload
  useEffect(() => {
    const handler = () => {
      if (ownsLock && lock) {
        // best-effort, fire-and-forget
        navigator.sendBeacon?.(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/payroll_edit_locks?id=eq.${lock.id}`,
        );
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [ownsLock, lock]);

  return {
    lock,
    loading,
    ownsLock,
    blockedByOther,
    isStale: isStale(lock),
    acquire,
    release,
    refresh: fetchLock,
  };
}
