import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("TEXTBEE_API_KEY");
    const deviceId = Deno.env.get("TEXTBEE_DEVICE_ID");
    if (!apiKey || !deviceId) {
      return new Response(JSON.stringify({ error: "TEXTBEE_API_KEY/TEXTBEE_DEVICE_ID ausentes" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Zera default anterior
    await admin.from("sms_senders").update({ is_default: false }).eq("is_default", true);

    // Upsert por device_id
    const { data: existing } = await admin.from("sms_senders").select("id").eq("device_id", deviceId).maybeSingle();
    if (existing) {
      const { error } = await admin.from("sms_senders")
        .update({ api_key: apiKey, active: true, is_default: true, name: "Motorola Edge 50 Neo (TIM)" })
        .eq("id", existing.id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, updated: existing.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data, error } = await admin.from("sms_senders").insert({
      name: "Motorola Edge 50 Neo (TIM)",
      provider: "textbee",
      api_key: apiKey,
      device_id: deviceId,
      active: true,
      is_default: true,
    }).select("id").single();
    if (error) throw error;
    return new Response(JSON.stringify({ ok: true, created: data.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
