import { useEffect, useState } from "react";
import { ArrowLeftRight, Check, X, Loader2 } from "lucide-react";
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
  requester_position: string | null;
}

/**
 * Banner exibido ao colega convidado com solicitações de troca de plantão
 * pendentes da resposta dele. Permite aceitar (envia ao gestor) ou recusar.
 */
export default function ShiftSwapPendingBanner() {
  const { user } = useAuth();
  const [items, setItems] = useState<PendingSwap[]>([]);
  const [responding, setResponding] = useState<PendingSwap | null>(null);
  const [action, setAction] = useState<"accept" | "reject">("accept");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    if (!user) {
      setItems([]);
      return;
    }
    const { data } = await supabase
      .from("shift_swap_requests")
      .select("id, requester_user_id, swap_type, requester_date, partner_date, reason, requester:employees!shift_swap_requests_requester_employee_id_fkey(full_name, position)")
      .eq("partner_user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    const mapped: PendingSwap[] = (data ?? []).map((r: any) => ({
      id: r.id,
      requester_user_id: r.requester_user_id,
      swap_type: r.swap_type,
      requester_date: r.requester_date,
      partner_date: r.partner_date,
      reason: r.reason,
      requester_full_name: r.requester?.full_name ?? null,
      requester_position: r.requester?.position ?? null,
    }));
    setItems(mapped);
  };

  useEffect(() => {
    refresh();
    if (!user) return;
    const ch = supabase
      .channel(`shift-swap-pending-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_swap_requests" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const open = (item: PendingSwap, kind: "accept" | "reject") => {
    setResponding(item);
    setAction(kind);
    setNote("");
  };

  const submit = async () => {
    if (!responding) return;
    setSubmitting(true);
    const update: any = {
      partner_responded_at: new Date().toISOString(),
      partner_response_note: note.trim() || null,
    };
    if (action === "accept") {
      update.status = "accepted";
    } else {
      update.status = "rejected";
      update.rejection_reason = note.trim() || "Recusado pelo colega";
    }

    const { error } = await supabase
      .from("shift_swap_requests")
      .update(update)
      .eq("id", responding.id);

    setSubmitting(false);
    if (error) {
      toast.error("Falha ao registrar resposta");
      return;
    }

    // Notifica solicitante
    void supabase.functions.invoke("notify-user", {
      body: {
        user_id: responding.requester_user_id,
        title: action === "accept" ? "Colega aceitou a troca" : "Colega recusou a troca",
        message: action === "accept"
          ? "Aguardando aprovação do gestor."
          : (note.trim() || "Sem motivo informado."),
        url: "/area-colaborador",
        tag: `swap-${responding.id}`,
      },
    });

    toast.success(action === "accept" ? "Aceito! Aguardando gestor." : "Recusa registrada.");
    setResponding(null);
    refresh();
  };

  if (items.length === 0) return null;

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
                  ? "Pedido de troca de plantão aguardando sua resposta"
                  : `${items.length} pedidos de troca de plantão aguardando sua resposta`}
              </p>
              <p className="text-xs text-muted-foreground">Aceite para enviar ao gestor.</p>
            </div>
          </div>

          {items.map((it) => (
            <div key={it.id} className="rounded-md border border-primary/30 bg-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {it.requester_full_name ?? "Colega"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {it.swap_type === "reciprocal" ? "Troca recíproca" : "Cobertura"}
                    {" · "}
                    Você {it.swap_type === "reciprocal" ? "trabalha" : "cobre"} dia{" "}
                    {format(parseISO(it.requester_date), "dd/MM", { locale: ptBR })}
                    {it.partner_date && (
                      <> e ele(a) trabalha o seu dia {format(parseISO(it.partner_date), "dd/MM", { locale: ptBR })}</>
                    )}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px]">Pendente</Badge>
              </div>
              {it.reason && <p className="text-xs text-foreground whitespace-pre-wrap">{it.reason}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => open(it, "reject")}>
                  <X className="h-3.5 w-3.5" /> Recusar
                </Button>
                <Button size="sm" className="h-8 gap-1" onClick={() => open(it, "accept")}>
                  <Check className="h-3.5 w-3.5" /> Aceitar
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!responding} onOpenChange={(v) => !v && setResponding(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{action === "accept" ? "Aceitar troca" : "Recusar troca"}</DialogTitle>
            <DialogDescription>
              {action === "accept"
                ? "Após aceitar, o gestor receberá a solicitação para aprovação final."
                : "O colega será avisado da recusa."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">
              {action === "accept" ? "Observação (opcional)" : "Motivo da recusa"}
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={action === "accept" ? "Algo a comentar?" : "Explique brevemente."}
              className="min-h-[80px] text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResponding(null)} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={submitting} variant={action === "accept" ? "default" : "destructive"}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {action === "accept" ? "Confirmar aceite" : "Confirmar recusa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
