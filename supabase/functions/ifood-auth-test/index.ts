// Teste de autenticação no iFood (client_credentials)
// Doc: https://developer.ifood.com.br/pt-BR/docs/references/authentication
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const clientId = Deno.env.get("IFOOD_CLIENT_ID");
    const clientSecret = Deno.env.get("IFOOD_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({ ok: false, error: "IFOOD_CLIENT_ID/SECRET não configurados" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = new URLSearchParams({
      grantType: "client_credentials",
      clientId,
      clientSecret,
    });

    const res = await fetch(
      "https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      },
    );

    const text = await res.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch { /* ignore */ }

    if (!res.ok) {
      console.error("iFood auth falhou:", res.status, text);
      return new Response(
        JSON.stringify({ ok: false, status: res.status, response: parsed }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = parsed as { accessToken?: string; expiresIn?: number; type?: string };
    return new Response(
      JSON.stringify({
        ok: true,
        token_preview: data.accessToken ? `${data.accessToken.slice(0, 20)}...` : null,
        expires_in: data.expiresIn,
        type: data.type,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("Erro inesperado:", e);
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
