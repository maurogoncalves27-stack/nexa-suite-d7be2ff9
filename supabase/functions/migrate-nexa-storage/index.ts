// Copia arquivos do Storage do NEXA original para o NEXA Suite.
// As linhas em employee_documents (e demais tabelas) já foram migradas via migrate-to-nexa.
// Esta função apenas baixa do bucket de origem e faz upload no bucket de destino.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPER_USER_IDS = new Set<string>([
  "ec5e52b2-a4c3-46c7-8d11-a5b6cf406866",
]);

const SOURCE_URL = Deno.env.get("SOURCE_NEXA_URL")!;
const SOURCE_KEY = Deno.env.get("SOURCE_NEXA_SERVICE_ROLE_KEY")!;
const TARGET_URL = Deno.env.get("SUPABASE_URL")!;
const TARGET_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BUCKETS_DEFAULT = [
  "employee-documents",
  "medical-certificates",
  "outsourced-contracts",
  "useful-documents",
  "warning-signatures",
  "payroll-receipts",
  "candidate-documents",
];

// Mapeamento bucket -> tabela e coluna com o caminho do arquivo
const BUCKET_SOURCES: Record<string, { table: string; col: string }> = {
  "employee-documents": { table: "employee_documents", col: "file_path" },
  "medical-certificates": { table: "medical_certificates", col: "file_path" },
  "outsourced-contracts": { table: "outsourced_contracts", col: "contract_url" },
  "useful-documents": { table: "useful_documents", col: "file_path" },
  "warning-signatures": { table: "warnings", col: "signature_path" },
  "payroll-receipts": { table: "payroll_receipts", col: "file_path" },
  "candidate-documents": { table: "candidate_documents", col: "file_path" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth: só super-usuário
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(TARGET_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const uid = userRes?.user?.id;
    if (!uid || !SUPER_USER_IDS.has(uid)) {
      return json({ error: "forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const mode: "plan" | "copy" = body.mode ?? "plan";
    const bucket: string = body.bucket ?? "employee-documents";
    const offset: number = body.offset ?? 0;
    const limit: number = Math.min(body.limit ?? 25, 50);

    const target = createClient(TARGET_URL, TARGET_KEY, { auth: { persistSession: false } });

    if (mode === "plan") {
      const result: Record<string, { total: number; missing: number }> = {};
      const list = Array.isArray(body.buckets) ? body.buckets : BUCKETS_DEFAULT;
      for (const b of list) {
        const src = BUCKET_SOURCES[b];
        if (!src) {
          result[b] = { total: 0, missing: 0 };
          continue;
        }
        const { data, error } = await target.rpc("_migration_storage_missing_count", {
          p_bucket: b,
          p_table: src.table,
          p_col: src.col,
        }).maybeSingle();
        if (error) {
          result[b] = { total: -1, missing: -1 };
        } else {
          result[b] = data as any;
        }
      }
      return json({ ok: true, plan: result });
    }

    // mode === "copy"
    const src = BUCKET_SOURCES[bucket];
    if (!src) return json({ error: `bucket ${bucket} não mapeado` }, 400);

    // Lista paths que faltam no storage de destino
    const { data: missing, error: missingErr } = await target.rpc("_migration_storage_missing_paths", {
      p_bucket: bucket,
      p_table: src.table,
      p_col: src.col,
      p_offset: offset,
      p_limit: limit,
    });
    if (missingErr) return json({ error: missingErr.message }, 500);

    const paths: string[] = (missing ?? []).map((r: any) => r.path).filter(Boolean);
    let copied = 0;
    const errors: { path: string; error: string }[] = [];

    for (const path of paths) {
      try {
        // Detecta se o path foi gravado com prefixo de OUTRO bucket
        // (ex: employee_documents.file_path = "payroll-receipts/<id>/file.pdf")
        // — nesse caso o arquivo real mora no bucket prefixado.
        let realBucket = bucket;
        let realPath = path;
        const firstSeg = path.split("/")[0];
        if (BUCKETS_DEFAULT.includes(firstSeg) && firstSeg !== bucket) {
          realBucket = firstSeg;
          realPath = path.slice(firstSeg.length + 1);
        }

        // Tenta baixar do bucket "real". Se falhar, faz fallback pro bucket original com path inteiro.
        const tryDownload = async (b: string, p: string) => {
          const u = `${SOURCE_URL}/storage/v1/object/${b}/${p}`;
          return await fetch(u, {
            headers: { Authorization: `Bearer ${SOURCE_KEY}`, apikey: SOURCE_KEY },
          });
        };

        let dl = await tryDownload(realBucket, realPath);
        if (!dl.ok && realBucket !== bucket) {
          dl = await tryDownload(bucket, path);
          if (dl.ok) { realBucket = bucket; realPath = path; }
        }
        if (!dl.ok) {
          errors.push({ path, error: `download ${dl.status}` });
          continue;
        }
        const buf = new Uint8Array(await dl.arrayBuffer());
        const ct = dl.headers.get("Content-Type") ?? "application/octet-stream";
        // Sobe sempre no path EXATO que a tabela referencia, no bucket original
        // (para o app continuar lendo do mesmo lugar).
        const { error: upErr } = await target.storage.from(bucket).upload(path, buf, {
          contentType: ct,
          upsert: true,
        });
        if (upErr) {
          errors.push({ path, error: upErr.message });
          continue;
        }
        copied++;
      } catch (e: any) {
        errors.push({ path, error: e?.message ?? String(e) });
      }
    }

    return json({
      ok: true,
      bucket,
      offset,
      processed: paths.length,
      copied,
      errors,
      nextOffset: offset + paths.length,
      done: paths.length < limit,
    });
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
