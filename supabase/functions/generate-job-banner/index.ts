import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { title, position, description, benefits, summary, custom_prompt } = body ?? {};
    if (!title && !position) {
      return new Response(JSON.stringify({ error: "title ou position é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = [
      `Crie um banner profissional, vibrante e moderno para uma vaga de emprego no segmento de food service / restaurante.`,
      `Cargo: ${position || title}.`,
      title ? `Título da vaga: ${title}.` : "",
      summary ? `Resumo: ${summary}.` : "",
      description ? `Contexto: ${description.slice(0, 200)}.` : "",
      benefits ? `Benefícios destaque: ${benefits.slice(0, 150)}.` : "",
      custom_prompt ? `INSTRUÇÕES ESPECÍFICAS DO USUÁRIO (priorize estas): ${custom_prompt.slice(0, 500)}.` : "",
      `Estilo: fotografia editorial cinematográfica, iluminação cálida e convidativa, ambiente de cozinha/restaurante real, pessoas trabalhando felizes (sem rostos focados ou identificáveis), foco em ação e atmosfera, profundidade de campo, cores vivas e atraentes para divulgação de vagas.`,
      `Composição horizontal 16:9, sem texto, sem logos, sem marcas d'água. Apenas a cena.`,
    ].filter(Boolean).join(" ");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de uso atingido. Tente novamente em instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos em Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Falha ao gerar imagem" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResp.json();
    const dataUrl: string | undefined = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl?.startsWith("data:image/")) {
      console.error("Resposta sem imagem", data);
      return new Response(JSON.stringify({ error: "IA não retornou imagem" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // data:image/png;base64,XXXX
    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      return new Response(JSON.stringify({ error: "Formato inesperado de imagem" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const mime = match[1];
    const ext = mime.split("/")[1].split("+")[0] || "png";
    const bin = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const path = `banners/${u.user.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await admin.storage.from("job-banners").upload(path, bin, {
      contentType: mime, upsert: false,
    });
    if (upErr) {
      console.error("upload error", upErr);
      return new Response(JSON.stringify({ error: "Falha ao salvar imagem" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: pub } = admin.storage.from("job-banners").getPublicUrl(path);
    return new Response(JSON.stringify({ url: pub.publicUrl }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-job-banner error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
