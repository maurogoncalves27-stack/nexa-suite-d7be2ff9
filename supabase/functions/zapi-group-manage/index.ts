// Gerencia grupos de WhatsApp via Z-API.
// Ações: create, rename, add_participant, remove_participant, list_participants, leave
// Body: { sender_id, action, ...params }
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { requireRole } from "../_shared/requireRole.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function normPhones(input: any): string[] {
  const arr = Array.isArray(input) ? input : [input];
  return arr
    .map((v) => String(v ?? "").replace(/\D+/g, ""))
    .filter((d) => d.length >= 10)
    .map((d) => (d.startsWith("55") ? d : "55" + d));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authCheck = await requireRole(req, ["admin", "manager"], corsHeaders);
  if (!authCheck.ok) return authCheck.response!;

  try {
    const body = await req.json().catch(() => ({}));
    const senderId = body?.sender_id as string | undefined;
    const action = body?.action as string | undefined;
    if (!senderId || !action) {
      return new Response(JSON.stringify({ error: "sender_id e action são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: sender } = await admin
      .from("whatsapp_senders")
      .select("id, zapi_instance_id, zapi_token, zapi_client_token")
      .eq("id", senderId)
      .maybeSingle();

    if (!sender?.zapi_instance_id || !sender?.zapi_token) {
      return new Response(JSON.stringify({ error: "Remetente Z-API não configurado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const base = `https://api.z-api.io/instances/${sender.zapi_instance_id}/token/${sender.zapi_token}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (sender.zapi_client_token) headers["Client-Token"] = sender.zapi_client_token;

    let path = "";
    let payload: any = {};
    let method: "POST" | "GET" | "DELETE" | "PUT" = "POST";

    switch (action) {
      case "create": {
        const groupName = String(body?.group_name ?? "").trim();
        const phones = normPhones(body?.phones);
        if (!groupName || phones.length === 0) {
          return new Response(JSON.stringify({ error: "group_name e phones são obrigatórios" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        path = "/create-group";
        payload = { groupName, phones, autoInvite: true };
        break;
      }
      case "rename": {
        const groupId = String(body?.group_id ?? "");
        const groupName = String(body?.group_name ?? "").trim();
        if (!groupId || !groupName) {
          return new Response(JSON.stringify({ error: "group_id e group_name são obrigatórios" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        path = "/update-group-name";
        payload = { groupId, groupName };
        break;
      }
      case "add_participant": {
        const groupId = String(body?.group_id ?? "");
        const phones = normPhones(body?.phones);
        if (!groupId || phones.length === 0) {
          return new Response(JSON.stringify({ error: "group_id e phones são obrigatórios" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        path = "/add-participant";
        payload = { groupId, phones };
        break;
      }
      case "remove_participant": {
        const groupId = String(body?.group_id ?? "");
        const phones = normPhones(body?.phones);
        if (!groupId || phones.length === 0) {
          return new Response(JSON.stringify({ error: "group_id e phones são obrigatórios" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        path = "/remove-participant";
        payload = { groupId, phones };
        break;
      }
      case "list_participants": {
        const groupId = String(body?.group_id ?? "");
        if (!groupId) {
          return new Response(JSON.stringify({ error: "group_id é obrigatório" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        path = `/group-metadata/${encodeURIComponent(groupId)}`;
        method = "GET";
        break;
      }
      case "leave": {
        const groupId = String(body?.group_id ?? "");
        if (!groupId) {
          return new Response(JSON.stringify({ error: "group_id é obrigatório" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        path = "/leave-group";
        payload = { groupId };
        break;
      }
      default:
        return new Response(JSON.stringify({ error: `action inválida: ${action}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: method === "GET" ? undefined : JSON.stringify(payload),
    });
    const txt = await res.text();
    let data: any = null;
    try { data = JSON.parse(txt); } catch { data = txt; }

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Z-API ${res.status}`, details: data }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Se criou grupo, upsert em whatsapp_groups
    if (action === "create" && (data?.phone || data?.groupId)) {
      const gid = String(data.phone ?? data.groupId);
      await admin.from("whatsapp_groups").upsert({
        sender_id: senderId,
        group_id: gid,
        name: payload.groupName,
        active: true,
        synced_at: new Date().toISOString(),
      }, { onConflict: "sender_id,group_id" });
    }
    if (action === "rename" && payload.groupId) {
      await admin.from("whatsapp_groups")
        .update({ name: payload.groupName, synced_at: new Date().toISOString() })
        .eq("sender_id", senderId).eq("group_id", payload.groupId);
    }

    return new Response(JSON.stringify({ ok: true, action, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("zapi-group-manage error", e);
    return new Response(JSON.stringify({ error: e?.message ?? "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
