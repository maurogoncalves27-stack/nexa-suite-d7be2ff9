import { useEffect, useState, useCallback } from "react";

export type ViewMode = "gestor" | "socio" | "colaborador" | "nutricionista" | "fornecedor";

const STORAGE_KEY = "rh:viewMode";

const VALID: ViewMode[] = ["gestor", "socio", "colaborador", "nutricionista", "fornecedor"];

const read = (): ViewMode | null => {
  if (typeof window === "undefined") return null;
  const v = sessionStorage.getItem(STORAGE_KEY) as ViewMode | null;
  return v && (VALID as string[]).includes(v) ? v : null;
};

export const getViewMode = read;

export const setViewMode = (mode: ViewMode | null) => {
  if (typeof window === "undefined") return;
  if (mode) sessionStorage.setItem(STORAGE_KEY, mode);
  else sessionStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("rh:viewMode-change"));
};

export const useViewMode = () => {
  const [mode, setMode] = useState<ViewMode | null>(read);

  useEffect(() => {
    const sync = () => setMode(read());
    window.addEventListener("rh:viewMode-change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("rh:viewMode-change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback((next: ViewMode | null) => {
    setViewMode(next);
  }, []);

  return { mode, setMode: update };
};
