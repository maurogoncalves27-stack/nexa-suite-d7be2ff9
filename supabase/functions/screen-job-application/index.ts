import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ApplicationPayload {
  job_opening_id: string;
  full_name: string;
  email?: string | null;
  phone: string;
  city?: string | null;
  neighborhood?: string | null;
  birth_date?: string | null;
  has_transport?: boolean | null;
  availability?: string[];
  experience_years?: number | null;
  last_job?: string | null;
  last_job_company?: string | null;
  behavioral_answers?: Record<string, string>;
  selected_slot_id?: string | null;
  resume_path?: string | null;
  resume_name?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as ApplicationPayload;
    if (!body.job_opening_id || !body.full_name?.trim() || !body.phone?.trim()) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios faltando." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Vaga deve estar pública e aberta
    const { data: opening, error: opErr } = await supabase
      .from("job_openings")
      .select("id, title, position, requirements, responsibilities, description, is_public, status")
      .eq("id", body.job_opening_id)
      .maybeSingle();
    if (opErr || !opening || !opening.is_public || opening.status !== "open") {
      return new Response(JSON.stringify({ error: "Vaga indisponível." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Reservar slot atomicamente, se selecionado (agenda global)
    if (body.selected_slot_id) {
      const { data: slot, error: slErr } = await supabase
        .from("interview_slots")
        .update({ is_available: false, booked_at: new Date().toISOString() })
        .eq("id", body.selected_slot_id)
        .eq("is_available", true)
        .is("booked_by_candidate_id", null)
        .select("id")
        .maybeSingle();
      if (slErr || !slot) {
        return new Response(JSON.stringify({ error: "Horário indisponível, por favor escolha outro." }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ==== Triagem com IA ====
    let screening_score: number | null = null;
    let screening_summary: string | null = null;
    let screening_recommendation: string | null = null;

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (apiKey) {
      try {
        const prompt = `Vaga: ${opening.title} (cargo: ${opening.position})
Descrição: ${opening.description ?? "—"}
Responsabilidades: ${opening.responsibilities ?? "—"}
Requisitos: ${opening.requirements ?? "—"}

Candidato:
Nome: ${body.full_name}
Cidade/Bairro: ${body.city ?? "—"} / ${body.neighborhood ?? "—"}
Data nascimento: ${body.birth_date ?? "—"}
Transporte próprio: ${body.has_transport ? "sim" : "não"}
Disponibilidade: ${(body.availability ?? []).join(", ") || "—"}
Experiência (anos): ${body.experience_years ?? "—"}
Último cargo: ${body.last_job ?? "—"} na ${body.last_job_company ?? "—"}

Respostas comportamentais:
${Object.entries(body.behavioral_answers ?? {}).map(([q, a]) => `- ${q}: ${a}`).join("\n") || "—"}

Avalie a aderência do candidato à vaga e devolva via tool call.`;

        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: "Você é um analista de RH experiente em fast-food/varejo. Seja objetivo e justo." },
              { role: "user", content: prompt },
            ],
            tools: [{
              type: "function",
              function: {
                name: "score_candidate",
                description: "Pontue o candidato",
                parameters: {
                  type: "object",
                  properties: {
                    score: { type: "integer", description: "0 a 100" },
                    summary: { type: "string", description: "Resumo curto em até 3 frases" },
                    recommendation: { type: "string", enum: ["forte_recomendado", "recomendado", "neutro", "nao_recomendado"] },
                  },
                  required: ["score", "summary", "recommendation"],
                  additionalProperties: false,
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "score_candidate" } },
          }),
        });
        if (aiResp.ok) {
          const aiJson = await aiResp.json();
          const tc = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
          if (tc?.function?.arguments) {
            const args = JSON.parse(tc.function.arguments);
            screening_score = Math.max(0, Math.min(100, Number(args.score) || 0));
            screening_summary = String(args.summary ?? "");
            screening_recommendation = String(args.recommendation ?? "neutro");
          }
        } else {
          console.error("AI gateway error:", aiResp.status, await aiResp.text());
        }
      } catch (e) {
        console.error("AI scoring failed:", e);
      }
    }

    // Inserir candidatura
    const { data: app, error: insErr } = await supabase
      .from("job_applications")
      .insert({
        job_opening_id: body.job_opening_id,
        full_name: body.full_name.trim(),
        email: body.email?.trim() || null,
        phone: body.phone.trim(),
        city: body.city || null,
        neighborhood: body.neighborhood || null,
        birth_date: body.birth_date || null,
        has_transport: body.has_transport ?? null,
        availability: body.availability ?? [],
        experience_years: body.experience_years ?? null,
        last_job: body.last_job || null,
        last_job_company: body.last_job_company || null,
        behavioral_answers: body.behavioral_answers ?? {},
        screening_score,
        screening_summary,
        screening_recommendation,
        selected_slot_id: body.selected_slot_id || null,
        interview_status: "pending",
        resume_path: body.resume_path || null,
        resume_name: body.resume_name || null,
      })
      .select("id")
      .single();

    if (insErr) {
      // Revert slot if insert failed
      if (body.selected_slot_id) {
        await supabase.from("interview_slots")
          .update({ is_available: true, booked_at: null })
          .eq("id", body.selected_slot_id);
      }
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, application_id: app.id, screening_score, screening_recommendation }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("screen-job-application error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
