// Invoca edge function preservando o corpo JSON de respostas não-2xx.
// O supabase-js joga fora o body quando o status não é 2xx (FunctionsHttpError),
// o que esconde códigos de erro de negócio como `delivery_fee_changed`.
import { supabase } from "@/integrations/supabase/client";

export type EdgeResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
};

export async function invokeEdge<T = Record<string, unknown>>(
  name: string,
  body?: unknown,
): Promise<EdgeResult<T>> {
  const { data, error } = await supabase.functions.invoke(name, body === undefined ? {} : { body });
  if (!error) return { ok: true, status: 200, data: (data ?? null) as T | null };

  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    let parsed: unknown = null;
    try {
      parsed = await context.clone().json();
    } catch {
      /* corpo não-JSON: cai no erro genérico abaixo */
    }
    if (parsed) return { ok: false, status: context.status, data: parsed as T };
  }
  throw error;
}
