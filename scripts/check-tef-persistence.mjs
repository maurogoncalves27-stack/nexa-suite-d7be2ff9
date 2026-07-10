/**
 * Diagnóstico local: verifica leitura/gravação em pdv_tef_transactions.
 * Usa o client do projeto (anon key pública). Não imprime credenciais.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || "https://ixjgmerxxakdkfdzgumy.supabase.co";
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4amdtZXJ4eGFrZGtmZHpndW15Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3Nzc0MDcsImV4cCI6MjA5NTM1MzQwN30.P6TOFgTyYCz1BpDiPZKucHwBAE8CMo8JqId7s4sYtAA";

const STORE_ID = "fcf435c2-c382-444c-b499-4d95f07b2633";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const probeSaleId = `DIAG-${stamp}`;

async function main() {
  console.log("=== TEF persistence diagnostic (anon, unauthenticated) ===\n");

  const { data: rows, error: readErr } = await supabase
    .from("pdv_tef_transactions")
    .select("id, finished_at, amount, status, paygo_reqnum, sale_id")
    .eq("store_id", STORE_ID)
    .order("finished_at", { ascending: false })
    .limit(8);

  if (readErr) {
    console.log("READ error:", readErr.message, `(code ${readErr.code})`);
  } else {
    console.log(`READ ok: ${rows?.length ?? 0} row(s) visible to anon`);
    for (const r of rows ?? []) {
      console.log(
        `  - ${r.finished_at} | R$ ${r.amount} | ${r.status} | req=${r.paygo_reqnum ?? "-"} | sale=${r.sale_id ?? "-"}`,
      );
    }
  }

  console.log("\n--- INSERT probe: status approved (anon) ---");
  const approvedId = crypto.randomUUID();
  const { error: insApproved } = await supabase.from("pdv_tef_transactions").insert({
    id: approvedId,
    store_id: STORE_ID,
    provider: "paygo",
    amount: 0.01,
    status: "approved",
    sale_id: probeSaleId,
    finished_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  console.log(insApproved ? `INSERT approved FAIL: ${insApproved.message}` : "INSERT approved OK (or blocked by RLS silently)");

  const { data: approvedRow, error: selApproved } = await supabase
    .from("pdv_tef_transactions")
    .select("id")
    .eq("id", approvedId)
    .maybeSingle();
  console.log(
    selApproved
      ? `SELECT after approved INSERT: ${selApproved.message}`
      : approvedRow
        ? "SELECT after approved INSERT: row visible"
        : "SELECT after approved INSERT: row NOT visible (RLS)",
  );

  console.log("\n--- INSERT probe: status pending_confirmation (anon) ---");
  const pendingId = crypto.randomUUID();
  const { error: insPending } = await supabase.from("pdv_tef_transactions").insert({
    id: pendingId,
    store_id: STORE_ID,
    provider: "paygo",
    amount: 0.02,
    status: "pending_confirmation",
    sale_id: `${probeSaleId}-pending`,
    finished_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  console.log(
    insPending
      ? `INSERT pending_confirmation FAIL: ${insPending.message}`
      : "INSERT pending_confirmation OK",
  );

  // cleanup probe rows if anon can delete (unlikely)
  await supabase.from("pdv_tef_transactions").delete().eq("id", approvedId);
  await supabase.from("pdv_tef_transactions").delete().eq("id", pendingId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
