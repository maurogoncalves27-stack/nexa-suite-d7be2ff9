// Edge function pública: cria reserva pelo formulário do site.
// Substitui a rota TanStack `api.public.reservations.ts`.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return j({ error: "method not allowed" }, 405);

  try {
    const body = await req.json() as {
      name?: string;
      phone?: string;
      email?: string;
      reservation_date?: string;
      reservation_time?: string;
      party_size?: number;
      notes?: string;
    };

    const name = (body.name || "").trim();
    const phone = (body.phone || "").trim();
    const reservation_date = (body.reservation_date || "").trim();
    const reservation_time = (body.reservation_time || "").trim();
    const party_size = Number(body.party_size || 0);

    if (
      !name || name.length < 2 ||
      !phone || phone.length < 8 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(reservation_date) ||
      !/^\d{2}:\d{2}/.test(reservation_time) ||
      !party_size || party_size < 1 || party_size > 30
    ) {
      return j({ error: "invalid payload" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase
      .from("reservations")
      .insert({
        name,
        phone,
        email: body.email?.trim() || null,
        reservation_date,
        reservation_time: reservation_time.slice(0, 5),
        party_size,
        notes: (body.notes || "").trim() || null,
      })
      .select("id, status")
      .single();

    if (error || !data) {
      console.error("[parme-reservation-create] db err:", error);
      return j({ error: "db_error" }, 500);
    }

    // Notifica loja por WhatsApp (best-effort, não bloqueia)
    (async () => {
      try {
        const { data: cfgRow } = await supabase
          .from("parme_site_settings")
          .select("value")
          .eq("key", "reservations")
          .maybeSingle();
        const cfg = (cfgRow?.value ?? {}) as {
          whatsappStorePhone?: string;
          notifyEnabled?: boolean;
        };
        if (cfg.notifyEnabled === false || !cfg.whatsappStorePhone) return;
        const instance = Deno.env.get("ZAPI_CUSTOMER_INSTANCE_ID");
        const token = Deno.env.get("ZAPI_CUSTOMER_TOKEN");
        const clientToken = Deno.env.get("ZAPI_CUSTOMER_CLIENT_TOKEN");
        if (!instance || !token || !clientToken) return;
        const dateBR = new Date(reservation_date + "T00:00")
          .toLocaleDateString("pt-BR");
        const msg = `🍽️ *Nova reserva (formulário)*\n\n` +
          `👤 ${name}\n📞 ${phone}\n📅 ${dateBR} às ${reservation_time}\n` +
          `👥 ${party_size} ${party_size === 1 ? "pessoa" : "pessoas"}\n` +
          (body.notes ? `📝 ${body.notes}\n` : "") + `\nConfirme com o cliente.`;
        await fetch(
          `https://api.z-api.io/instances/${instance}/token/${token}/send-text`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Client-Token": clientToken,
            },
            body: JSON.stringify({
              phone: cfg.whatsappStorePhone.replace(/\D/g, ""),
              message: msg,
            }),
          },
        );
      } catch (e) {
        console.warn("[parme-reservation-create] notify err:", e);
      }
    })();

    return j({ ok: true, id: data.id, status: data.status });
  } catch (e) {
    console.error("[parme-reservation-create] fatal:", e);
    return j({ error: "internal_error" }, 500);
  }
});
