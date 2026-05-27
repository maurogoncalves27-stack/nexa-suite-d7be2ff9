// Login facial: recebe e-mail + descritor capturado pela câmera, compara com o cadastrado e emite OTP.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FACE_THRESHOLD = 0.55;

function distance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { email, descriptor } = await req.json();
    if (!email || !Array.isArray(descriptor) || descriptor.length < 64) {
      return new Response(JSON.stringify({ error: "Dados incompletos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userId } = await admin.rpc("find_user_id_by_email", { _email: email });
    if (!userId) {
      return new Response(JSON.stringify({ error: "Rosto não reconhecido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: face } = await admin
      .from("user_face_descriptors")
      .select("descriptor")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    if (!face?.descriptor) {
      return new Response(JSON.stringify({ error: "Rosto não cadastrado para esta conta" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dist = distance(descriptor as number[], face.descriptor as number[]);
    if (dist > FACE_THRESHOLD) {
      console.warn("face-login-verify: face mismatch", { email });
      return new Response(JSON.stringify({ error: "Rosto não reconhecido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr || !linkData?.properties?.email_otp) {
      return new Response(JSON.stringify({ error: "Falha ao gerar sessão" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      email,
      token: linkData.properties.email_otp,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const err = e as Error;
    return new Response(JSON.stringify({ error: err.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
