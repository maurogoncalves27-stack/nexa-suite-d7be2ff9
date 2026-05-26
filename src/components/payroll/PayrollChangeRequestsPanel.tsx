import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { AlertTriangle, Check, X, Loader2, Clock } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface ChangeRequest {
  id: string;
  import_id: string;
  row_id: string | null;
  ref_year: number;
  ref_month: number;
  employee_name: string | null;
  change_kind: string;
  field_label: string;
  old_value: any;
  new_value: any;
  justification: string | null;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  requested_by: string;
  requested_at: string;
  reviewed_at: string | null;
}

const fmtVal = (v: any) => {
  if (v == null) return "—";
  if (typeof v === "number") return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

interface Props {
  importId?: string | null;
  refYear?: number;
  refMonth?: number;
  /** Quando true (staff), mostra ações aprovar/rejeitar. */
  canReview: boolean;
}

export default function PayrollChangeRequestsPanel({ importId, refYear, refMonth, canReview }: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [reviewing, setReviewing] = useState<ChangeRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      let q = (supabase as any)
        .from("payroll_change_requests")
        .select("*")
        .order("requested_at", { ascending: false })
        .limit(100);
      const isSyntheticId = !!importId && importId.startsWith("calculated-");
      if (importId && !isSyntheticId) q = q.eq("import_id", importId);
      else if (refYear && refMonth) q = q.eq("ref_year", refYear).eq("ref_month", refMonth);
      else { setItems([]); setLoading(false); return; }
      const { data, error } = await q;
      if (error) throw error;
      setItems((data as ChangeRequest[]) ?? []);
    } catch (e: any) {
      toast({ title: "Erro ao carregar pedidos", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importId, refYear, refMonth]);

  const pending = useMemo(() => items.filter((i) => i.status === "pending"), [items]);
  const others = useMemo(() => items.filter((i) => i.status !== "pending"), [items]);

  const applyChange = async (req: ChangeRequest) => {
    // Aplica a alteração no banco com base no change_kind
    if (!req.row_id) return;
    if (req.change_kind === "value" || req.change_kind === "rubric_update") {
      // new_value: { rubric_id?: string, value: number, description?: string, kind?: string }
      const nv = req.new_value ?? {};
      if (nv.rubric_id) {
        await (supabase as any).from("payroll_import_rubrics").update({ value: Number(nv.value || 0) }).eq("id", nv.rubric_id);
      }
    } else if (req.change_kind === "rubric_add") {
      const nv = req.new_value ?? {};
      await (supabase as any).from("payroll_import_rubrics").insert({
        row_id: req.row_id,
        code: nv.code ?? null,
        description: nv.description ?? req.field_label,
        reference: nv.reference ?? null,
        kind: nv.kind ?? "earning",
        value: Number(nv.value || 0),
      });
    } else if (req.change_kind === "rubric_delete") {
      const ov = req.old_value ?? {};
      if (ov.rubric_id) {
        await (supabase as any).from("payroll_import_rubrics").delete().eq("id", ov.rubric_id);
      }
    } else if (req.change_kind === "note") {
      const nv = req.new_value ?? {};
      await (supabase as any).from("payroll_import_rows").update({ accountant_notes: nv.text ?? null }).eq("id", req.row_id);
    }

    // Recalcula totais da linha
    const { data: rubs } = await (supabase as any)
      .from("payroll_import_rubrics")
      .select("kind, value")
      .eq("row_id", req.row_id);
    const earnings = (rubs ?? []).filter((r: any) => r.kind === "earning").reduce((s: number, r: any) => s + Number(r.value || 0), 0);
    const deductions = (rubs ?? []).filter((r: any) => r.kind === "deduction").reduce((s: number, r: any) => s + Number(r.value || 0), 0);
    await (supabase as any)
      .from("payroll_import_rows")
      .update({
        total_earnings: earnings,
        total_discounts: deductions,
        net_amount: Math.max(0, earnings - deductions),
      })
      .eq("id", req.row_id);
  };

  const submitReview = async () => {
    if (!reviewing || !reviewAction) return;
    setReviewSaving(true);
    try {
      if (reviewAction === "approve") {
        await applyChange(reviewing);
        await (supabase as any)
          .from("payroll_change_requests")
          .update({
            status: "approved",
            reviewed_by: user?.id ?? null,
            reviewed_at: new Date().toISOString(),
            applied_at: new Date().toISOString(),
          })
          .eq("id", reviewing.id);
        toast({ title: "Alteração aplicada", description: `${reviewing.field_label} atualizado.` });
      } else {
        await (supabase as any)
          .from("payroll_change_requests")
          .update({
            status: "rejected",
            reviewed_by: user?.id ?? null,
            reviewed_at: new Date().toISOString(),
            rejection_reason: reviewNotes || null,
          })
          .eq("id", reviewing.id);
        toast({ title: "Alteração rejeitada" });
      }
      setReviewing(null);
      setReviewAction(null);
      setReviewNotes("");
      await load();
      // Avisa a página para recarregar a folha
      window.dispatchEvent(new CustomEvent("payroll:change-applied"));
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setReviewSaving(false);
    }
  };

  if (!canReview && pending.length === 0 && others.length === 0) return null;

  return (
    <Card className="border-amber-300/60 bg-amber-50/30 dark:bg-amber-950/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Alterações solicitadas pela contabilidade
          {pending.length > 0 && (
            <Badge variant="default" className="bg-amber-500 ml-1">{pending.length} pendente(s)</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin" /></div>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma alteração solicitada para este período.</p>
        ) : (
          <>
            {pending.map((r) => (
              <div key={r.id} className="rounded-md border bg-card p-2 sm:p-3 space-y-1.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="text-sm font-medium">
                    {r.employee_name ?? "—"} <span className="text-muted-foreground">·</span> {r.field_label}
                  </div>
                  <Badge variant="outline" className="text-amber-600 border-amber-400">
                    <Clock className="h-3 w-3 mr-1" /> Pendente
                  </Badge>
                </div>
                <div className="text-xs grid grid-cols-1 sm:grid-cols-2 gap-1">
                  <div><span className="text-muted-foreground">Antes: </span>{fmtVal(r.old_value?.value ?? r.old_value)}</div>
                  <div><span className="text-muted-foreground">Depois: </span><strong>{fmtVal(r.new_value?.value ?? r.new_value)}</strong></div>
                </div>
                {r.justification && (
                  <p className="text-xs italic text-muted-foreground">"{r.justification}"</p>
                )}
                {canReview && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { setReviewing(r); setReviewAction("approve"); setReviewNotes(""); }}>
                      <Check className="h-4 w-4 mr-1" /> Aprovar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setReviewing(r); setReviewAction("reject"); setReviewNotes(""); }}>
                      <X className="h-4 w-4 mr-1" /> Rejeitar
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {others.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground py-1">Histórico ({others.length})</summary>
                <div className="space-y-1 pt-1">
                  {others.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-2 py-1 border-b last:border-0">
                      <span>
                        {r.employee_name ?? "—"} · {r.field_label} → <strong>{fmtVal(r.new_value?.value ?? r.new_value)}</strong>
                      </span>
                      <Badge variant={r.status === "approved" ? "success" : "destructive"}>
                        {r.status === "approved" ? "Aprovada" : "Rejeitada"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </CardContent>

      <Dialog open={!!reviewing} onOpenChange={(o) => !o && !reviewSaving && (setReviewing(null), setReviewAction(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewAction === "approve" ? "Aprovar alteração" : "Rejeitar alteração"}</DialogTitle>
            <DialogDescription>
              {reviewing && `${reviewing.employee_name ?? "—"} · ${reviewing.field_label}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div>De <strong>{fmtVal(reviewing?.old_value?.value ?? reviewing?.old_value)}</strong> para <strong>{fmtVal(reviewing?.new_value?.value ?? reviewing?.new_value)}</strong></div>
            {reviewing?.justification && <p className="italic text-muted-foreground">"{reviewing.justification}"</p>}
            {reviewAction === "reject" && (
              <Textarea
                placeholder="Motivo da rejeição (opcional)"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={3}
              />
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setReviewing(null); setReviewAction(null); }} disabled={reviewSaving}>Cancelar</Button>
            <Button
              onClick={submitReview}
              disabled={reviewSaving}
              className={reviewAction === "approve" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"}
            >
              {reviewSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {reviewAction === "approve" ? "Aprovar e aplicar" : "Rejeitar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
