import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, Eraser, PenTool, ShieldCheck } from "lucide-react";
import SignaturePad, { type SignaturePadHandle } from "@/components/warnings/SignaturePad";
import { SIGNATURE_CONSENT_TEXT } from "@/lib/userSignature";
import { toast } from "@/hooks/use-toast";

interface SignatureSetupDialogProps {
  open: boolean;
  /** Não permite fechar sem cadastrar — `onCancel` é opcional (usado se o caller permitir abandono) */
  onCancel?: () => void;
  /** Recebe a imagem PNG dataURL desenhada (caller é responsável por persistir). */
  onConfirm: (signatureDataUrl: string) => Promise<void> | void;
  busy?: boolean;
}

/**
 * Diálogo de cadastro da assinatura única do colaborador.
 * É chamado durante o signup (e em uma migração leve, no primeiro login de quem ainda não tem).
 */
export default function SignatureSetupDialog({
  open,
  onCancel,
  onConfirm,
  busy = false,
}: SignatureSetupDialogProps) {
  const sigRef = useRef<SignaturePadHandle | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!sigRef.current || sigRef.current.isEmpty()) {
      toast({
        title: "Desenhe sua assinatura",
        description: "Use o quadro abaixo para desenhar sua assinatura.",
        variant: "destructive",
      });
      return;
    }
    if (!agreed) {
      toast({
        title: "Aceite obrigatório",
        description: "Você precisa autorizar o uso da assinatura.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const dataUrl = sigRef.current.toDataURL("image/png");
      await onConfirm(dataUrl);
    } finally {
      setSubmitting(false);
    }
  };

  const isBusy = busy || submitting;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && onCancel && !isBusy) onCancel();
      }}
    >
      <DialogContent
        className="max-w-lg"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenTool className="h-5 w-5 text-primary" />
            Cadastrar sua assinatura
          </DialogTitle>
          <DialogDescription className="leading-relaxed">
            Esta assinatura será usada em <strong>todos os documentos</strong> que você
            precisar assinar no sistema. Você só precisa desenhá-la <strong>uma vez</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-sm">Desenhe sua assinatura abaixo</Label>
            <SignaturePad ref={sigRef} height={180} penColor="#111827" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => sigRef.current?.clear()}
              disabled={isBusy}
            >
              <Eraser className="h-4 w-4 mr-1" /> Limpar
            </Button>
          </div>

          <div className="rounded-md border bg-muted/40 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              TERMO DE ADESÃO
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {SIGNATURE_CONSENT_TEXT}
            </p>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="signature-agree"
              checked={agreed}
              onCheckedChange={(c) => setAgreed(c === true)}
              className="mt-0.5"
            />
            <Label
              htmlFor="signature-agree"
              className="text-sm leading-relaxed cursor-pointer font-normal"
            >
              Li e aceito o termo acima. Confirmo que esta é minha assinatura pessoal e
              autorizo seu uso eletrônico em todos os documentos do sistema.
            </Label>
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            ⚠️ Esta assinatura é <strong>definitiva</strong> e não poderá ser alterada
            depois. Capriche no traço!
          </p>
        </div>

        <DialogFooter className="gap-2">
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} disabled={isBusy}>
              Mais tarde
            </Button>
          )}
          <Button onClick={handleConfirm} disabled={!agreed || isBusy}>
            {isBusy ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <PenTool className="h-4 w-4 mr-2" />
            )}
            Salvar assinatura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
