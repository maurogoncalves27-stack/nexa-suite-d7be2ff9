// Extrai dados de notas fiscais e boletos a partir de imagens/PDFs usando Lovable AI (Gemini 2.5 Pro multimodal).
// Recebe { files: [{ url, mime_type }] } onde `url` é uma URL assinada do bucket inventory-invoices.
// Retorna o JSON estruturado da nota + lista de boletos.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é um assistente especializado em extrair dados de notas fiscais brasileiras (NF-e, NFC-e, DANFE) e de boletos bancários a partir de imagens e PDFs.

Você receberá uma OU MAIS imagens (que podem ser páginas diferentes da MESMA nota, ou misturar nota + boletos).

Regras:
- Identifique tudo que for nota fiscal e tudo que for boleto.
- Se houver várias páginas da mesma nota, consolide em UM único objeto de nota.
- Se houver vários boletos (parcelas), retorne TODOS no array "boletos".
- Datas no formato YYYY-MM-DD.
- Valores em número decimal (use ponto, sem símbolo de moeda).
- CNPJ apenas dígitos.
- Chave NF-e: 44 dígitos sem espaços.
- Código de barras do boleto: apenas dígitos (44 caracteres) quando legível.
- Linha digitável: formato com pontos/espaços conforme aparece, ou apenas dígitos.
- Se um campo não estiver visível ou legível, retorne null.

Use a função "registrar_nota_e_boletos" para devolver o resultado.`;

const TOOL = {
  type: "function",
  function: {
    name: "registrar_nota_e_boletos",
    description: "Registra os dados extraídos da nota fiscal e dos boletos identificados.",
    parameters: {
      type: "object",
      properties: {
        nota: {
          type: "object",
          description: "Dados consolidados da nota fiscal. Null se não houver nota nas imagens.",
          properties: {
            fornecedor_nome: { type: "string" },
            fornecedor_cnpj: { type: "string", description: "Apenas dígitos" },
            numero: { type: "string" },
            serie: { type: "string" },
            chave_acesso: { type: "string", description: "44 dígitos" },
            data_emissao: { type: "string", description: "YYYY-MM-DD" },
            valor_total: { type: "number" },
          },
        },
        boletos: {
          type: "array",
          description: "Lista de boletos/parcelas identificadas. Pode estar vazia.",
          items: {
            type: "object",
            properties: {
              parcela: { type: "integer", description: "Número da parcela (1, 2, 3...)" },
              vencimento: { type: "string", description: "YYYY-MM-DD" },
              valor: { type: "number" },
              codigo_barras: { type: "string" },
              linha_digitavel: { type: "string" },
              beneficiario: { type: "string" },
            },
            required: ["parcela"],
          },
        },
        observacoes: {
          type: "string",
          description: "Notas livres caso algo esteja ilegível ou ambíguo.",
        },
      },
      required: ["boletos"],
    },
  },
} as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const files = Array.isArray(body?.files) ? body.files : [];
    if (!files.length) return json({ error: "files array is required" }, 400);
    if (files.length > 12) return json({ error: "Máximo de 12 arquivos por extração" }, 400);

    // Baixa cada arquivo e envia inline como data URL (base64).
    // Isso evita falhas silenciosas quando o gateway da IA não consegue
    // alcançar URLs assinadas e também permite enviar PDFs.
    const userContent: Array<Record<string, unknown>> = [
      {
        type: "text",
        text:
          "Analise os arquivos a seguir (imagens e/ou PDFs de notas fiscais e boletos) e extraia os dados solicitados.",
      },
    ];

    const toBase64 = (bytes: Uint8Array) => {
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(
          null,
          Array.from(bytes.subarray(i, i + chunk)) as unknown as number[],
        );
      }
      return btoa(binary);
    };

    let attached = 0;
    const failures: string[] = [];
    for (const f of files) {
      if (!f?.url) {
        failures.push("arquivo sem URL");
        continue;
      }
      try {
        console.log("[extract-invoice] baixando", f.url.slice(0, 120));
        const resp = await fetch(f.url);
        if (!resp.ok) {
          const msg = `download falhou ${resp.status}`;
          console.error("Falha ao baixar arquivo da nota:", f.url, resp.status);
          failures.push(msg);
          continue;
        }
        const buf = new Uint8Array(await resp.arrayBuffer());
        if (!buf.length) {
          failures.push("arquivo vazio");
          continue;
        }
        const mime = (f.mime_type as string) || resp.headers.get("content-type") || "application/octet-stream";
        const dataUrl = `data:${mime};base64,${toBase64(buf)}`;
        console.log("[extract-invoice] anexando", mime, `${(buf.length / 1024).toFixed(0)}KB`);
        // O gateway aceita PDF e imagens via image_url com data URL.
        userContent.push({
          type: "image_url",
          image_url: { url: dataUrl },
        });
        attached += 1;
      } catch (e) {
        console.error("Erro ao preparar arquivo para IA:", e);
        failures.push(e instanceof Error ? e.message : "erro desconhecido");
      }
    }

    if (!attached) {
      return json(
        {
          error:
            "Não foi possível ler nenhum dos arquivos enviados. " +
            (failures.length ? `Detalhes: ${failures.join("; ")}` : ""),
        },
        400,
      );
    }

    console.log("[extract-invoice] chamando IA com", attached, "arquivo(s)");
    const aiResp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
          tools: [TOOL],
          tool_choice: {
            type: "function",
            function: { name: "registrar_nota_e_boletos" },
          },
        }),
      },
    );

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("AI gateway error", aiResp.status, txt);
      if (aiResp.status === 429) {
        return json(
          { error: "Limite de requisições da IA atingido. Tente novamente em alguns instantes." },
          429,
        );
      }
      if (aiResp.status === 402) {
        return json(
          { error: "Créditos da IA esgotados. Adicione créditos no workspace." },
          402,
        );
      }
      return json(
        { error: `Falha ao chamar a IA (${aiResp.status}): ${txt.slice(0, 300)}` },
        500,
      );
    }

    const data = await aiResp.json();
    console.log("[extract-invoice] resposta IA finish:", data?.choices?.[0]?.finish_reason);
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      const textReply = data?.choices?.[0]?.message?.content;
      console.error("Sem tool_call. finish_reason:", data?.choices?.[0]?.finish_reason, "content:", textReply);
      return json(
        {
          error:
            "A IA não conseguiu interpretar o arquivo. " +
            (typeof textReply === "string" && textReply
              ? textReply.slice(0, 200)
              : "Tente uma foto mais nítida ou converta o PDF em imagem (JPG/PNG)."),
        },
        422,
      );
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Failed to parse tool args", e, toolCall.function.arguments);
      return json({ error: "Resposta da IA inválida" }, 500);
    }

    return json({ ok: true, data: parsed }, 200);
  } catch (err) {
    console.error("extract-invoice error", err);
    return json(
      { error: err instanceof Error ? err.message : "Erro desconhecido" },
      500,
    );
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
