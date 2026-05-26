// Cria/atualiza os 4 logins fixos de loja (PCs do balcão) com role 'employee'.
// Execução manual via supabase.functions.invoke('seed-store-logins').
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PASSWORD = "Parme@123";
const LOGINS = [
  { email: "asasul@aquelaparme.com.br", name: "PC ASA SUL" },
  { email: "asanorte@aquelaparme.com.br", name: "PC ASA NORTE" },
  { email: "aguasclaras@aquelaparme.com.br", name: "PC ÁGUAS CLARAS" },
  { email: "lagosul@aquelaparme.com.br", name: "PC LAGO SUL" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const results: Array<{ email: string; user_id?: string; status: string; error?: string }> = [];

  for (const l of LOGINS) {
    try {
      // Tenta criar
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: l.email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: l.name, store_login: true },
      });

      let userId = created?.user?.id;

      if (createErr || !userId) {
        // Já existe — busca e reseta senha
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const existing = list?.users.find((u) => u.email?.toLowerCase() === l.email.toLowerCase());
        if (!existing) {
          results.push({ email: l.email, status: "error", error: createErr?.message ?? "not found" });
          continue;
        }
        userId = existing.id;
        await admin.auth.admin.updateUserById(userId, {
          password: PASSWORD,
          email_confirm: true,
          user_metadata: { ...(existing.user_metadata ?? {}), full_name: l.name, store_login: true },
        });
      }

      // Garante role 'employee'
      await admin.from("user_roles").upsert(
        { user_id: userId, role: "employee" },
        { onConflict: "user_id,role" },
      );

      results.push({ email: l.email, user_id: userId, status: "ok" });
    } catch (e) {
      results.push({ email: l.email, status: "error", error: (e as Error).message });
    }
  }

  return new Response(JSON.stringify({ results }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
