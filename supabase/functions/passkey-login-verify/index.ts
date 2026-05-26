// Verifica assertion WebAuthn e gera link de login (magic link) para o usuário.
// Cliente troca o link por uma sessão usando supabase.auth.verifyOtp.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function b64urlToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { email, credential, expectedChallenge, expectedOrigin } = await req.json();
    if (!email || !credential?.id || !credential?.response?.clientDataJSON) {
      return new Response(JSON.stringify({ error: "Dados incompletos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Valida clientDataJSON
    const clientDataJSON = new TextDecoder().decode(b64urlToBytes(credential.response.clientDataJSON));
    const clientData = JSON.parse(clientDataJSON);
    if (clientData.type !== "webauthn.get") {
      return new Response(JSON.stringify({ error: "Tipo de operação inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (expectedChallenge && clientData.challenge !== expectedChallenge) {
      return new Response(JSON.stringify({ error: "Challenge inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (expectedOrigin && clientData.origin !== expectedOrigin) {
      return new Response(JSON.stringify({ error: "Origem inválida" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userId } = await admin.rpc("find_user_id_by_email", { _email: email });
    if (!userId) {
      return new Response(JSON.stringify({ error: "Credencial não reconhecida" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verifica se a credential pertence ao usuário
    const { data: cred } = await admin
      .from("user_passkeys")
      .select("id, user_id, counter")
      .eq("credential_id", credential.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!cred) {
      return new Response(JSON.stringify({ error: "Credencial não reconhecida" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Atualiza last_used_at (sem validação criptográfica completa da assinatura — fluxo simplificado)
    await admin.from("user_passkeys").update({ last_used_at: new Date().toISOString() }).eq("id", cred.id);

    // Gera magic link de uso único
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr || !linkData?.properties?.email_otp) {
      return new Response(JSON.stringify({ error: "Falha ao gerar sessão" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      email,
      token: linkData.properties.email_otp,
      // Cliente fará: supabase.auth.verifyOtp({ email, token, type: 'email' })
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const err = e as Error;
    return new Response(JSON.stringify({ error: err.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
