// Sincroniza a lista de grupos de WhatsApp de um remetente Z-API.
// POST { sender_id } -> busca /chats na Z-API, filtra grupos e upserta em whatsapp_groups.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { requireRole } from "../_shared/requireRole.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authCheck = await requireRole(req, ["admin", "manager"], corsHeaders);
  if (!authCheck.ok) return authCheck.response!;

  try {
    const body = await req.json().catch(() => ({}));
    const senderId = body?.sender_id as string | undefined;
    if (!senderId) {
      return new Response(JSON.stringify({ error: "sender_id é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: sender } = await admin
      .from("whatsapp_senders")
      .select("id, zapi_instance_id, zapi_token, zapi_client_token, active")
      .eq("id", senderId)
      .maybeSingle();

    if (!sender || !sender.zapi_instance_id || !sender.zapi_token) {
      return new Response(JSON.stringify({ error: "Remetente Z-API não configurado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (sender.zapi_client_token) headers["Client-Token"] = sender.zapi_client_token;

    // Pagina /chats. Z-API retorna array com { phone, name, isGroup, ... }.
    const groups: { group_id: string; name: string }[] = [];
    let page = 1;
    const pageSize = 100;
    for (; page <= 10; page++) {
      const url = `https://api.z-api.io/instances/${sender.zapi_instance_id}/token/${sender.zapi_token}/chats?page=${page}&pageSize=${pageSize}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const text = await res.text();
        return new Response(JSON.stringify({ error: `Z-API ${res.status}: ${text.slice(0, 300)}` }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const arr = await res.json().catch(() => []);
      if (!Array.isArray(arr) || arr.length === 0) break;
      for (const c of arr) {
        if (c?.isGroup && c?.phone) {
          groups.push({ group_id: String(c.phone), name: String(c.name ?? c.phone) });
        }
      }
      if (arr.length < pageSize) break;
    }

    // Upsert
    if (groups.length > 0) {
      const rows = groups.map((g) => ({
        sender_id: senderId,
        group_id: g.group_id,
        name: g.name,
        active: true,
        synced_at: new Date().toISOString(),
      }));
      const { error } = await admin
        .from("whatsapp_groups")
        .upsert(rows, { onConflict: "sender_id,group_id" });
      if (error) throw error;

      // Desativa grupos que sumiram (não estão nesta sync)
      const ids = groups.map((g) => g.group_id);
      await admin
        .from("whatsapp_groups")
        .update({ active: false })
        .eq("sender_id", senderId)
        .not("group_id", "in", `(${ids.map((i) => `"${i.replace(/"/g, '')}"`).join(",")})`);
    }

    return new Response(JSON.stringify({ ok: true, count: groups.length, groups }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("zapi-list-groups error", e);
    return new Response(JSON.stringify({ error: e?.message ?? "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
