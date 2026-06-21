// Helpers puros (sem I/O) usados pelo edge function parme-chat
// Extraídos para permitir testes unitários sem dependências do Supabase.

export const COMPLAINT_RE =
  /\b(n[ãa]o\s+veio|faltou|faltando|errad[oa]|fri[oa]|atras(?:ou|ado|o)|demor(?:ou|ado)|reclama[cç][ãa]o|reclamar|cobran[cç]a|p[ée]ssim[oa]|horr[ií]vel|estragad[oa]|queim(?:ado|a)|cru|sem\s+sabor|sumiu|esqueceram|n[ãa]o\s+chegou|veio\s+errad)/i;

export const EXPLICIT_ORDER_RE =
  /(?:pedido\s*#?\s*|n[uú]mero\s*(?:do\s+pedido)?\s*[:#]?\s*)(\d{2,10})/i;

export const LOOSE_ORDER_RE = /(?:^|\D)(\d{3,6})(?:\D|$)/;

export const PHONE_RE = /(?:\(?\d{2}\)?\s?)?9?\d{4}[-\s]?\d{4}/;

export function detectComplaint(text: string): boolean {
  return COMPLAINT_RE.test(text);
}

export function extractOrderNumber(fullText: string): string | null {
  return (
    fullText.match(EXPLICIT_ORDER_RE)?.[1] ??
    fullText.match(LOOSE_ORDER_RE)?.[1] ??
    null
  );
}

export function extractPhone(text: string): string | null {
  const m = text.match(PHONE_RE);
  return m ? m[0].replace(/\D/g, "") : null;
}

export type ReservationDraft = {
  nome: string;
  telefone: string;
  data: string; // YYYY-MM-DD
  horario: string; // HH:MM
  pessoas: number;
  observacao?: string;
};

export function isValidReservation(r: Partial<ReservationDraft>): r is ReservationDraft {
  if (!r.nome || !r.telefone || !r.data || !r.horario || !r.pessoas) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.data)) return false;
  if (!/^\d{2}:\d{2}$/.test(r.horario)) return false;
  const digits = String(r.telefone).replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 11) return false;
  if (r.pessoas < 1 || r.pessoas > 50) return false;
  return true;
}
