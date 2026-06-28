// Confirma uma reserva local e dispara WhatsApp via Z-API Cliente.
// Aceita `id` (preferido) ou `parme_id` (retrocompat) — ambos tratados como id local.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw || "").replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.length >= 12 && digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return "55" + digits;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

function fmtDateBR(d: string | null): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

function buildMessage(r: {
  name: string | null;
  reservation_date: string | null;
  reservation_time: string | null;
  party_size: number | null;
}): string {
  const nome = (r.name || "").trim().split(" ")[0] || "tudo bem";
  const data = fmtDateBR(r.reservation_date);
  const hora = (r.reservation_time || "").slice(0, 5) || "—";
  const pessoas = r.party_size ?? 0;
  const pessoasTxt = pessoas
    ? `para ${pessoas} ${pessoas === 1 ? "pessoa" : "pessoas"}`
    : "";
  return (
    `Olá, ${nome}! 👋\n\n` +
    `Sua reserva no *Aquela Parmê* está *confirmada* para *${data}* às *${hora}*${pessoasTxt ? " " + pessoasTxt : ""}.\n\n` +
    `Qualquer alteração é só responder por aqui. Até logo! 🍝`
  );
}

async function sendCustomerWhatsApp(phone: string, message: string) {
  const instance = Deno.env.get("ZAPI_CUSTOMER_INSTANCE_ID") || "";
  const token = Deno.env.get("ZAPI_CUSTOMER_TOKEN") || "";
  const clientToken = Deno.env.get("ZAPI_CUSTOMER_CLIENT_TOKEN") || "";
  if (!instance || !token || !clientToken) {
    return { ok: false, error: "Z-API Cliente não configurada" };
  }
  const url =
    `https://api.z-api.io/instances/${instance}/token/${token}/send-text`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": clientToken,
      },
      body: JSON.stringify({ phone, message }),
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `Z-API ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "fetch error" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authError } = await supabase.auth.getClaims(
      token,
    );
    if (authError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const id: string | undefined = body?.id ?? body?.parme_id;
    if (!id || typeof id !== "string") {
      return new Response(JSON.stringify({ error: "id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: reservation, error: resErr } = await admin
      .from("reservations")
      .select("id, name, phone, reservation_date, reservation_time, party_size")
      .eq("id", id)
      .maybeSingle();

    if (resErr || !reservation) {
      return new Response(
        JSON.stringify({
          error: "reservation_not_found",
          message: resErr?.message ?? "Reserva não encontrada.",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { error: updErr } = await admin
      .from("reservations")
      .update({ status: "confirmed" })
      .eq("id", id);

    if (updErr) {
      return new Response(
        JSON.stringify({
          error: "local_update_failed",
          message: updErr.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const phone = normalizePhone(reservation.phone);
    let whatsapp_sent = false;
    let whatsapp_error: string | undefined;
    if (!phone) {
      whatsapp_error = "telefone_invalido";
    } else {
      const message = buildMessage(reservation as any);
      const sendResult = await sendCustomerWhatsApp(phone, message);
      whatsapp_sent = sendResult.ok;
      if (!sendResult.ok) whatsapp_error = sendResult.error;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        id,
        whatsapp_sent,
        whatsapp_error,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "internal_error", message: String(e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
