import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plane, Download, CheckCircle2, FileText, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/vacation";
import { exportC6PixFile } from "@/lib/c6Export";

interface VacationReceiptRow {
  id: string;
  vacation_schedule_id: string;
  employee_id: string;
  reference_year: number;
  reference_month: number;
  gross_total: number;
  net_total: number;
  payment_status: string;
  payment_due_date: string | null;
  paid_at: string | null;
  pdf_url: string | null;
  accounts_payable_id: string | null;
  employee?: {
    full_name: string;
    cpf: string | null;
    pix_key: string | null;
    pix_key_type: string | null;
    allocated_store_id: string | null;
    store_id: string | null;
  } | null;
  schedule?: {
    start_date: string;
    end_date: string;
    days_count: number;
  } | null;
}

const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function VacationPayments() {
  const [loading, setLoading] = useState(true);
  const [receipts, setReceipts] = useState<VacationReceiptRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("vacation_receipts" as any)
      .select(`
        id, vacation_schedule_id, employee_id, reference_year, reference_month,
        gross_total, net_total, payment_status, payment_due_date, paid_at,
        pdf_url, accounts_payable_id,
        employee:employees(full_name, cpf, pix_key, pix_key_type, allocated_store_id, store_id),
        schedule:vacation_schedules(start_date, end_date, days_count)
      `)
      .order("payment_due_date", { ascending: true });
    setReceipts((data ?? []) as unknown as VacationReceiptRow[]);
    setSelected(new Set());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const pending = useMemo(() => receipts.filter((r) => r.payment_status === "pending"), [receipts]);
  const paidThisMonth = useMemo(() => {
    const now = new Date();
    return receipts.filter((r) => {
      if (r.payment_status !== "paid" || !r.paid_at) return false;
      const d = new Date(r.paid_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
  }, [receipts]);
  const dueThisWeek = useMemo(() => {
    const today = new Date();
    const in7 = new Date(today);
    in7.setDate(today.getDate() + 7);
    return pending.filter((r) => {
      if (!r.payment_due_date) return false;
      const d = new Date(`${r.payment_due_date}T00:00:00`);
      return d <= in7;
    });
  }, [pending]);

  const totalPending = pending.reduce((s, r) => s + Number(r.net_total), 0);
  const totalDueThisWeek = dueThisWeek.reduce((s, r) => s + Number(r.net_total), 0);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    if (selected.size === pending.length) setSelected(new Set());
    else setSelected(new Set(pending.map((r) => r.id)));
  };

  const handleMarkPaid = async (id: string) => {
    const rec = receipts.find((r) => r.id === id);
    if (!rec) return;
    const { error } = await supabase
      .from("vacation_receipts" as any)
      .update({ payment_status: "paid", paid_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    if (rec.accounts_payable_id) {
      await supabase
        .from("accounts_payable")
        .update({ status: "paid", paid_at: new Date().toISOString() } as any)
        .eq("id", rec.accounts_payable_id);
    }
    toast({ title: "Marcado como pago" });
    load();
  };

  const handleOpenReceipt = async (rec: VacationReceiptRow) => {
    if (!rec.pdf_url) {
      toast({ title: "PDF ainda não disponível", variant: "destructive" });
      return;
    }
    const { data, error } = await supabase.storage
      .from("employee-documents")
      .createSignedUrl(rec.pdf_url, 300);
    if (error || !data?.signedUrl) {
      toast({ title: "Erro ao abrir PDF", description: error?.message, variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const handleExportC6 = async () => {
    const chosen = pending.filter((r) => selected.has(r.id));
    if (chosen.length === 0) {
      toast({ title: "Selecione ao menos um recibo", variant: "destructive" });
      return;
    }
    setExporting(true);
    try {
      const rows = chosen.map((r) => ({
        name: r.employee?.full_name ?? "",
        pixKey: r.employee?.pix_key ?? "",
        pixKeyType: r.employee?.pix_key_type ?? null,
        amount: Number(r.net_total),
        employeeId: r.employee_id,
        storeId: r.employee?.allocated_store_id ?? r.employee?.store_id ?? null,
      }));
      const today = new Date();
      const monthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
      const result = await exportC6PixFile({
        rows,
        fileName: `ferias-${monthStr}`,
        paymentDate: today,
        source: "other",
        sourceRef: `Férias ${monthStr}`,
      });
      toast({
        title: `Lote C6 gerado (${result.included} linhas)`,
        description: result.skipped.length > 0 ? `${result.skipped.length} descartadas por dados inválidos.` : undefined,
      });
    } catch (e: any) {
      toast({ title: "Erro no export C6", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Plane className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Pagamento de Férias
        </h1>
        <p className="text-muted-foreground">Recibos de férias emitidos e status de pagamento (vencimento 2 dias antes do início).</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>A pagar (total)</CardDescription>
            <CardTitle className="text-2xl">{fmtBRL(totalPending)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">{pending.length} recibo(s)</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Vence nos próximos 7 dias</CardDescription>
            <CardTitle className="text-2xl">{fmtBRL(totalDueThisWeek)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">{dueThisWeek.length} recibo(s)</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pagos este mês</CardDescription>
            <CardTitle className="text-2xl">{paidThisMonth.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {fmtBRL(paidThisMonth.reduce((s, r) => s + Number(r.net_total), 0))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recibos pendentes</CardTitle>
            <CardDescription>Selecione para gerar lote C6 PIX.</CardDescription>
          </div>
          <Button onClick={handleExportC6} disabled={exporting || selected.size === 0} className="gap-2">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Gerar lote C6 PIX ({selected.size})
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Carregando…</p>
          ) : pending.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhum recibo pendente.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <Checkbox checked={selected.size === pending.length} onCheckedChange={toggleAll} />
                    </TableHead>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Período de gozo</TableHead>
                    <TableHead>Bruto</TableHead>
                    <TableHead>Líquido</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                      </TableCell>
                      <TableCell className="font-medium">{r.employee?.full_name ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {r.schedule ? `${formatDate(r.schedule.start_date)} → ${formatDate(r.schedule.end_date)} (${r.schedule.days_count}d)` : "—"}
                      </TableCell>
                      <TableCell className="font-mono">{fmtBRL(Number(r.gross_total))}</TableCell>
                      <TableCell className="font-mono font-semibold">{fmtBRL(Number(r.net_total))}</TableCell>
                      <TableCell>
                        {r.payment_due_date ? (
                          <Badge variant={new Date(`${r.payment_due_date}T00:00:00`) <= new Date() ? "destructive" : "outline"}>
                            {formatDate(r.payment_due_date)}
                          </Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        {r.pdf_url && (
                          <Button size="sm" variant="outline" onClick={() => handleOpenReceipt(r)} className="gap-1">
                            <FileText className="h-3 w-3" /> PDF
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => handleMarkPaid(r.id)} className="gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Pagar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pagos recentemente</CardTitle>
          <CardDescription>Últimos recibos quitados.</CardDescription>
        </CardHeader>
        <CardContent>
          {receipts.filter((r) => r.payment_status === "paid").length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhum recibo pago ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Líquido</TableHead>
                    <TableHead>Pago em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipts.filter((r) => r.payment_status === "paid").slice(0, 20).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.employee?.full_name ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {r.schedule ? `${formatDate(r.schedule.start_date)} → ${formatDate(r.schedule.end_date)}` : "—"}
                      </TableCell>
                      <TableCell className="font-mono">{fmtBRL(Number(r.net_total))}</TableCell>
                      <TableCell className="text-xs">{r.paid_at ? new Date(r.paid_at).toLocaleDateString("pt-BR") : "—"}</TableCell>
                      <TableCell className="text-right">
                        {r.pdf_url && (
                          <Button size="sm" variant="outline" onClick={() => handleOpenReceipt(r)} className="gap-1">
                            <FileText className="h-3 w-3" /> PDF
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
