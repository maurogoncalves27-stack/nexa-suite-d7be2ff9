// Edge function ONE-SHOT — migra todos os dados do NEXA original para este projeto (NEXA Suite).
// Lê via SOURCE_NEXA_URL / SOURCE_NEXA_SERVICE_ROLE_KEY (projeto NEXA original).
// Escreve neste projeto via SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (auto-injetados).
// Pode ser removida após a migração concluída.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// URL fixa do projeto NEXA original (origem da leitura).
const SOURCE_NEXA_URL = "https://xmswsrhfofwhwtykjqef.supabase.co";

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

// Conflict keys customizados por tabela (quando não houver `id`).
const CONFLICT_KEYS: Record<string, string> = {
  user_roles: "user_id,role",
};

async function upsertChunked(client: SupabaseClient, table: string, rows: any[]) {
  if (rows.length === 0) return { ok: 0, errors: [] as any[] };
  const chunkSize = 500;
  let ok = 0;
  const errors: any[] = [];
  const hasId = rows[0] && Object.prototype.hasOwnProperty.call(rows[0], "id");
  const conflictKey = CONFLICT_KEYS[table] ?? (hasId ? "id" : null);
  const stripCols = new Set<string>();

  for (let i = 0; i < rows.length; i += chunkSize) {
    let chunk = rows.slice(i, i + chunkSize);
    if (stripCols.size > 0) {
      chunk = chunk.map((r) => {
        const c = { ...r };
        stripCols.forEach((k) => { delete c[k]; });
        return c;
      });
    }
    let attempt = 0;
    while (attempt < 5) {
      const q = conflictKey
        ? client.from(table).upsert(chunk, { onConflict: conflictKey, ignoreDuplicates: true })
        : client.from(table).insert(chunk);
      const { error } = await q;
      if (!error) { ok += chunk.length; break; }
      const m = error.message.match(/non-DEFAULT value into column "([^"]+)"/);
      if (m && !stripCols.has(m[1])) {
        stripCols.add(m[1]);
        chunk = chunk.map((r) => { const c = { ...r }; delete c[m[1]]; return c; });
        attempt++;
        continue;
      }
      errors.push({ chunkIndex: i, message: error.message });
      break;
    }
  }
  return { ok, errors, stripped: [...stripCols] };
}




Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ORIGEM = NEXA original
    const SRC_URL = SOURCE_NEXA_URL;
    const SRC_KEY = Deno.env.get("SOURCE_NEXA_SERVICE_ROLE_KEY")?.trim();
    // DESTINO = este projeto (NEXA Suite)
    const DST_URL = Deno.env.get("SUPABASE_URL")!;
    const DST_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!SRC_KEY) {
      return new Response(JSON.stringify({
        error: "Falta SOURCE_NEXA_SERVICE_ROLE_KEY (service_role do projeto NEXA original)",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const src = createClient(SRC_URL, SRC_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${SRC_KEY}`, apikey: SRC_KEY } },
    });
    const dst = createClient(DST_URL, DST_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    // Probe origem (precisa do SQL auxiliar lá)
    const probe = await src.rpc("_migration_list_tables");
    if (probe.error) {
      return new Response(JSON.stringify({
        error: "Origem (NEXA original) não tem _migration_list_tables. Rode o SQL auxiliar lá primeiro.",
        details: probe.error.message,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const meta = probe.data as { tables: string[]; fks: { t: string; ref: string }[] };

    const candidates = meta.tables.filter((t) => !shouldSkip(t));
    const ordered = topoSort(candidates, meta.fks);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const url = new URL(req.url);
    const mode = (body.mode ?? url.searchParams.get("mode") ?? "plan") as string;
    const only: string[] | null = body.only ?? (url.searchParams.get("only")?.split(",").filter(Boolean) ?? null);
    const dryRun = body.dry === true || url.searchParams.get("dry") === "1";
    const skipTables = new Set<string>(body.skip ?? []);
    const startIdx: number = Number(body.startIdx ?? url.searchParams.get("startIdx") ?? 0) || 0;
    const count: number = Number(body.count ?? url.searchParams.get("count") ?? 0) || 0;
    const triggersAction: string | undefined = body.triggers ?? url.searchParams.get("triggers") ?? undefined;

    let targetTables = ordered.filter((t) => !skipTables.has(t));
    if (only && only.length) targetTables = targetTables.filter((t) => only.includes(t));

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

    // Liga/desliga triggers NO DESTINO (este projeto).
    if (mode === "triggers") {
      const enable = triggersAction === "on";
      const { error } = await dst.rpc("_migration_set_triggers", { p_enable: enable });
      return new Response(JSON.stringify({ ok: !error, triggers: enable ? "on" : "off", error: error?.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Migra auth.users da origem para o destino, preservando o UUID.
    // Senhas NÃO podem ser exportadas via API: os usuários precisarão usar "esqueci a senha".
    if (mode === "auth") {
      const result = {
        scanned: 0,
        created: 0,
        already: 0,
        errors: [] as { email?: string; id?: string; message: string }[],
      };
      let page = 1;
      const perPage = 200;
      // Cache de e-mails já existentes no destino
      const existing = new Set<string>();
      const existingIds = new Set<string>();
      {
        let p = 1;
        while (true) {
          const { data, error } = await dst.auth.admin.listUsers({ page: p, perPage });
          if (error) break;
          (data.users ?? []).forEach((u) => {
            if (u.email) existing.add(u.email.toLowerCase());
            existingIds.add(u.id);
          });
          if (!data.users || data.users.length < perPage) break;
          p++;
        }
      }
      while (true) {
        const { data, error } = await src.auth.admin.listUsers({ page, perPage });
        if (error) {
          result.errors.push({ message: `listUsers page ${page}: ${error.message}` });
          break;
        }
        const users = data.users ?? [];
        if (users.length === 0) break;
        for (const u of users) {
          result.scanned++;
          const email = (u.email ?? "").toLowerCase();
          if (existingIds.has(u.id) || (email && existing.has(email))) {
            result.already++;
            continue;
          }
          if (dryRun) continue;
          // createUser aceita `id` (passthrough p/ gotrue) — preserva UUID p/ casar com profiles/employees.
          const payload: any = {
            id: u.id,
            email: u.email ?? undefined,
            phone: u.phone ?? undefined,
            email_confirm: true,
            user_metadata: u.user_metadata ?? {},
            app_metadata: u.app_metadata ?? {},
          };
          const { error: cErr } = await dst.auth.admin.createUser(payload);
          if (cErr) {
            result.errors.push({ id: u.id, email: u.email ?? undefined, message: cErr.message });
          } else {
            result.created++;
            if (u.email) existing.add(email);
            existingIds.add(u.id);
          }
        }
        if (users.length < perPage) break;
        page++;
      }
      return new Response(JSON.stringify({ ok: true, mode, ...result }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mode !== "full" && mode !== "tables") {
      return new Response(JSON.stringify({ error: `mode inválido: ${mode}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    const slice = count > 0 ? targetTables.slice(startIdx, startIdx + count) : targetTables.slice(startIdx);
    const log: any = { mode, dryRun, startIdx, count: slice.length, totalTables: targetTables.length, results: {} as Record<string, any> };

    for (const t of slice) {
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

    log.nextStartIdx = startIdx + slice.length;
    log.done = log.nextStartIdx >= targetTables.length;

    return new Response(JSON.stringify({ ok: true, ...log }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
