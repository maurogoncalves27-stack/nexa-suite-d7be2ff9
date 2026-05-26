// One-shot: cria/atualiza o super-usuário MAURO SOUZA com UUID fixo.
// Protegido por um token simples no body. Remover após uso.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPER_USER_ID = "ec5e52b2-a4c3-46c7-8d11-a5b6cf406866";
const SUPER_USER_EMAIL = "maurogoncalves27@gmail.com";
const SUPER_USER_PASSWORD = "Senha@123";
const GUARD = "nexa-bootstrap-2026";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    if (body?.secret !== GUARD) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let userId = SUPER_USER_ID;
    let action: "created" | "updated" = "created";

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      id: SUPER_USER_ID,
      email: SUPER_USER_EMAIL,
      password: SUPER_USER_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "MAURO SOUZA" },
    });

    if (createErr || !created?.user?.id) {
      // Já existe — localiza e atualiza
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = list?.users.find(
        (u) => u.email?.toLowerCase() === SUPER_USER_EMAIL.toLowerCase() || u.id === SUPER_USER_ID,
      );
      if (!existing) {
        return new Response(
          JSON.stringify({ error: createErr?.message ?? "create failed", details: createErr }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      userId = existing.id;
      action = "updated";
      await admin.auth.admin.updateUserById(userId, {
        password: SUPER_USER_PASSWORD,
        email_confirm: true,
        user_metadata: { ...(existing.user_metadata ?? {}), full_name: "MAURO SOUZA" },
      });
    }

    // Garante roles admin + manager (defesa em profundidade)
    await admin.from("user_roles").upsert(
      [
        { user_id: userId, role: "admin" },
        { user_id: userId, role: "manager" },
      ],
      { onConflict: "user_id,role" },
    );

    return new Response(
      JSON.stringify({
        ok: true,
        action,
        user_id: userId,
        matches_super_user_const: userId === SUPER_USER_ID,
        email: SUPER_USER_EMAIL,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
