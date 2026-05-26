import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Trash2, FileDown, MessageSquare } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import PayrollChangeRequestsPanel from "./PayrollChangeRequestsPanel";
import { buildS1200Xml, downloadS1200Xml } from "@/lib/esocialS1200Export";

interface ImportRow {
  id: string;
  full_name: string | null;
  cpf: string | null;
  registration_number: string | null;
  position: string | null;
  salary: number;
  total_earnings: number;
  total_discounts: number;
  net_amount: number;
  accountant_notes: string | null;
}
interface ImportMeta {
  id: string;
  ref_year: number;
  ref_month: number;
  consolidated_at: string | null;
  accounting_ok_at?: string | null;
  workflow_status?: string | null;
  is_virtual?: boolean;
}
interface RubricRow {
  id: string;
  row_id: string;
  code: string | null;
  description: string | null;
  reference: string | null;
  kind: "earning" | "deduction" | "informative";
  value: number;
}

const money = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtMonth = (y: number, m: number) =>
  new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const isInternshipEmployee = (employee?: {
  contract_type?: string | null;
  position?: string | null;
  esocial_category?: string | null;
}) => {
  const contractType = norm(employee?.contract_type ?? "");
  const position = norm(employee?.position ?? "");
  const esocialCategory = String(employee?.esocial_category ?? "").trim();
  return contractType.includes("estag") || contractType === "internship" || position.includes("estagi") || esocialCategory === "701";
};

type ChangeKind = "rubric_update" | "rubric_add" | "rubric_delete" | "note";

export default function AccountantPayrollPanel() {
  const { user } = useAuth();
  // Contabilidade abre por padrão na competência ANTERIOR — a folha a pagar no mês corrente.
  const defaultRef = () => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  };
  const [ref, setRef] = useState(defaultRef);
  const refYear = ref.year;
  const refMonth = ref.month;
  const maxRef = defaultRef();
  const isAtMax = refYear === maxRef.year && refMonth === maxRef.month;
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<ImportMeta | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [rubricsByRow, setRubricsByRow] = useState<Record<string, RubricRow[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  // Dialog para criar pedido de alteração
  const [reqDialog, setReqDialog] = useState<{
    kind: ChangeKind;
    row: ImportRow;
    rubric?: RubricRow;
    fieldLabel: string;
    currentValue?: number;
    currentText?: string;
  } | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [draftKind, setDraftKind] = useState<"earning" | "deduction">("earning");
  const [draftJustification, setDraftJustification] = useState("");
  const [draftSaving, setDraftSaving] = useState(false);

  const goPrev = () => {
    setRef(refMonth === 1 ? { year: refYear - 1, month: 12 } : { year: refYear, month: refMonth - 1 });
  };
  const goNext = () => {
    if (isAtMax) return;
    setRef(refMonth === 12 ? { year: refYear + 1, month: 1 } : { year: refYear, month: refMonth + 1 });
  };

  const load = async () => {
    setLoading(true);
    try {
      const { data: imp } = await (supabase as any)
        .from("payroll_imports")
        .select("id, ref_year, ref_month, consolidated_at, accounting_ok_at, workflow_status")
        .eq("ref_year", refYear)
        .eq("ref_month", refMonth)
        .order("uploaded_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      // Se import existe mas não tem rows, é marcador de workflow → cai no fluxo calculated
      let importRowCount = 0;
      if (imp) {
        const { count } = await (supabase as any)
          .from("payroll_import_rows")
          .select("id", { count: "exact", head: true })
          .eq("import_id", imp.id);
        importRowCount = Number(count ?? 0);
      }
      const treatAsCalculated = !imp || importRowCount === 0;
      if (treatAsCalculated) {
        const { data: calc } = await (supabase as any)
          .from("payroll_calculated")
          .select(`
            id, employee_id, calculated_at,
            base_salary, proportional_salary,
            advance, food_voucher, transport_discount, health_plan,
            inss, irrf, fgts, productivity, family_allowance,
            infraction_discount, absence_discount, dsr_loss_discount, other_earnings, other_discounts,
            total_earnings, total_discounts, net_pay, calculation_details,
            employees:employee_id ( full_name, cpf, registration_number, position, contract_type, esocial_category )
          `)
          .eq("reference_year", refYear)
          .eq("reference_month", refMonth);

        const calcList = ((calc ?? []) as any[]).filter((r) => !isInternshipEmployee(r.employees));
        if (calcList.length === 0) {
          setMeta(imp ? (imp as any) : null);
          setRows([]);
          setRubricsByRow({});
          return;
        }

        const newest = calcList.reduce(
          (acc, r) => (r.calculated_at > acc ? r.calculated_at : acc),
          calcList[0].calculated_at,
        );
        // Se import real existe, mantém seus flags; senão pseudo-meta virtual
        setMeta(imp
          ? ({ ...(imp as any), is_virtual: false } as ImportMeta)
          : ({
              id: `calculated-${refYear}-${refMonth}`,
              ref_year: refYear,
              ref_month: refMonth,
              consolidated_at: newest ?? null,
              accounting_ok_at: null,
              workflow_status: null,
              is_virtual: true,
            }));
        setRows(
          calcList
            .map((r) => ({
              id: r.id,
              full_name: r.employees?.full_name ?? null,
              cpf: r.employees?.cpf ?? null,
              registration_number: r.employees?.registration_number ?? null,
              position: r.employees?.position ?? null,
              salary: Number(r.proportional_salary ?? r.base_salary ?? 0),
              total_earnings: Number(r.total_earnings ?? 0),
              total_discounts: Number(r.total_discounts ?? 0),
              net_amount: Number(r.net_pay ?? 0),
              accountant_notes: null,
            }))
            .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "")),
        );

        const synth: Record<string, RubricRow[]> = {};
        calcList.forEach((r) => {
          const rubs: RubricRow[] = [];
          const push = (description: string, kind: "earning" | "deduction", value: number) => {
            if (Number(value) === 0) return;
            rubs.push({
              id: `${r.id}-${description}`,
              row_id: r.id,
              code: null,
              description,
              reference: null,
              kind,
              value: Number(value),
            });
          };
          push("Salário proporcional", "earning", Number(r.proportional_salary ?? r.base_salary ?? 0));
          push("Produtividade 5%", "earning", Number(r.productivity ?? 0));
          push("Adicional Noturno", "earning", Number(r.calculation_details?.night_addition ?? 0));
          push("Feriados Trabalhados", "earning", Number(r.calculation_details?.holiday_pay ?? 0));
          push("Salário Família", "earning", Number(r.family_allowance ?? 0));
          push("Outros proventos", "earning", Number(r.other_earnings ?? 0));
          push("Adiantamentos", "deduction", Number(r.advance ?? 0));
          push("Vale-transporte", "deduction", Number(r.transport_discount ?? 0));
          push("Plano de saúde", "deduction", Number(r.health_plan ?? 0));
          push("INSS", "deduction", Number(r.inss ?? 0));
          push("IRRF", "deduction", Number(r.irrf ?? 0));
          push("Infrações", "deduction", Number(r.infraction_discount ?? 0));
          push("Faltas", "deduction", Number(r.absence_discount ?? r.calculation_details?.absence_discount ?? 0));
          push("DSR Falta", "deduction", Number(r.dsr_loss_discount ?? r.calculation_details?.dsr_loss_discount ?? 0));
          push("Outros descontos", "deduction", Number(r.other_discounts ?? 0));
          synth[r.id] = rubs;
        });
        setRubricsByRow(synth);
        return;
      }
      setMeta(imp as ImportMeta);
      const { data: rs } = await (supabase as any)
        .from("payroll_import_rows")
        .select("id, full_name, cpf, registration_number, position, salary, total_earnings, total_discounts, net_amount, accountant_notes")
        .eq("import_id", imp.id)
        .order("full_name", { ascending: true });
      setRows((rs as ImportRow[]) ?? []);
      if (rs && rs.length > 0) {
        const { data: rubs } = await (supabase as any)
          .from("payroll_import_rubrics")
          .select("id, row_id, code, description, reference, kind, value")
          .in("row_id", (rs as any[]).map((r) => r.id));
        const grp: Record<string, RubricRow[]> = {};
        (rubs ?? []).forEach((rb: RubricRow) => {
          (grp[rb.row_id] ??= []).push({ ...rb, value: Number(rb.value) });
        });
        setRubricsByRow(grp);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [refYear, refMonth]);

  useEffect(() => {
    const handler = () => void load();
    window.addEventListener("payroll:change-applied", handler);
    return () => window.removeEventListener("payroll:change-applied", handler);
  });

  const totals = useMemo(() => {
    const e = rows.reduce((s, r) => s + Number(r.total_earnings || 0), 0);
    const d = rows.reduce((s, r) => s + Number(r.total_discounts || 0), 0);
    const n = rows.reduce((s, r) => s + Number(r.net_amount || 0), 0);
    return { e, d, n };
  }, [rows]);

  // Abre o dialog para alterar valor de uma rubrica existente
  const openEditRubric = (row: ImportRow, rubric: RubricRow) => {
    setReqDialog({ kind: "rubric_update", row, rubric, fieldLabel: rubric.description || rubric.code || "Rubrica", currentValue: rubric.value });
    setDraftValue(String(rubric.value).replace(".", ","));
    setDraftDesc(rubric.description ?? "");
    setDraftKind(rubric.kind === "deduction" ? "deduction" : "earning");
    setDraftJustification("");
  };

  const openAddRubric = (row: ImportRow) => {
    setReqDialog({ kind: "rubric_add", row, fieldLabel: "Nova rubrica" });
    setDraftValue("");
    setDraftDesc("");
    setDraftKind("earning");
    setDraftJustification("");
  };

  const openDeleteRubric = (row: ImportRow, rubric: RubricRow) => {
    setReqDialog({ kind: "rubric_delete", row, rubric, fieldLabel: rubric.description || rubric.code || "Rubrica", currentValue: rubric.value });
    setDraftValue("0");
    setDraftJustification("");
  };

  const openNote = (row: ImportRow) => {
    setReqDialog({ kind: "note", row, fieldLabel: "Observação", currentText: row.accountant_notes ?? "" });
    setDraftValue(row.accountant_notes ?? "");
    setDraftJustification("");
  };

  const submitRequest = async () => {
    if (!reqDialog || !meta) return;
    const { kind, row, rubric, fieldLabel } = reqDialog;
    const parsedValue = Number(draftValue.replace(/\./g, "").replace(",", ".")) || 0;

    let old_value: any = null;
    let new_value: any = null;
    let label = fieldLabel;

    if (kind === "rubric_update") {
      old_value = { rubric_id: rubric?.id, value: rubric?.value, description: rubric?.description, kind: rubric?.kind };
      new_value = { rubric_id: rubric?.id, value: parsedValue, description: draftDesc || rubric?.description, kind: draftKind };
      label = draftDesc || rubric?.description || fieldLabel;
    } else if (kind === "rubric_add") {
      if (!draftDesc.trim()) {
        toast({ title: "Descrição obrigatória", description: "Informe a descrição da nova rubrica.", variant: "destructive" });
        return;
      }
      new_value = { description: draftDesc, value: parsedValue, kind: draftKind };
      label = `Nova: ${draftDesc}`;
    } else if (kind === "rubric_delete") {
      old_value = { rubric_id: rubric?.id, value: rubric?.value, description: rubric?.description };
      new_value = { rubric_id: rubric?.id, value: 0 };
      label = `Remover: ${rubric?.description ?? ""}`;
    } else if (kind === "note") {
      old_value = { text: row.accountant_notes ?? "" };
      new_value = { text: draftValue };
      label = "Observação do contador";
    }

    setDraftSaving(true);
    try {
      const { error } = await (supabase as any).from("payroll_change_requests").insert({
        import_id: meta.id,
        row_id: row.id,
        ref_year: meta.ref_year,
        ref_month: meta.ref_month,
        employee_name: row.full_name,
        change_kind: kind,
        field_label: label,
        old_value,
        new_value,
        justification: draftJustification || null,
        requested_by: user?.id,
      });
      if (error) throw error;
      toast({
        title: "Solicitação enviada",
        description: "O gestor foi notificado para aprovar/rejeitar a alteração.",
      });
      setReqDialog(null);
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setDraftSaving(false);
    }
  };

  const exportEsocial = async () => {
    if (!meta || rows.length === 0) {
      toast({ title: "Nada a exportar", description: "Sem folha disponível para o período.", variant: "destructive" });
      return;
    }
    const exportRows = rows
      .filter((r) => (rubricsByRow[r.id] ?? []).length > 0 && r.cpf)
      .map((r) => ({
        full_name: r.full_name,
        cpf: r.cpf,
        registration_number: r.registration_number,
        rubrics: (rubricsByRow[r.id] ?? []).map((rb) => ({
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
    const xml = buildS1200Xml({ rows: exportRows, refYear: meta.ref_year, refMonth: meta.ref_month, cnpj: "44932369000108" });
    downloadS1200Xml(xml, meta.ref_year, meta.ref_month);
    toast({ title: "eSocial S-1200 gerado", description: `${exportRows.length} evento(s) no XML.` });
  };

  const [approving, setApproving] = useState(false);
  const approvePayroll = async () => {
    if (!meta) return;
    if (!confirm(
      `Confirmar aprovação da folha de ${fmtMonth(meta.ref_year, meta.ref_month)}?\n\n` +
      `Após o OK da contabilidade, o gestor poderá consolidar a folha e gerar o pagamento.`,
    )) return;
    setApproving(true);
    try {
      const nowIso = new Date().toISOString();
      let importId = meta.id;
      // Folha calculada (sem XML): cria registro virtual em payroll_imports
      if (meta.is_virtual) {
        const { data: created, error: insErr } = await (supabase as any)
          .from("payroll_imports")
          .insert({
            ref_year: meta.ref_year,
            ref_month: meta.ref_month,
            file_name: `Folha calculada ${meta.ref_year}-${String(meta.ref_month).padStart(2, "0")}`,
            uploaded_by: user?.id ?? null,
            competence: `${meta.ref_year}-${String(meta.ref_month).padStart(2, "0")}`,
            workflow_status: "aprovada_contabilidade",
            sent_to_accounting_at: nowIso,
            sent_to_accounting_by: user?.id ?? null,
            accounting_ok_at: nowIso,
            accounting_ok_by: user?.id ?? null,
          })
          .select("id")
          .single();
        if (insErr) throw insErr;
        importId = created.id;
      } else {
        const { error } = await (supabase as any)
          .from("payroll_imports")
          .update({
            workflow_status: "aprovada_contabilidade",
            sent_to_accounting_at: meta.workflow_status ? undefined : nowIso,
            accounting_ok_at: nowIso,
            accounting_ok_by: user?.id ?? null,
          })
          .eq("id", meta.id);
        if (error) throw error;
      }
      toast({
        title: "Folha aprovada",
        description: "O gestor já pode consolidar a folha e gerar o pagamento.",
      });
      try { window.dispatchEvent(new CustomEvent("payroll:status-changed")); } catch {}
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao aprovar", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="space-y-1">
          <Label className="flex items-center gap-2 text-sm">
            <CalendarDays className="h-4 w-4" /> Mês de referência
          </Label>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={goPrev}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="capitalize text-sm font-medium min-w-[140px] text-center">
                {fmtMonth(refYear, refMonth)} {isAtMax && <span className="text-primary text-xs normal-case">(Atual)</span>}
              </span>
              <Button variant="outline" size="icon" onClick={goNext} disabled={isAtMax}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {meta && rows.length > 0 && !meta.accounting_ok_at && (
            <Button
              onClick={approvePayroll}
              disabled={approving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              title="Dar o OK da contabilidade e liberar o gestor para consolidar e pagar"
            >
              {approving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Aprovar folha (OK contabilidade)
            </Button>
          )}
          {meta?.accounting_ok_at && (
            <span className="inline-flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-1.5">
              <CheckCircle2 className="h-4 w-4" />
              Aprovada em {new Date(meta.accounting_ok_at).toLocaleString("pt-BR")}
            </span>
          )}
          <Button onClick={exportEsocial} disabled={!meta || rows.length === 0} className="bg-blue-600 hover:bg-blue-700 text-white">
            <FileDown className="h-4 w-4 mr-2" /> Exportar eSocial S-1200
          </Button>
        </div>
      </div>

      <PayrollChangeRequestsPanel importId={meta?.id} canReview={false} />

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : !meta ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nenhuma folha gerada para {fmtMonth(refYear, refMonth)}.
        </CardContent></Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {rows.length} colaborador(es) · Líquido total: <strong>{money(totals.n)}</strong>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead className="text-right">Proventos</TableHead>
                    <TableHead className="text-right">Descontos</TableHead>
                    <TableHead className="text-right">Líquido</TableHead>
                    <TableHead className="w-[1%]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const isOpen = expanded === r.id;
                    const rubs = rubricsByRow[r.id] ?? [];
                    return (
                      <>
                        <TableRow key={r.id} className="cursor-pointer" onClick={() => setExpanded(isOpen ? null : r.id)}>
                          <TableCell>
                            <div className="font-medium">{r.full_name ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">
                              {r.position ?? "—"} · CPF {r.cpf ?? "—"}
                            </div>
                            {r.accountant_notes && (
                              <Badge variant="outline" className="text-xs mt-1"><MessageSquare className="h-3 w-3 mr-1" /> Obs</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{money(r.total_earnings)}</TableCell>
                          <TableCell className="text-right text-destructive">{money(r.total_discounts)}</TableCell>
                          <TableCell className="text-right font-semibold">{money(r.net_amount)}</TableCell>
                          <TableCell>
                            <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow key={`${r.id}-detail`}>
                            <TableCell colSpan={5} className="bg-muted/30">
                              <div className="space-y-2 py-2">
                                <div className="flex flex-wrap gap-2">
                                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openAddRubric(r); }}>
                                    <Plus className="h-3 w-3 mr-1" /> Solicitar nova rubrica
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openNote(r); }}>
                                    <MessageSquare className="h-3 w-3 mr-1" /> Observação
                                  </Button>
                                </div>
                                <div className="rounded border bg-card">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="w-[60px]">Cód</TableHead>
                                        <TableHead>Descrição</TableHead>
                                        <TableHead>Tipo</TableHead>
                                        <TableHead className="text-right">Valor</TableHead>
                                        <TableHead className="w-[1%]"></TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {rubs.length === 0 ? (
                                        <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-3">Sem rubricas</TableCell></TableRow>
                                      ) : rubs.map((rb) => (
                                        <TableRow key={rb.id}>
                                          <TableCell className="text-xs font-mono">{rb.code ?? "—"}</TableCell>
                                          <TableCell className="text-xs">{rb.description ?? "—"}</TableCell>
                                          <TableCell>
                                            <Badge variant={rb.kind === "deduction" ? "destructive" : rb.kind === "informative" ? "secondary" : "default"} className="text-xs">
                                              {rb.kind === "earning" ? "Provento" : rb.kind === "deduction" ? "Desconto" : "Informativo"}
                                            </Badge>
                                          </TableCell>
                                          <TableCell className="text-right text-sm">{money(rb.value)}</TableCell>
                                          <TableCell>
                                            <div className="flex gap-1">
                                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEditRubric(r, rb); }}>
                                                <Pencil className="h-3 w-3" />
                                              </Button>
                                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); openDeleteRubric(r, rb); }}>
                                                <Trash2 className="h-3 w-3" />
                                              </Button>
                                            </div>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                                {r.accountant_notes && (
                                  <div className="text-xs italic text-muted-foreground p-2 rounded bg-amber-50 dark:bg-amber-950/20">
                                    "{r.accountant_notes}"
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog de solicitação */}
      <Dialog open={!!reqDialog} onOpenChange={(o) => !o && !draftSaving && setReqDialog(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Solicitar alteração</DialogTitle>
            <DialogDescription>
              {reqDialog && `${reqDialog.row.full_name ?? "—"} · ${reqDialog.fieldLabel}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {reqDialog?.kind === "rubric_add" && (
              <div className="space-y-2">
                <Label>Descrição da rubrica</Label>
                <Input value={draftDesc} onChange={(e) => setDraftDesc(e.target.value)} placeholder="Ex.: Adicional periculosidade" />
              </div>
            )}
            {(reqDialog?.kind === "rubric_update" || reqDialog?.kind === "rubric_add") && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Tipo</Label>
                  <select className="w-full border rounded h-9 px-2 text-sm bg-background" value={draftKind} onChange={(e) => setDraftKind(e.target.value as any)}>
                    <option value="earning">Provento</option>
                    <option value="deduction">Desconto</option>
                  </select>
                </div>
                <div>
                  <Label>Valor (R$)</Label>
                  <Input value={draftValue} onChange={(e) => setDraftValue(e.target.value)} placeholder="0,00" />
                </div>
              </div>
            )}
            {reqDialog?.kind === "rubric_delete" && (
              <p className="text-sm text-muted-foreground">
                Você está solicitando a remoção desta rubrica (atualmente {money(reqDialog.currentValue ?? 0)}).
              </p>
            )}
            {reqDialog?.kind === "note" && (
              <div className="space-y-2">
                <Label>Observação</Label>
                <Textarea value={draftValue} onChange={(e) => setDraftValue(e.target.value)} rows={4} placeholder="Anotação visível para o gestor" />
              </div>
            )}
            <div className="space-y-2">
              <Label>Justificativa (recomendado)</Label>
              <Textarea value={draftJustification} onChange={(e) => setDraftJustification(e.target.value)} rows={3} placeholder="Explique a alteração..." />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReqDialog(null)} disabled={draftSaving}>Cancelar</Button>
            <Button onClick={submitRequest} disabled={draftSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {draftSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enviar solicitação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
