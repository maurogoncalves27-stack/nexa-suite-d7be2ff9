import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { isStoreLoginId } from "@/lib/storeLogins";

const INACTIVITY_MS = 10 * 60 * 1000; // 10 minutos
const ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "touchstart",
  "scroll",
  "click",
  "visibilitychange",
] as const;

/**
 * Desloga automaticamente o usuário após 10 minutos de inatividade.
 * Aplica-se SOMENTE a usuários que não são admin nem gestor.
 *
 * Considera "atividade" qualquer interação (mouse, teclado, toque, scroll)
 * e o retorno da aba ao estado visível.
 */
export function useInactivityLogout() {
  const { user, isAdmin, isManager, signOut, loading } = useAuth();
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    // Admin e gestor não são deslogados por inatividade
    if (isAdmin || isManager) return;
    // Logins fixos de PC de loja não deslogam por inatividade
    if (isStoreLoginId(user.id)) return;

    const clearTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const triggerLogout = async () => {
      clearTimer();
      try {
        toast({
          title: "Sessão encerrada",
          description: "Você foi desconectado por inatividade (10 min).",
        });
      } catch {
        // ignora
      }
      try {
        await signOut();
      } catch {
        // ignora
      }
    };

    const resetTimer = () => {
      clearTimer();
      timerRef.current = window.setTimeout(triggerLogout, INACTIVITY_MS);
    };

    const handleActivity = () => {
      // Em visibilitychange, só conta se a aba ficou visível
      resetTimer();
    };

    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, handleActivity, { passive: true }),
    );
    resetTimer();

    return () => {
      clearTimer();
      ACTIVITY_EVENTS.forEach((evt) =>
        window.removeEventListener(evt, handleActivity),
      );
    };
  }, [user, isAdmin, isManager, loading, signOut]);
}
