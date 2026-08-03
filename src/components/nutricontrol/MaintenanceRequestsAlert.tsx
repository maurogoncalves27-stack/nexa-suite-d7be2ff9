import { useEffect, useState, useMemo } from "react";
import { AlertTriangle, Wrench, Loader2, CheckCircle2, Store, Eye } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useInventoryPermission } from "@/hooks/useInventoryPermission";

interface PendingRequest {
  id: string;
  store_id: string;
  equipment_type: string;
  description: string | null;
  urgency: "baixa" | "media" | "alta";
  requested_at: string;
  photo_path: string | null;
  seen_at: string | null;
  store_name?: string | null;
  requester_name?: string | null;
}

const PHOTO_BUCKET = "nutri-maintenance-photos";

const URGENCY: Record<string, { label: string; className: string }> = {
  alta: { label: "Urgente", className: "bg-destructive/15 text-destructive border-destructive/30" },
  media: { label: "Média", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" },
  baixa: { label: "Baixa", className: "bg-muted text-muted-foreground border-border" },
};

/**
 * Banner para gestores/admins na Área do Gestor. Lista chamados de manutenção
 * PENDENTES; cada card tem campo de observação opcional + botão "Resolver"
 * que fecha o chamado em 1 clique e registra o histórico em
 * nutri_maintenance_records.
 */
export default function MaintenanceRequestsAlert() {
  const { user, isAdmin, isManager } = useAuth();
  const { canReceive: isInventory } = useInventoryPermission();
  // Estoquista: vê os chamados como o gestor, mas só pode marcar como visto.
  const canResolve = isAdmin || isManager;
  const canView = canResolve || isInventory;
  const [items, setItems] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [resolving, setResolving] = useState<string | null>(null);

  const refresh = async () => {
    const { data, error } = await supabase
      .from("nutri_maintenance_requests")
      .select("id, store_id, equipment_type, description, urgency, requested_at, photo_path, user_id, seen_at")
      .eq("status", "pending")
      .order("requested_at", { ascending: true });

    if (error) {
      console.error("Erro ao carregar manutenções pendentes", error);
      setItems([]);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as any[];
    const storeIds = Array.from(new Set(rows.map((r) => r.store_id).filter(Boolean)));
    const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));

    const [storesRes, empsRes] = await Promise.all([
      storeIds.length
        ? supabase.from("stores").select("id, name").in("id", storeIds)
        : Promise.resolve({ data: [] as any[] }),
      userIds.length
        ? supabase.from("employees").select("user_id, full_name").in("user_id", userIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const storeMap = new Map((storesRes.data ?? []).map((s: any) => [s.id, s.name]));
    const empMap = new Map((empsRes.data ?? []).map((e: any) => [e.user_id, e.full_name]));

    setItems(
      rows.map((r) => ({
        id: r.id,
        store_id: r.store_id,
        equipment_type: r.equipment_type,
        description: r.description,
        urgency: r.urgency,
        requested_at: r.requested_at,
        photo_path: r.photo_path,
        seen_at: r.seen_at,
        store_name: storeMap.get(r.store_id) ?? null,
        requester_name: empMap.get(r.user_id) ?? null,
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    if (!user || !canView) {
      setLoading(false);
      return;
    }
    refresh();

    const channel = supabase
      .channel("maintenance-manager-alert")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "nutri_maintenance_requests" },
        () => refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, canView]);

  const resolveOne = async (req: PendingRequest) => {
    if (!user) return;
    setResolving(req.id);
    const note = (notes[req.id] || "").trim() || "Resolvido pelo gestor";
    const today = format(new Date(), "yyyy-MM-dd");

    const { data: rec, error: recErr } = await supabase
      .from("nutri_maintenance_records")
      .insert({
        user_id: user.id,
        store_id: req.store_id,
        date: today,
        equipment_type: req.equipment_type,
        maintenance_type: "corretiva",
        note,
      })
      .select("id")
      .single();

    if (recErr || !rec) {
      console.error("Erro ao registrar manutenção", recErr);
      toast.error("Erro ao registrar manutenção");
      setResolving(null);
      return;
    }

    const { error: updErr } = await supabase
      .from("nutri_maintenance_requests")
      .update({
        status: "awaiting_confirmation",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        maintenance_record_id: rec.id,
        resolved_note: note,
      })
      .eq("id", req.id);

    setResolving(null);
    if (updErr) {
      toast.error("Histórico registrado, mas falha ao atualizar o chamado");
    } else {
      toast.success("Enviado para confirmação da loja");
      // Notifica o colaborador que abriu o chamado (fire-and-forget)
      supabase.functions
        .invoke("notify-maintenance-resolved", { body: { request_id: req.id } })
        .catch(() => null);
      setNotes((prev) => {
        const { [req.id]: _omit, ...rest } = prev;
        return rest;
      });
    }
    refresh();
  };

  const markSeen = async (req: PendingRequest) => {
    if (!user) return;
    setResolving(req.id);
    const { error } = await supabase
      .from("nutri_maintenance_requests")
      .update({ seen_by: user.id, seen_at: new Date().toISOString() })
      .eq("id", req.id);
    setResolving(null);
    if (error) {
      toast.error("Erro ao marcar como visto");
      return;
    }
    toast.success("Chamado marcado como visto");
    refresh();
  };

  const visibleItems = useMemo(
    () => (canResolve ? items : items.filter((i) => !i.seen_at)),
    [items, canResolve],
  );

  const byStore = useMemo(() => {
    const map = new Map<string, PendingRequest[]>();
    for (const item of visibleItems) {
      const key = item.store_name ?? "Loja";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [visibleItems]);

  if (!user || !canView) return null;
  if (loading) return null;
  if (visibleItems.length === 0) return null;

  const urgent = visibleItems.filter((i) => i.urgency === "alta").length;

  return (
    <Accordion type="single" collapsible defaultValue="" className="rounded-lg border border-amber-500/40 bg-amber-500/5">
      <AccordionItem value="all" className="border-0">
        <AccordionTrigger className="px-3 py-2 hover:no-underline">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="h-8 w-8 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              {urgent > 0 ? <AlertTriangle className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-semibold text-foreground">
                {visibleItems.length} manutenç{visibleItems.length > 1 ? "ões" : "ão"} aguardando você
                {urgent > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-destructive">
                    • {urgent} urgente{urgent > 1 ? "s" : ""}
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {canResolve ? "Toque para ver e resolver." : "Toque para ver e marcar como visto."}
              </p>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-3 pb-3">
          <Accordion type="multiple" defaultValue={byStore.map(([store]) => store)} className="w-full">
            {byStore.map(([storeName, requests]) => {
              const storeUrgent = requests.filter((r) => r.urgency === "alta").length;
              return (
                <AccordionItem key={storeName} value={storeName} className="border-0">
                  <AccordionTrigger className="rounded-md border bg-card px-3 py-2 text-sm hover:no-underline hover:bg-muted/40">
                    <span className="flex items-center gap-2">
                      <Store className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold text-foreground">{storeName}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {requests.length}
                      </Badge>
                      {storeUrgent > 0 && (
                        <Badge variant="outline" className="text-[10px] bg-destructive/15 text-destructive border-destructive/30">
                          {storeUrgent} urgente{storeUrgent > 1 ? "s" : ""}
                        </Badge>
                      )}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pt-2">
                    <div className="space-y-2">
                      {requests.map((r) => {
                        const urg = URGENCY[r.urgency] ?? URGENCY.media;
                        const photoUrl = r.photo_path
                          ? supabase.storage.from(PHOTO_BUCKET).getPublicUrl(r.photo_path).data.publicUrl
                          : null;
                        return (
                          <div key={r.id} className="rounded-md border bg-card p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2 flex-wrap">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-foreground truncate">
                                  {r.equipment_type}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {r.requester_name && <>{r.requester_name}</>}
                                  <> · {format(new Date(r.requested_at), "dd/MM 'às' HH:mm", { locale: ptBR })}</>
                                </p>
                              </div>
                              <Badge variant="outline" className={`text-[10px] ${urg.className}`}>
                                {urg.label}
                              </Badge>
                            </div>

                            {r.description && (
                              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{r.description}</p>
                            )}

                            {photoUrl && (
                              <a href={photoUrl} target="_blank" rel="noreferrer" className="block">
                                <img
                                  src={photoUrl}
                                  alt="Foto do equipamento"
                                  className="rounded-md border max-h-40 object-cover"
                                />
                              </a>
                            )}

                            {canResolve && (
                            <Textarea
                              value={notes[r.id] ?? ""}
                              onChange={(e) => setNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                              placeholder="Observação (opcional) — o que foi feito?"
                              className="text-sm min-h-[60px]"
                            />
                            )}

                            <div className="flex justify-end">
                              <Button
                                size="sm"
                                variant={canResolve ? "default" : "outline"}
                                onClick={() => (canResolve ? resolveOne(r) : markSeen(r))}
                                disabled={resolving === r.id}
                                className="h-8 gap-1"
                              >
                                {resolving === r.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : canResolve ? (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                ) : (
                                  <Eye className="h-3.5 w-3.5" />
                                )}
                                {canResolve ? "Resolver" : "Marcar como visto"}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
