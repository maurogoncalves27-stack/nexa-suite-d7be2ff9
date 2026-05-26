import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { hasUserSignature, registerUserSignature } from "@/lib/userSignature";
import SignatureSetupDialog from "./SignatureSetupDialog";
import { toast } from "@/hooks/use-toast";

/**
 * Garante que todo usuário logado tenha cadastrado a assinatura única.
 * Para usuários antigos (criados antes da feature) que ainda não têm assinatura,
 * o diálogo aparece automaticamente no primeiro acesso.
 *
 * Não pode ser fechado: cadastrar é obrigatório para usar o sistema.
 */
export default function EnsureUserSignature() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (loading || !user || checked) return;
    let cancelled = false;
    (async () => {
      try {
        const exists = await hasUserSignature();
        if (cancelled) return;
        if (!exists) setOpen(true);
      } catch {
        // silencioso — não bloquear se houve erro de rede
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading, checked]);

  const handleConfirm = async (signatureDataUrl: string) => {
    if (!user) return;
    setBusy(true);
    try {
      await registerUserSignature({ userId: user.id, signatureDataUrl });
      toast({
        title: "Assinatura cadastrada",
        description: "Pronto! Sua assinatura será usada em todos os documentos.",
      });
      setOpen(false);
    } catch (err: any) {
      toast({
        title: "Erro ao salvar assinatura",
        description: err?.message ?? "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;

  return (
    <SignatureSetupDialog open={open} onConfirm={handleConfirm} busy={busy} />
  );
}
