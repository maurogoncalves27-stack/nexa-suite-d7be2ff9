// Edge function pública para verificação de autenticidade de documentos assinados.
// Sem JWT (qualquer pessoa com o link/QR pode verificar).
// Retorna apenas metadados sanitizados (sem CPF completo, sem IP completo, sem conteúdo).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface VerifyResponse {
  valid: boolean;
  doc_type: string;
  doc_label: string;
  signer_name: string;
  signer_cpf_masked: string | null;
  signed_at: string;
  content_hash: string | null;
  ip_masked: string | null;
  company_name: string | null;
  superseded: boolean;
}

const maskCpf = (cpf?: string | null): string | null => {
  if (!cpf) return null;
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return null;
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
};

const maskIp = (ip?: string | null): string | null => {
  if (!ip) return null;
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.xx.xx`;
  // ipv6: mostra só os 2 primeiros segmentos
  const v6 = ip.split(":");
  if (v6.length > 2) return `${v6[0]}:${v6[1]}:xxxx:...`;
  return "xx.xx.xx.xx";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const type = url.searchParams.get("type"); // contract | custom_doc | warning | regulation | position_term

    if (!id || !type) {
      return new Response(
        JSON.stringify({ error: "Missing id or type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    let resp: VerifyResponse | null = null;

    if (type === "contract") {
      const { data: sig } = await supabase
        .from("contract_signatures")
        .select("id, employee_id, template_name, content_hash, signed_at, ip_address, superseded_at")
        .eq("id", id)
        .maybeSingle();
      if (!sig) return notFound();
      const { data: emp } = await supabase
        .from("employees")
        .select("full_name, cpf, store_id")
        .eq("id", sig.employee_id)
        .maybeSingle();
      const { data: store } = emp?.store_id
        ? await supabase.from("stores").select("name, legal_name").eq("id", emp.store_id).maybeSingle()
        : { data: null as any };
      resp = {
        valid: true,
        doc_type: "contract",
        doc_label: sig.template_name || "Contrato de Trabalho",
        signer_name: emp?.full_name ?? "—",
        signer_cpf_masked: maskCpf(emp?.cpf),
        signed_at: sig.signed_at,
        content_hash: sig.content_hash,
        ip_masked: maskIp(sig.ip_address),
        company_name: store?.legal_name || store?.name || null,
        superseded: !!sig.superseded_at,
      };
    } else if (type === "custom_doc") {
      const { data: sig } = await supabase
        .from("custom_document_signatures")
        .select("id, document_id, version_number, signed_at, ip_address, employee_id")
        .eq("id", id)
        .maybeSingle();
      if (!sig) return notFound();
      const { data: doc } = await supabase
        .from("custom_documents")
        .select("title, current_version")
        .eq("id", sig.document_id)
        .maybeSingle();
      const { data: ver } = await supabase
        .from("custom_document_versions")
        .select("content")
        .eq("document_id", sig.document_id)
        .eq("version_number", sig.version_number)
        .maybeSingle();
      const { data: emp } = sig.employee_id
        ? await supabase.from("employees").select("full_name, cpf, store_id").eq("id", sig.employee_id).maybeSingle()
        : { data: null as any };
      const { data: store } = emp?.store_id
        ? await supabase.from("stores").select("name, legal_name").eq("id", emp.store_id).maybeSingle()
        : { data: null as any };

      // Hash do conteúdo da versão (gerado on-the-fly pra verificar integridade)
      let hash: string | null = null;
      if (ver?.content) {
        const buf = new TextEncoder().encode(ver.content);
        const digest = await crypto.subtle.digest("SHA-256", buf);
        hash = Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      }
      resp = {
        valid: true,
        doc_type: "custom_doc",
        doc_label: `${doc?.title ?? "Documento"} (v${sig.version_number})`,
        signer_name: emp?.full_name ?? "—",
        signer_cpf_masked: maskCpf(emp?.cpf),
        signed_at: sig.signed_at,
        content_hash: hash,
        ip_masked: maskIp(sig.ip_address),
        company_name: store?.legal_name || store?.name || null,
        superseded: doc?.current_version != null && sig.version_number < doc.current_version,
      };
    } else if (type === "warning") {
      const { data: w } = await supabase
        .from("employee_warnings")
        .select("id, employee_id, title, content_hash, signed_at, signature_ip, status")
        .eq("id", id)
        .maybeSingle();
      if (!w || w.status !== "signed") return notFound();
      const { data: emp } = await supabase
        .from("employees")
        .select("full_name, cpf, store_id")
        .eq("id", w.employee_id)
        .maybeSingle();
      const { data: store } = emp?.store_id
        ? await supabase.from("stores").select("name, legal_name").eq("id", emp.store_id).maybeSingle()
        : { data: null as any };
      resp = {
        valid: true,
        doc_type: "warning",
        doc_label: `Advertência: ${w.title}`,
        signer_name: emp?.full_name ?? "—",
        signer_cpf_masked: maskCpf(emp?.cpf),
        signed_at: w.signed_at,
        content_hash: w.content_hash,
        ip_masked: maskIp(w.signature_ip),
        company_name: store?.legal_name || store?.name || null,
        superseded: false,
      };
    } else if (type === "regulation") {
      const { data: a } = await supabase
        .from("internal_regulation_acceptances")
        .select("id, employee_id, regulation_version, accepted_at, ip_address")
        .eq("id", id)
        .maybeSingle();
      if (!a) return notFound();
      const { data: emp } = a.employee_id
        ? await supabase.from("employees").select("full_name, cpf, store_id").eq("id", a.employee_id).maybeSingle()
        : { data: null as any };
      const { data: store } = emp?.store_id
        ? await supabase.from("stores").select("name, legal_name").eq("id", emp.store_id).maybeSingle()
        : { data: null as any };
      resp = {
        valid: true,
        doc_type: "regulation",
        doc_label: `Regimento Interno (v${a.regulation_version})`,
        signer_name: emp?.full_name ?? "—",
        signer_cpf_masked: maskCpf(emp?.cpf),
        signed_at: a.accepted_at,
        content_hash: null,
        ip_masked: maskIp(a.ip_address),
        company_name: store?.legal_name || store?.name || null,
        superseded: false,
      };
    } else if (type === "position_term") {
      const { data: a } = await supabase
        .from("position_term_acceptances")
        .select("id, employee_id, term_key, term_version, accepted_at, ip_address")
        .eq("id", id)
        .maybeSingle();
      if (!a) return notFound();
      const { data: emp } = a.employee_id
        ? await supabase.from("employees").select("full_name, cpf, store_id").eq("id", a.employee_id).maybeSingle()
        : { data: null as any };
      const { data: store } = emp?.store_id
        ? await supabase.from("stores").select("name, legal_name").eq("id", emp.store_id).maybeSingle()
        : { data: null as any };
      resp = {
        valid: true,
        doc_type: "position_term",
        doc_label: `Termo: ${a.term_key} (v${a.term_version})`,
        signer_name: emp?.full_name ?? "—",
        signer_cpf_masked: maskCpf(emp?.cpf),
        signed_at: a.accepted_at,
        content_hash: null,
        ip_masked: maskIp(a.ip_address),
        company_name: store?.legal_name || store?.name || null,
        superseded: false,
      };
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify(resp), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("verify-signature error", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function notFound() {
  return new Response(
    JSON.stringify({ valid: false, error: "Documento não encontrado" }),
    { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
