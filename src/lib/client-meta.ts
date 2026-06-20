// Coleta dados passivos do visitante (sem pedir permissão).
export interface ClientMeta {
  ua: string;
  platform: string;
  mobile: boolean;
  language: string;
  languages: string[];
  timezone: string;
  screen: { w: number; h: number; dpr: number };
  viewport: { w: number; h: number };
  referrer: string;
  landing_path: string;
  utm: { source?: string; medium?: string; campaign?: string; term?: string; content?: string };
  collected_at: string;
}

function detectMobile(ua: string): boolean {
  return /Android|iPhone|iPad|iPod|Mobile|Opera Mini/i.test(ua);
}

function detectPlatform(ua: string): string {
  if (/Windows/i.test(ua)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macOS";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Linux/i.test(ua)) return "Linux";
  return "Outro";
}

const STORAGE_KEY = "parme_client_meta";

export function collectClientMeta(): ClientMeta | null {
  if (typeof window === "undefined") return null;
  try {
    const cached = sessionStorage.getItem(STORAGE_KEY);
    if (cached) return JSON.parse(cached) as ClientMeta;

    const ua = navigator.userAgent || "";
    const params = new URLSearchParams(window.location.search);
    const meta: ClientMeta = {
      ua,
      platform: detectPlatform(ua),
      mobile: detectMobile(ua),
      language: navigator.language || "",
      languages: Array.from(navigator.languages ?? []),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      screen: { w: window.screen.width, h: window.screen.height, dpr: window.devicePixelRatio || 1 },
      viewport: { w: window.innerWidth, h: window.innerHeight },
      referrer: document.referrer || "",
      landing_path: window.location.pathname + window.location.search,
      utm: {
        source: params.get("utm_source") ?? undefined,
        medium: params.get("utm_medium") ?? undefined,
        campaign: params.get("utm_campaign") ?? undefined,
        term: params.get("utm_term") ?? undefined,
        content: params.get("utm_content") ?? undefined,
      },
      collected_at: new Date().toISOString(),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
    return meta;
  } catch {
    return null;
  }
}
