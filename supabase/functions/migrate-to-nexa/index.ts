// Edge function ONE-SHOT — migra todos os dados deste projeto para o projeto NEXA.
// Lê via service_role local; escreve no NEXA via NEXA_SUITE_URL/NEXA_SUITE_SERVICE_ROLE_KEY.
// Pode ser removida após a migração concluída.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Prefixos / nomes a NUNCA copiar.
const SKIP_PREFIXES = ["pdv_", "pos_", "saipos_", "_migration", "migration_"];
const SKIP_EXACT = new Set<string>([
  "payroll_xml_history",
  "schema_migrations",
]);

function shouldSkip(t: string): boolean {
  if (SKIP_EXACT.has(t)) return true;
  if (t.startsWith("_")) return true;
  return SKIP_PREFIXES.some((p) => t.startsWith(p));
}

// Ordena tabelas topologicamente: pais antes de filhos.
function topoSort(tables: string[], fks: { t: string; ref: string }[]): string[] {
  const set = new Set(tables);
  const deps = new Map<string, Set<string>>();
  tables.forEach((t) => deps.set(t, new Set()));
  for (const fk of fks) {
    if (!set.has(fk.t) || !set.has(fk.ref) || fk.t === fk.ref) continue;
    deps.get(fk.t)!.add(fk.ref);
  }
  const out: string[] = [];
  const remaining = new Set(tables);
  while (remaining.size) {
    const ready = [...remaining].filter((t) =>
      [...deps.get(t)!].every((d) => !remaining.has(d))
    );
    if (ready.length === 0) {
      // Ciclo — joga o resto em ordem alfabética
      out.push(...[...remaining].sort());
      break;
    }
    ready.sort();
    ready.forEach((t) => { out.push(t); remaining.delete(t); });
  }
  return out;
}

async function fetchAll(client: SupabaseClient, table: string) {
  const all: any[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await client.from(table).select("*").range(from, from + pageSize - 1);
    if (error) throw new Error(`read ${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function upsertChunked(client: SupabaseClient, table: string, rows: any[]) {
  if (rows.length === 0) return { ok: 0, errors: [] as any[] };
  const chunkSize = 500;
  let ok = 0;
  const errors: any[] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await client.from(table).upsert(chunk, { onConflict: "id" });
    if (error) errors.push({ chunkIndex: i, message: error.message });
    else ok += chunk.length;
  }
  return { ok, errors };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SRC_URL = Deno.env.get("SUPABASE_URL")!;
    const SRC_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const DST_URL = Deno.env.get("NEXA_SUITE_URL")?.trim();
    const DST_KEY = Deno.env.get("NEXA_SUITE_SERVICE_ROLE_KEY")?.trim();

    if (!DST_URL || !DST_KEY) {
      return new Response(JSON.stringify({
        error: "Faltam NEXA_SUITE_URL / NEXA_SUITE_SERVICE_ROLE_KEY",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const src = createClient(SRC_URL, SRC_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const dst = createClient(DST_URL, DST_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${DST_KEY}`, apikey: DST_KEY } },
    });

    // Probe destino
    const probe = await dst.rpc("_migration_list_tables");
    if (probe.error) {
      return new Response(JSON.stringify({
        error: "Destino não tem _migration_list_tables. Rode o SQL auxiliar no NEXA primeiro.",
        details: probe.error.message,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Lista tabelas da ORIGEM
    const srcMeta = await src.rpc("_migration_list_tables");
    if (srcMeta.error) throw new Error(`origem _migration_list_tables: ${srcMeta.error.message}`);
    const meta = srcMeta.data as { tables: string[]; fks: { t: string; ref: string }[] };

    const candidates = meta.tables.filter((t) => !shouldSkip(t));
    const ordered = topoSort(candidates, meta.fks);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const url = new URL(req.url);
    const mode = (body.mode ?? url.searchParams.get("mode") ?? "plan") as string;
    const only: string[] | null = body.only ?? (url.searchParams.get("only")?.split(",").filter(Boolean) ?? null);
    const dryRun = body.dry === true || url.searchParams.get("dry") === "1";
    const disableTriggers = body.disableTriggers !== false; // default true em full
    const skipTables = new Set<string>(body.skip ?? []);

    let targetTables = ordered.filter((t) => !skipTables.has(t));
    if (only && only.length) targetTables = targetTables.filter((t) => only.includes(t));

    // mode=plan: só retorna a lista + contagem na origem
    if (mode === "plan") {
      const counts: Record<string, number> = {};
      for (const t of targetTables) {
        const { count, error } = await src.from(t).select("id", { count: "exact", head: true });
        counts[t] = error ? -1 : (count ?? 0);
      }
      return new Response(JSON.stringify({
        ok: true,
        mode,
        totalTables: targetTables.length,
        skipped: meta.tables.filter((t) => shouldSkip(t)),
        order: targetTables,
        counts,
      }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // mode=full ou mode=tables
    if (mode !== "full" && mode !== "tables") {
      return new Response(JSON.stringify({ error: `mode inválido: ${mode}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const log: any = { mode, dryRun, disableTriggers, results: {} as Record<string, any> };

    if (!dryRun && disableTriggers && mode === "full") {
      const { error } = await dst.rpc("_migration_set_triggers", { p_enable: false });
      if (error) log.triggersOff = { error: error.message };
      else log.triggersOff = "ok";
    }

    try {
      for (const t of targetTables) {
        try {
          const rows = await fetchAll(src, t);
          if (rows.length === 0) {
            log.results[t] = { read: 0 };
            continue;
          }
          if (dryRun) {
            log.results[t] = { read: rows.length, written: 0, dryRun: true };
            continue;
          }
          const { ok, errors } = await upsertChunked(dst, t, rows);
          log.results[t] = { read: rows.length, written: ok, errors: errors.length ? errors : undefined };
        } catch (e) {
          log.results[t] = { error: (e as Error).message };
        }
      }
    } finally {
      if (!dryRun && disableTriggers && mode === "full") {
        const { error } = await dst.rpc("_migration_set_triggers", { p_enable: true });
        log.triggersOn = error ? { error: error.message } : "ok";
      }
    }

    return new Response(JSON.stringify({ ok: true, ...log }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
