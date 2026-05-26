// Verifica e armazena uma nova Passkey registrada pelo usuário autenticado.
// Implementação simplificada: confiamos no clientDataJSON (challenge/origin)
// e armazenamos a publicKey + credentialId. Para registro (não login),
// não há contadores antigos a comparar — segurança vem do device + origin check.
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
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { credential, deviceName, expectedChallenge, expectedOrigin } = await req.json();
    if (!credential?.id || !credential?.response?.clientDataJSON || !credential?.response?.attestationObject) {
      return new Response(JSON.stringify({ error: "Credencial inválida" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Valida clientDataJSON
    const clientDataJSON = new TextDecoder().decode(b64urlToBytes(credential.response.clientDataJSON));
    const clientData = JSON.parse(clientDataJSON);
    if (clientData.type !== "webauthn.create") {
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

    // Armazena attestationObject (contém publicKey) + credentialId
    const { error } = await admin.from("user_passkeys").insert({
      user_id: user.id,
      credential_id: credential.id,
      public_key: credential.response.attestationObject, // base64url do attestationObject
      counter: 0,
      transports: credential.response.transports ?? [],
      device_name: deviceName || "Dispositivo",
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
