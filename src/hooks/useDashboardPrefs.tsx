import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "dashboard_prefs_v2";
const LEGACY_KEY = "dashboard_prefs_v1";

export interface DashboardPrefs {
  order: string[];
  hidden: string[];
  /** Seção favorita (abre primeiro / aparece destacada). */
  favoriteSection: string | null;
  /** Seções atualmente expandidas (accordion multi). */
  openSections: string[];
}

interface Stored {
  order?: string[];
  hidden?: string[];
  favoriteSection?: string | null;
  openSections?: string[];
}

const sanitize = (raw: Stored | null, allCardIds: string[], allSectionIds: string[]): DashboardPrefs => {
  const order = (raw?.order ?? []).filter((id) => allCardIds.includes(id));
  const missing = allCardIds.filter((id) => !order.includes(id));
  const fav = raw?.favoriteSection ?? null;
  const openSections = (raw?.openSections ?? allSectionIds).filter((id) => allSectionIds.includes(id));
  return {
    order: [...order, ...missing],
    hidden: (raw?.hidden ?? []).filter((id) => allCardIds.includes(id)),
    favoriteSection: fav && allSectionIds.includes(fav) ? fav : null,
    openSections: openSections.length > 0 ? openSections : allSectionIds,
  };
};

const readInitial = (allCardIds: string[], allSectionIds: string[]): DashboardPrefs => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY);
    return sanitize(raw ? (JSON.parse(raw) as Stored) : null, allCardIds, allSectionIds);
  } catch {
    return sanitize(null, allCardIds, allSectionIds);
  }
};

export function useDashboardPrefs(allCardIds: string[], allSectionIds: string[] = []) {
  const [prefs, setPrefs] = useState<DashboardPrefs>(() => readInitial(allCardIds, allSectionIds));

  useEffect(() => {
    setPrefs((prev) => sanitize(prev, allCardIds, allSectionIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCardIds.join("|"), allSectionIds.join("|")]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, [prefs]);

  const setOrder = useCallback((order: string[]) => {
    setPrefs((p) => ({ ...p, order }));
  }, []);

  const toggleHidden = useCallback((id: string) => {
    setPrefs((p) => ({
      ...p,
      hidden: p.hidden.includes(id) ? p.hidden.filter((x) => x !== id) : [...p.hidden, id],
    }));
  }, []);

  const setFavoriteSection = useCallback((id: string | null) => {
    setPrefs((p) => ({ ...p, favoriteSection: p.favoriteSection === id ? null : id }));
  }, []);

  const setOpenSections = useCallback((ids: string[]) => {
    setPrefs((p) => ({ ...p, openSections: ids }));
  }, []);

  const reset = useCallback(() => {
    setPrefs(sanitize(null, allCardIds, allSectionIds));
  }, [allCardIds, allSectionIds]);

  return { prefs, setOrder, toggleHidden, setFavoriteSection, setOpenSections, reset };
}
