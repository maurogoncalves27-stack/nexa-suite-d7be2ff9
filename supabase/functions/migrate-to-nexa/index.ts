// Edge function ONE-SHOT DESABILITADA (migração concluída).
// Mantida apenas para histórico — retorna 410 para qualquer chamada.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return new Response(
    JSON.stringify({ error: "migration function disabled" }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
