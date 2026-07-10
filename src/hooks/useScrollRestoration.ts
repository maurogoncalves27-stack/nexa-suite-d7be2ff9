import { useEffect } from "react";

/**
 * Salva a posição de scroll da window ao desmontar a página e
 * restaura ao voltar (mesma aba do navegador).
 *
 * `ready` opcional: quando `false`, adia a restauração até virar `true`
 * (útil para esperar dados carregarem e o layout atingir sua altura final).
 */
export function useScrollRestoration(key: string, ready: boolean = true) {
  const storageKey = `scroll:${key}`;

  // Restaura ao montar / quando os dados ficarem prontos
  useEffect(() => {
    if (!ready) return;
    if (typeof window === "undefined") return;
    let raw: string | null = null;
    try {
      raw = window.sessionStorage.getItem(storageKey);
    } catch {
      return;
    }
    if (!raw) return;
    const y = Number(raw);
    if (!Number.isFinite(y) || y <= 0) return;
    // Duplo rAF pra esperar o layout se estabilizar
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: y, behavior: "auto" });
      });
    });
  }, [ready, storageKey]);

  // Salva continuamente e ao desmontar
  useEffect(() => {
    if (typeof window === "undefined") return;
    const save = () => {
      try {
        window.sessionStorage.setItem(storageKey, String(window.scrollY));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("scroll", save, { passive: true });
    return () => {
      save();
      window.removeEventListener("scroll", save);
    };
  }, [storageKey]);
}
