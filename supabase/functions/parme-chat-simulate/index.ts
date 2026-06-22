// Edge function: roda uma bateria de testes simulados contra a Giana (parme-chat).
// - Gera fala do cliente fictício via Lovable AI Gateway
// - Chama parme-chat real com session_id "test-..." e drena o stream
// - Lê do banco a resposta do assistente após cada turno
// - Avalia automaticamente cada conversa e grava em chat_test_runs

import { createClient } from "npm:@supabase/supabase-js@2";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible@1";
import { generateText } from "npm:ai@5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Scenario = {
  id: string;
  label: string;
  persona: { nome: string; telefone: string; bairro?: string };
  briefing: string; // instrução em PT-BR pro roteirista de cliente
  expects: string; // o que a Giana deveria fazer (usado pelo avaliador)
  maxTurns?: number;
};

const SCENARIOS: Record<string, Scenario> = {
  duvida_cardapio: {
    id: "duvida_cardapio",
    label: "Dúvida cardápio (sem glúten)",
    persona: { nome: "Carla", telefone: "61999900001" },
    briefing:
      "Você é Carla, cliente. Pergunte se o Aquela Parmê tem opção sem glúten. Responda às perguntas da Giana de forma curta e natural. Se ela perguntar seu nome, diga Carla. Encerre a conversa depois que ela responder sua dúvida.",
    expects:
      "A Giana deve perguntar o nome no início, responder educadamente, NÃO inventar produto sem glúten se não souber, e não tentar registrar reserva/pedido.",
    maxTurns: 4,
  },
  duvida_horario: {
    id: "duvida_horario",
    label: "Dúvida horário",
    persona: { nome: "Bruno", telefone: "61999900002" },
    briefing:
      "Você é Bruno. Pergunte que horas o restaurante abre no domingo. Se ela perguntar seu nome diga Bruno. Mantenha mensagens curtas. Encerre depois da resposta.",
    expects:
      "A Giana deve responder ou dizer que não tem essa informação sem inventar horário, e não criar reserva.",
    maxTurns: 4,
  },
  reclamacao_atraso: {
    id: "reclamacao_atraso",
    label: "Reclamação de atraso",
    persona: { nome: "Diana", telefone: "61999900003" },
    briefing:
      "Você é Diana, cliente irritada. Reclame que pediu há 1h e nada chegou. Pedido #4521. Diga seu WhatsApp se ela perguntar: 61 99990-0003. Mantenha tom de cliente real, frases curtas. Encerre quando ela confirmar que registrou.",
    expects:
      "A Giana DEVE chamar a tool registrar_problema_pedido com o pedido 4521 e o telefone. Não pode dizer 'registrei' sem ter chamado a tool.",
    maxTurns: 6,
  },
  reclamacao_item_faltando: {
    id: "reclamacao_item_faltando",
    label: "Item faltando",
    persona: { nome: "Eduardo", telefone: "61999900004" },
    briefing:
      "Você é Eduardo. Reclame que faltou a batata frita no seu pedido de parmegiana. Se ela pedir, diga pedido #7812. WhatsApp: 61 99990-0004. Frases curtas.",
    expects:
      "Giana deve registrar o problema via tool, sem inventar reembolso.",
    maxTurns: 6,
  },
  reclamacao_frio: {
    id: "reclamacao_frio",
    label: "Comida fria",
    persona: { nome: "Fernanda", telefone: "61999900005" },
    briefing:
      "Você é Fernanda. Diga que o estrogonofe chegou frio e murcho. Pedido #3104. WhatsApp 61 99990-0005. Curta e direta.",
    expects: "Registrar problema via tool com os dados.",
    maxTurns: 6,
  },
  reserva_completa: {
    id: "reserva_completa",
    label: "Reserva (dados de uma vez)",
    persona: { nome: "Gustavo", telefone: "61999900006", bairro: "Asa Sul" },
    briefing:
      "Você é Gustavo. Já no início diga que quer reservar mesa pra 4 pessoas no próximo sábado às 20h, em nome de Gustavo, WhatsApp 61999900006. Confirme quando ela perguntar.",
    expects:
      "Giana DEVE chamar criar_reserva com pessoas=4, horario=20:00, data correta do próximo sábado.",
    maxTurns: 5,
  },
  reserva_pingada: {
    id: "reserva_pingada",
    label: "Reserva (info por info)",
    persona: { nome: "Helena", telefone: "61999900007" },
    briefing:
      "Você é Helena. Comece só com 'quero reservar uma mesa'. Responda às perguntas dela uma a uma: nome Helena, WhatsApp 61999900007, dia próximo domingo, 19h30, 2 pessoas. Confirme quando ela pedir.",
    expects:
      "Giana deve perguntar dados faltantes e ao final chamar criar_reserva.",
    maxTurns: 8,
  },
  delivery_asa_norte: {
    id: "delivery_asa_norte",
    label: "Delivery Asa Norte",
    persona: { nome: "Igor", telefone: "61999900008", bairro: "Asa Norte" },
    briefing:
      "Você é Igor. Diga que quer fazer um pedido. Quando ela perguntar bairro: Asa Norte. Marca: Aquela Parmê.",
    expects:
      "Giana deve chamar sugerir_ifood com bairro=Asa Norte e marca=parme e mandar o link.",
    maxTurns: 5,
  },
  delivery_lago_sul: {
    id: "delivery_lago_sul",
    label: "Delivery Lago Sul",
    persona: { nome: "Juliana", telefone: "61999900009", bairro: "Lago Sul" },
    briefing:
      "Você é Juliana. Diz que quer pedir delivery. Bairro Lago Sul. Marca: Estrogonofe.",
    expects:
      "Giana deve chamar sugerir_ifood com bairro=Lago Sul e marca=estrogonofe.",
    maxTurns: 5,
  },
  oi_curto: {
    id: "oi_curto",
    label: "Só 'oi'",
    persona: { nome: "Kleber", telefone: "61999900010" },
    briefing:
      "Você é Kleber. Mande apenas 'oi' e na próxima mensagem diga 'tchau, era só pra testar'. Nada mais.",
    expects: "Giana deve cumprimentar e perguntar o nome, sem tentar fechar venda.",
    maxTurns: 3,
  },
  troll: {
    id: "troll",
    label: "Fora de escopo",
    persona: { nome: "Lara", telefone: "61999900011" },
    briefing:
      "Você é Lara. Pergunte 'qual a capital da França?' e depois 'me ajuda com minha lição de casa'. Curta.",
    expects:
      "Giana deve recusar educadamente e trazer a conversa de volta pro restaurante.",
    maxTurns: 3,
  },
};

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function buildGateway(key: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
}

type Turn = { role: "user" | "assistant"; text: string };

function uiMessages(history: Turn[]) {
  return history.map((m, i) => ({
    id: `m-${i}`,
    role: m.role,
    parts: [{ type: "text", text: m.text }],
  }));
}

async function drainStream(res: Response): Promise<void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
}

async function readLastAssistantText(
  supabase: ReturnType<typeof sb>,
  sessionId: string,
  prevCount: number,
): Promise<string> {
  // Pequeno poll porque parme-chat grava no onFinish
  for (let i = 0; i < 12; i++) {
    const { data } = await supabase
      .from("chat_conversations")
      .select("messages")
      .eq("session_id", sessionId)
      .maybeSingle();
    const msgs = Array.isArray((data as { messages?: unknown } | null)?.messages)
      ? ((data as { messages: unknown[] }).messages as Array<{ role?: string; content?: string }>)
      : [];
    if (msgs.length > prevCount) {
      const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant");
      if (lastAssistant?.content) return String(lastAssistant.content);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  return "";
}

async function nextClientMessage(
  gateway: ReturnType<typeof buildGateway>,
  scenario: Scenario,
  history: Turn[],
): Promise<{ text: string; done: boolean }> {
  const transcript = history
    .map((m) => `${m.role === "user" ? "CLIENTE" : "GIANA"}: ${m.text}`)
    .join("\n");
  const prompt =
    `Você está ATUANDO como um cliente de restaurante conversando com a atendente virtual Giana.
PERSONA: ${scenario.persona.nome} (WhatsApp ${scenario.persona.telefone}${scenario.persona.bairro ? `, bairro ${scenario.persona.bairro}` : ""}).
BRIEFING: ${scenario.briefing}

Histórico até agora:
${transcript || "(início da conversa)"}

Escreva APENAS a próxima fala do cliente, curta (máx 2 frases), em português coloquial. Não escreva narrações nem o nome "CLIENTE:". Se a conversa já chegou ao fim natural (você agradeceu/se despediu/disse tchau), responda exatamente "[FIM]".`;
  const { text } = await generateText({
    model: gateway("google/gemini-3-flash-preview"),
    prompt,
    temperature: 0.8,
  });
  const clean = text.trim();
  if (!clean || clean === "[FIM]" || /^\[FIM\]/i.test(clean)) {
    return { text: "", done: true };
  }
  return { text: clean.replace(/^CLIENTE:\s*/i, ""), done: false };
}

async function evaluateConversation(
  gateway: ReturnType<typeof buildGateway>,
  scenario: Scenario,
  history: Turn[],
): Promise<{ passed: boolean; score: number; issues: string[]; notes: string }> {
  const transcript = history
    .map((m) => `${m.role === "user" ? "CLIENTE" : "GIANA"}: ${m.text}`)
    .join("\n");
  const prompt =
    `Você é um avaliador de qualidade de atendimento. Analise a conversa abaixo e julgue se a atendente (GIANA) cumpriu o esperado.

CENÁRIO: ${scenario.label}
EXPECTATIVA: ${scenario.expects}

CONVERSA:
${transcript}

Responda SOMENTE com um JSON válido neste formato:
{"passed": true|false, "score": 0-10, "issues": ["..."], "notes": "uma frase curta"}
- "passed": true se a Giana cumpriu o essencial.
- "issues": lista de problemas concretos (vazio se tudo ok).
- Sem markdown, sem cercas, só o JSON.`;
  const { text } = await generateText({
    model: gateway("google/gemini-3-flash-preview"),
    prompt,
    temperature: 0.2,
  });
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    return {
      passed: !!parsed.passed,
      score: Number(parsed.score) || 0,
      issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [],
      notes: String(parsed.notes ?? ""),
    };
  } catch {
    return { passed: false, score: 0, issues: ["Avaliador falhou em parsear JSON"], notes: text.slice(0, 200) };
  }
}

async function runOne(
  scenario: Scenario,
  runId: string,
  index: number,
  apiKey: string,
  supabaseUrl: string,
  serviceKey: string,
): Promise<void> {
  const supabase = sb();
  const gateway = buildGateway(apiKey);
  const sessionId = `test-${runId}-${scenario.id}-${index}`.toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-").slice(0, 80);
  const history: Turn[] = [];
  const startedAt = new Date().toISOString();
  const maxTurns = scenario.maxTurns ?? 5;

  try {
    // Primeiro turno do cliente é semeado pelo roteirista (sem histórico).
    let lastMsgCount = 0;
    for (let turn = 0; turn < maxTurns; turn++) {
      const { text: clientText, done } = await nextClientMessage(gateway, scenario, history);
      if (done || !clientText) break;
      history.push({ role: "user", text: clientText });

      const res = await fetch(`${supabaseUrl}/functions/v1/parme-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
        body: JSON.stringify({
          messages: uiMessages(history),
          sessionId,
          clientMeta: {
            test_run: {
              run_id: runId,
              scenario: scenario.id,
              persona: scenario.persona,
              started_at: startedAt,
            },
            telefone: scenario.persona.telefone,
            nome: scenario.persona.nome,
            ...(scenario.persona.bairro ? { bairro: scenario.persona.bairro } : {}),
          },
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`parme-chat ${res.status}: ${errText.slice(0, 200)}`);
      }
      await drainStream(res);
      const assistant = await readLastAssistantText(supabase, sessionId, lastMsgCount);
      if (assistant) {
        history.push({ role: "assistant", text: assistant });
        lastMsgCount = history.length;
      } else {
        // Sem resposta gravada — interrompe pra não travar
        break;
      }
    }

    const evalResult = await evaluateConversation(gateway, scenario, history);
    await supabase.from("chat_test_runs").insert({
      run_id: runId,
      scenario: scenario.id,
      session_id: sessionId,
      persona: scenario.persona,
      passed: evalResult.passed,
      score: evalResult.score,
      issues: evalResult.issues,
      evaluator_notes: evalResult.notes,
    });
    // Marca conversa como test_run (caso pre-stream tenha sobrescrito client_meta)
    const { data: cur } = await supabase
      .from("chat_conversations")
      .select("client_meta")
      .eq("session_id", sessionId)
      .maybeSingle();
    const meta = (cur?.client_meta && typeof cur.client_meta === "object") ? cur.client_meta as Record<string, unknown> : {};
    await supabase.from("chat_conversations").update({
      client_meta: {
        ...meta,
        test_run: {
          run_id: runId,
          scenario: scenario.id,
          persona: scenario.persona,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          passed: evalResult.passed,
          score: evalResult.score,
        },
      },
    }).eq("session_id", sessionId);
  } catch (e) {
    console.error(`[simulate] ${scenario.id}#${index} falhou:`, e);
    await supabase.from("chat_test_runs").insert({
      run_id: runId,
      scenario: scenario.id,
      session_id: sessionId,
      persona: scenario.persona,
      passed: false,
      score: 0,
      issues: [`Erro de execução: ${(e as Error).message}`],
      evaluator_notes: "",
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") {
    return Response.json(
      { scenarios: Object.values(SCENARIOS).map((s) => ({ id: s.id, label: s.label })) },
      { headers: corsHeaders },
    );
  }

  try {
    const body = await req.json().catch(() => ({})) as {
      scenarios?: unknown;
      runs_per_scenario?: unknown;
    };
    const requested = Array.isArray(body.scenarios) ? body.scenarios.filter((s) => typeof s === "string") as string[] : [];
    const ids = requested.length ? requested.filter((id) => SCENARIOS[id]) : Object.keys(SCENARIOS);
    if (!ids.length) {
      return new Response("Nenhum cenário válido", { status: 400, headers: corsHeaders });
    }
    const runsPer = Math.min(Math.max(Number(body.runs_per_scenario) || 1, 1), 3);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response("Missing LOVABLE_API_KEY", { status: 500, headers: corsHeaders });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const runId = `${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 12)}-${crypto.randomUUID().slice(0, 6)}`;

    // Dispara em background — cliente polla chat_test_runs
    const work = (async () => {
      const tasks: Promise<void>[] = [];
      for (const id of ids) {
        const scenario = SCENARIOS[id];
        // runs do mesmo cenário sequenciais, cenários em paralelo
        tasks.push((async () => {
          for (let i = 0; i < runsPer; i++) {
            await runOne(scenario, runId, i, apiKey, supabaseUrl, serviceKey);
          }
        })());
      }
      await Promise.allSettled(tasks);
    })();

    // @ts-ignore EdgeRuntime existe no Supabase Edge Functions
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(work);
    } else {
      work.catch((e) => console.error("[simulate] background err:", e));
    }

    return Response.json(
      {
        run_id: runId,
        scenarios: ids,
        runs_per_scenario: runsPer,
        total_expected: ids.length * runsPer,
        status: "started",
      },
      { headers: corsHeaders },
    );
  } catch (e) {
    console.error("[simulate] erro:", e);
    return new Response(`Erro: ${(e as Error).message}`, { status: 500, headers: corsHeaders });
  }
});
