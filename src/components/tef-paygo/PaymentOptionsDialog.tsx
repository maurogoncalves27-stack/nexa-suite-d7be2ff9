/**
 * Modal de opções de pagamento — abre ao clicar em "Efetuar Pagamento".
 * Coleta adquirente, tipo de pagamento e parcelamento ANTES de enviar
 * a transação ao agente PayGo. Substitui a navegação por menu no pinpad.
 */
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CreditCard, QrCode, Landmark, Loader2 } from "lucide-react";

export type AcquirerId = "C6_PAY" | "REDE" | "PIX_C6" | "PIX_CIELO";
export type PaymentKind = "CREDITO" | "DEBITO" | "PIX";
export type InstallmentMode = "AVISTA" | "PARC_LOJA" | "PARC_ADM";

export interface PaymentOptionsResult {
  acquirerId: AcquirerId;
  acquirerLabel: string;
  /** rótulo enviado ao agente como `paygoMenuChoice` para selecionar a rede */
  paygoMenuChoice: string;
  method: PaymentKind;
  installments: number;
  installmentMode: InstallmentMode;
}

const ACQUIRERS: Array<{
  id: AcquirerId;
  label: string;
  paygoMenuChoice: string;
  kind: "card" | "pix";
  icon: typeof CreditCard;
  description: string;
}> = [
  { id: "C6_PAY", label: "C6 PAY", paygoMenuChoice: "C6 PAY", kind: "card", icon: CreditCard, description: "Crédito e débito via C6 Pay" },
  { id: "REDE", label: "REDE", paygoMenuChoice: "REDE", kind: "card", icon: Landmark, description: "Crédito e débito via Rede" },
  { id: "PIX_C6", label: "PIX C6 BANK", paygoMenuChoice: "C6 PAY", kind: "pix", icon: QrCode, description: "PIX liquidado no C6 Bank" },
  { id: "PIX_CIELO", label: "PIX CIELO", paygoMenuChoice: "CIELO", kind: "pix", icon: QrCode, description: "PIX liquidado pela Cielo" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  busy?: boolean;
  onConfirm: (options: PaymentOptionsResult) => void;
}

export function PaymentOptionsDialog({ open, onOpenChange, amount, busy, onConfirm }: Props) {
  const [acquirerId, setAcquirerId] = useState<AcquirerId>("C6_PAY");
  const [method, setMethod] = useState<PaymentKind>("CREDITO");
  const [installments, setInstallments] = useState<number>(1);
  const [installmentMode, setInstallmentMode] = useState<InstallmentMode>("AVISTA");

  const acquirer = useMemo(() => ACQUIRERS.find((a) => a.id === acquirerId)!, [acquirerId]);

  const handleAcquirerChange = (id: AcquirerId) => {
    setAcquirerId(id);
    const a = ACQUIRERS.find((x) => x.id === id)!;
    if (a.kind === "pix") {
      setMethod("PIX");
      setInstallments(1);
      setInstallmentMode("AVISTA");
    } else if (method === "PIX") {
      setMethod("CREDITO");
    }
  };

  const handleMethodChange = (m: PaymentKind) => {
    setMethod(m);
    if (m !== "CREDITO") {
      setInstallments(1);
      setInstallmentMode("AVISTA");
    }
  };

  const handleInstallmentsChange = (n: number) => {
    setInstallments(n);
    if (n <= 1) setInstallmentMode("AVISTA");
    else if (installmentMode === "AVISTA") setInstallmentMode("PARC_LOJA");
  };

  const handleConfirm = () => {
    onConfirm({
      acquirerId,
      acquirerLabel: acquirer.label,
      paygoMenuChoice: acquirer.paygoMenuChoice,
      method,
      installments,
      installmentMode,
    });
  };

  const amountLabel = amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <Dialog open={open} onOpenChange={busy ? () => {} : onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Novo pagamento
          </DialogTitle>
          <DialogDescription>
            Escolha adquirente e forma de pagamento antes de enviar ao PayGo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3">
            <span className="text-sm text-muted-foreground">Valor da venda</span>
            <span className="text-xl font-semibold">{amountLabel}</span>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground">Adquirente</Label>
            <div className="grid grid-cols-2 gap-2">
              {ACQUIRERS.map((a) => {
                const Icon = a.icon;
                const selected = acquirerId === a.id;
                return (
                  <button
                    type="button"
                    key={a.id}
                    onClick={() => handleAcquirerChange(a.id)}
                    className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                      selected
                        ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                        : "border-border hover:border-primary/40 hover:bg-muted/40"
                    }`}
                    disabled={busy}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold">{a.label}</span>
                      {a.kind === "pix" && (
                        <Badge variant="outline" className="h-5 px-1.5 text-[10px]">PIX</Badge>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground">{a.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {acquirer.kind === "card" && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">Tipo de pagamento</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["CREDITO", "DEBITO"] as PaymentKind[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleMethodChange(m)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      method === m
                        ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                        : "border-border hover:border-primary/40"
                    }`}
                    disabled={busy}
                  >
                    {m === "CREDITO" ? "Crédito" : "Débito"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {acquirer.kind === "card" && method === "CREDITO" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">Parcelas</Label>
                <Select
                  value={String(installments)}
                  onValueChange={(v) => handleInstallmentsChange(Number(v))}
                  disabled={busy}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n === 1 ? "1x à vista" : `${n}x`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {installments > 1 && (
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">Modalidade</Label>
                  <Select
                    value={installmentMode}
                    onValueChange={(v) => setInstallmentMode(v as InstallmentMode)}
                    disabled={busy}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PARC_LOJA">Parcelado pela loja</SelectItem>
                      <SelectItem value="PARC_ADM">Parcelado pela administradora</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            Enviar ao PayGo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
