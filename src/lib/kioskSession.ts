import { supabase } from "@/integrations/supabase/client";

/**
 * Sessão "kiosk" (Totem / PC de loja): a sessão NUNCA pode cair.
 * Guardamos as credenciais do login dedicado na máquina (localStorage) e
 * reautenticamos automaticamente sempre que o refresh token falhar,
 * a internet cair ou o app ficar horas ocioso.
 */
const KEY = "nexa:kioskCreds";

type KioskCreds = { email: string; password: string };

const enc = (v: string) => {
  try { return btoa(unescape(encodeURIComponent(v))); } catch { return v; }
};
const dec = (v: string) => {
  try { return decodeURIComponent(escape(atob(v))); } catch { return v; }
};

export function saveKioskCredentials(email: string, password: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ email: enc(email), password: enc(password) }));
  } catch {}
}

export function clearKioskCredentials() {
  try { localStorage.removeItem(KEY); } catch {}
}

export function getKioskCredentials(): KioskCreds | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { email?: string; password?: string };
    if (!parsed?.email || !parsed?.password) return null;
    return { email: dec(parsed.email), password: dec(parsed.password) };
  } catch {
    return null;
  }
}

export function isKioskMetadata(meta: Record<string, unknown> | null | undefined) {
  if (!meta) return false;
  return Boolean((meta as { totem_login?: boolean }).totem_login) ||
    Boolean((meta as { store_login?: boolean }).store_login);
}

let started = false;
let relogging = false;

async function ensureSession() {
  const creds = getKioskCredentials();
  if (!creds) return;

  const { data } = await supabase.auth.getSession();
  const session = data.session;

  // Sessão viva e com folga (> 5 min) — nada a fazer.
  if (session?.expires_at && session.expires_at * 1000 - Date.now() > 5 * 60 * 1000) return;

  if (session) {
    const { error } = await supabase.auth.refreshSession();
    if (!error) return;
  }

  if (relogging) return;
  relogging = true;
  try {
    await supabase.auth.signInWithPassword({ email: creds.email, password: creds.password });
  } catch {
    // offline: tenta de novo no próximo tick
  } finally {
    relogging = false;
  }
}

/** Mantém a sessão do totem/PC de loja viva enquanto o app estiver aberto. */
export function startKioskSessionKeeper() {
  if (started || typeof window === "undefined") return;
  started = true;

  const tick = () => { void ensureSession(); };

  // A cada 2 minutos, ao voltar o foco/visibilidade e ao reconectar a internet.
  setInterval(tick, 2 * 60 * 1000);
  window.addEventListener("focus", tick);
  window.addEventListener("online", tick);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tick();
  });

  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
      // SIGNED_OUT em kiosk = falha de refresh; reautentica imediatamente.
      if (event === "SIGNED_OUT") setTimeout(tick, 500);
    }
  });

  tick();
}
