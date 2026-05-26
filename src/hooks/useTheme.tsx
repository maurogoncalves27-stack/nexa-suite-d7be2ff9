import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

type ThemeMode = "light" | "dark";

export interface ThemeTokens {
  primary: string;       // HSL "H S% L%"
  accent: string;        // HSL
  background: string;    // HSL (light)
  sidebarBg: string;     // HSL
  radius: string;        // ex: "0.6rem"
  fontFamily: string;    // ex: "Inter"
  fontScale: number;     // 0.875 .. 1.25
}

interface ThemeContextValue extends ThemeTokens {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  toggleMode: () => void;
  setPrimary: (hsl: string) => void;
  setAccent: (hsl: string) => void;
  setBackground: (hsl: string) => void;
  setSidebarBg: (hsl: string) => void;
  setRadius: (r: string) => void;
  setFontFamily: (f: string) => void;
  setFontScale: (n: number) => void;
  logoUrl: string | null;
  setLogoUrl: (url: string | null) => void;
  resetCustomization: () => void;
  applyAsGlobal: () => Promise<{ ok: boolean; error?: string }>;
  resetGlobal: () => Promise<{ ok: boolean; error?: string }>;
  hasGlobalOverride: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const LS = {
  mode: "app.theme.mode",
  primary: "app.theme.primary",
  accent: "app.theme.accent",
  background: "app.theme.background",
  sidebarBg: "app.theme.sidebarBg",
  radius: "app.theme.radius",
  fontFamily: "app.theme.fontFamily",
  fontScale: "app.theme.fontScale",
  logo: "app.theme.logo",
};

const DEFAULTS: ThemeTokens = {
  primary: "212 85% 38%",
  accent: "178 70% 40%",
  background: "210 40% 98%",
  sidebarBg: "220 25% 10%",
  radius: "0.6rem",
  fontFamily: "Inter",
  fontScale: 1,
};

export const DEFAULT_PRIMARY_HSL = DEFAULTS.primary;

const setVar = (name: string, value: string) => {
  document.documentElement.style.setProperty(name, value);
};

const normalizeSidebarBg = (hsl: string | null) => {
  if (!hsl || hsl === "212 60% 14%" || hsl === "222 22% 8%") return DEFAULTS.sidebarBg;
  return hsl;
};

const removeVar = (name: string) => {
  document.documentElement.style.removeProperty(name);
};

const darkReadableHsl = (hsl: string, minLightness = 58) => {
  const match = hsl.trim().match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
  if (!match) return hsl;
  const [, h, s, l] = match;
  return `${h} ${s}% ${Math.max(Number(l), minLightness)}%`;
};

const applyMode = (mode: ThemeMode) => {
  const root = document.documentElement;
  if (mode === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
};

const ls = {
  get: (k: string) => (typeof window === "undefined" ? null : localStorage.getItem(k)),
  set: (k: string, v: string) => localStorage.setItem(k, v),
  del: (k: string) => localStorage.removeItem(k),
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  if (typeof window !== "undefined") {
    const savedSidebar = ls.get(LS.sidebarBg);
    const normalizedSidebar = normalizeSidebarBg(savedSidebar);
    if (savedSidebar !== normalizedSidebar) {
      ls.set(LS.sidebarBg, normalizedSidebar);
    }
  }

  const [mode, setModeState] = useState<ThemeMode>(() => (ls.get(LS.mode) as ThemeMode) || "light");
  const [primary, setPrimaryState] = useState(() => ls.get(LS.primary) || DEFAULTS.primary);
  const [accent, setAccentState] = useState(() => ls.get(LS.accent) || DEFAULTS.accent);
  const [background, setBackgroundState] = useState(() => ls.get(LS.background) || DEFAULTS.background);
  const [sidebarBg, setSidebarBgState] = useState(() => normalizeSidebarBg(ls.get(LS.sidebarBg)));
  const [radius, setRadiusState] = useState(() => ls.get(LS.radius) || DEFAULTS.radius);
  const [fontFamily, setFontFamilyState] = useState(() => ls.get(LS.fontFamily) || DEFAULTS.fontFamily);
  const [fontScale, setFontScaleState] = useState(() => Number(ls.get(LS.fontScale) || DEFAULTS.fontScale));
  const [logoUrl, setLogoUrlState] = useState<string | null>(() => ls.get(LS.logo));
  const [hasGlobalOverride, setHasGlobalOverride] = useState(false);

  // Marca para distinguir mudanças locais (devem persistir) de mudanças oriundas do tema global
  const applyingGlobalRef = useRef(false);

  // Aplicação de tokens
  useEffect(() => { applyMode(mode); }, [mode]);

  useEffect(() => {
    if (mode === "dark") {
      setVar("--primary", darkReadableHsl(primary));
      setVar("--ring", darkReadableHsl(primary));
      setVar("--sidebar-ring", darkReadableHsl(primary));
    } else {
      setVar("--primary", primary);
      setVar("--ring", primary);
      setVar("--sidebar-ring", primary);
    }
  }, [primary, mode]);

  useEffect(() => {
    setVar("--accent", mode === "dark" ? darkReadableHsl(accent, 56) : accent);
  }, [accent, mode]);

  useEffect(() => {
    if (mode === "light") setVar("--background", background);
    else removeVar("--background");
  }, [background, mode]);

  useEffect(() => {
    if (mode === "light") setVar("--sidebar-background", sidebarBg);
    else removeVar("--sidebar-background");
  }, [sidebarBg, mode]);
  useEffect(() => { setVar("--radius", radius); }, [radius]);
  useEffect(() => {
    document.documentElement.style.setProperty("font-size", `${fontScale * 100}%`);
  }, [fontScale]);
  useEffect(() => {
    document.body.style.fontFamily = `'${fontFamily}', system-ui, sans-serif`;
  }, [fontFamily]);

  // Aplica um snapshot de tema global vindo do banco
  const applyGlobalSnapshot = useCallback((row: any) => {
    if (!row) {
      setHasGlobalOverride(false);
      return;
    }
    applyingGlobalRef.current = true;
    setHasGlobalOverride(true);
    // Modo (claro/escuro) é sempre preferência local do usuário — não sobrescrever pelo tema global
    if (row.primary_hsl) setPrimaryState(row.primary_hsl);
    if (row.accent_hsl) setAccentState(row.accent_hsl);
    if (row.background_hsl) setBackgroundState(row.background_hsl);
    if (row.sidebar_bg_hsl) setSidebarBgState(normalizeSidebarBg(row.sidebar_bg_hsl));
    if (row.radius) setRadiusState(row.radius);
    if (row.font_family) setFontFamilyState(row.font_family);
    if (row.font_scale != null) setFontScaleState(Number(row.font_scale));
    setLogoUrlState(row.logo_url ?? null);
    // Após o ciclo, libera o flag
    setTimeout(() => { applyingGlobalRef.current = false; }, 0);
  }, []);

  // Carrega tema global ao iniciar e escuta mudanças em realtime
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("theme_settings")
        .select("*")
        .eq("scope", "global")
        .maybeSingle();
      if (mounted && data) applyGlobalSnapshot(data);
    })();

    const channel = supabase
      .channel("theme_settings_global")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "theme_settings", filter: "scope=eq.global" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setHasGlobalOverride(false);
          } else {
            applyGlobalSnapshot(payload.new);
          }
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [applyGlobalSnapshot]);

  const setMode = useCallback((m: ThemeMode) => { setModeState(m); ls.set(LS.mode, m); }, []);
  const toggleMode = useCallback(() => setMode(mode === "dark" ? "light" : "dark"), [mode, setMode]);

  const mk = <T,>(key: string, setter: (v: T) => void) => (v: T) => {
    setter(v);
    if (!applyingGlobalRef.current) ls.set(key, String(v));
  };

  const setPrimary = useCallback(mk<string>(LS.primary, setPrimaryState), []);
  const setAccent = useCallback(mk<string>(LS.accent, setAccentState), []);
  const setBackground = useCallback(mk<string>(LS.background, setBackgroundState), []);
  const setSidebarBg = useCallback(mk<string>(LS.sidebarBg, setSidebarBgState), []);
  const setRadius = useCallback(mk<string>(LS.radius, setRadiusState), []);
  const setFontFamily = useCallback(mk<string>(LS.fontFamily, setFontFamilyState), []);
  const setFontScale = useCallback((n: number) => {
    setFontScaleState(n);
    if (!applyingGlobalRef.current) ls.set(LS.fontScale, String(n));
  }, []);

  const setLogoUrl = useCallback((url: string | null) => {
    setLogoUrlState(url);
    if (!applyingGlobalRef.current) {
      if (url) ls.set(LS.logo, url); else ls.del(LS.logo);
    }
  }, []);

  const resetCustomization = useCallback(() => {
    setPrimaryState(DEFAULTS.primary); ls.del(LS.primary);
    setAccentState(DEFAULTS.accent); ls.del(LS.accent);
    setBackgroundState(DEFAULTS.background); ls.del(LS.background);
    setSidebarBgState(DEFAULTS.sidebarBg); ls.del(LS.sidebarBg);
    setRadiusState(DEFAULTS.radius); ls.del(LS.radius);
    setFontFamilyState(DEFAULTS.fontFamily); ls.del(LS.fontFamily);
    setFontScaleState(DEFAULTS.fontScale); ls.del(LS.fontScale);
    setLogoUrlState(null); ls.del(LS.logo);
    const root = document.documentElement;
    ["--primary","--ring","--sidebar-ring","--accent","--background","--sidebar-background","--radius"].forEach(v => root.style.removeProperty(v));
    root.style.removeProperty("font-size");
    document.body.style.removeProperty("font-family");
  }, []);

  // Salva o tema atual como global (admin only — RLS aplica no banco)
  const applyAsGlobal = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      scope: "global",
      mode,
      primary_hsl: primary,
      accent_hsl: accent,
      background_hsl: background,
      sidebar_bg_hsl: sidebarBg,
      radius,
      font_family: fontFamily,
      font_scale: fontScale,
      logo_url: logoUrl,
      updated_by: user?.id ?? null,
    };
    const { error } = await supabase
      .from("theme_settings")
      .upsert(payload, { onConflict: "scope" });
    if (error) return { ok: false, error: error.message };
    setHasGlobalOverride(true);
    return { ok: true };
  }, [mode, primary, accent, background, sidebarBg, radius, fontFamily, fontScale, logoUrl]);

  const resetGlobal = useCallback(async () => {
    const { error } = await supabase
      .from("theme_settings")
      .delete()
      .eq("scope", "global");
    if (error) return { ok: false, error: error.message };
    setHasGlobalOverride(false);
    return { ok: true };
  }, []);

  return (
    <ThemeContext.Provider value={{
      mode, setMode, toggleMode,
      primary, setPrimary,
      accent, setAccent,
      background, setBackground,
      sidebarBg, setSidebarBg,
      radius, setRadius,
      fontFamily, setFontFamily,
      fontScale, setFontScale,
      logoUrl, setLogoUrl,
      resetCustomization,
      applyAsGlobal,
      resetGlobal,
      hasGlobalOverride,
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
};
