import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let year: number, month: number;
    try {
      const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
      const now = new Date();
      year = Number(body?.year ?? now.getUTCFullYear());
      month = Number(body?.month ?? now.getUTCMonth() + 1);
    } catch {
      const now = new Date();
      year = now.getUTCFullYear();
      month = now.getUTCMonth() + 1;
    }

    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return new Response(JSON.stringify({ error: "Invalid year/month" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const competenceMonth = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();

    // Templates ativos válidos para o mês
    const { data: templates, error: tErr } = await supabase
      .from("recurring_payables")
      .select("*")
      .eq("active", true)
      .lte("start_month", competenceMonth);
    if (tErr) throw tErr;

    const eligible = (templates ?? []).filter(
      (t) => !t.end_month || t.end_month >= competenceMonth,
    );

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const t of eligible) {
      const dueDay = Math.min(Number(t.due_day) || 1, lastDay);
      const dueDate = `${year}-${String(month).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`;
      const isVariable = t.kind === "variable";
      const amount = isVariable ? 0 : Number(t.default_amount || 0);

      const { error } = await supabase.from("accounts_payable").insert({
        store_id: t.store_id,
        installment_number: 1,
        due_date: dueDate,
        amount,
        status: "pending",
        description: t.description,
        supplier_name: null,
        category_id: t.category_id,
        bank_account_id: t.bank_account_id,
        competence_date: dueDate,
        competence_month: competenceMonth,
        recurring_template_id: t.id,
        awaiting_amount: isVariable,
        created_by: t.created_by,
      });

      if (error) {
        // Índice único = duplicate → já existe, pula
        if (String(error.code) === "23505" || /duplicate/i.test(error.message)) {
          skipped++;
        } else {
          errors.push(`${t.description}: ${error.message}`);
        }
      } else {
        created++;
      }
    }

    return new Response(
      JSON.stringify({
        competence_month: competenceMonth,
        templates: eligible.length,
        created,
        skipped,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("generate-recurring-payables failed", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
