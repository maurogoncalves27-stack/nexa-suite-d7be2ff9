// Gera challenge para login via Passkey (sem autenticação prévia).
// Recebe um e-mail, busca o user_id e retorna as credenciais permitidas + challenge.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { email, rpId } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: "Informe o e-mail" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const effectiveRpId = rpId ?? new URL(req.headers.get("origin") ?? "https://localhost").hostname;

    const { data: userId } = await admin.rpc("find_user_id_by_email", { _email: email });
    if (!userId) {
      // Não vaza informação: devolve challenge mesmo sem credenciais.
      return new Response(JSON.stringify({
        challenge: b64url(crypto.getRandomValues(new Uint8Array(32))),
        rpId: effectiveRpId,
        allowCredentials: [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: creds } = await admin
      .from("user_passkeys")
      .select("credential_id, transports")
      .eq("user_id", userId);

    const challenge = b64url(crypto.getRandomValues(new Uint8Array(32)));

    return new Response(JSON.stringify({
      challenge,
      rpId: effectiveRpId,
      timeout: 60000,
      userVerification: "preferred",
      allowCredentials: (creds ?? []).map((c) => ({
        type: "public-key",
        id: c.credential_id,
        transports: c.transports ?? [],
      })),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const err = e as Error;
    return new Response(JSON.stringify({ error: err.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
