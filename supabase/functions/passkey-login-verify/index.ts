// Passkey login DESABILITADO até implementação criptográfica completa do WebAuthn.
//
// A versão anterior não verificava a assinatura ECDSA/RSA sobre
// `authenticatorData || sha256(clientDataJSON)`, e o challenge/origin vinham do
// próprio corpo da requisição (client-controlled), permitindo que qualquer um
// que conhecesse um `credential_id` válido obtivesse um magic link / OTP da
// conta-alvo.
//
// Para reabilitar com segurança será necessário:
//   1. Armazenar o challenge emitido por passkey-login-options em uma tabela
//      `passkey_challenges` (user_id, challenge, expires_at).
//   2. Em register-verify: parsear attestationObject (CBOR) e extrair a COSE
//      public key real (não o attestationObject inteiro como hoje).
//   3. Em login-verify: validar challenge contra o servidor, validar origin
//      contra allow-list do servidor, e verificar a assinatura usando
//      `@simplewebauthn/server` (ou equivalente em Deno) com a chave pública
//      armazenada.
//
// Enquanto isso, a função retorna 503 — o login segue por e-mail/senha.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  return new Response(
    JSON.stringify({
      error: "Login por Passkey temporariamente indisponível. Use e-mail e senha.",
      code: "PASSKEY_LOGIN_DISABLED",
    }),
    {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
