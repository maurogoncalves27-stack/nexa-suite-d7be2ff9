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
import { ScrollText, CheckCircle2, Loader2, FileDown, PenTool } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import {
  COMPANY_INFO,
  INTERNAL_REGULATION_CHAPTERS,
  INTERNAL_REGULATION_COMMITMENT,
  INTERNAL_REGULATION_INTRO,
  INTERNAL_REGULATION_TITLE,
  INTERNAL_REGULATION_VERSION,
  fetchClientIp,
  generateInternalRegulationPdf,
} from "@/lib/internalRegulation";
import { getCurrentUserSignatureDataUrl } from "@/lib/userSignature";

interface InternalRegulationCardProps {
  employeeId: string;
  employeeName: string;
  employeeCpf?: string | null;
}

interface AcceptanceRecord {
  id: string;
  accepted_at: string;
  ip_address: string | null;
  user_agent: string | null;
  regulation_version: string;
}

export default function InternalRegulationCard({
  employeeId,
  employeeName,
  employeeCpf,
}: InternalRegulationCardProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [acceptance, setAcceptance] = useState<AcceptanceRecord | null>(null);
  const [open, setOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [loadingSig, setLoadingSig] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("internal_regulation_acceptances")
        .select("id, accepted_at, ip_address, user_agent, regulation_version")
        .eq("user_id", user.id)
        .eq("regulation_version", INTERNAL_REGULATION_VERSION)
        .order("accepted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!error) setAcceptance(data ?? null);
      setLoading(false);
    })();
  }, [user]);

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
      const { data, error } = await supabase
        .from("internal_regulation_acceptances")
        .insert({
          user_id: user.id,
          employee_id: employeeId,
          regulation_version: INTERNAL_REGULATION_VERSION,
          ip_address: ip,
          user_agent: ua,
        })
        .select("id, accepted_at, ip_address, user_agent, regulation_version")
        .single();
      if (error) throw error;

      setAcceptance(data);
      await generateInternalRegulationPdf({
        employeeName,
        employeeCpf,
        acceptedAt: new Date(data.accepted_at),
        ipAddress: data.ip_address,
        userAgent: data.user_agent,
        signatureId: data.id,
        signatureDataUrl,
      });
      // Arquiva cópia na Pasta do Colaborador
      try {
        const blob = (await generateInternalRegulationPdf({
          employeeName,
          employeeCpf,
          acceptedAt: new Date(data.accepted_at),
          ipAddress: data.ip_address,
          userAgent: data.user_agent,
          signatureId: data.id,
          signatureDataUrl,
          returnBlob: true,
        })) as Blob;
        if (blob) {
          const { uploadEmployeePdfBlob } = await import("@/lib/employeeDocUpload");
          const safe = employeeName.replace(/[^\w\-]+/g, "_");
          await uploadEmployeePdfBlob({
            employeeId,
            docType: "regimento_interno",
            fileName: `regimento_interno_${safe}.pdf`,
            blob,
            uploadedBy: user.id,
          });
        }
      } catch (err) {
        console.error("[Regulation] falha ao arquivar PDF na pasta", err);
      }
      toast({ title: "Regimento aceito", description: "PDF gerado com sua assinatura digital." });
      setOpen(false);
      setAgreed(false);
    } catch (e: any) {
      toast({
        title: "Erro ao registrar aceite",
        description: e.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async () => {
    if (!acceptance) return;
    const sig = signatureDataUrl ?? (await getCurrentUserSignatureDataUrl());
    await generateInternalRegulationPdf({
      employeeName,
      employeeCpf,
      acceptedAt: new Date(acceptance.accepted_at),
      ipAddress: acceptance.ip_address,
      userAgent: acceptance.user_agent,
      signatureId: acceptance.id,
      signatureDataUrl: sig,
    });
  };

  if (loading) return null;

  const accepted = !!acceptance;

  if (accepted) return null;

  return (
    <>
      <Card className={accepted ? "border-primary/30" : "border-amber-500/60 bg-amber-50/40 dark:bg-amber-500/5"}>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="flex items-start gap-3">
            <div className={`rounded-md p-2 ${accepted ? "bg-primary/10 text-primary" : "bg-amber-500/20 text-amber-700 dark:text-amber-400"}`}>
              <ScrollText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                Regimento Interno
                {accepted ? (
                  <Badge variant="default" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Assinado
                  </Badge>
                ) : (
                  <Badge variant="destructive">Pendente</Badge>
                )}
              </CardTitle>
              <CardDescription>
                {accepted
                  ? `Você aceitou em ${new Date(acceptance!.accepted_at).toLocaleString("pt-BR")}.`
                  : "É necessário ler e aceitar o Regulamento Interno da empresa."}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button size="sm" variant={accepted ? "outline" : "default"} onClick={() => setOpen(true)}>
            {accepted ? "Visualizar regimento" : "Ler e assinar agora"}
          </Button>
          {accepted && (
            <Button size="sm" variant="outline" onClick={handleDownload} className="gap-1">
              <FileDown className="h-4 w-4" /> Baixar PDF assinado
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setAgreed(false); }}>
        <DialogContent className="sm:max-w-3xl max-h-[95vh] h-[95vh] sm:h-auto flex flex-col p-0 gap-0">
          <DialogHeader className="p-4 sm:p-6 pb-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <ScrollText className="h-5 w-5 text-primary shrink-0" />
              <span className="truncate">{INTERNAL_REGULATION_TITLE}</span>
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {COMPANY_INFO.name} – CNPJ {COMPANY_INFO.cnpj}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0 px-4 sm:px-6">
            <div className="space-y-4 text-sm text-foreground py-4">
              <p className="text-muted-foreground">{INTERNAL_REGULATION_INTRO}</p>

              {INTERNAL_REGULATION_CHAPTERS.map((chapter) => (
                <section key={chapter.title} className="space-y-2">
                  <h3 className="font-semibold text-base">{chapter.title}</h3>
                  {chapter.articles.map((art, i) => (
                    <p key={i} className="whitespace-pre-line leading-relaxed">
                      {art}
                    </p>
                  ))}
                </section>
              ))}

              <section className="space-y-2 pt-2 border-t">
                <h3 className="font-semibold text-base">TERMO DE CIÊNCIA E COMPROMISSO</h3>
                <p className="leading-relaxed">{INTERNAL_REGULATION_COMMITMENT}</p>
              </section>

              <p className="text-xs text-muted-foreground pt-2 border-t">
                Versão {INTERNAL_REGULATION_VERSION} • {COMPANY_INFO.address}
              </p>
            </div>
          </ScrollArea>

          <div className="border-t bg-background shrink-0 p-4 sm:p-6 space-y-3">
            {!accepted && (
              <>
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
                  <Checkbox
                    id="regulation-agree"
                    checked={agreed}
                    onCheckedChange={(v) => setAgreed(v === true)}
                    disabled={submitting}
                    className="mt-0.5"
                  />
                  <label htmlFor="regulation-agree" className="text-sm leading-snug cursor-pointer">
                    Li e concordo integralmente com o Regulamento Interno e autorizo o uso da minha
                    assinatura eletrônica cadastrada para firmá-lo, comprometendo-me a cumprir todas
                    as suas disposições, que passam a integrar meu contrato de trabalho.
                  </label>
                </div>
              </>
            )}

            <DialogFooter className="gap-2 sm:gap-2">
              {accepted ? (
                <>
                  <Button variant="outline" onClick={() => setOpen(false)} className="w-full sm:w-auto">Fechar</Button>
                  <Button onClick={handleDownload} className="gap-1 w-full sm:w-auto">
                    <FileDown className="h-4 w-4" /> Baixar PDF
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting} className="w-full sm:w-auto">
                    Cancelar
                  </Button>
                  <Button onClick={handleAccept} disabled={!agreed || submitting || !signatureDataUrl} className="w-full sm:w-auto">
                    {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Aceitar e assinar
                  </Button>
                </>
              )}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
