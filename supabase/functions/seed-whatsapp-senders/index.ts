import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const zapiInstance = Deno.env.get("ZAPI_INSTANCE_ID");
    const zapiToken = Deno.env.get("ZAPI_TOKEN");
    const zapiClient = Deno.env.get("ZAPI_CLIENT_TOKEN");

    const zapiCustInstance = Deno.env.get("ZAPI_CUSTOMER_INSTANCE_ID");
    const zapiCustToken = Deno.env.get("ZAPI_CUSTOMER_TOKEN");
    const zapiCustClient = Deno.env.get("ZAPI_CUSTOMER_CLIENT_TOKEN");

    const uazBase = Deno.env.get("UAZAPI_BASE_URL");
    const uazToken = Deno.env.get("UAZAPI_INSTANCE_TOKEN");

    const rows: any[] = [];

    const upsert = async (match: Record<string, any>, row: any) => {
      let q = admin.from("whatsapp_senders").select("id");
      for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
      const { data: ex } = await q.maybeSingle();
      if (ex) {
        const { error } = await admin.from("whatsapp_senders").update(row).eq("id", ex.id);
        if (error) throw error;
        rows.push({ updated: ex.id, label: row.label });
      } else {
        const { data, error } = await admin.from("whatsapp_senders").insert(row).select("id").single();
        if (error) throw error;
        rows.push({ created: data.id, label: row.label });
      }
    };

    if (zapiInstance && zapiToken) {
      await upsert({ provider: "zapi", zapi_instance_id: zapiInstance }, {
        label: "Z-API Alertas (padrão)",
        provider: "zapi",
        zapi_instance_id: zapiInstance,
        zapi_token: zapiToken,
        zapi_client_token: zapiClient ?? null,
        active: true,
        is_default: true,
      });
    }

    if (zapiCustInstance && zapiCustToken) {
      await upsert({ provider: "zapi", zapi_instance_id: zapiCustInstance }, {
        label: "Z-API Cliente (SAC)",
        provider: "zapi",
        zapi_instance_id: zapiCustInstance,
        zapi_token: zapiCustToken,
        zapi_client_token: zapiCustClient ?? null,
        active: true,
        is_default: false,
      });
    }

    if (uazBase && uazToken) {
      await upsert({ provider: "uazapi", uazapi_base_url: uazBase }, {
        label: "UAZAPI (principal)",
        provider: "uazapi",
        uazapi_base_url: uazBase,
        uazapi_token: uazToken,
        active: true,
        is_default: false,
      });
    }

    return new Response(JSON.stringify({ ok: true, rows }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
