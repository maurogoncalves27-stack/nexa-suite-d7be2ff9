// delivery-service-types — cidades e tipos de veículo habilitados na Lalamove.
// Usado na tela de configuração de entregas: os valores de `serviceType` mudam
// por cidade/mercado, então precisam vir da API em vez de serem chumbados.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { lalamoveCities, lalamoveMeta } from '../_shared/delivery/lalamoveAdapter.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!lalamoveMeta.configured) {
      return json(
        {
          error: 'not_configured',
          detail: 'Configure LALAMOVE_API_KEY e LALAMOVE_API_SECRET.',
          market: lalamoveMeta.market,
          env: lalamoveMeta.env,
        },
        503,
      );
    }

    const cities = await lalamoveCities();
    return json({
      ok: true,
      market: lalamoveMeta.market,
      env: lalamoveMeta.env,
      cities: cities.map((c) => ({
        locode: c.locode,
        name: c.name,
        service_types: (c.services ?? []).map((s) => s.key).filter(Boolean),
      })),
    });
  } catch (e) {
    console.error('[delivery-service-types] error', e);
    return json({ error: 'lalamove_error', detail: String((e as Error)?.message ?? e) }, 502);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
