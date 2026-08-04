# Pacote de migração — Notificações por SMS (NEXA Suite → Conta+)

Este arquivo contém tudo que é necessário para replicar **apenas o canal SMS**
do sistema de notificações do NEXA Suite em outro projeto Lovable.

Provedor usado: **TextBee** (https://textbee.dev) — gateway que usa um celular
Android como "modem" SMS. Custo zero de API; só precisa do app TextBee instalado
e pareado num aparelho com chip.

Push/VAPID não faz parte deste pacote (já configurado no destino).

---

## 1. Banco de dados (rodar como migration)

```sql
-- Remetentes SMS (multi-gateway / multi-aparelho)
CREATE TABLE public.sms_senders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  provider text NOT NULL DEFAULT 'textbee',
  api_key text NOT NULL,
  device_id text NOT NULL,
  phone_display text,
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_senders TO authenticated;
GRANT ALL ON public.sms_senders TO service_role;

ALTER TABLE public.sms_senders ENABLE ROW LEVEL SECURITY;

-- Ajuste os papéis conforme o projeto de destino.
-- No NEXA usamos has_role(); se o Conta+ for single-user, troque por
-- USING (auth.uid() = <dono>) ou por uma checagem de admin equivalente.
CREATE POLICY "Admins manage sms_senders" ON public.sms_senders FOR ALL
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Staff read sms_senders" ON public.sms_senders FOR SELECT
  USING (public.has_role(auth.uid(),'admin'));

-- Preferências por tipo de alerta (opcional, mas recomendado)
CREATE TABLE public.notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_key text NOT NULL UNIQUE,
  label text,
  sms_enabled boolean NOT NULL DEFAULT false,
  sms_sender_id uuid REFERENCES public.sms_senders(id) ON DELETE SET NULL,
  extra_recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_settings TO authenticated;
GRANT ALL ON public.notification_settings TO service_role;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage notification_settings" ON public.notification_settings FOR ALL
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
```

Notas:
- `api_key` e `device_id` ficam na tabela (não em secrets) porque são
  configuráveis pela UI de admin e podem existir vários aparelhos.
  Se preferir, use secrets `TEXTBEE_API_KEY` / `TEXTBEE_DEVICE_ID` e simplifique
  a função para ler `Deno.env.get()`.
- `alert_key` é uma string livre por tipo de alerta (ex.: `conta_vencendo`,
  `conta_vencida`, `saldo_baixo`).

---

## 2. Edge function `send-sms`

Criar em `supabase/functions/send-sms/index.ts`. Versão adaptada (sem a
dependência de `employees` do NEXA — resolve telefone direto de `profiles`
ou do corpo da requisição):

```ts
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Body {
  user_id?: string;
  phone?: string;
  message: string;
  category?: string;   // casa com notification_settings.alert_key
  sender_id?: string;
}

// TextBee espera E.164 com '+' (ex.: +5561999999999)
function normalizePhoneE164(raw: string): string | null {
  const digits = (raw || "").replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.length >= 12 && digits.startsWith("55")) return "+" + digits;
  if (digits.length === 10 || digits.length === 11) return "+55" + digits;
  if (digits.length >= 11 && digits.length <= 15) return "+" + digits;
  return null;
}

async function sendViaTextBee(
  creds: { apiKey: string; deviceId: string },
  phone: string,
  message: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!creds.apiKey || !creds.deviceId) {
    return { ok: false, error: "TextBee não configurado (api_key/device_id)" };
  }
  const url = `https://api.textbee.dev/api/v1/gateway/devices/${creds.deviceId}/send-sms`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": creds.apiKey },
      body: JSON.stringify({ recipients: [phone], message }),
    });
    const text = await res.text();
    let json: any = {};
    try { json = JSON.parse(text); } catch { /* ignore */ }
    if (!res.ok) return { ok: false, error: `TextBee ${res.status}: ${text.slice(0, 300)}` };
    return { ok: true, id: json?.data?.smsBatchId ?? json?.smsBatchId ?? json?.id };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "fetch error" };
  }
}

async function resolveSmsCreds(admin: any, senderId?: string) {
  if (senderId) {
    const { data } = await admin.from("sms_senders")
      .select("id, api_key, device_id, active").eq("id", senderId).maybeSingle();
    if (data?.active) return { apiKey: data.api_key, deviceId: data.device_id };
  }
  const { data: def } = await admin.from("sms_senders")
    .select("id, api_key, device_id").eq("is_default", true).eq("active", true).maybeSingle();
  if (def) return { apiKey: def.api_key, deviceId: def.device_id };
  return { apiKey: "", deviceId: "" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Chamado por cron/trigger com service role, ou por usuário autenticado.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const isServiceRole = !!SERVICE_ROLE && token === SERVICE_ROLE;
  if (!isServiceRole && !token) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json()) as Body;
    if (!body?.message) {
      return new Response(JSON.stringify({ error: "message é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    let phone = body.phone ?? "";
    if (!phone && body.user_id) {
      const { data: prof } = await admin.from("profiles")
        .select("phone").eq("user_id", body.user_id).maybeSingle();
      phone = prof?.phone ?? "";
    }

    const normalized = normalizePhoneE164(phone);
    if (!normalized) {
      return new Response(JSON.stringify({ ok: true, status: "skipped", reason: "invalid-phone" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let effectiveSenderId = body.sender_id;
    if (!effectiveSenderId && body.category) {
      const { data: setting } = await admin.from("notification_settings")
        .select("sms_sender_id, sms_enabled").eq("alert_key", body.category).maybeSingle();
      if (setting && setting.sms_enabled === false) {
        return new Response(JSON.stringify({ ok: true, status: "skipped", reason: "sms-disabled-for-category" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (setting?.sms_sender_id) effectiveSenderId = setting.sms_sender_id;
    }

    const creds = await resolveSmsCreds(admin, effectiveSenderId);
    if (!creds.apiKey) {
      return new Response(JSON.stringify({ ok: false, status: "failed", error: "Nenhum gateway SMS configurado" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await sendViaTextBee(creds, normalized, body.message);
    return new Response(
      JSON.stringify({ ok: result.ok, status: result.ok ? "sent" : "failed", error: result.error, id: result.id }),
      { status: result.ok ? 200 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("send-sms error", e);
    return new Response(JSON.stringify({ error: e?.message ?? "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

---

## 3. Como disparar

### Do frontend
```ts
await supabase.functions.invoke("send-sms", {
  body: {
    phone: "61999999999",
    message: "Conta de luz vence amanhã: R$ 320,00",
    category: "conta_vencendo",
  },
});
```

### De outra edge function / cron (lembrete de vencimento)
```ts
await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${SERVICE_ROLE}`,
  },
  body: JSON.stringify({ user_id, message, category: "conta_vencendo" }),
});
```

Para os lembretes automáticos do Conta+, criar uma função
`bills-due-reminders` agendada via `pg_cron` (ex.: diariamente às 08:00) que
busca contas com vencimento em D-1/D0, monta o texto e chama `send-sms`.

---

## 4. Configuração do TextBee (uma vez)

1. Criar conta em https://textbee.dev.
2. Instalar o app Android TextBee no celular que terá o chip e parear via QR.
3. Copiar **API Key** e **Device ID** do painel.
4. Inserir na tabela:

```sql
INSERT INTO public.sms_senders (label, api_key, device_id, phone_display, is_default)
VALUES ('Celular principal', '<API_KEY>', '<DEVICE_ID>', '(61) 9xxxx-xxxx', true);
```

Alternativa se o volume crescer ou precisar de entregabilidade garantida:
trocar `sendViaTextBee` por Twilio ou GatewayAPI (ambos disponíveis como
conector Lovable) — o restante da estrutura permanece igual.

---

## 5. Checklist de implantação no Conta+

- [ ] Rodar a migration da seção 1 (ajustando as policies aos papéis do projeto)
- [ ] Criar a edge function `send-sms` da seção 2
- [ ] Garantir coluna `phone` em `profiles` (ou equivalente)
- [ ] Cadastrar o remetente TextBee (seção 4)
- [ ] Criar a tela de admin para gerenciar remetentes e ligar/desligar SMS por alerta
- [ ] Criar o cron de lembretes de vencimento
- [ ] Testar ponta a ponta com um número real
