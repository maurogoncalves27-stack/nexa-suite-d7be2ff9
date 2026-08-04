# Notificações por SMS no Conta+ (TextBee — mesmas credenciais do NEXA)

Versão simplificada: **um único emissor TextBee** (o mesmo aparelho/API key já usado
no NEXA Suite) e **um telefone por usuário**, informado pela própria pessoa na tela
de configurações do Conta+. Sem tabela de emissores, sem painel de admin.

---

## 1. Credenciais (secrets no Conta+)

Pegue os valores do emissor padrão já configurado no NEXA Suite em
**Configurações → Alertas e Notificações → aba SMS** (campos *API Key* e *Device ID*)
e salve no Conta+ como secrets de backend:

| Secret              | Valor                                   |
| ------------------- | --------------------------------------- |
| `TEXTBEE_API_KEY`   | mesma API key do TextBee usada no NEXA  |
| `TEXTBEE_DEVICE_ID` | mesmo Device ID (mesmo aparelho Android)|

> É o mesmo device: os dois sistemas disparam pelo mesmo chip/número. Não precisa
> criar device novo no painel do TextBee.

---

## 2. Banco de dados

Só precisamos guardar o telefone e o liga/desliga do usuário.

```sql
CREATE TABLE public.sms_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_preferences TO authenticated;
GRANT ALL ON public.sms_preferences TO service_role;

ALTER TABLE public.sms_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own sms prefs"
ON public.sms_preferences FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
```

Opcional (log de envios):

```sql
CREATE TABLE public.sms_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  phone text NOT NULL,
  message text NOT NULL,
  status text NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sms_log TO authenticated;
GRANT ALL ON public.sms_log TO service_role;
ALTER TABLE public.sms_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own sms log" ON public.sms_log FOR SELECT
TO authenticated USING (user_id = auth.uid());
```

---

## 3. Edge function `send-sms`

`supabase/functions/send-sms/index.ts`

```ts
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_KEY = Deno.env.get("TEXTBEE_API_KEY") ?? "";
const DEVICE_ID = Deno.env.get("TEXTBEE_DEVICE_ID") ?? "";

// TextBee espera E.164 (ex.: +5561999999999)
function toE164(raw: string): string | null {
  const d = (raw || "").replace(/\D+/g, "");
  if (!d) return null;
  if (d.length >= 12 && d.startsWith("55")) return "+" + d;
  if (d.length === 10 || d.length === 11) return "+55" + d;
  if (d.length >= 11 && d.length <= 15) return "+" + d;
  return null;
}

async function sendViaTextBee(phone: string, message: string) {
  if (!API_KEY || !DEVICE_ID) return { ok: false, error: "TextBee não configurado" };
  const url = `https://api.textbee.dev/api/v1/gateway/devices/${DEVICE_ID}/send-sms`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({ recipients: [phone], message }),
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, error: `TextBee ${res.status}: ${text.slice(0, 300)}` };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const isServiceRole = !!SERVICE_ROLE && token === SERVICE_ROLE;

  let body: { user_id?: string; phone?: string; message: string };
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), { status: 400, headers: corsHeaders });
  }
  if (!body?.message || body.message.length > 500) {
    return new Response(JSON.stringify({ error: "message obrigatória (máx. 500)" }), { status: 400, headers: corsHeaders });
  }

  // Quem envia: service role pode mandar para qualquer user_id (crons);
  // usuário logado só pode mandar para si mesmo (teste do próprio número).
  let userId = body.user_id ?? null;
  if (!isServiceRole) {
    const { data: auth } = await admin.auth.getUser(token);
    if (!auth?.user) return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401, headers: corsHeaders });
    userId = auth.user.id;
  }

  let phone = body.phone ?? null;
  if (!phone && userId) {
    const { data: pref } = await admin.from("sms_preferences")
      .select("phone, enabled").eq("user_id", userId).maybeSingle();
    if (!pref || !pref.enabled) {
      return new Response(JSON.stringify({ skipped: "SMS desativado ou telefone não cadastrado" }), { headers: corsHeaders });
    }
    phone = pref.phone;
  }

  const e164 = toE164(phone ?? "");
  if (!e164) return new Response(JSON.stringify({ error: "Telefone inválido" }), { status: 400, headers: corsHeaders });

  const result = await sendViaTextBee(e164, body.message);
  await admin.from("sms_log").insert({
    user_id: userId, phone: e164, message: body.message,
    status: result.ok ? "sent" : "error", error: result.error ?? null,
  });

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 502,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
```

---

## 4. Tela do usuário (o que a pessoa vê)

Um card em Configurações com:

- Campo **Telefone (WhatsApp/SMS)** com máscara `(61) 99999-9999`
- Switch **Receber notificações por SMS**
- Botão **Enviar SMS de teste**

```ts
// salvar
await supabase.from("sms_preferences").upsert({
  user_id: user.id,
  phone,
  enabled,
  updated_at: new Date().toISOString(),
});

// testar
await supabase.functions.invoke("send-sms", {
  body: { message: "Conta+: teste de notificação por SMS ✅" },
});
```

---

## 5. Disparo automático (lembretes de contas)

De um cron/edge function, usando a service role key:

```ts
await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
  method: "POST",
  headers: { Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    user_id: conta.user_id,
    message: `Conta+ : "${conta.titulo}" vence amanhã (R$ ${conta.valor}).`,
  }),
});
```

---

## Checklist

- [ ] Copiar API Key + Device ID do NEXA e salvar como secrets no Conta+
- [ ] Rodar a migration (`sms_preferences` + opcional `sms_log`)
- [ ] Criar e publicar a edge function `send-sms`
- [ ] Adicionar o card de telefone/switch/teste em Configurações
- [ ] Agendar o cron de lembretes
