// Helper compartilhado: pega/renova access_token do iFood usando cache em pdv_ifood_tokens
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const AUTH_URL = "https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token";

export type IfoodEnv = "sandbox" | "production";

export async function getIfoodAccessToken(env: IfoodEnv = "sandbox"): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  // Tenta cache (margem de 5min)
  const { data: cached } = await sb
    .from("pdv_ifood_tokens")
    .select("access_token, expires_at")
    .eq("environment", env)
    .maybeSingle();

  if (cached?.access_token && new Date(cached.expires_at).getTime() > Date.now() + 5 * 60 * 1000) {
    return cached.access_token;
  }

  const clientId = Deno.env.get("IFOOD_CLIENT_ID");
  const clientSecret = Deno.env.get("IFOOD_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("IFOOD_CLIENT_ID/SECRET não configurados");

  const body = new URLSearchParams({
    grantType: "client_credentials",
    clientId,
    clientSecret,
  });

  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`iFood auth falhou ${res.status}: ${text}`);
  const data = JSON.parse(text) as { accessToken: string; expiresIn: number; type?: string };

  const expiresAt = new Date(Date.now() + data.expiresIn * 1000).toISOString();
  await sb.from("pdv_ifood_tokens").upsert(
    {
      environment: env,
      access_token: data.accessToken,
      token_type: data.type ?? "bearer",
      expires_at: expiresAt,
      refreshed_at: new Date().toISOString(),
    },
    { onConflict: "environment" },
  );

  return data.accessToken;
}
