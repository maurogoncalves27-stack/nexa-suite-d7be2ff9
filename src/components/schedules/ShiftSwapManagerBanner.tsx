import { useEffect, useState } from "react";
import { ArrowLeftRight, Check, X, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface PendingSwap {
  id: string;
  requester_user_id: string;
  swap_type: "reciprocal" | "coverage";
  requester_date: string;
  partner_date: string | null;
  reason: string | null;
  requester_full_name: string | null;
  partner_full_name: string | null;
  partner_response_note: string | null;
  store_name: string | null;
}

/**
 * Banner para gestores/admins listando trocas de plantão aceitas pelo colega
 * e aguardando aprovação final. Aprovar dispara a função SQL apply_shift_swap.
 */
export default function ShiftSwapManagerBanner() {
  const { user, isAdmin, isManager } = useAuth();
  const [items, setItems] = useState<PendingSwap[]>([]);
  const [deciding, setDeciding] = useState<PendingSwap | null>(null);
  const [action, setAction] = useState<"approve" | "reject">("approve");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    if (!user || (!isAdmin && !isManager)) {
      setItems([]);
      return;
    }
    const { data } = await supabase
      .from("shift_swap_requests")
      .select(`
        id, requester_user_id, swap_type, requester_date, partner_date, reason, partner_response_note,
        requester:employees!shift_swap_requests_requester_employee_id_fkey(full_name),
        partner:employees!shift_swap_requests_partner_employee_id_fkey(full_name),
        store:stores!shift_swap_requests_store_id_fkey(name)
      `)
      .eq("status", "accepted")
      .order("created_at", { ascending: false });

    const mapped: PendingSwap[] = (data ?? []).map((r: any) => ({
      id: r.id,
      requester_user_id: r.requester_user_id,
      swap_type: r.swap_type,
      requester_date: r.requester_date,
      partner_date: r.partner_date,
      reason: r.reason,
      partner_response_note: r.partner_response_note,
      requester_full_name: r.requester?.full_name ?? null,
      partner_full_name: r.partner?.full_name ?? null,
      store_name: r.store?.name ?? null,
    }));
    setItems(mapped);
  };

  useEffect(() => {
    refresh();
    if (!user || (!isAdmin && !isManager)) return;
    const ch = supabase
      .channel(`shift-swap-manager-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_swap_requests" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isAdmin, isManager]);

  const open = (item: PendingSwap, kind: "approve" | "reject") => {
    setDeciding(item);
    setAction(kind);
    setNote("");
  };

  const submit = async () => {
    if (!deciding || !user) return;
    setSubmitting(true);

    if (action === "reject") {
      const { error } = await supabase
        .from("shift_swap_requests")
        .update({
          status: "rejected",
          rejection_reason: note.trim() || "Rejeitado pelo gestor",
          manager_decided_at: new Date().toISOString(),
          manager_decided_by: user.id,
        })
        .eq("id", deciding.id);
      setSubmitting(false);
      if (error) { toast.error("Falha ao rejeitar"); return; }

      void supabase.functions.invoke("notify-user", {
        body: {
          user_id: deciding.requester_user_id,
          title: "Troca de plantão rejeitada",
          message: note.trim() || "Sua solicitação foi rejeitada pelo gestor.",
          url: "/area-colaborador",
          tag: `swap-${deciding.id}`,
        },
      });
      toast.success("Solicitação rejeitada");
      setDeciding(null);
      refresh();
      return;
    }

    // Aprovar: marca como approved e chama RPC para aplicar nas escalas
    const { error: updErr } = await supabase
      .from("shift_swap_requests")
      .update({
        status: "approved",
        manager_decided_at: new Date().toISOString(),
        manager_decided_by: user.id,
      })
      .eq("id", deciding.id);

    if (updErr) {
      setSubmitting(false);
      toast.error("Falha ao aprovar");
      return;
    }

    const { error: rpcErr } = await supabase.rpc("apply_shift_swap" as never, { _swap_id: deciding.id } as never);
    setSubmitting(false);

    if (rpcErr) {
      toast.error(`Aprovado mas falha ao ajustar escala: ${rpcErr.message}`);
    } else {
      toast.success("Troca aprovada e escala atualizada");
    }

    void supabase.functions.invoke("notify-user", {
      body: {
        user_id: deciding.requester_user_id,
        title: "Troca de plantão aprovada",
        message: "Sua escala foi atualizada conforme a troca solicitada.",
        url: "/area-colaborador",
        tag: `swap-${deciding.id}`,
      },
    });

    setDeciding(null);
    refresh();
  };

  if (!user || (!isAdmin && !isManager) || items.length === 0) return null;

  return (
    <>
      <Card className="border-primary/40 bg-primary/5">
        <CardContent className="p-3 sm:p-4 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary/20 text-primary flex items-center justify-center shrink-0">
              <ArrowLeftRight className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {items.length === 1
                  ? "Troca de plantão aguardando sua aprovação"
                  : `${items.length} trocas de plantão aguardando aprovação`}
              </p>
              <p className="text-xs text-muted-foreground">Os colegas envolvidos já confirmaram entre si.</p>
            </div>
          </div>

          {items.map((it) => (
            <div key={it.id} className="rounded-md border border-primary/30 bg-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {it.requester_full_name ?? "Solicitante"} ↔ {it.partner_full_name ?? "Colega"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {it.store_name ?? "Loja"} ·{" "}
                    {it.swap_type === "reciprocal" ? "Recíproca" : "Cobertura"} ·{" "}
                    {format(parseISO(it.requester_date), "dd/MM", { locale: ptBR })}
                    {it.partner_date && (
                      <> ↔ {format(parseISO(it.partner_date), "dd/MM", { locale: ptBR })}</>
                    )}
                  </p>
                </div>
                <Badge variant="secondary" className="text-[10px]">Aceita pelo colega</Badge>
              </div>
              {it.reason && <p className="text-xs text-foreground whitespace-pre-wrap">{it.reason}</p>}
              {it.partner_response_note && (
                <p className="text-xs text-muted-foreground">
                  <strong>Nota do colega:</strong> {it.partner_response_note}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => open(it, "reject")}>
                  <X className="h-3.5 w-3.5" /> Rejeitar
                </Button>
                <Button size="sm" className="h-8 gap-1" onClick={() => open(it, "approve")}>
                  <Check className="h-3.5 w-3.5" /> Aprovar
                </Button>
              </div>
            </div>
          ))}

          <div className="text-right">
            <Link to="/escalas" className="text-xs text-primary hover:underline">
              Ver na grade de escalas →
            </Link>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!deciding} onOpenChange={(v) => !v && setDeciding(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{action === "approve" ? "Aprovar troca" : "Rejeitar troca"}</DialogTitle>
            <DialogDescription>
              {action === "approve"
                ? "A escala será atualizada automaticamente."
                : "Os colegas serão avisados da rejeição."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">
              {action === "approve" ? "Observação (opcional)" : "Motivo da rejeição"}
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={action === "approve" ? "Algo a registrar?" : "Explique brevemente."}
              className="min-h-[80px] text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeciding(null)} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={submitting} variant={action === "approve" ? "default" : "destructive"}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {action === "approve" ? "Confirmar aprovação" : "Confirmar rejeição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
