import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { KeyRound, Loader2, PenTool } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import {
  PositionTerm,
  fetchClientIp,
  generatePositionTermPdf,
} from "@/lib/positionTerms";
import { COMPANY_INFO } from "@/lib/internalRegulation";
import { getCurrentUserSignatureDataUrl } from "@/lib/userSignature";

interface PositionTermCardProps {
  employeeId: string;
  employeeName: string;
  employeeCpf?: string | null;
  term: PositionTerm;
}

export default function PositionTermCard({
  employeeId,
  employeeName,
  employeeCpf,
  term,
}: PositionTermCardProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [open, setOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [loadingSig, setLoadingSig] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("position_term_acceptances")
        .select("id")
        .eq("user_id", user.id)
        .eq("term_key", term.key)
        .eq("term_version", term.version)
        .limit(1)
        .maybeSingle();
      setAccepted(!!data);
      setLoading(false);
    })();
  }, [user, term.key, term.version]);

  useEffect(() => {
    if (!open || signatureDataUrl || loadingSig) return;
    setLoadingSig(true);
    getCurrentUserSignatureDataUrl()
      .then((url) => setSignatureDataUrl(url))
      .finally(() => setLoadingSig(false));
  }, [open, signatureDataUrl, loadingSig]);

  const handleAccept = async () => {
    if (!user || !agreed) return;
    if (!signatureDataUrl) {
      toast({ title: "Assinatura não cadastrada", description: "Cadastre sua assinatura única primeiro.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const ip = await fetchClientIp();
      const ua = navigator.userAgent;
      const { data: insRow, error } = await supabase
        .from("position_term_acceptances")
        .insert({
          user_id: user.id,
          employee_id: employeeId,
          term_key: term.key,
          term_version: term.version,
          ip_address: ip,
          user_agent: ua,
        })
        .select("id")
        .single();
      if (error) throw error;

      const acceptedAtDate = new Date();
      await generatePositionTermPdf({
        term,
        employeeName,
        employeeCpf,
        acceptedAt: acceptedAtDate,
        ipAddress: ip,
        userAgent: ua,
        signatureId: (insRow as any).id,
        signatureDataUrl,
      });

      try {
        const blob = (await generatePositionTermPdf({
          term,
          employeeName,
          employeeCpf,
          acceptedAt: acceptedAtDate,
          ipAddress: ip,
          userAgent: ua,
          signatureId: (insRow as any).id,
          signatureDataUrl,
          returnBlob: true,
        })) as Blob;
        if (blob) {
          const { uploadEmployeePdfBlob } = await import("@/lib/employeeDocUpload");
          const safe = employeeName.replace(/[^\w\-]+/g, "_");
          await uploadEmployeePdfBlob({
            employeeId,
            docType: `termo_${term.key}`,
            fileName: `${term.key}_${safe}.pdf`,
            blob,
            uploadedBy: user.id,
          });
        }
      } catch (err) {
        console.error("[PositionTerm] falha ao arquivar PDF na pasta", err);
      }

      setAccepted(true);
      setOpen(false);
      toast({ title: "Termo assinado", description: "Aceite registrado com sucesso." });
    } catch (e: any) {
      toast({
        title: "Erro ao assinar termo",
        description: e.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || accepted) return null;

  return (
    <>
      <Card className="border-amber-500/60 bg-amber-50/40 dark:bg-amber-500/5">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="flex items-start gap-3">
            <div className="rounded-md p-2 bg-amber-500/20 text-amber-700 dark:text-amber-400">
              <KeyRound className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                {term.title}
                <Badge variant="destructive">Pendente</Badge>
              </CardTitle>
              <CardDescription>
                Termo específico do seu cargo. É necessário ler e aceitar.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button size="sm" onClick={() => setOpen(true)}>Ler e assinar agora</Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setAgreed(false); }}>
        <DialogContent className="sm:max-w-2xl max-h-[95vh] sm:max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-4 sm:p-6 pb-2 sm:pb-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <KeyRound className="h-5 w-5 text-primary shrink-0" />
              <span className="truncate">{term.title}</span>
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {COMPANY_INFO.name} – CNPJ {COMPANY_INFO.cnpj}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-3 space-y-4">
            <ScrollArea className="h-[30vh] sm:h-[35vh] pr-2 sm:pr-4 border rounded-md p-3 bg-muted/20">
              <div className="space-y-4 text-sm whitespace-pre-line leading-relaxed">
                <p>{term.body(employeeName)}</p>
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-2">Declaração</h3>
                  <p>{term.commitment}</p>
                </div>
              </div>
            </ScrollArea>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <PenTool className="h-4 w-4 text-primary" />
                Sua assinatura cadastrada
              </label>
              {loadingSig ? (
                <div className="flex items-center justify-center h-[80px] border rounded-md bg-muted/20">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : signatureDataUrl ? (
                <div className="border rounded-md bg-white p-2 flex items-center justify-center">
                  <img src={signatureDataUrl} alt="Sua assinatura" className="max-h-[80px] object-contain" />
                </div>
              ) : (
                <div className="border border-destructive/40 rounded-md p-3 bg-destructive/5 text-sm text-destructive">
                  Você ainda não cadastrou sua assinatura. Recarregue a página para cadastrá-la.
                </div>
              )}
            </div>

            <div className="flex items-start gap-2">
              <Checkbox id="agree-term" checked={agreed} onCheckedChange={(c) => setAgreed(!!c)} className="mt-0.5" />
              <label htmlFor="agree-term" className="text-sm cursor-pointer leading-snug">
                Li e concordo com o termo acima e autorizo o uso da minha assinatura eletrônica cadastrada
                para firmá-lo, comprometendo-me a cumpri-lo integralmente.
              </label>
            </div>
          </div>

          <DialogFooter className="p-4 sm:p-6 pt-3 border-t shrink-0 flex-col-reverse sm:flex-row gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button onClick={handleAccept} disabled={!agreed || submitting || !signatureDataUrl} className="w-full sm:w-auto">
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Aceitar e assinar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
