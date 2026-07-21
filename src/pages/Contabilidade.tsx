import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Calculator, Download, Check, ArrowLeft, FileText, Loader2, AlertTriangle, History, FileDown,
  Users, FolderOpen, Stethoscope, ShieldAlert, Plane, LogOut, Bus, Wallet, Award, Receipt, TrendingUp,
} from "lucide-react";


import { toast } from "@/hooks/use-toast";
import { Link, Navigate } from "react-router-dom";
import { buildS1200Xml, downloadS1200Xml } from "@/lib/esocialS1200Export";

interface PayrollImport {
  id: string;
  ref_year: number;
  ref_month: number;
  file_name: string;
  uploaded_at: string;
  workflow_status: string | null;
  sent_to_accounting_at: string | null;
  accounting_ok_at: string | null;
  accounting_notes: string | null;
  consolidated_at: string | null;
  exported_at: string | null;
}

interface XmlHistoryRow {
  id: string;
  ref_year: number;
  ref_month: number;
  file_name: string;
  uploaded_by_role: string;
  kind: string;
  notes: string | null;
  created_at: string;
}

const monthLabel = (y: number, m: number) =>
  new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

const statusBadge = (s: string | null) => {
  switch (s) {
    case "em_revisao_contabilidade":
      return <Badge variant="default" className="bg-warning text-warning-foreground">Aguardando aprovação</Badge>;
    case "aprovada_contabilidade":
      return <Badge variant="success">Aprovada</Badge>;
    case "consolidada":
      return <Badge variant="success">Consolidada</Badge>;
    case "gerada":
      return <Badge variant="secondary">Em revisão do gestor</Badge>;
    default:
      return <Badge variant="outline">{s ?? "—"}</Badge>;
  }
};

export default function Contabilidade() {
  const { user, isContabilidade, isAdmin, isManager, loading } = useAuth();
  const [imports, setImports] = useState<PayrollImport[]>([]);
  const [historyByPeriod, setHistoryByPeriod] = useState<Record<string, XmlHistoryRow[]>>({});
  const [refreshing, setRefreshing] = useState(false);

  const [reviewDialog, setReviewDialog] = useState<PayrollImport | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewAction, setReviewAction] = useState<"approve" | "return" | null>(null);
  const [reviewSaving, setReviewSaving] = useState(false);

  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  const load = async () => {
    setRefreshing(true);
    try {
      const { data: imps, error } = await (supabase as any)
        .from("payroll_imports")
        .select("id, ref_year, ref_month, file_name, uploaded_at, workflow_status, sent_to_accounting_at, accounting_ok_at, accounting_notes, consolidated_at, exported_at")
        .in("workflow_status", ["em_revisao_contabilidade", "aprovada_contabilidade", "consolidada"])
        .order("ref_year", { ascending: false })
        .order("ref_month", { ascending: false });
      if (error) throw error;
      setImports((imps ?? []) as PayrollImport[]);

      const periods = new Set((imps ?? []).map((i: any) => `${i.ref_year}-${i.ref_month}`));
      if (periods.size > 0) {
        const { data: hist } = await (supabase as any)
          .from("payroll_xml_history")
          .select("id, ref_year, ref_month, file_name, uploaded_by_role, kind, notes, created_at")
          .order("created_at", { ascending: false });
        const grouped: Record<string, XmlHistoryRow[]> = {};
        (hist ?? []).forEach((h: XmlHistoryRow) => {
          const k = `${h.ref_year}-${h.ref_month}`;
          if (!grouped[k]) grouped[k] = [];
          grouped[k].push(h);
        });
        setHistoryByPeriod(grouped);
      }
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user) void load();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // Bloqueia: só contabilidade/admin/manager veem essa página
  if (!isContabilidade && !isAdmin && !isManager) {
    return <Navigate to="/" replace />;
  }

  // Gera XML da folha para a contabilidade baixar (mesma estrutura da /folha)
  const downloadOriginal = async (imp: PayrollImport) => {
    try {
      const { data: rows } = await (supabase as any)
        .from("payroll_import_rows")
        .select("*")
        .eq("import_id", imp.id);
      if (!rows || rows.length === 0) {
        toast({ title: "Sem dados", description: "Esta folha não tem linhas para exportar.", variant: "destructive" });
        return;
      }
      const { data: rubs } = await (supabase as any)
        .from("payroll_import_rubrics")
        .select("*")
        .in("row_id", (rows as any[]).map((r) => r.id));
      const xmlEscape = (s: string) =>
        String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
      const fmt = (n: number) => Number(n || 0).toFixed(2);
      const competence = `${String(imp.ref_month).padStart(2, "0")}/${imp.ref_year}`;
      const lines: string[] = [];
      lines.push('<?xml version="1.0" encoding="UTF-8"?>');
      lines.push(`<PayrollExport competence="${competence}" generatedAt="${new Date().toISOString()}" employees="${rows.length}">`);
      for (const r of rows as any[]) {
        const myRubs = (rubs as any[] ?? []).filter((rb) => rb.row_id === r.id);
        lines.push(`  <Employee>`);
        lines.push(`    <FullName>${xmlEscape(r.full_name ?? "")}</FullName>`);
        lines.push(`    <Cpf>${xmlEscape(r.cpf ?? "")}</Cpf>`);
        lines.push(`    <Registration>${xmlEscape(r.registration_number ?? "")}</Registration>`);
        lines.push(`    <BaseSalary>${fmt(r.salary)}</BaseSalary>`);
        lines.push(`    <TotalEarnings>${fmt(r.total_earnings)}</TotalEarnings>`);
        lines.push(`    <TotalDiscounts>${fmt(r.total_discounts)}</TotalDiscounts>`);
        lines.push(`    <NetAmount>${fmt(r.net_amount)}</NetAmount>`);
        lines.push(`    <Rubrics>`);
        for (const rb of myRubs) {
          lines.push(`      <Rubric kind="${rb.kind}" code="${xmlEscape(rb.code ?? "")}" description="${xmlEscape(rb.description ?? "")}" reference="${xmlEscape(rb.reference ?? "")}" value="${fmt(rb.value)}" />`);
        }
        lines.push(`    </Rubrics>`);
        lines.push(`  </Employee>`);
      }
      lines.push(`</PayrollExport>`);
      const blob = new Blob([lines.join("\n")], { type: "application/xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `folha-${imp.ref_year}-${String(imp.ref_month).padStart(2, "0")}.xml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "Erro ao baixar", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  // Exporta eSocial S-1200 a partir das linhas/rubricas já existentes na folha
  const handleExportEsocial = async (imp: PayrollImport) => {
    try {
      const { data: rows } = await (supabase as any)
        .from("payroll_import_rows")
        .select("id, full_name, cpf, registration_number")
        .eq("import_id", imp.id);
      if (!rows || rows.length === 0) {
        toast({ title: "Sem dados", description: "Esta folha não tem colaboradores.", variant: "destructive" });
        return;
      }
      const { data: rubs } = await (supabase as any)
        .from("payroll_import_rubrics")
        .select("row_id, code, description, reference, kind, value")
        .in("row_id", (rows as any[]).map((r) => r.id));
      const byRow: Record<string, any[]> = {};
      (rubs ?? []).forEach((rb: any) => {
        (byRow[rb.row_id] ||= []).push(rb);
      });
      const exportRows = (rows as any[])
        .filter((r) => r.cpf && (byRow[r.id]?.length ?? 0) > 0)
        .map((r) => ({
          full_name: r.full_name,
          cpf: r.cpf,
          registration_number: r.registration_number,
          rubrics: (byRow[r.id] ?? []).map((rb) => ({
            code: rb.code,
            description: rb.description,
            reference: rb.reference,
            kind: rb.kind,
            value: Number(rb.value || 0),
          })),
        }));
      if (exportRows.length === 0) {
        toast({ title: "Sem dados", description: "Nenhum colaborador com rubricas e CPF.", variant: "destructive" });
        return;
      }
      const xml = buildS1200Xml({ rows: exportRows, refYear: imp.ref_year, refMonth: imp.ref_month, cnpj: "44932369000108" });
      downloadS1200Xml(xml, imp.ref_year, imp.ref_month);
      toast({ title: "eSocial S-1200 gerado", description: `${exportRows.length} evento(s) no XML.` });
    } catch (e: any) {
      toast({ title: "Erro ao exportar", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const openReview = (imp: PayrollImport, action: "approve" | "return") => {
    setReviewDialog(imp);
    setReviewAction(action);
    setReviewNotes(imp.accounting_notes ?? "");
  };

  const submitReview = async () => {
    if (!reviewDialog || !reviewAction) return;
    setReviewSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const patch: any = {
        accounting_notes: reviewNotes || null,
      };
      if (reviewAction === "approve") {
        patch.accounting_ok_at = nowIso;
        patch.accounting_ok_by = user?.id ?? null;
        patch.workflow_status = "aprovada_contabilidade";
      } else {
        // Devolver: limpa "enviado" para o gestor reabrir/corrigir
        patch.sent_to_accounting_at = null;
        patch.sent_to_accounting_by = null;
        patch.workflow_status = "gerada";
      }
      const { error } = await (supabase as any)
        .from("payroll_imports")
        .update(patch)
        .eq("id", reviewDialog.id);
      if (error) throw error;
      toast({
        title: reviewAction === "approve" ? "Folha aprovada" : "Folha devolvida ao gestor",
        description: reviewAction === "approve"
          ? "O gestor pode prosseguir com a consolidação."
          : "O gestor receberá de volta para ajustar.",
      });
      setReviewDialog(null);
      setReviewAction(null);
      setReviewNotes("");
      await load();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setReviewSaving(false);
    }
  };

  const pending = imports.filter((i) => i.workflow_status === "em_revisao_contabilidade");
  const others = imports.filter((i) => i.workflow_status !== "em_revisao_contabilidade");

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl md:text-xl font-bold flex items-center gap-2">
            <Calculator className="md: md: h-6 w-6 md:h-7 md:w-7 text-primary" /> Contabilidade
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Confira as folhas já fechadas pelo gestor, dê o "ok" da contabilidade e baixe o eSocial S-1200 para transmissão.
          </p>
        </div>
        {(isAdmin || isManager) && (
          <Button asChild variant="outline" size="sm">
            <Link to="/folha"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar à folha</Link>
          </Button>
        )}
      </div>

      {/* Atalhos da contabilidade */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acessos rápidos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { to: "/folha", icon: FileText, label: "Folha de pagamento" },
              { to: "/rescisoes", icon: LogOut, label: "Rescisões" },
              { to: "/ferias", icon: Plane, label: "Férias" },
              { to: "/adiantamentos", icon: Wallet, label: "Adiantamentos" },
              { to: "/vale-transporte", icon: Bus, label: "Vale-transporte" },
              { to: "/bonificacoes", icon: Award, label: "Bonificações" },
              { to: "/atestados", icon: Stethoscope, label: "Atestados" },
              { to: "/infracoes", icon: ShieldAlert, label: "Advertências" },
              { to: "/colaboradores", icon: Users, label: "Colaboradores" },
              { to: "/pasta-colaborador", icon: FolderOpen, label: "Pasta do colaborador" },
            ].map(({ to, icon: Icon, label }) => (

              <Button
                key={to}
                asChild
                variant="outline"
                className="h-auto flex-col gap-2 py-4 px-2 text-center whitespace-normal"
              >
                <Link to={to}>
                  <Icon className="h-6 w-6 text-primary" />
                  <span className="text-xs md:text-sm font-medium leading-tight">{label}</span>
                </Link>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>


      {/* Pendentes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Pendentes de aprovação ({pending.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {refreshing ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma folha aguardando revisão.</p>
          ) : (
            <div className="grid gap-3">
              {pending.map((imp) => (
                <ImportCard
                  key={imp.id}
                  imp={imp}
                  history={historyByPeriod[`${imp.ref_year}-${imp.ref_month}`] ?? []}
                  onDownload={() => downloadOriginal(imp)}
                  onExportEsocial={() => handleExportEsocial(imp)}
                  onApprove={() => openReview(imp, "approve")}
                  onReturn={() => openReview(imp, "return")}
                  showActions
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Aprovadas/Consolidadas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Check className="h-4 w-4 text-success" />
            Histórico recente ({others.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {others.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma folha aprovada ainda.</p>
          ) : (
            <div className="grid gap-3">
              {others.map((imp) => (
                <ImportCard
                  key={imp.id}
                  imp={imp}
                  history={historyByPeriod[`${imp.ref_year}-${imp.ref_month}`] ?? []}
                  onDownload={() => downloadOriginal(imp)}
                  onExportEsocial={() => handleExportEsocial(imp)}
                  onApprove={() => openReview(imp, "approve")}
                  onReturn={() => openReview(imp, "return")}
                  showActions={false}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!reviewDialog} onOpenChange={(o) => !o && !reviewSaving && setReviewDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === "approve" ? "Aprovar folha" : "Devolver ao gestor"}
            </DialogTitle>
            <DialogDescription>
              {reviewDialog && monthLabel(reviewDialog.ref_year, reviewDialog.ref_month)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Observações (opcional)
            </label>
            <Textarea
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              placeholder={reviewAction === "approve"
                ? "Ex.: aprovado sem ressalvas."
                : "Explique o que precisa ser ajustado..."}
              rows={4}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReviewDialog(null)} disabled={reviewSaving}>
              Cancelar
            </Button>
            <Button
              onClick={submitReview}
              disabled={reviewSaving}
              className={reviewAction === "approve"
                ? "bg-success hover:bg-success/90 text-success-foreground"
                : "bg-warning hover:bg-warning/90 text-warning-foreground"}
            >
              {reviewSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {reviewAction === "approve" ? "Aprovar" : "Devolver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ImportCard({
  imp, history, onDownload, onExportEsocial, onApprove, onReturn, showActions,
}: {
  imp: PayrollImport;
  history: XmlHistoryRow[];
  onDownload: () => void;
  onExportEsocial: () => void;
  onApprove: () => void;
  onReturn: () => void;
  showActions: boolean;
}) {
  const [showHistory, setShowHistory] = useState(false);
  return (
    <div className="rounded-lg border bg-card p-3 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="font-medium capitalize flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            {monthLabel(imp.ref_year, imp.ref_month)}
          </div>
          <div className="text-xs text-muted-foreground">
            Enviada em {imp.sent_to_accounting_at ? new Date(imp.sent_to_accounting_at).toLocaleString("pt-BR") : "—"}
          </div>
          {imp.accounting_notes && (
            <div className="text-xs italic text-muted-foreground">"{imp.accounting_notes}"</div>
          )}
        </div>
        {statusBadge(imp.workflow_status)}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to={`/folha?ano=${imp.ref_year}&mes=${imp.ref_month}`}>
            <FileText className="h-4 w-4 mr-2" /> Ver folha conferida
          </Link>
        </Button>
        <Button size="sm" variant="outline" onClick={onExportEsocial} className="border-primary/30 text-primary hover:bg-primary/5">
          <FileDown className="h-4 w-4 mr-2" /> Baixar eSocial S-1200
        </Button>
        {showActions && (
          <>
            <Button size="sm" onClick={onApprove} className="bg-success hover:bg-success/90 text-success-foreground">
              <Check className="h-4 w-4 mr-2" /> Aprovar
            </Button>
            <Button size="sm" variant="outline" onClick={onReturn}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Devolver
            </Button>
          </>
        )}
        {history.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
            <History className="h-4 w-4 mr-2" /> Histórico ({history.length})
          </Button>
        )}
      </div>

      {showHistory && history.length > 0 && (
        <div className="border-t pt-2 space-y-1.5">
          {history.map((h) => (
            <div key={h.id} className="text-xs flex flex-wrap gap-1.5 items-center">
              <Badge variant="outline" className="text-[10px]">{h.uploaded_by_role}</Badge>
              <span className="font-medium">{h.kind}</span>
              <span className="text-muted-foreground">·</span>
              <span className="truncate">{h.file_name}</span>
              <span className="text-muted-foreground">· {new Date(h.created_at).toLocaleString("pt-BR")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
