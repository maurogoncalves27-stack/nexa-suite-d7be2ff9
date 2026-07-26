import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Loader2, Wrench } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface PendingConfirm {
  id: string;
  store_id: string;
  equipment_type: string;
  resolved_note: string | null;
  approved_at: string | null;
  maintenance_record_id: string | null;
  store_name?: string | null;
}

/**
 * Banner na Área do Colaborador listando manutenções que o gestor marcou como
 * resolvidas e ainda aguardam confirmação da loja (do próprio user_id).
 * Confirma = fecha; Reabre = volta para o gestor com motivo.
 */
export default function MaintenanceConfirmAlert() {
  const { user } = useAuth();
  const [items, setItems] = useState<PendingConfirm[]>([]);
  const [loading, setLoading] = useState(true);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [openReopen, setOpenReopen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("nutri_maintenance_requests")
      .select("id, store_id, equipment_type, resolved_note, approved_at, maintenance_record_id")
      .eq("status", "awaiting_confirmation")
      .eq("user_id", user.id)
      .order("approved_at", { ascending: false });

    if (error) {
      console.error("Erro ao carregar confirmações de manutenção", error);
      setItems([]);
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as any[];
    const storeIds = Array.from(new Set(rows.map((r) => r.store_id).filter(Boolean)));
    const { data: stores } = storeIds.length
      ? await supabase.from("stores").select("id, name").in("id", storeIds)
      : { data: [] as any[] };
    const map = new Map((stores ?? []).map((s: any) => [s.id, s.name]));
    setItems(rows.map((r) => ({ ...r, store_name: map.get(r.store_id) ?? null })));
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    if (!user) return;
    const channel = supabase
      .channel("employee-maintenance-confirm")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "nutri_maintenance_requests", filter: `user_id=eq.${user.id}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const confirmOne = async (r: PendingConfirm) => {
    if (!user) return;
    setBusy(r.id);
    const { error } = await supabase
      .from("nutri_maintenance_requests")
      .update({
        status: "completed",
        confirmed_at: new Date().toISOString(),
        confirmed_by: user.id,
      })
      .eq("id", r.id);
    setBusy(null);
    if (error) {
      toast.error("Erro ao confirmar");
    } else {
      toast.success("Manutenção confirmada");
    }
    refresh();
  };

  const reopenOne = async (r: PendingConfirm) => {
    if (!user) return;
    const reason = (reasons[r.id] || "").trim();
    if (!reason) {
      toast.error("Descreva o que ainda está com problema");
      return;
    }
    setBusy(r.id);

    // Apaga o histórico gravado pelo gestor (a manutenção não foi de fato resolvida)
    if (r.maintenance_record_id) {
      await supabase.from("nutri_maintenance_records").delete().eq("id", r.maintenance_record_id);
    }

    const { error } = await supabase
      .from("nutri_maintenance_requests")
      .update({
        status: "pending",
        reopen_reason: reason,
        reopened_at: new Date().toISOString(),
        reopen_count: 0, // será incrementado abaixo via RPC simples
        approved_by: null,
        approved_at: null,
        maintenance_record_id: null,
        resolved_note: null,
      })
      .eq("id", r.id);

    if (!error) {
      // incremento pós-update para não depender de RPC específica
      await supabase.rpc("increment" as never, {} as never).catch(() => null);
      await supabase
        .from("nutri_maintenance_requests")
        .update({ reopen_count: (Number((r as any).reopen_count) || 0) + 1 })
        .eq("id", r.id);
    }

    setBusy(null);
    if (error) {
      toast.error("Erro ao reabrir chamado");
    } else {
      toast.success("Chamado reaberto — gestor notificado");
      supabase.functions.invoke("notify-maintenance-reopened", { body: { request_id: r.id } }).catch(() => null);
      setReasons((prev) => {
        const { [r.id]: _o, ...rest } = prev;
        return rest;
      });
      setOpenReopen((prev) => ({ ...prev, [r.id]: false }));
    }
    refresh();
  };

  if (!user) return null;
  if (loading || items.length === 0) return null;

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <Wrench className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {items.length} manutenç{items.length > 1 ? "ões" : "ão"} aguardando sua confirmação
          </p>
          <p className="text-xs text-muted-foreground">
            O gestor marcou como resolvido. Confirme se realmente ficou ok.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {items.map((r) => (
          <div key={r.id} className="rounded-md border bg-card p-3 space-y-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{r.equipment_type}</p>
              <p className="text-xs text-muted-foreground truncate">
                {r.store_name ?? "Loja"}
                {r.approved_at && (
                  <> · Resolvido em {format(new Date(r.approved_at), "dd/MM 'às' HH:mm", { locale: ptBR })}</>
                )}
              </p>
            </div>

            {r.resolved_note && (
              <div className="rounded-md bg-muted/40 border border-border p-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  O que o gestor fez
                </p>
                <p className="text-xs text-foreground whitespace-pre-wrap">{r.resolved_note}</p>
              </div>
            )}

            {openReopen[r.id] ? (
              <div className="space-y-2">
                <Textarea
                  value={reasons[r.id] ?? ""}
                  onChange={(e) => setReasons((p) => ({ ...p, [r.id]: e.target.value }))}
                  placeholder="O que ainda está com problema?"
                  className="text-sm min-h-[60px]"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setOpenReopen((p) => ({ ...p, [r.id]: false }))}
                    disabled={busy === r.id}
                    className="h-8"
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => reopenOne(r)}
                    disabled={busy === r.id}
                    className="h-8 gap-1"
                  >
                    {busy === r.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    )}
                    Reabrir chamado
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setOpenReopen((p) => ({ ...p, [r.id]: true }))}
                  disabled={busy === r.id}
                  className="h-8 gap-1"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Ainda com problema
                </Button>
                <Button
                  size="sm"
                  onClick={() => confirmOne(r)}
                  disabled={busy === r.id}
                  className="h-8 gap-1"
                >
                  {busy === r.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Confirmar conclusão
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
