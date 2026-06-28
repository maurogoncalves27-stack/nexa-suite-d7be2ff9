// Diagnóstico: status da instância UazAPI
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const BASE_URL = (Deno.env.get("UAZAPI_BASE_URL") || "").replace(/\/+$/, "");
const TOKEN = Deno.env.get("UAZAPI_INSTANCE_TOKEN") || "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const res = await fetch(`${BASE_URL}/instance/status`, {
    method: "GET",
    headers: { token: TOKEN },
  });
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch {}
  return new Response(JSON.stringify({ status: res.status, body: json ?? text }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
