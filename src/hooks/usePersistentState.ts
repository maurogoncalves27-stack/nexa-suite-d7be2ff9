import { useEffect, useRef, useState } from "react";

/**
 * useState que persiste o valor em sessionStorage.
 * Sobrevive a navegação entre rotas na mesma aba; some ao fechar o navegador.
 */
export function usePersistentState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initialValue;
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw === null) return initialValue;
      return JSON.parse(raw) as T;
    } catch {
      return initialValue;
    }
  });

  const keyRef = useRef(key);
  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(keyRef.current, JSON.stringify(value));
    } catch {
      /* ignore quota / serialization errors */
    }
  }, [value]);

  return [value, setValue] as const;
}
