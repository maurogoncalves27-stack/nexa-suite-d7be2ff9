// Cria/atualiza os 4 logins fixos de TOTEM (um por loja).
// user_metadata.totem_login = true, totem_store = "asa sul" | "asa norte" | "lago sul" | "aguas claras"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireRole } from "../_shared/requireRole.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PASSWORD = Deno.env.get("TOTEM_SEED_PASSWORD");

const LOGINS = [
  { email: "totemas@aquelaparme.com.br", name: "TOTEM ASA SUL", store: "asa sul" },
  { email: "toteman@aquelaparme.com.br", name: "TOTEM ASA NORTE", store: "asa norte" },
  { email: "totemls@aquelaparme.com.br", name: "TOTEM LAGO SUL", store: "lago sul" },
  { email: "totemac@aquelaparme.com.br", name: "TOTEM AGUAS CLARAS", store: "aguas claras" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireRole(req, ["admin"], corsHeaders);
  if (!auth.ok) return auth.response!;

  if (!PASSWORD) {
    return new Response(
      JSON.stringify({ error: "TOTEM_SEED_PASSWORD não configurada" }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const results: Array<{ email: string; user_id?: string; status: string; error?: string }> = [];

  for (const l of LOGINS) {
    try {
      const meta = { full_name: l.name, totem_login: true, totem_store: l.store };
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: l.email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: meta,
      });

      let userId = created?.user?.id;

      if (createErr || !userId) {
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
          user_metadata: { ...(existing.user_metadata ?? {}), ...meta },
        });
      }

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
