import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" } });
  const { email, password } = await req.json();
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: list, error: le } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (le) return new Response(JSON.stringify({ error: le.message }), { status: 500 });
  const user = list.users.find((u) => u.email?.toLowerCase() === String(email).toLowerCase());
  if (!user) return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
  const { error } = await admin.auth.admin.updateUserById(user.id, { password });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ ok: true, id: user.id }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
});
