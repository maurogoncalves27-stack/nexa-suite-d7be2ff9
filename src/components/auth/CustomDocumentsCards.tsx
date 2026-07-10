import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  FileSignature,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Download,
  ChevronDown,
  PenTool,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { fetchClientIp } from "@/lib/internalRegulation";
import { downloadCustomDocumentPdf } from "@/lib/customDocumentPdf";
import { getCurrentUserSignatureDataUrl } from "@/lib/userSignature";

interface CustomDocumentsCardsProps {
  employeeId: string;
  employeePosition: string | null;
}

interface PendingDoc {
  id: string;
  title: string;
  description: string | null;
  current_version: number;
  version_id: string;
  content: string;
}

interface SignedDoc {
  signature_id: string;
  document_id: string;
  title: string;
  version_number: number;
  signed_at: string;
}

export default function CustomDocumentsCards({ employeeId, employeePosition }: CustomDocumentsCardsProps) {
  const { user } = useAuth();
  const [pending, setPending] = useState<PendingDoc[]>([]);
  const [signed, setSigned] = useState<SignedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDoc, setOpenDoc] = useState<PendingDoc | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [signedOpen, setSignedOpen] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [loadingSig, setLoadingSig] = useState(false);

  useEffect(() => {
    if (!openDoc || signatureDataUrl || loadingSig) return;
    setLoadingSig(true);
    getCurrentUserSignatureDataUrl()
      .then((url) => setSignatureDataUrl(url))
      .finally(() => setLoadingSig(false));
  }, [openDoc, signatureDataUrl, loadingSig]);

  const load = async () => {
    if (!user || (!employeePosition && !employeeId)) {
      setPending([]);
      setSigned([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: docs } = await supabase
      .from("custom_documents")
      .select("id, title, description, current_version")
      .eq("is_active", true);

    const docList = docs ?? [];
    if (docList.length === 0) {
      setPending([]);
      setSigned([]);
      setLoading(false);
      return;
    }

    const docIds = docList.map((d) => d.id);
    const [{ data: vers }, { data: sigs }] = await Promise.all([
      supabase
        .from("custom_document_versions")
        .select("id, document_id, version_number, content, target_positions, target_employee_ids")
        .in("document_id", docIds),
      supabase
        .from("custom_document_signatures")
        .select("id, document_id, version_number, signed_at")
        .eq("user_id", user.id)
        .in("document_id", docIds)
        .order("signed_at", { ascending: false }),
    ]);

    const signedKey = new Set(
      ((sigs ?? []) as any[]).map((s) => `${s.document_id}::${s.version_number}`),
    );

    const pendingResult: PendingDoc[] = [];
    for (const d of docList) {
      const v = ((vers ?? []) as any[]).find(
        (x) => x.document_id === d.id && x.version_number === d.current_version,
      );
      if (!v) continue;
      if (!v.target_positions?.includes(employeePosition)) continue;
      if (signedKey.has(`${d.id}::${d.current_version}`)) continue;
      pendingResult.push({
        id: d.id,
        title: d.title,
        description: d.description,
        current_version: d.current_version,
        version_id: v.id,
        content: v.content,
      });
    }

    const docTitleById = new Map(docList.map((d) => [d.id, d.title]));
    const signedResult: SignedDoc[] = ((sigs ?? []) as any[]).map((s) => ({
      signature_id: s.id,
      document_id: s.document_id,
      title: docTitleById.get(s.document_id) ?? "Documento",
      version_number: s.version_number,
      signed_at: s.signed_at,
    }));

    setPending(pendingResult);
    setSigned(signedResult);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user, employeePosition]);

  const handleDownload = async (signatureId: string) => {
    setDownloadingId(signatureId);
    try {
      await downloadCustomDocumentPdf({ signatureId });
    } catch (e: any) {
      toast({ title: "Erro ao gerar PDF", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleSign = async () => {
    if (!user || !openDoc) return;
    if (!signatureDataUrl) {
      toast({ title: "Assinatura não cadastrada", description: "Cadastre sua assinatura única primeiro.", variant: "destructive" });
      return;
    }
    setSigning(true);
    try {
      const ip = await fetchClientIp().catch(() => null);
      const { data: inserted, error } = await supabase
        .from("custom_document_signatures")
        .insert({
          document_id: openDoc.id,
          version_id: openDoc.version_id,
          version_number: openDoc.current_version,
          user_id: user.id,
          employee_id: employeeId,
          ip_address: ip,
          user_agent: navigator.userAgent,
        })
        .select("id")
        .single();
      if (error) throw error;
      const newSigId = inserted?.id;

      // Arquiva PDF assinado na Pasta do Colaborador
      if (newSigId) {
        try {
          const blob = (await downloadCustomDocumentPdf({ signatureId: newSigId, returnBlob: true })) as Blob;
          if (blob) {
            const { uploadEmployeePdfBlob } = await import("@/lib/employeeDocUpload");
            const safeTitle = openDoc.title.replace(/[^\w\-]+/g, "_").slice(0, 60);
            await uploadEmployeePdfBlob({
              employeeId,
              docType: "documento_personalizado",
              fileName: `${safeTitle}_v${openDoc.current_version}.pdf`,
              blob,
              uploadedBy: user.id,
            });
          }
        } catch (err) {
          console.error("[CustomDoc] falha ao arquivar PDF na pasta", err);
        }
      }

      toast({
        title: "Documento assinado",
        description: openDoc.title,
        action: newSigId ? (
          <Button size="sm" variant="outline" onClick={() => handleDownload(newSigId)}>
            <Download className="h-3.5 w-3.5 mr-1" />
            Baixar PDF
          </Button>
        ) : undefined,
      });
      setOpenDoc(null);
      setAgreed(false);
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao assinar", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setSigning(false);
    }
  };

  if (loading) return null;
  if (pending.length === 0) return null;

  return (
    <>
      {pending.map((doc) => (
        <Card key={doc.id} className="border-warning/40">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="flex items-start gap-3 min-w-0">
              <div className="rounded-md p-2 bg-warning/10 text-warning shrink-0">
                <FileSignature className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                  {doc.title}
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="h-3 w-3" /> Assinatura pendente
                  </Badge>
                  <Badge variant="outline">v{doc.current_version}</Badge>
                </CardTitle>
                <CardDescription>
                  {doc.description ?? "Documento aguardando sua leitura e assinatura."}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button onClick={() => { setOpenDoc(doc); setAgreed(false); }}>
              Ler e assinar
            </Button>
          </CardContent>
        </Card>
      ))}

      {/* Documentos personalizados assinados agora aparecem dentro do card "Meus documentos" em EmployeeDocumentsTab */}

      <Dialog open={!!openDoc} onOpenChange={(v) => { if (!v) { setOpenDoc(null); setAgreed(false); } }}>
        <DialogContent className="sm:max-w-3xl max-h-[95vh] h-[95vh] sm:h-auto flex flex-col p-0 gap-0">
          <DialogHeader className="p-4 sm:p-6 pb-3 border-b shrink-0">
            <DialogTitle className="text-base sm:text-lg truncate">{openDoc?.title}</DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0 px-4 sm:px-6">
            <div
              className="prose prose-sm dark:prose-invert max-w-none py-4"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(openDoc?.content ?? "") }}
            />
          </ScrollArea>

          <div className="border-t bg-background shrink-0 p-4 sm:p-6 space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <PenTool className="h-4 w-4 text-primary" />
                Sua assinatura cadastrada
              </label>
              {loadingSig ? (
                <div className="flex items-center justify-center h-[70px] border rounded-md bg-muted/20">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : signatureDataUrl ? (
                <div className="border rounded-md bg-white p-2 flex items-center justify-center">
                  <img src={signatureDataUrl} alt="Sua assinatura" className="max-h-[70px] object-contain" />
                </div>
              ) : (
                <div className="border border-destructive/40 rounded-md p-3 bg-destructive/5 text-sm text-destructive">
                  Você ainda não cadastrou sua assinatura. Recarregue a página.
                </div>
              )}
            </div>

            <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3">
              <Checkbox id="agree-custom" checked={agreed} onCheckedChange={(v) => setAgreed(!!v)} className="mt-0.5" />
              <label htmlFor="agree-custom" className="text-sm cursor-pointer leading-snug">
                Li, compreendi e concordo com o conteúdo deste documento e autorizo o uso da minha
                assinatura eletrônica cadastrada para firmá-lo.
              </label>
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => setOpenDoc(null)} className="w-full sm:w-auto">Cancelar</Button>
              <Button onClick={handleSign} disabled={!agreed || signing || !signatureDataUrl} className="w-full sm:w-auto">
                {signing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Assinar documento
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
