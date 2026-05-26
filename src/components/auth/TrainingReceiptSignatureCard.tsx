import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileSignature, Loader2, AlertCircle, CheckCircle2, PenTool } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { fetchClientIp } from "@/lib/internalRegulation";
import { getCurrentUserSignatureDataUrl } from "@/lib/userSignature";
import { generateTrainingReceiptPdf } from "@/lib/trainingReceiptPdf";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  employeeId: string;
}

interface PendingReceipt {
  id: string;
  training_start: string;
  training_end: string;
  worked_days: number;
  monthly_salary: number;
  daily_rate: number;
  total_amount: number;
  due_date: string;
}

const fmtBRL = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function TrainingReceiptSignatureCard({ employeeId }: Props) {
  const { user } = useAuth();
  const [pending, setPending] = useState<PendingReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<PendingReceipt | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [loadingSig, setLoadingSig] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("training_receipts")
      .select("id, training_start, training_end, worked_days, monthly_salary, daily_rate, total_amount, due_date")
      .eq("employee_id", employeeId)
      .not("signature_required_at", "is", null)
      .is("signed_at", null)
      .order("training_end", { ascending: false });
    setPending((data ?? []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, [employeeId]);

  useEffect(() => {
    if (!open || signatureDataUrl || loadingSig) return;
    setLoadingSig(true);
    getCurrentUserSignatureDataUrl()
      .then(setSignatureDataUrl)
      .finally(() => setLoadingSig(false));
  }, [open, signatureDataUrl, loadingSig]);

  const handleSign = async () => {
    if (!user || !open || !signatureDataUrl) return;
    setSigning(true);
    try {
      const ip = await fetchClientIp().catch(() => null);
      const signedAtIso = new Date().toISOString();
      const { error } = await (supabase as any)
        .from("training_receipts")
        .update({
          signed_at: signedAtIso,
          signed_ip: ip,
          signed_user_agent: navigator.userAgent,
        })
        .eq("id", open.id);
      if (error) throw error;

      // Arquiva PDF assinado na Pasta do Colaborador
      try {
        const { data: emp } = await supabase
          .from("employees")
          .select("full_name, cpf, position")
          .eq("id", employeeId)
          .maybeSingle();
        const doc = generateTrainingReceiptPdf({
          employee_name: emp?.full_name ?? "",
          employee_cpf: emp?.cpf ?? null,
          position: emp?.position ?? null,
          training_start: open.training_start,
          training_end: open.training_end,
          worked_days: open.worked_days,
          monthly_salary: Number(open.monthly_salary),
          daily_rate: Number(open.daily_rate),
          total_amount: Number(open.total_amount),
          signature_data_url: signatureDataUrl,
          signed_at: signedAtIso,
        });
        const blob = doc.output("blob");
        const { uploadEmployeePdfBlob } = await import("@/lib/employeeDocUpload");
        const safe = (emp?.full_name || "colaborador").replace(/[^\w\-]+/g, "_");
        await uploadEmployeePdfBlob({
          employeeId,
          docType: "recibo_treinamento",
          fileName: `recibo_treinamento_${safe}_${open.training_start}.pdf`,
          blob,
          uploadedBy: user.id,
        });
      } catch (err) {
        console.error("[TrainingReceipt] falha ao arquivar PDF na pasta", err);
      }

      toast({ title: "Recibo assinado", description: "Você já pode baixá-lo em Meus documentos." });
      setOpen(null);
      setAgreed(false);
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao assinar", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setSigning(false);
    }
  };

  if (loading || pending.length === 0) return null;

  return (
    <>
      {pending.map((r) => (
        <Card key={r.id} className="border-warning/40">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="flex items-start gap-3 min-w-0">
              <div className="rounded-md p-2 bg-warning/10 text-warning shrink-0">
                <FileSignature className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                  Recibo de treinamento
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="h-3 w-3" /> Assinatura pendente
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {format(parseISO(r.training_start), "dd/MM/yyyy")} a {format(parseISO(r.training_end), "dd/MM/yyyy")} · {r.worked_days} dia(s) · {fmtBRL(Number(r.total_amount))}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button onClick={() => { setOpen(r); setAgreed(false); }}>
              Ler e assinar
            </Button>
          </CardContent>
        </Card>
      ))}

      <Dialog open={!!open} onOpenChange={(v) => { if (!v) { setOpen(null); setAgreed(false); } }}>
        <DialogContent className="sm:max-w-3xl max-h-[95vh] h-[95vh] sm:h-auto flex flex-col p-0 gap-0">
          <DialogHeader className="p-4 sm:p-6 pb-3 border-b shrink-0">
            <DialogTitle className="text-base sm:text-lg">Recibo de pagamento — período de treinamento</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 px-4 sm:px-6">
            {open && (
              <div className="prose prose-sm dark:prose-invert max-w-none py-4 space-y-3 text-sm">
                <p>
                  Declaro ter recebido a importância de <strong>{fmtBRL(Number(open.total_amount))}</strong>,
                  referente a <strong>{open.worked_days} dia(s)</strong> trabalhados no período de
                  treinamento entre <strong>{format(parseISO(open.training_start), "dd/MM/yyyy", { locale: ptBR })}</strong> e
                  {" "}<strong>{format(parseISO(open.training_end), "dd/MM/yyyy", { locale: ptBR })}</strong>.
                </p>
                <p>
                  Cálculo: salário mensal de {fmtBRL(Number(open.monthly_salary))}, diária de
                  {" "}{fmtBRL(Number(open.daily_rate))} (salário ÷ 30) × {open.worked_days} dia(s).
                </p>
                <p>
                  Vencimento: {format(parseISO(open.due_date), "dd/MM/yyyy", { locale: ptBR })}.
                </p>
                <p className="text-xs text-muted-foreground">
                  Ao assinar, dou plena, geral, rasa e irrevogável quitação da importância recebida.
                </p>
              </div>
            )}
          </ScrollArea>
          <div className="border-t bg-background shrink-0 p-4 sm:p-6 space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <PenTool className="h-4 w-4 text-primary" /> Sua assinatura cadastrada
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
              <Checkbox id="agree-rec" checked={agreed} onCheckedChange={(v) => setAgreed(!!v)} className="mt-0.5" />
              <label htmlFor="agree-rec" className="text-sm cursor-pointer leading-snug">
                Li, compreendi e dou quitação. Autorizo o uso da minha assinatura eletrônica cadastrada.
              </label>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => setOpen(null)} className="w-full sm:w-auto">Cancelar</Button>
              <Button onClick={handleSign} disabled={!agreed || signing || !signatureDataUrl} className="w-full sm:w-auto">
                {signing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Assinar recibo
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
