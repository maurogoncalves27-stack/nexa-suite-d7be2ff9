import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const token = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN') ?? '';
  const prefix = token.slice(0, 8);
  const isTest = token.startsWith('TEST-');
  const isProd = token.startsWith('APP_USR-');
  let me: any = null;
  try {
    const r = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    me = await r.json();
  } catch (e) {
    me = { error: String(e) };
  }
  return new Response(
    JSON.stringify({
      prefix,
      isTest,
      isProd,
      site_id: me?.site_id,
      nickname: me?.nickname,
      email: me?.email,
      id: me?.id,
      tags: me?.tags,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
