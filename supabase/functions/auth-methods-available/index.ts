// Retorna quais métodos biométricos estão disponíveis para um e-mail.
// Não vaza se o usuário existe: sempre responde 200 com flags booleanas.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const respond = (passkey: boolean, face: boolean) =>
    new Response(JSON.stringify({ passkey, face }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") return respond(false, false);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userId } = await admin.rpc("find_user_id_by_email", { _email: email });
    if (!userId) return respond(false, false);

    const [{ count: passkeyCount }, { data: emp }] = await Promise.all([
      admin.from("user_passkeys").select("id", { count: "exact", head: true }).eq("user_id", userId),
      admin.from("employees").select("id").eq("user_id", userId).maybeSingle(),
    ]);

    let face = false;
    if (emp?.id) {
      const { count: faceCount } = await admin
        .from("employee_face_descriptors")
        .select("id", { count: "exact", head: true })
        .eq("employee_id", emp.id)
        .eq("is_active", true);
      face = (faceCount ?? 0) > 0;
    }

    return respond((passkeyCount ?? 0) > 0, face);
  } catch {
    return respond(false, false);
  }
});
