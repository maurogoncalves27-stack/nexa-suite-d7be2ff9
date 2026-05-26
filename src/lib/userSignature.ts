// Helpers para a assinatura única e definitiva do colaborador.
// Cadastrada uma vez no signup, reutilizada em todos os documentos.
import { supabase } from "@/integrations/supabase/client";

export const SIGNATURE_CONSENT_TEXT =
  "Declaro que esta é a minha assinatura pessoal e autorizo, de forma livre e expressa, " +
  "o seu uso eletrônico para assinar quaisquer documentos que me forem apresentados neste " +
  "sistema (contratos, termos, regimento interno, advertências, documentos personalizados " +
  "e demais comunicações), com a mesma validade jurídica de uma assinatura manuscrita, " +
  "nos termos da MP nº 2.200-2/2001 (ICP-Brasil) e da Lei nº 14.063/2020.";

const BUCKET = "user-signatures";

export interface UserSignatureRow {
  id: string;
  user_id: string;
  signature_path: string;
  consent_text: string;
  consent_accepted_at: string;
  consent_ip: string | null;
  consent_user_agent: string | null;
  created_at: string;
}

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const r = await fetch(dataUrl);
  return r.blob();
};

const fetchClientIp = async (): Promise<string | null> => {
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    if (!r.ok) return null;
    const j = await r.json();
    return j?.ip ?? null;
  } catch {
    return null;
  }
};

/** Cadastra a assinatura única para o usuário (uma única vez). */
export async function registerUserSignature(params: {
  userId: string;
  signatureDataUrl: string; // PNG dataURL do SignaturePad
}): Promise<UserSignatureRow> {
  const { userId, signatureDataUrl } = params;
  const blob = await dataUrlToBlob(signatureDataUrl);
  const path = `${userId}/signature.png`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: "image/png", upsert: false });
  if (upErr) {
    throw new Error(`Falha ao salvar imagem da assinatura: ${upErr.message}`);
  }

  const ip = await fetchClientIp().catch(() => null);
  const { data, error } = await supabase
    .from("user_signatures")
    .insert({
      user_id: userId,
      signature_path: path,
      consent_text: SIGNATURE_CONSENT_TEXT,
      consent_ip: ip,
      consent_user_agent: navigator.userAgent,
    })
    .select("*")
    .single();
  if (error) throw new Error(`Falha ao registrar assinatura: ${error.message}`);
  return data as UserSignatureRow;
}

/** Busca a assinatura do usuário corrente (ou null se ainda não cadastrou). */
export async function getCurrentUserSignature(): Promise<UserSignatureRow | null> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return null;
  const { data } = await supabase
    .from("user_signatures")
    .select("*")
    .eq("user_id", uid)
    .maybeSingle();
  return (data as UserSignatureRow) ?? null;
}

/** Verifica se o usuário já cadastrou assinatura. */
export async function hasUserSignature(): Promise<boolean> {
  const sig = await getCurrentUserSignature();
  return !!sig;
}

/** Retorna a assinatura como dataURL PNG (pra embutir em PDF / mostrar preview). */
export async function getUserSignatureDataUrl(
  signaturePath: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .download(signaturePath);
    if (error || !data) return null;
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string) ?? null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(data);
    });
  } catch {
    return null;
  }
}

/** Conveniência: assinatura do usuário corrente como dataURL. */
export async function getCurrentUserSignatureDataUrl(): Promise<string | null> {
  const sig = await getCurrentUserSignature();
  if (!sig) return null;
  return getUserSignatureDataUrl(sig.signature_path);
}
