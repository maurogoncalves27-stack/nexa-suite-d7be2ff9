import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Loader2, FileText, RefreshCw, ExternalLink, AlertTriangle, CheckCircle2, Ban } from "lucide-react";

interface Invoice {
  id: string;
  status: string;
  numero: number | null;
  serie: number | null;
  chave_acesso: string | null;
  danfe_url: string | null;
  xml_url: string | null;
  rejection_reason: string | null;
  rejection_code: string | null;
  environment: string;
  emitted_at: string | null;
  created_at: string;
  contingency_attempts?: number | null;
  contingency_reason?: string | null;
  last_contingency_at?: string | null;
}

const STATUS_META: Record<string, { label: string; tone: string; icon: any }> = {
  pending: { label: "Pendente", tone: "bg-muted text-muted-foreground", icon: Loader2 },
  processing: { label: "Processando", tone: "bg-blue-500/15 text-blue-700 dark:text-blue-300", icon: Loader2 },
  authorized: { label: "Autorizada", tone: "bg-green-500/15 text-green-700 dark:text-green-300", icon: CheckCircle2 },
  rejected: { label: "Rejeitada", tone: "bg-destructive/15 text-destructive", icon: AlertTriangle },
  cancelled: { label: "Cancelada", tone: "bg-muted text-muted-foreground", icon: AlertTriangle },
  contingency: { label: "Contingência", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300", icon: AlertTriangle },
  error: { label: "Erro", tone: "bg-destructive/15 text-destructive", icon: AlertTriangle },
};

export default function NfceSection({ orderId }: { orderId: string }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  // Janela de cancelamento (30 min após autorização)
  const cancelWindow = useMemo(() => {
    if (!invoice || invoice.status !== "authorized" || !invoice.emitted_at) return null;
    const ageMin = (Date.now() - new Date(invoice.emitted_at).getTime()) / 60000;
    return { ageMin, remaining: Math.max(0, 30 - ageMin) };
  }, [invoice]);
  const canCancel = invoice?.status === "authorized" && (cancelWindow?.remaining ?? 0) > 0;

  const fetchInvoice = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("pdv_fiscal_invoices")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setInvoice(data as any);
    setLoading(false);
  }, [orderId]);

  useEffect(() => { fetchInvoice(); }, [fetchInvoice]);

  // Auto-poll quando processando
  useEffect(() => {
    if (invoice?.status !== "processing") return;
    const t = setInterval(() => refresh(), 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.status]);

  async function emit() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("nfce-emit", { body: { order_id: orderId } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Falha ao emitir");
      toast({ title: "NFC-e enviada", description: "Aguardando autorização da SEFAZ." });
      await fetchInvoice();
    } catch (e: any) {
      toast({ title: "Erro ao emitir", description: e.message, variant: "destructive" });
      await fetchInvoice();
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    if (!invoice) return;
    const { data } = await supabase.functions.invoke("nfce-status", { body: { invoice_id: invoice.id } });
    if (data?.ok) await fetchInvoice();
  }

  async function doCancel() {
    if (!invoice) return;
    const motivo = cancelReason.trim();
    if (motivo.length < 15) {
      toast({ title: "Justificativa muito curta", description: "Mínimo 15 caracteres.", variant: "destructive" });
      return;
    }
    setCancelling(true);
    try {
      const { data, error } = await supabase.functions.invoke("nfce-cancel", {
        body: { invoice_id: invoice.id, justificativa: motivo },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Falha ao cancelar");
      toast({ title: "NFC-e cancelada", description: "SEFAZ confirmou o cancelamento." });
      setCancelOpen(false);
      setCancelReason("");
      await fetchInvoice();
    } catch (e: any) {
      toast({ title: "Erro ao cancelar", description: e.message, variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  }

  async function retryContingency() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("nfce-retry-contingency", { body: {} });
      if (error) throw error;
      toast({ title: "Reenvio disparado", description: `${data?.processed ?? 0} nota(s) reprocessada(s).` });
      await fetchInvoice();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="text-xs text-muted-foreground py-2">Carregando NFC-e…</div>;
  }

  if (!invoice) {
    return (
      <div className="border-t pt-3 mt-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4 text-primary" /> NFC-e
        </div>
        <p className="text-xs text-muted-foreground">Nenhuma NFC-e emitida para este pedido.</p>
        <Button size="sm" className="w-full" disabled={busy} onClick={emit}>
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
          Emitir NFC-e
        </Button>
      </div>
    );
  }

  const meta = STATUS_META[invoice.status] ?? STATUS_META.pending;
  const Icon = meta.icon;
  const spinning = invoice.status === "processing" || invoice.status === "pending";

  return (
    <div className="border-t pt-3 mt-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" /> NFC-e
        </span>
        <Badge className={`${meta.tone} text-[10px]`}>
          <Icon className={`h-3 w-3 mr-1 ${spinning ? "animate-spin" : ""}`} />
          {meta.label}
          {invoice.environment === "homologacao" && " (homolog)"}
        </Badge>
      </div>

      {invoice.numero && (
        <div className="text-xs text-muted-foreground">
          Nº {invoice.numero} · Série {invoice.serie}
        </div>
      )}
      {invoice.chave_acesso && (
        <div className="text-[10px] font-mono break-all text-muted-foreground">
          {invoice.chave_acesso}
        </div>
      )}
      {invoice.rejection_reason && (
        <div className="text-xs text-destructive bg-destructive/10 rounded p-2">
          {invoice.rejection_code && <strong>{invoice.rejection_code}: </strong>}
          {invoice.rejection_reason}
        </div>
      )}
      {invoice.status === "contingency" && (
        <div className="text-xs bg-amber-500/10 text-amber-800 dark:text-amber-300 rounded p-2 space-y-1">
          <div className="font-medium">SEFAZ/Focus indisponível — em contingência</div>
          {invoice.contingency_reason && <div className="opacity-90">{invoice.contingency_reason}</div>}
          <div className="text-[10px] opacity-75">
            Tentativas: {invoice.contingency_attempts ?? 0} · reenvio automático com backoff (até 60 min)
          </div>
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        {invoice.danfe_url && (
          <Button asChild size="sm" variant="outline" className="flex-1">
            <a href={invoice.danfe_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3 w-3 mr-1" /> DANFE
            </a>
          </Button>
        )}
        {invoice.xml_url && (
          <Button asChild size="sm" variant="outline" className="flex-1">
            <a href={invoice.xml_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3 w-3 mr-1" /> XML
            </a>
          </Button>
        )}
        {(invoice.status === "rejected" || invoice.status === "error") && (
          <Button size="sm" disabled={busy} onClick={emit} className="flex-1">
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Reemitir
          </Button>
        )}
        {invoice.status === "processing" && (
          <Button size="sm" variant="ghost" onClick={refresh} className="flex-1">
            <RefreshCw className="h-3 w-3 mr-1" /> Atualizar
          </Button>
        )}
        {invoice.status === "contingency" && (
          <Button size="sm" disabled={busy} onClick={retryContingency} className="flex-1">
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Tentar agora
          </Button>
        )}
        {canCancel && (
          <Button
            size="sm"
            variant="destructive"
            className="flex-1"
            onClick={() => setCancelOpen(true)}
          >
            <Ban className="h-3 w-3 mr-1" /> Cancelar
          </Button>
        )}
      </div>

      {invoice.status === "authorized" && cancelWindow && (
        <p className="text-[10px] text-muted-foreground">
          {canCancel
            ? `Cancelamento disponível por mais ${Math.ceil(cancelWindow.remaining)} min`
            : "Janela de cancelamento (30 min) expirada"}
        </p>
      )}

      {invoice.status === "cancelled" && (
        <p className="text-[10px] text-muted-foreground italic">
          NFC-e cancelada na SEFAZ
        </p>
      )}

      <Dialog open={cancelOpen} onOpenChange={(o) => { setCancelOpen(o); if (!o) setCancelReason(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancelar NFC-e</DialogTitle>
            <DialogDescription>
              Informe a justificativa do cancelamento (15 a 255 caracteres). A SEFAZ exige descrição clara.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value.slice(0, 255))}
              placeholder="Ex: Pedido cancelado a pedido do cliente antes da entrega"
              rows={4}
            />
            <p className="text-[10px] text-muted-foreground text-right">
              {cancelReason.length}/255 (mín. 15)
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setCancelOpen(false)} disabled={cancelling}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={doCancel}
              disabled={cancelling || cancelReason.trim().length < 15}
            >
              {cancelling && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
