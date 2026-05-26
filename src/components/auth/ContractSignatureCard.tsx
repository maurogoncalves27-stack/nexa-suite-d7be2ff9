import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileSignature, Loader2, AlertCircle, CheckCircle2, FileDown, PenTool } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { fetchClientIp } from "@/lib/internalRegulation";
import {
  buildContract,
  generateContractPdf,
  getActiveContractTemplate,
  type ContractEmployeeData,
} from "@/lib/contractPdf";
import { addVerificationFooter } from "@/lib/documentVerification";
import { getCurrentUserSignatureDataUrl } from "@/lib/userSignature";

interface ContractSignatureCardProps {
  employeeId: string;
  /** Se true, oculta o card quando o contrato já estiver assinado (sem pendência). */
  hideWhenSigned?: boolean;
  /** Notifica o pai sobre o estado atual do contrato (pendente / assinado). */
  onStatusChange?: (status: {
    pending: boolean;
    signed: boolean;
    signedAt: string | null;
    download: (() => Promise<void>) | null;
    downloading: boolean;
  }) => void;
}

interface ExistingSignature {
  id: string;
  template_id: string | null;
  template_name: string | null;
  content: string;
  content_hash?: string | null;
  signed_at: string;
  ip_address: string | null;
  user_agent: string | null;
  signature_url: string | null;
}

interface PendingContract {
  templateId: string;
  templateName: string;
  templateContent: string;
  fullText: string;
  contentHash: string;
  employee: ContractEmployeeData;
}

const sha256 = async (text: string): Promise<string> => {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const dataUrlToBlob = (dataUrl: string): Blob => {
  const [meta, b64] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(meta)?.[1] ?? "image/png";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

const fetchSignedUrlAsDataUrl = async (path: string): Promise<string | null> => {
  const { data } = await supabase.storage
    .from("employee-documents")
    .createSignedUrl(path, 60);
  if (!data?.signedUrl) return null;
  try {
    const res = await fetch(data.signedUrl);
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

export default function ContractSignatureCard({ employeeId, hideWhenSigned, onStatusChange }: ContractSignatureCardProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<ExistingSignature | null>(null);
  const [pending, setPending] = useState<PendingContract | null>(null);
  const [openSign, setOpenSign] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [userSignatureDataUrl, setUserSignatureDataUrl] = useState<string | null>(null);
  const [loadingSignature, setLoadingSignature] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: sig } = await supabase
        .from("contract_signatures")
        .select("id, template_id, template_name, content, content_hash, signed_at, ip_address, user_agent, signature_url, superseded_at" as any)
        .eq("user_id", user.id)
        .is("superseded_at", null)
        .order("signed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const tpl = await getActiveContractTemplate();
      if (!tpl) {
        setExisting((sig as any) ?? null);
        setPending(null);
        setLoading(false);
        return;
      }

      const { data: emp } = await supabase
        .from("employees")
        .select("*")
        .eq("id", employeeId)
        .maybeSingle();

      if (!emp) {
        setExisting((sig as any) ?? null);
        setPending(null);
        setLoading(false);
        return;
      }

      const built = await buildContract(emp as ContractEmployeeData, tpl.content);
      const fullText = `${built.header}\n\n${built.body}\n${built.footer}`;
      const hash = await sha256(`${tpl.id}::${fullText}`);

      const { data: matchSig } = await supabase
        .from("contract_signatures")
        .select("id, template_id, template_name, content, content_hash, signed_at, ip_address, user_agent, signature_url, superseded_at" as any)
        .eq("user_id", user.id)
        .eq("content_hash", hash)
        .is("superseded_at", null)
        .order("signed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (matchSig) {
        setExisting(matchSig as any);
        setPending(null);
      } else {
        setExisting((sig as any) ?? null);
        setPending({
          templateId: tpl.id,
          templateName: tpl.name,
          templateContent: tpl.content,
          fullText,
          contentHash: hash,
          employee: emp as ContractEmployeeData,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, employeeId]);

  // Carrega a assinatura única do usuário ao abrir o dialog (uma vez)
  useEffect(() => {
    if (!openSign || userSignatureDataUrl || loadingSignature) return;
    setLoadingSignature(true);
    getCurrentUserSignatureDataUrl()
      .then((url) => setUserSignatureDataUrl(url))
      .finally(() => setLoadingSignature(false));
  }, [openSign, userSignatureDataUrl, loadingSignature]);

  const handleSign = async () => {
    if (!user || !pending) return;
    if (!userSignatureDataUrl) {
      toast({
        title: "Assinatura não cadastrada",
        description: "Cadastre sua assinatura única para poder assinar documentos.",
        variant: "destructive",
      });
      return;
    }
    setSigning(true);
    try {
      const dataUrl = userSignatureDataUrl;
      const blob = dataUrlToBlob(dataUrl);
      const path = `contract-signatures/${user.id}/${Date.now()}.png`;
      const { error: upErr } = await supabase.storage
        .from("employee-documents")
        .upload(path, blob, { contentType: "image/png", upsert: false });
      if (upErr) throw upErr;

      const ip = await fetchClientIp().catch(() => null);
      const signedAt = new Date();
      const { data: insSig, error } = await supabase.from("contract_signatures").insert({
        employee_id: employeeId,
        user_id: user.id,
        template_id: pending.templateId,
        template_name: pending.templateName,
        content: pending.fullText,
        content_hash: pending.contentHash,
        ip_address: ip,
        user_agent: navigator.userAgent,
        signature_url: path,
        signed_at: signedAt.toISOString(),
      }).select("id").single();
      if (error) throw error;
      const newSigId = (insSig as any).id as string;

      // Gera PDF assinado e arquiva na pasta de documentos do colaborador
      try {
        const doc = await generateContractPdf(
          pending.employee,
          pending.templateContent,
          { signatureDataUrl: dataUrl },
        );
        const pageCount = (doc as any).internal.getNumberOfPages();
        doc.setPage(pageCount);
        const pageHeight = doc.internal.pageSize.getHeight();
        doc.setFont("times", "italic");
        doc.setFontSize(8);
        doc.setTextColor(80);
        const stamp = [
          `Assinado eletronicamente por ${pending.employee.full_name || ""} em ${signedAt.toLocaleString("pt-BR")}`,
          ip ? `IP: ${ip}` : null,
          "Lei 14.063/2020 — assinatura eletrônica avançada",
        ].filter(Boolean).join(" • ");
        doc.text(stamp, 20, pageHeight - 8);

        // Adiciona rodapé de verificação (QR Code) em todas as páginas
        await addVerificationFooter(doc, {
          type: "contract",
          signatureId: newSigId,
          contentHash: pending.contentHash,
          signedAt,
        });

        const pdfBlob = doc.output("blob");
        const safeName = (pending.employee.full_name || "colaborador")
          .replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
        const fileName = `contrato_assinado_${safeName}_${signedAt.getTime()}.pdf`;
        const pdfPath = `${employeeId}/${signedAt.getTime()}-contrato-assinado.pdf`;
        const { error: pdfUpErr } = await supabase.storage
          .from("employee-documents")
          .upload(pdfPath, pdfBlob, { contentType: "application/pdf", upsert: false });
        if (pdfUpErr) throw pdfUpErr;
        const { error: docInsErr } = await supabase.from("employee_documents").insert({
          employee_id: employeeId,
          doc_type: "Contrato de Trabalho Assinado",
          file_name: fileName,
          file_path: pdfPath,
          mime_type: "application/pdf",
          size_bytes: pdfBlob.size,
          uploaded_by: user.id,
        });
        if (docInsErr) throw docInsErr;
      } catch (archiveErr: any) {
        console.error("[Contract] erro ao arquivar PDF assinado", archiveErr);
        toast({
          title: "Assinatura registrada, mas falha ao arquivar PDF",
          description: archiveErr.message ?? String(archiveErr),
          variant: "destructive",
        });
      }

      toast({ title: "Contrato assinado", description: "Assinatura digital registrada e arquivada nos documentos do colaborador." });
      setOpenSign(false);
      setAgreed(false);
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao assinar", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setSigning(false);
    }
  };

  const handleDownload = async () => {
    if (!existing) return;
    setDownloading(true);
    try {
      const { data: emp } = await supabase
        .from("employees")
        .select("*")
        .eq("id", employeeId)
        .maybeSingle();
      if (!emp) throw new Error("Colaborador não encontrado");

      let templateContent: string | null = null;
      if (existing.template_id) {
        const { data: tpl } = await supabase
          .from("contract_templates")
          .select("content")
          .eq("id", existing.template_id)
          .maybeSingle();
        templateContent = tpl?.content ?? null;
      }
      if (!templateContent) {
        const tpl = await getActiveContractTemplate();
        templateContent = tpl?.content ?? "";
      }

      let signatureDataUrl: string | null = null;
      if (existing.signature_url) {
        signatureDataUrl = await fetchSignedUrlAsDataUrl(existing.signature_url);
      }

      const doc = await generateContractPdf(
        emp as ContractEmployeeData,
        templateContent,
        { signatureDataUrl },
      );

      const pageCount = (doc as any).internal.getNumberOfPages();
      doc.setPage(pageCount);
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFont("times", "italic");
      doc.setFontSize(8);
      doc.setTextColor(80);
      const stamp = [
        `Assinado eletronicamente por ${(emp as any).full_name || ""} em ${new Date(existing.signed_at).toLocaleString("pt-BR")}`,
        existing.ip_address ? `IP: ${existing.ip_address}` : null,
        "Lei 14.063/2020 — assinatura eletrônica avançada",
      ]
        .filter(Boolean)
        .join(" • ");
      doc.text(stamp, 20, pageHeight - 8);

      // Adiciona rodapé de verificação (QR Code) em todas as páginas
      await addVerificationFooter(doc, {
        type: "contract",
        signatureId: existing.id,
        contentHash: existing.content_hash ?? null,
        signedAt: existing.signed_at,
      });

      const safeName = ((emp as any).full_name || "colaborador")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "_");
      doc.save(`contrato_assinado_${safeName}.pdf`);
    } catch (e: any) {
      toast({ title: "Erro ao gerar PDF", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  // Notifica o pai sobre o estado atual (para listar fora do card, se quiser)
  useEffect(() => {
    if (!onStatusChange) return;
    onStatusChange({
      pending: !!pending,
      signed: !!existing && !pending,
      signedAt: existing?.signed_at ?? null,
      download: existing ? handleDownload : null,
      downloading,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, existing, downloading]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!pending && !existing) return null;
  // Quando já assinado e o pai pediu para esconder (vai listar dentro de "Meus documentos")
  if (hideWhenSigned && existing && !pending) return null;

  return (
    <>
      <Card className={pending ? "border-warning/40" : ""}>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`rounded-md p-2 shrink-0 ${
                pending ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"
              }`}
            >
              <FileSignature className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                Contrato Individual de Trabalho
                {pending ? (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="h-3 w-3" /> Assinatura pendente
                  </Badge>
                ) : (
                  <Badge variant="default">Assinado</Badge>
                )}
              </CardTitle>
              <CardDescription>
                {pending
                  ? "Leia atentamente seu contrato de trabalho e assine digitalmente."
                  : existing
                    ? `Assinado em ${new Date(existing.signed_at).toLocaleString("pt-BR")}`
                    : ""}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {pending && (
            <Button onClick={() => { setOpenSign(true); setAgreed(false); }}>
              Ler e assinar
            </Button>
          )}
          {existing && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownload}
              disabled={downloading}
              className="gap-1"
            >
              <FileDown className="h-4 w-4" />
              {downloading ? "Gerando PDF..." : "Baixar PDF assinado"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={openSign}
        onOpenChange={(v) => {
          setOpenSign(v);
          if (!v) setAgreed(false);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Contrato Individual de Trabalho</DialogTitle>
          </DialogHeader>
          <div className="h-[45vh] overflow-y-auto border rounded-md p-4 bg-muted/20">
            <pre className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-foreground">
              {pending?.fullText ?? ""}
            </pre>
          </div>
          <div className="flex items-start gap-2 pt-3">
            <Checkbox
              id="agree-contract"
              checked={agreed}
              onCheckedChange={(v) => setAgreed(!!v)}
            />
            <label htmlFor="agree-contract" className="text-sm cursor-pointer">
              Li, compreendi e concordo com todas as cláusulas deste contrato de trabalho.
              Autorizo o uso da minha assinatura eletrônica cadastrada para firmá-lo,
              nos termos da Lei 14.063/2020.
            </label>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <PenTool className="h-4 w-4 text-primary" />
              Sua assinatura cadastrada
            </label>
            {loadingSignature ? (
              <div className="flex items-center justify-center h-[120px] border rounded-md bg-muted/20">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : userSignatureDataUrl ? (
              <div className="border rounded-md bg-white p-2 flex items-center justify-center">
                <img
                  src={userSignatureDataUrl}
                  alt="Sua assinatura"
                  className="max-h-[120px] object-contain"
                />
              </div>
            ) : (
              <div className="border border-destructive/40 rounded-md p-3 bg-destructive/5 text-sm text-destructive">
                Você ainda não cadastrou sua assinatura. Recarregue a página para cadastrá-la.
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Esta assinatura foi cadastrada por você no momento da criação da conta e será
              embutida automaticamente no PDF do contrato.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenSign(false)}>Cancelar</Button>
            <Button onClick={handleSign} disabled={!agreed || !userSignatureDataUrl || signing}>
              {signing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Assinar contrato
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
