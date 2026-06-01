import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReceiptText, Calculator, Trash2, FileDown, Lock, CheckCheck, Send, Loader2 } from "lucide-react";
import PayrollSummaryPanel from "@/components/payroll/PayrollSummaryPanel";
import AccountantPayrollPanel from "@/components/payroll/AccountantPayrollPanel";
import SimpleManagerPayrollPanel from "@/components/payroll/SimpleManagerPayrollPanel";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function Payroll() {
  const { isContabilidade, isAdmin, isManager } = useAuth();
  const { toast } = useToast();
  const [readOnly, setReadOnly] = useState(false);
  const [payrollLocked, setPayrollLocked] = useState<{ locked: boolean; reason: string | null }>({ locked: false, reason: null });
  const [sendingPayslips, setSendingPayslips] = useState(false);
  const [currentRef, setCurrentRef] = useState<{ year: number; month: number }>(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      if (d.year && d.month) setCurrentRef({ year: Number(d.year), month: Number(d.month) });
    };
    window.addEventListener("payroll:ref-change", h as EventListener);
    return () => window.removeEventListener("payroll:ref-change", h as EventListener);
  }, []);
  const sendPayslips = async () => {
    if (!currentRef) {
      toast({ title: "Aguarde", description: "Carregando referência da folha…", variant: "destructive" });
      return;
    }
    setSendingPayslips(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-payslip-pdf", {
        body: { year: currentRef.year, month: currentRef.month },
      });
      if (error) throw error;
      const d: any = data || {};
      const generated = Number(d.generated ?? 0);
      const skipped = Number(d.skipped ?? 0);
      const errors = Array.isArray(d.errors) ? d.errors.length : Number(d.errors ?? 0);
      toast({
        title: "Holerites enviados",
        description: `${generated} gerado(s)${skipped ? `, ${skipped} ignorado(s)` : ""}${errors ? `, ${errors} erro(s)` : ""}.`,
      });
    } catch (e: any) {
      toast({ title: "Falha ao enviar", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setSendingPayslips(false);
    }
  };
  const [okProgress, setOkProgress] = useState<{ ok: number; total: number; allOk: boolean }>({ ok: 0, total: 0, allOk: false });
  useEffect(() => {
    try { localStorage.removeItem("payroll_view_mode"); } catch {}
  }, []);
  useEffect(() => {
    const h = (e: Event) => setReadOnly(!!(e as CustomEvent).detail?.readOnly);
    window.addEventListener("payroll:readonly-change", h as EventListener);
    return () => window.removeEventListener("payroll:readonly-change", h as EventListener);
  }, []);
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      setOkProgress({ ok: Number(d.ok ?? 0), total: Number(d.total ?? 0), allOk: !!d.allOk });
    };
    window.addEventListener("payroll:ok-progress", h as EventListener);
    return () => window.removeEventListener("payroll:ok-progress", h as EventListener);
  }, []);
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      setPayrollLocked({ locked: !!d.locked, reason: d.reason ?? null });
    };
    window.addEventListener("payroll:locked-state", h as EventListener);
    return () => window.removeEventListener("payroll:locked-state", h as EventListener);
  }, []);
  const blockIfReadOnly = (cb: () => void) => () => {
    if (readOnly) {
      toast({
        title: "Modo somente leitura",
        description: "Outro usuário está editando esta folha. Assuma o controle no banner para usar essa ação.",
        variant: "destructive",
      });
      return;
    }
    cb();
  };
  const fire = (name: string) => window.dispatchEvent(new CustomEvent(name));
  const showAccountantView = isContabilidade && !isAdmin && !isManager;
  const canExportEsocial = isContabilidade && !isManager;

  return (
    <div className="md:h-[calc(100vh-7rem)] md:overflow-hidden flex flex-col gap-3 md:gap-6">
      <div className="shrink-0 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg md:text-xl font-bold flex items-center gap-2">
            <ReceiptText className="md: md: shrink-0 h-6 w-6 md:h-7 md:w-7 text-primary" />
            <span className="truncate">Folha de pagamento</span>
          </h1>
          {showAccountantView && (
            <p className="text-sm md:text-base text-muted-foreground">
              Visão da contabilidade — solicite alterações para aprovação do gestor.
            </p>
          )}
        </div>
        {!showAccountantView && (
          <div className="grid grid-cols-2 gap-1.5 md:flex md:flex-wrap md:gap-2 md:shrink-0 md:items-center [&>*]:w-full md:[&>*]:w-auto">
            {readOnly && (
              <span className="col-span-2 md:col-span-1 inline-flex items-center justify-center md:justify-start gap-1 text-[11px] md:text-xs text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/40 border border-amber-300 rounded-md px-2 py-1">
                <Lock className="h-3 w-3" /> Somente leitura
              </span>
            )}
            {payrollLocked.locked && (
              <span className="col-span-2 md:col-span-1 inline-flex items-center justify-center md:justify-start gap-1 text-[11px] md:text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-300 rounded-md px-2 py-1">
                <Lock className="h-3 w-3" />
                {payrollLocked.reason === "consolidada" ? "Folha consolidada — somente visualização" : "Folha aprovada pela contabilidade — somente visualização"}
              </span>
            )}
            <Button
              onClick={blockIfReadOnly(() => {
                if (payrollLocked.locked) {
                  toast({
                    title: "Folha bloqueada",
                    description: "Esta folha já foi aprovada pela contabilidade e não pode ser substituída.",
                    variant: "destructive",
                  });
                  return;
                }
                fire("payroll:generate");
              })}
              disabled={readOnly || payrollLocked.locked}
              size="sm"
              className="h-9 text-xs md:text-sm md:h-10 md:size-default bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Calculator className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2" />
              <span className="hidden md:inline">Gerar nova folha</span>
              <span className="md:hidden">Nova folha</span>
            </Button>
            {payrollLocked.locked && (
              <Button
                onClick={sendPayslips}
                disabled={sendingPayslips}
                variant="outline"
                size="sm"
                className="h-9 text-xs md:text-sm md:h-10 md:size-default border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                title="Gerar PDFs e notificar colaboradores para assinatura"
              >
                {sendingPayslips ? (
                  <Loader2 className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2" />
                )}
                <span className="hidden md:inline">Enviar holerites</span>
                <span className="md:hidden">Holerites</span>
              </Button>
            )}
            {canExportEsocial && (
              <Button
                onClick={blockIfReadOnly(() => fire("payroll:export-esocial"))}
                disabled={readOnly}
                variant="outline"
                size="sm"
                className="h-9 text-xs md:text-sm md:h-10 md:size-default"
                title="Exportar eSocial S-1200"
                aria-label="Exportar eSocial S-1200"
              >
                <FileDown className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2" />
                <span className="hidden md:inline">Exportar eSocial S-1200</span>
                <span className="md:hidden">eSocial</span>
              </Button>
            )}
            <div
              id="payroll-header-actions"
              className={(readOnly ? "[&_button:not([data-lock-bypass])]:pointer-events-none [&_button:not([data-lock-bypass])]:opacity-50 " : "") + "contents [&>button]:h-9 [&>button]:text-xs md:[&>button]:h-10 md:[&>button]:text-sm"}
            />
          </div>
        )}
      </div>
      <Card className="md:flex-1 md:min-h-0 md:overflow-hidden">
        <CardContent className="p-2 md:p-6 md:pt-6 md:h-full md:min-h-0 md:overflow-y-auto">
          {showAccountantView ? (
            <AccountantPayrollPanel />
          ) : (
            <>
              <SimpleManagerPayrollPanel />
              {/* Painel avançado oculto: mantém handlers de Gerar/Importar/Consolidar/Exportar/Remover ativos */}
              <div className="hidden" aria-hidden>
                <PayrollSummaryPanel />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
