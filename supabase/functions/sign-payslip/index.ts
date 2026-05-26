// Edge function: o colaborador assina seu holerite.
// - Lê o PDF "unsigned"
// - Anexa página de evidência com a assinatura visual + dados do ato
// - Salva o PDF final em payroll-receipts/{emp}/{ano}-{mes}-signed.pdf
// - Atualiza payroll_receipts (status=signed, ip, user_agent, signed_at)
// - Espelha em employee_documents (doc_type='holerite') substituindo o registro mensal anterior
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const receiptId: string = body.receipt_id;
    if (!receiptId) {
      return new Response(JSON.stringify({ error: "receipt_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Carrega holerite + valida que o usuário é o dono
    const { data: receipt, error: rErr } = await admin
      .from("payroll_receipts")
      .select("*")
      .eq("id", receiptId)
      .single();
    if (rErr || !receipt) throw new Error("Holerite não encontrado");
    if (receipt.status === "signed") {
      return new Response(
        JSON.stringify({ ok: true, already_signed: true, signed_path: receipt.signed_file_path }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: employee } = await admin
      .from("employees")
      .select("id, full_name, cpf, user_id")
      .eq("id", receipt.employee_id)
      .single();
    if (!employee) throw new Error("Colaborador não encontrado");
    if (employee.user_id !== userId) throw new Error("forbidden");

    // Pega assinatura visual cadastrada
    const { data: sig } = await admin
      .from("user_signatures")
      .select("signature_path")
      .eq("user_id", userId)
      .maybeSingle();
    if (!sig?.signature_path) throw new Error("Assinatura visual não cadastrada");

    // Baixa PDF unsigned
    const dl = await admin.storage
      .from("payroll-receipts")
      .download(receipt.unsigned_file_path);
    if (dl.error || !dl.data) throw new Error("PDF base não encontrado");
    const unsignedBytes = new Uint8Array(await dl.data.arrayBuffer());

    // Baixa imagem da assinatura (bucket fixo: user-signatures)
    let sigImageBytes: Uint8Array | null = null;
    let sigContentType = "image/png";
    try {
      const sigDl = await admin.storage.from("user-signatures").download(sig.signature_path);
      if (sigDl.data) {
        sigImageBytes = new Uint8Array(await sigDl.data.arrayBuffer());
        sigContentType = sigDl.data.type || "image/png";
      }
    } catch (_) {
      // segue sem imagem; ainda gera evidência textual
    }

    // Carrega PDF e adiciona overlay de assinatura na última página + página de evidência
    const pdf = await PDFDocument.load(unsignedBytes);
    const helv = await pdf.embedFont(StandardFonts.Helvetica);
    const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const pages = pdf.getPages();
    const lastPage = pages[pages.length - 1];

    // Estampar assinatura no espaço reservado (canto inferior esquerdo)
    if (sigImageBytes) {
      const img = sigContentType.includes("jpeg") || sigContentType.includes("jpg")
        ? await pdf.embedJpg(sigImageBytes)
        : await pdf.embedPng(sigImageBytes);
      const w = 180;
      const h = (img.height / img.width) * w;
      lastPage.drawImage(img, { x: 40, y: 95, width: w, height: Math.min(h, 50) });
    }

    const signedAt = new Date();
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("cf-connecting-ip") || "";
    const userAgent = req.headers.get("user-agent") || "";

    const evidenceHash = await sha256Hex(
      [
        receipt.id, employee.id, employee.cpf, signedAt.toISOString(),
        receipt.company_stamp_hash, ip, userAgent,
      ].join("|"),
    );

    // Página de evidência
    const ev = pdf.addPage([595, 842]);
    let y = 800;
    ev.drawText("EVIDÊNCIA DE ASSINATURA ELETRÔNICA", {
      x: 40, y, size: 14, font: helvBold,
    });
    y -= 24;
    ev.drawText("Documento: Recibo de Pagamento de Salário", {
      x: 40, y, size: 10, font: helv,
    });
    y -= 14;
    ev.drawText(
      `Referência: ${String(receipt.reference_month).padStart(2, "0")}/${receipt.reference_year}`,
      { x: 40, y, size: 10, font: helv },
    );
    y -= 14;
    ev.drawText(`Colaborador: ${employee.full_name}`, { x: 40, y, size: 10, font: helv });
    y -= 14;
    ev.drawText(`CPF: ${employee.cpf || "-"}`, { x: 40, y, size: 10, font: helv });
    y -= 22;
    ev.drawText("Carimbo da empresa:", { x: 40, y, size: 10, font: helvBold });
    y -= 14;
    ev.drawText(
      `Data/hora: ${new Date(receipt.company_stamp_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
      { x: 40, y, size: 9, font: helv },
    );
    y -= 12;
    ev.drawText(`Hash: ${receipt.company_stamp_hash}`, {
      x: 40, y, size: 8, font: helv, color: rgb(0.4, 0.4, 0.4),
    });
    y -= 22;
    ev.drawText("Assinatura do colaborador:", { x: 40, y, size: 10, font: helvBold });
    y -= 14;
    ev.drawText(
      `Data/hora: ${signedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
      { x: 40, y, size: 9, font: helv },
    );
    y -= 12;
    ev.drawText(`IP: ${ip || "-"}`, { x: 40, y, size: 9, font: helv });
    y -= 12;
    ev.drawText(`Navegador: ${userAgent.slice(0, 110)}`, { x: 40, y, size: 8, font: helv, color: rgb(0.4, 0.4, 0.4) });
    y -= 12;
    ev.drawText(`Hash da evidência: ${evidenceHash}`, {
      x: 40, y, size: 8, font: helv, color: rgb(0.4, 0.4, 0.4),
    });
    y -= 24;
    ev.drawText(
      "Validade jurídica: assinatura eletrônica simples nos termos da MP 2.200-2/2001, art. 10, §2º.",
      { x: 40, y, size: 9, font: helv },
    );

    const signedBytes = await pdf.save();

    // Sobe assinado
    const signedPath = `${employee.id}/${receipt.reference_year}-${String(receipt.reference_month).padStart(2, "0")}-signed.pdf`;
    const up = await admin.storage
      .from("payroll-receipts")
      .upload(signedPath, signedBytes, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (up.error) throw up.error;

    // Atualiza registro
    const { error: updErr } = await admin
      .from("payroll_receipts")
      .update({
        status: "signed",
        signed_file_path: signedPath,
        signed_at: signedAt.toISOString(),
        signed_ip: ip,
        signed_user_agent: userAgent,
        signed_by_user_id: userId,
      })
      .eq("id", receipt.id);
    if (updErr) throw updErr;

    // Espelha em employee_documents (doc_type='holerite') — substitui mês anterior
    // Mantém só o do mês atual nessa aba; o histórico vive em payroll-receipts.
    await admin
      .from("employee_documents")
      .delete()
      .eq("employee_id", employee.id)
      .eq("doc_type", "holerite");

    const fileName = `Holerite ${String(receipt.reference_month).padStart(2, "0")}-${receipt.reference_year}.pdf`;
    await admin.from("employee_documents").insert({
      employee_id: employee.id,
      doc_type: "holerite",
      file_name: fileName,
      file_path: `payroll-receipts/${signedPath}`,
      mime_type: "application/pdf",
      size_bytes: signedBytes.byteLength,
      uploaded_by: userId,
    });

    return new Response(
      JSON.stringify({ ok: true, signed_path: signedPath }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("sign-payslip error", err);
    return new Response(
      JSON.stringify({ error: err.message || String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
