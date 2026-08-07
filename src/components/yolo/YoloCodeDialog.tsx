// Entrada do código Yolo (6 dígitos) que libera a categoria exclusiva no Totem e no site.
// O código é consumido na Yolo já na validação inicial.
import { useState } from "react";
import { Loader2, Ticket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  storeId: string;
  channel: "totem" | "garcom" | "online" | "pdv";
  onUnlocked: (code: string) => void;
}

export default function YoloCodeDialog({ open, onOpenChange, storeId, channel, onUnlocked }: Props) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const clean = code.replace(/\D/g, "");
    if (clean.length !== 6) { setError("Digite os 6 dígitos do código."); return; }
    setLoading(true);
    setError(null);
    try {
      const { data: check } = await supabase.functions.invoke("yolo-validate", {
        body: { code: clean, store_id: storeId, channel },
      });
      if (!check?.valid) {
        setError(check?.message ?? "Código inválido ou já utilizado.");
        return;
      }
      const { data: redeem } = await supabase.functions.invoke("yolo-redeem", {
        body: {
          code: clean,
          store_id: storeId,
          channel,
          order_id: `unlock:${clean}:${Date.now()}`,
          order_total_cents: 0,
          discount_applied_cents: 0,
        },
      });
      if (!redeem?.redeemed) {
        setError(redeem?.message ?? "Não foi possível validar o código agora.");
        return;
      }
      onUnlocked(clean);
      setCode("");
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao validar o código.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-primary" /> Código Yolo
          </DialogTitle>
          <DialogDescription>
            Digite o código de 6 dígitos do app Yolo Club para liberar o cardápio exclusivo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="000000"
            className="text-center text-2xl tracking-[0.4em] h-14"
            autoFocus
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={loading || code.length !== 6}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Validar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
