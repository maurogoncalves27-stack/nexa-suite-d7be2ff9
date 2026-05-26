import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth caller: deve ser admin/manager
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", caller.id);
    const isStaff = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "manager");
    if (!isStaff) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const kind = body.kind as "supplier" | "outsourced";
    const partnerId = body.partner_id as string;
    if (!kind || !partnerId) {
      return new Response(JSON.stringify({ error: "missing kind or partner_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Lê o registro do parceiro
    const table = kind === "supplier" ? "suppliers" : "outsourced_professionals";
    const { data: partner, error: pErr } = await (admin.from(table) as any)
      .select("*").eq("id", partnerId).maybeSingle();
    if (pErr || !partner) {
      return new Response(JSON.stringify({ error: "partner not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!partner.email) {
      return new Response(JSON.stringify({ error: "partner has no email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cria usuário (ou pega existente)
    let userId = partner.user_id as string | null;
    if (!userId) {
      // tenta achar usuário pelo e-mail
      const { data: list } = await admin.auth.admin.listUsers();
      const existing = list?.users?.find(
        (u) => (u.email ?? "").toLowerCase() === String(partner.email).toLowerCase()
      );
      if (existing) {
        userId = existing.id;
      } else {
        const { data: created, error: cErr } = await admin.auth.admin.createUser({
          email: partner.email,
          email_confirm: true,
          user_metadata: {
            full_name: partner.full_name ?? partner.legal_name ?? null,
            partner_kind: kind,
          },
        });
        if (cErr || !created.user) {
          return new Response(JSON.stringify({ error: cErr?.message ?? "create user failed" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        userId = created.user.id;
      }
      // Vincula no parceiro
      await (admin.from(table) as any).update({ user_id: userId }).eq("id", partnerId);
    }

    // Garante role
    const role = kind === "supplier" ? "supplier" : "outsourced";
    await admin.from("user_roles").upsert(
      { user_id: userId!, role: role as any },
      { onConflict: "user_id,role" }
    );

    // Gera magic link (recovery → permite definir senha)
    const redirectTo = `${new URL(req.url).origin.replace(".supabase.co", ".lovable.app")}/reset-password`;
    const { data: link, error: lErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: partner.email,
      options: { redirectTo: body.redirect_to ?? "https://nexa.aquelaparme.com.br/reset-password" },
    });
    if (lErr) {
      return new Response(JSON.stringify({ error: lErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      user_id: userId,
      action_link: link?.properties?.action_link ?? null,
      email: partner.email,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
