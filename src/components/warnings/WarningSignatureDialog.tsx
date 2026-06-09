import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldAlert, CheckCircle2, XCircle, PenTool, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { getCurrentUserSignatureDataUrl } from "@/lib/userSignature";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";

interface PendingWarning {
  id: string;
  title: string;
  content: string;
  issued_at: string;
}

const dataUrlToBlob = (dataUrl: string): Blob => {
  const [meta, b64] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(meta)?.[1] ?? "image/png";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

export default function WarningSignatureDialog() {
  const { user } = useAuth();
  const [pending, setPending] = useState<PendingWarning[]>([]);
  const [current, setCurrent] = useState<PendingWarning | null>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "refuse">("view");
  const [refusalReason, setRefusalReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [loadingSig, setLoadingSig] = useState(false);
  const [showRefuseWarning, setShowRefuseWarning] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data: emp, error: empErr } = await supabase
      .from("employees").select("id").eq("user_id", user.id).maybeSingle();
    if (empErr) console.error("[Warnings] employee lookup error", empErr);
    if (!emp) {
      console.log("[Warnings] no employee linked to user", user.id);
      setPending([]); setCurrent(null); setEmployeeId(null);
      return;
    }
    setEmployeeId(emp.id);
    const { data, error } = await supabase
      .from("employee_warnings")
      .select("id, title, content, issued_at")
      .eq("employee_id", emp.id)
      .eq("status", "pending")
      .order("issued_at", { ascending: true });
    if (error) console.error("[Warnings] fetch error", error);
    const list = (data ?? []) as PendingWarning[];
    console.log("[Warnings] pending count for", emp.id, "=", list.length);
    setPending(list);
    setCurrent(list[0] ?? null);
    setMode("view");
    setRefusalReason("");
    setAgreed(false);
  };

  useEffect(() => {
    if (!user) return;
    load();
    const channel = supabase
      .channel("employee-warnings-self")
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_warnings" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Carrega a assinatura única quando o dialog abre
  useEffect(() => {
    if (!current || signatureDataUrl || loadingSig) return;
    setLoadingSig(true);
    getCurrentUserSignatureDataUrl()
      .then((url) => setSignatureDataUrl(url))
      .finally(() => setLoadingSig(false));
  }, [current, signatureDataUrl, loadingSig]);

  const fetchClientIp = async (): Promise<string | null> => {
    try {
      const r = await fetch("https://api.ipify.org?format=json");
      if (!r.ok) return null;
      const j = await r.json();
      return j?.ip ?? null;
    } catch { return null; }
  };

  const sha256Hex = async (text: string): Promise<string> => {
    const buf = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const sign = async () => {
    if (!current || !user) return;
    if (!agreed) return toast({ title: "Confirme a autorização", description: "Marque a caixa para autorizar o uso da sua assinatura.", variant: "destructive" });
    if (!signatureDataUrl) return toast({ title: "Assinatura não cadastrada", description: "Cadastre sua assinatura única primeiro.", variant: "destructive" });

    setSubmitting(true);
    try {
      const blob = dataUrlToBlob(signatureDataUrl);
      const path = `${user.id}/${current.id}-${Date.now()}.png`;
      const { error: upErr } = await supabase.storage
        .from("warning-signatures").upload(path, blob, { contentType: "image/png", upsert: true });
      if (upErr) throw upErr;

      const [ip, contentHash] = await Promise.all([
        fetchClientIp(),
        sha256Hex(`${current.title}\n\n${current.content}\n\n${current.issued_at}`),
      ]);

      const { error } = await supabase.from("employee_warnings").update({
        status: "signed",
        signed_at: new Date().toISOString(),
        signature_path: path,
        signature_ip: ip,
        signature_user_agent: navigator.userAgent,
        content_hash: contentHash,
        signed_by_user_id: user.id,
      }).eq("id", current.id);
      if (error) throw error;
      toast({ title: "Advertência assinada" });
      load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const refuse = async () => {
    if (!current || !user) return;
    if (!refusalReason.trim() || refusalReason.trim().length < 30)
      return toast({ title: "Descreva o motivo (mínimo 30 caracteres)", description: "Detalhe melhor o motivo da recusa para registro formal.", variant: "destructive" });
    setSubmitting(true);
    const [ip, contentHash] = await Promise.all([
      fetchClientIp(),
      sha256Hex(`${current.title}\n\n${current.content}\n\n${current.issued_at}`),
    ]);
    const { error } = await supabase.from("employee_warnings").update({
      status: "refused",
      refused_at: new Date().toISOString(),
      refusal_reason: refusalReason.trim(),
      signature_ip: ip,
      signature_user_agent: navigator.userAgent,
      content_hash: contentHash,
      refused_by_user_id: user.id,
    }).eq("id", current.id);
    setSubmitting(false);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Recusa registrada" });
    load();
  };

  if (!current) return null;

  return (
    <>
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="max-w-2xl" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="h-5 w-5" />
            Advertência pendente {pending.length > 1 && `(${pending.length} no total)`}
          </DialogTitle>
          <DialogDescription>
            Leia o conteúdo abaixo e autorize o uso da sua assinatura cadastrada para confirmar ciência, ou registre recusa com motivo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2 max-h-[35vh] overflow-y-auto">
            <p className="font-semibold">{current.title}</p>
            <p className="text-xs text-muted-foreground">
              Emitida em {format(new Date(current.issued_at), "dd/MM/yyyy HH:mm")}
            </p>
            <p className="text-sm whitespace-pre-wrap">{current.content}</p>
          </div>

          {mode === "view" ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <PenTool className="h-4 w-4 text-primary" />
                  Sua assinatura cadastrada
                </Label>
                {loadingSig ? (
                  <div className="flex items-center justify-center h-[100px] border rounded-md bg-muted/20">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : signatureDataUrl ? (
                  <div className="border rounded-md bg-white p-2 flex items-center justify-center">
                    <img src={signatureDataUrl} alt="Sua assinatura" className="max-h-[100px] object-contain" />
                  </div>
                ) : (
                  <div className="border border-destructive/40 rounded-md p-3 bg-destructive/5 text-sm text-destructive">
                    Você ainda não cadastrou sua assinatura. Recarregue a página para cadastrá-la.
                  </div>
                )}
              </div>

              <div className="flex items-start gap-2">
                <Checkbox id="agree-warning" checked={agreed} onCheckedChange={(v) => setAgreed(!!v)} />
                <label htmlFor="agree-warning" className="text-sm cursor-pointer leading-snug">
                  Confirmo ciência do teor desta advertência e autorizo o uso da minha assinatura
                  eletrônica cadastrada para registrá-la, nos termos da Lei 14.063/2020.
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Motivo da recusa <span className="text-destructive">*</span></Label>
              <Textarea
                rows={4} maxLength={1000} value={refusalReason}
                onChange={(e) => setRefusalReason(e.target.value)}
                placeholder="Descreva detalhadamente o motivo pelo qual recusa assinar (mínimo 30 caracteres)."
              />
              <p className={`text-xs ${refusalReason.trim().length < 30 ? "text-destructive" : "text-muted-foreground"}`}>
                {refusalReason.trim().length}/30 caracteres mínimos
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {mode === "view" ? (
            <>
              <Button variant="destructive" onClick={() => setShowRefuseWarning(true)} disabled={submitting}>
                <XCircle className="h-4 w-4 mr-2" />Recusar assinar
              </Button>
              <Button onClick={sign} disabled={submitting || !agreed || !signatureDataUrl}>
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Assinar e confirmar
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => { setMode("view"); setRefusalReason(""); }} disabled={submitting}>
                Voltar
              </Button>
              <Button variant="destructive" onClick={refuse} disabled={submitting || refusalReason.trim().length < 30}>
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
                Confirmar recusa
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={showRefuseWarning} onOpenChange={setShowRefuseWarning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Atenção antes de recusar
          </AlertDialogTitle>
          <AlertDialogDescription className="text-foreground/90 leading-relaxed pt-2">
            Estou ciente que me recusar a assinar a advertência não impede que ela tenha o mesmo efeito legal.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground font-normal"
            onClick={() => {
              setShowRefuseWarning(false);
              setMode("refuse");
            }}
          >
            Estou ciente
          </Button>
          <Button
            onClick={() => setShowRefuseWarning(false)}
            className="font-semibold"
          >
            <PenTool className="h-4 w-4 mr-2" />
            Quero assinar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
