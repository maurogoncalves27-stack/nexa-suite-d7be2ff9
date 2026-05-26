import { useEffect, useState } from "react";
import { Wrench, Phone, User, Building2, ClipboardCheck, Info, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ActiveMaintenance {
  id: string;
  store_id: string;
  store_name: string | null;
  equipment_type: string;
  description: string;
  urgency: "baixa" | "media" | "alta";
  status: string;
  approval_instructions: string | null;
  approved_at: string | null;
  requested_at: string;
  user_id: string;
  professional_name: string | null;
  professional_phone: string | null;
  professional_role: string | null;
  company_name: string | null;
  company_phone: string | null;
  company_contact_name: string | null;
  company_contact_phone: string | null;
}

const URGENCY_BADGE: Record<string, { label: string; className: string }> = {
  alta: { label: "Urgente", className: "bg-destructive/15 text-destructive border-destructive/30" },
  media: { label: "Média", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" },
  baixa: { label: "Baixa", className: "bg-muted text-muted-foreground border-border" },
};

const MAINTENANCE_TYPES = [
  { value: "preventiva", label: "Preventiva" },
  { value: "corretiva", label: "Corretiva" },
  { value: "limpeza_tecnica", label: "Limpeza técnica" },
  { value: "calibracao", label: "Calibração" },
];

function digitsOnly(v: string | null) {
  return (v ?? "").replace(/\D+/g, "");
}

/**
 * Banner exibido na área do colaborador listando manutenções APROVADAS e
 * ainda não concluídas em qualquer loja a que o colaborador tenha acesso.
 * Mostra instruções da gestão e contato do técnico/empresa alocada.
 * Permanece visível até que alguém (solicitante ou gestor) registre como concluída.
 */
export default function EmployeeMaintenanceAlert() {
  const { user } = useAuth();
  const [items, setItems] = useState<ActiveMaintenance[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<ActiveMaintenance | null>(null);
  const [maintType, setMaintType] = useState<string>("corretiva");
  const [maintNote, setMaintNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.rpc(
      "active_maintenance_for_employee" as never,
      { _user_id: user.id } as never,
    );
    if (error) {
      console.error("Erro ao carregar manutenções ativas", error);
      setItems([]);
    } else {
      setItems((data ?? []) as ActiveMaintenance[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    if (!user) return;

    const channel = supabase
      .channel("employee-maintenance-alert")
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
  }, [user?.id]);

  const completeMaintenance = async () => {
    if (!user || !completing) return;
    setSubmitting(true);

    const today = format(new Date(), "yyyy-MM-dd");
    const { data: rec, error: recErr } = await supabase
      .from("nutri_maintenance_records")
      .insert({
        user_id: user.id,
        store_id: completing.store_id,
        date: today,
        equipment_type: completing.equipment_type,
        maintenance_type: maintType,
        note: maintNote.trim(),
      })
      .select()
      .single();

    if (recErr || !rec) {
      console.error("Erro ao registrar manutenção", recErr);
      toast.error("Erro ao registrar manutenção");
      setSubmitting(false);
      return;
    }

    const { error: updErr } = await supabase
      .from("nutri_maintenance_requests")
      .update({ status: "completed", maintenance_record_id: rec.id })
      .eq("id", completing.id);

    setSubmitting(false);
    if (updErr) {
      toast.error("Manutenção registrada, mas falha ao atualizar a solicitação");
    } else {
      toast.success("Manutenção marcada como concluída");
    }
    setCompleting(null);
    setMaintType("corretiva");
    setMaintNote("");
    refresh();
  };

  if (loading || items.length === 0) return null;

  return (
    <>
      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="p-2 sm:p-3">
          <Accordion type="single" collapsible>
            <AccordionItem value="maint" className="border-0">
              <AccordionTrigger className="py-1.5 hover:no-underline">
                <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                  <div className="h-8 w-8 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                    <Wrench className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-semibold text-foreground">
                      {items.length === 1
                        ? "1 manutenção aprovada em andamento"
                        : `${items.length} manutenções aprovadas em andamento`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Toque para ver detalhes e marcar como concluída.
                    </p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-2">
                <div className="space-y-2 pt-1">
                  {items.map((m) => {
                    const urg = URGENCY_BADGE[m.urgency] ?? URGENCY_BADGE.media;
                    const techPhone = digitsOnly(m.professional_phone || m.company_contact_phone || m.company_phone);
                    const techName = m.professional_name || m.company_contact_name || m.company_name;
                    const techRole = m.professional_role || (m.company_name ? "Empresa terceirizada" : null);
                    return (
                      <div
                        key={m.id}
                        className="rounded-md border border-amber-500/30 bg-card p-3 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {m.equipment_type}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {m.store_name ?? "Loja"}
                              {m.approved_at && (
                                <> · Aprovada em {format(new Date(m.approved_at), "dd/MM 'às' HH:mm", { locale: ptBR })}</>
                              )}
                            </p>
                          </div>
                          <Badge variant="outline" className={`text-[10px] ${urg.className}`}>
                            {urg.label}
                          </Badge>
                        </div>

                        {m.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">{m.description}</p>
                        )}

                        {m.approval_instructions && (
                          <div className="rounded-md bg-primary/5 border border-primary/20 p-2">
                            <div className="flex items-start gap-1.5">
                              <Info className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-[11px] font-semibold text-primary uppercase tracking-wide">
                                  Instruções da gestão
                                </p>
                                <p className="text-xs text-foreground whitespace-pre-wrap">
                                  {m.approval_instructions}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {(techName || techPhone) && (
                          <div className="rounded-md bg-muted/40 border border-border p-2">
                            <div className="flex items-start gap-1.5">
                              {m.professional_name ? (
                                <User className="h-3.5 w-3.5 text-foreground mt-0.5 shrink-0" />
                              ) : (
                                <Building2 className="h-3.5 w-3.5 text-foreground mt-0.5 shrink-0" />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                                  Técnico responsável
                                </p>
                                {techName && (
                                  <p className="text-xs text-foreground font-medium truncate">
                                    {techName}
                                    {techRole && (
                                      <span className="text-muted-foreground font-normal"> · {techRole}</span>
                                    )}
                                  </p>
                                )}
                                {techPhone && (
                                  <a
                                    href={`tel:${techPhone}`}
                                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
                                  >
                                    <Phone className="h-3 w-3" />
                                    {m.professional_phone || m.company_contact_phone || m.company_phone}
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="flex justify-end pt-1">
                          <Button
                            size="sm"
                            variant="default"
                            className="h-8 gap-1"
                            onClick={() => setCompleting(m)}
                          >
                            <ClipboardCheck className="h-3.5 w-3.5" />
                            Marcar como concluída
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      <Dialog open={!!completing} onOpenChange={(open) => !open && setCompleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar manutenção realizada</DialogTitle>
            <DialogDescription>
              {completing?.equipment_type} · {completing?.store_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Tipo de manutenção</label>
              <Select value={maintType} onValueChange={setMaintType}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MAINTENANCE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Observações (o que foi feito)
              </label>
              <Textarea
                value={maintNote}
                onChange={(e) => setMaintNote(e.target.value)}
                placeholder="Descreva o serviço realizado, peças trocadas, etc."
                className="text-sm min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleting(null)} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={completeMaintenance} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Confirmar conclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}