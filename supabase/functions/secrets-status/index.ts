// Returns only presence (boolean) of each requested env var. Never returns values.
// Restricted to super users.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Não autenticado');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) throw new Error('Sessão inválida');

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: isSuperData } = await admin.rpc('is_super_user', { _user_id: userRes.user.id });
    const isSuper = !!isSuperData;

    // Fallback: check user_roles for admin
    let allowed = !!isSuper;
    if (!allowed) {
      const { data: role } = await admin.from('user_roles').select('role').eq('user_id', userRes.user.id).eq('role', 'admin').maybeSingle();
      allowed = !!role;
    }
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const names: string[] = Array.isArray(body?.names) ? body.names.slice(0, 100) : [];
    const status: Record<string, boolean> = {};
    for (const n of names) {
      if (!/^[A-Z][A-Z0-9_]*$/i.test(n)) continue;
      const v = Deno.env.get(n);
      status[n] = !!(v && v.length > 0);
    }

    return new Response(JSON.stringify({ status }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message ?? e) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
