import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, ChevronLeft, ChevronRight, CalendarDays, Upload, Trash2,
  FileSpreadsheet, AlertTriangle, Link2, ChevronDown, ChevronUp, Columns3, X, Download,
  Lock, Unlock, CheckCircle2, Pencil, Calculator, Check, Send,
} from "lucide-react";
import { exportC6PixFile } from "@/lib/c6Export";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { parseQxDocumentXml, isQxDocumentXml, type ParsedBlock, type RubricKind } from "@/lib/payrollParser";
import { parseEsocialXml, guessCategoryFromDescription, type S1200Worker } from "@/lib/esocialParser";
import { cn } from "@/lib/utils";
import PayrollWorkflowStepper, { type PayrollStage } from "./PayrollWorkflowStepper";
import ConsolidateSequentialDialog from "./ConsolidateSequentialDialog";
import { usePayrollLock } from "@/hooks/usePayrollLock";
import PayrollChangeRequestsPanel from "./PayrollChangeRequestsPanel";


type ConsolidateStepStatus = "pending" | "running" | "done" | "error";
interface ConsolidateStepState {
  status: ConsolidateStepStatus;
  message?: string;
}

interface ImportRow {
  id: string;
  employee_id: string | null;
  registration_number: string | null;
  full_name: string | null;
  cpf: string | null;
  position: string | null;
  admission_date: string | null;
  salary: number;
  base_salary: number;
  advance_discount: number;
  food_voucher_discount: number;
  vt_discount: number;
  health_plan_discount: number;
  inss_discount: number;
  irrf_discount: number;
  fgts_base: number;
  fgts_value: number;
  other_discounts: number;
  total_earnings: number;
  total_discounts: number;
  net_amount: number;
  payable_id: string | null;
  worked_days?: number | null;
}
interface ImportMeta {
  id: string;
  file_name: string;
  uploaded_at: string;
  competence: string | null;
  consolidated_at: string | null;
  consolidated_by: string | null;
  exported_at: string | null;
  exported_by: string | null;
  sent_to_accounting_at: string | null;
  sent_to_accounting_by: string | null;
  accounting_ok_at: string | null;
  accounting_ok_by: string | null;
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
interface EmployeeOption {
  id: string;
  full_name: string;
  cpf: string | null;
  registration_number: string | null;
  position: string | null;
  contract_type?: string | null;
  esocial_category?: string | null;
}

const money = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtMonthLabel = (d: Date) =>
  d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

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

interface PayrollRubricMeta {
  cod_rubr: string;
  ide_tab_rubr: string | null;
  description: string;
  category: string | null;
  tp_rubr: string | null;
}

interface EmployeeLookup {
  id: string;
  full_name: string | null;
  cpf: string | null;
  registration_number: string | null;
  position: string | null;
  contract_type?: string | null;
  esocial_category?: string | null;
}

const emptyBlock = (): ParsedBlock => ({
  registration_number: null, full_name: "", cpf: null, position: null, admission_date: null,
  rubrics: [], salary: 0, total_earnings: 0, total_discounts: 0, net_amount: 0,
  advance_discount: 0, food_voucher_discount: 0, vt_discount: 0, health_plan_discount: 0,
  inss_discount: 0, irrf_discount: 0, fgts_base: 0, fgts_value: 0, other_discounts: 0,
  entry_status: "active",
});

const deductionCategories = new Set(["advance", "food_voucher", "transport_voucher", "health_plan", "inss", "irrf", "infraction", "other_discount"]);

const categoryToKind = (category?: string | null, tpRubr?: string | null): RubricKind => {
  if (tpRubr === "3") return "informative";
  if (tpRubr === "2" || tpRubr === "4") return "deduction";
  if (category === "informative") return "informative";
  if (category && deductionCategories.has(category)) return "deduction";
  return "earning";
};

const applyEsocialTotals = (block: ParsedBlock, category: string | null | undefined, kind: RubricKind, value: number) => {
  if (kind === "informative") return;
  if (category === "salary") block.salary += value;
  if (category === "advance") block.advance_discount += value;
  else if (category === "food_voucher") block.food_voucher_discount += value;
  else if (category === "transport_voucher") block.vt_discount += value;
  else if (category === "health_plan") block.health_plan_discount += value;
  else if (category === "inss") block.inss_discount += value;
  else if (category === "irrf") block.irrf_discount += value;
  else if (kind === "deduction") block.other_discounts += value;
};

const esocialCompetence = (perApur: string | null) => {
  const m = perApur?.match(/^(\d{4})-(\d{2})$/);
  return m ? `${m[2]}/${m[1]}` : null;
};

const buildEsocialBlocks = (workers: S1200Worker[], rubrics: PayrollRubricMeta[]): ParsedBlock[] => {
  const byExact = new Map(rubrics.map((r) => [`${r.cod_rubr}|${r.ide_tab_rubr ?? ""}`, r]));
  const byCode = new Map(rubrics.map((r) => [r.cod_rubr, r]));
  return workers.map((worker) => {
    const block = emptyBlock();
    block.registration_number = worker.matricula?.trim() || null;
    block.full_name = worker.nm_trab?.trim() || "";
    block.cpf = worker.cpf?.replace(/\D/g, "") || null;

    worker.rubrics.forEach((r) => {
      const value = Math.abs(Number(r.vr_rubr || 0));
      if (!value) return;
      const meta = byExact.get(`${r.cod_rubr}|${r.ide_tab_rubr ?? ""}`) ?? byCode.get(r.cod_rubr);
      const description = meta?.description?.trim() || `Rubrica ${r.cod_rubr}`;
      const category = meta?.category || guessCategoryFromDescription(description);
      const kind = categoryToKind(category, meta?.tp_rubr);
      const reference = r.qtd_rubr != null ? String(r.qtd_rubr) : r.fator_rubr != null ? String(r.fator_rubr) : null;
      block.rubrics.push({ code: r.cod_rubr, description, reference, kind, value });
      applyEsocialTotals(block, category, kind, value);
    });

    block.total_earnings = block.rubrics.filter((r) => r.kind === "earning").reduce((sum, r) => sum + r.value, 0);
    block.total_discounts = block.rubrics.filter((r) => r.kind === "deduction").reduce((sum, r) => sum + r.value, 0);
    block.net_amount = Math.max(0, block.total_earnings - block.total_discounts);
    return block;
  }).filter((block) => block.cpf || block.registration_number || block.full_name || block.rubrics.length > 0);
};

function EditableExtraCell({
  value, kind, locked, onSave,
}: {
  value: number;
  kind: "earning" | "deduction";
  locked: boolean;
  onSave: (v: number) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value === 0 ? "" : String(value).replace(".", ","));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(value === 0 ? "" : String(value).replace(".", ","));
  }, [value]);

  const commit = async () => {
    const parsed = Number(draft.replace(/\./g, "").replace(",", "."));
    const newVal = isNaN(parsed) ? 0 : parsed;
    if (Math.abs(newVal - value) < 0.005) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(newVal); } finally { setSaving(false); setEditing(false); }
  };

  if (editing && !locked) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") { setDraft(value === 0 ? "" : String(value).replace(".", ",")); setEditing(false); }
        }}
        disabled={saving}
        className="h-7 text-right text-xs px-1 w-24 ml-auto"
      />
    );
  }
  return (
    <button
      type="button"
      disabled={locked}
      onClick={() => setEditing(true)}
      className={`w-full text-right ${locked ? "cursor-not-allowed" : "hover:bg-muted/50 rounded px-1"} ${kind === "deduction" ? "text-destructive" : ""}`}
      title={locked ? "Folha consolidada — desconsolide para editar" : "Clique para editar"}
    >
      {value > 0
        ? `${kind === "deduction" ? "- " : ""}${value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
        : <span className="text-muted-foreground">—</span>}
    </button>
  );
}

const PayrollTable = ({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) => (
  <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
);

export default function PayrollSummaryPanel() {
  const { user } = useAuth();
  // Folha abre por padrão na competência ANTERIOR — é a que será paga no mês corrente
  // (ex.: em maio, paga-se a folha de abril).
  const [refDate, setRefDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return d;
  });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [meta, setMeta] = useState<ImportMeta | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [rubricsByRow, setRubricsByRow] = useState<Record<string, RubricRow[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [linkDialog, setLinkDialog] = useState<ImportRow | null>(null);
  const [linkSelection, setLinkSelection] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [consolidateDialogOpen, setConsolidateDialogOpen] = useState(false);
  const [stepPayables, setStepPayables] = useState<ConsolidateStepState>({ status: "pending" });
  const [stepSignatures, setStepSignatures] = useState<ConsolidateStepState>({ status: "pending" });
  const [stepC6, setStepC6] = useState<ConsolidateStepState>({ status: "pending" });
  const [columnsDialogOpen, setColumnsDialogOpen] = useState(false);
  const [forceShowList, setForceShowList] = useState(false);
  const [forceShowIndividualSheets, setForceShowIndividualSheets] = useState(false);
  const [individualSheetIndex, setIndividualSheetIndex] = useState(0);
  // Dialog para marcar feriados trabalhados (útil para dispensados de ponto)
  

  // Colunas fixas editáveis (descontos/adicionais padrão da folha)
  // ATENÇÃO: a chave (key) é a descrição normalizada (sem acento, lowercase) usada para casar com a rubrica importada.
  // As regras de preenchimento serão definidas em etapa seguinte.
  type ExtraColumn = { key: string; label: string; kind: "earning" | "deduction" };
  const FIXED_COLUMNS: ExtraColumn[] = [
    { key: "produtividade 5%",                     label: "Produtividade 5%",       kind: "earning"   },
    { key: "falta",                                label: "Falta",                  kind: "deduction" },
    { key: "dsr falta",                            label: "DSR Falta",              kind: "deduction" },
    { key: "adiantamentos",                        label: "Adiantamentos",          kind: "deduction" },
    { key: "co-participacao em plano de saude",    label: "Co-part. Plano Saúde",   kind: "deduction" },
    { key: "desc. vt",                             label: "Desc. VT",               kind: "deduction" },
    { key: "adicional noturno",                    label: "Adicional Noturno",      kind: "earning"   },
    { key: "feriados trabalhados",                 label: "Feriados Trabalhados",   kind: "earning"   },
    { key: "salario familia",                      label: "Salário Família",        kind: "earning"   },
  ];
  const extraColumns = FIXED_COLUMNS;

  const refYear = refDate.getFullYear();
  const refMonth = refDate.getMonth() + 1;

  // Trava de edição por competência (um usuário por vez)
  const editLock = usePayrollLock(refYear, refMonth);
  // Adquire trava automaticamente ao abrir/mudar de competência
  useEffect(() => {
    if (!editLock.loading && !editLock.blockedByOther && !editLock.ownsLock) {
      editLock.acquire();
    }
  }, [editLock.loading, editLock.blockedByOther, editLock.ownsLock, refYear, refMonth]);
  // Notifica o cabeçalho (Payroll.tsx) sobre estado somente leitura
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("payroll:readonly-change", { detail: { readOnly: editLock.blockedByOther } })
    );
  }, [editLock.blockedByOther]);
  // Libera ao desmontar
  useEffect(() => {
    return () => {
      editLock.release();
      window.dispatchEvent(new CustomEvent("payroll:readonly-change", { detail: { readOnly: false } }));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Visibilidade de colunas (ocultar para facilitar visualização/preenchimento)
  // Todas as colunas listadas aqui podem ser ocultadas. Persistido por mês.
  type ColumnId =
    | "registration" | "position" | "worked_days" | "inss" | "irrf" | "fgts" | "earnings" | "discounts"
    | `extra:${string}`;
  const ALL_TOGGLEABLE: { id: ColumnId; label: string }[] = [
    { id: "position",    label: "Cargo" },
    { id: "worked_days", label: "Dias trabalhados" },
    { id: "earnings",    label: "Proventos" },
    { id: "inss",        label: "INSS" },
    { id: "irrf",        label: "IRRF" },
    { id: "fgts",        label: "FGTS" },
    ...FIXED_COLUMNS.filter((c) => c.kind === "earning").map((c) => ({ id: `extra:${c.key}` as ColumnId, label: c.label })),
    ...FIXED_COLUMNS.filter((c) => c.kind === "deduction").map((c) => ({ id: `extra:${c.key}` as ColumnId, label: c.label })),
    { id: "discounts",   label: "Total Descontos" },
  ];
  const visibilityKey = `payroll_col_visibility_${refYear}_${refMonth}`;
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(visibilityKey);
      setHiddenCols(new Set(raw ? JSON.parse(raw) : []));
    } catch { setHiddenCols(new Set()); }
  }, [visibilityKey]);
  useEffect(() => {
    try { localStorage.setItem(visibilityKey, JSON.stringify(Array.from(hiddenCols))); } catch {}
  }, [visibilityKey, hiddenCols]);

  // Revisão linha-a-linha: ao gerar a folha, mostra 1 colaborador por vez.
  // Ao apertar "OK" o colaborador é marcado como revisado e some, abrindo o próximo.
  // Quando todos forem revisados, o botão "Salvar" é habilitado.
  const approvedKey = `payroll_approved_${refYear}_${refMonth}`;
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(approvedKey);
      setApprovedIds(new Set(raw ? JSON.parse(raw) : []));
    } catch { setApprovedIds(new Set()); }
  }, [approvedKey]);
  // Sincroniza quando o painel simples marca/desmarca OK
  useEffect(() => {
    const reload = () => {
      try {
        const raw = localStorage.getItem(approvedKey);
        setApprovedIds(new Set(raw ? JSON.parse(raw) : []));
      } catch {}
    };
    window.addEventListener("payroll:approved-sync", reload);
    return () => window.removeEventListener("payroll:approved-sync", reload);
  }, [approvedKey]);
  useEffect(() => {
    try { localStorage.setItem(approvedKey, JSON.stringify(Array.from(approvedIds))); } catch {}
  }, [approvedKey, approvedIds]);
  const approveRow = (id: string) => {
    setApprovedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };
  const goPreviousReview = () => {
    setApprovedIds((prev) => {
      if (prev.size === 0) return prev;
      // Remove the last approved row in the current rows order
      const next = new Set(prev);
      for (let i = rows.length - 1; i >= 0; i--) {
        if (next.has(rows[i].id)) { next.delete(rows[i].id); break; }
      }
      return next;
    });
  };
  const isVisible = (id: ColumnId) => !hiddenCols.has(id);
  const toggleCol = (id: ColumnId) => {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  // Colunas extras separadas por tipo, na ordem desejada
  const visibleEarningExtras = useMemo(
    () => extraColumns.filter((c) => c.kind === "earning" && isVisible(`extra:${c.key}` as ColumnId)),
    [extraColumns, hiddenCols]
  );
  const visibleDeductionExtras = useMemo(
    () => extraColumns.filter((c) => c.kind === "deduction" && isVisible(`extra:${c.key}` as ColumnId)),
    [extraColumns, hiddenCols]
  );

  const loadEmployees = async () => {
    const { data } = await supabase
      .from("employees")
      .select("id, full_name, cpf, registration_number, position, contract_type, esocial_category")
      .not("status", "in", "(terminated,in_training)")
      .eq("exclude_from_payroll", false)
      .order("full_name");
    setEmployees(((data ?? []) as EmployeeOption[]).filter((employee) => !isInternshipEmployee(employee)));
  };

  const load = async () => {
    setLoading(true);
    const { data: imp } = await (supabase as any)
      .from("payroll_imports")
      .select("id, file_name, uploaded_at, competence, consolidated_at, consolidated_by, exported_at, exported_by, sent_to_accounting_at, sent_to_accounting_by, accounting_ok_at, accounting_ok_by")
      .eq("ref_year", refYear)
      .eq("ref_month", refMonth)
      .maybeSingle();

    // Verifica se o import tem linhas reais; se 0, é um marcador de workflow
    let importRowCount = 0;
    if (imp) {
      const { count } = await (supabase as any)
        .from("payroll_import_rows")
        .select("id", { count: "exact", head: true })
        .eq("import_id", imp.id);
      importRowCount = Number(count ?? 0);
    }
    const useCalculated = !imp || importRowCount === 0;

    if (useCalculated) {
      // Sem XML importado (ou import sem linhas): exibe folha calculada internamente
      const { data: calc } = await (supabase as any)
        .from("payroll_calculated")
        .select(`
          id, employee_id, source, calculated_at,
          base_salary, proportional_salary, worked_days,
          advance, food_voucher, transport_discount, health_plan,
          inss, irrf, fgts, productivity, family_allowance,
          infraction_discount, absence_discount, dsr_loss_discount, other_earnings, other_discounts,
          total_earnings, total_discounts, net_pay, calculation_details,
          employees:employee_id ( full_name, cpf, registration_number, position, admission_date, contract_type, esocial_category )
        `)
        .eq("reference_year", refYear)
        .eq("reference_month", refMonth);

      const calcList = ((calc ?? []) as any[]).filter((r) => !isInternshipEmployee(r.employees));
      if (calcList.length === 0) {
        setMeta(imp ? (imp as ImportMeta) : null);
        setRows([]); setRubricsByRow({}); setLoading(false); return;
      }

      const newest = calcList.reduce(
        (acc, r) => (r.calculated_at > acc ? r.calculated_at : acc),
        calcList[0].calculated_at,
      );
      // Se há import real, preserva seus flags de workflow (accounting_ok, etc); senão pseudo-meta
      setMeta(imp
        ? (imp as ImportMeta)
        : ({
            id: `calculated-${refYear}-${refMonth}`,
            file_name: "Folha calculada internamente",
            uploaded_at: newest,
            competence: `${refYear}-${String(refMonth).padStart(2, "0")}`,
            consolidated_at: null,
            consolidated_by: null,
            exported_at: null,
            exported_by: null,
            sent_to_accounting_at: null,
            sent_to_accounting_by: null,
            accounting_ok_at: null,
            accounting_ok_by: null,
          } as ImportMeta));

      setRows(
        calcList
          .map((r) => ({
            id: r.id,
            employee_id: r.employee_id,
            registration_number: r.employees?.registration_number ?? null,
            full_name: r.employees?.full_name ?? null,
            cpf: r.employees?.cpf ?? null,
            position: r.employees?.position ?? null,
            admission_date: r.employees?.admission_date ?? null,
            salary: Number(r.proportional_salary ?? r.base_salary ?? 0),
            base_salary: Number(r.base_salary ?? 0),
            advance_discount: Number(r.advance ?? 0),
            food_voucher_discount: Number(r.food_voucher ?? 0),
            vt_discount: Number(r.transport_discount ?? 0),
            health_plan_discount: Number(r.health_plan ?? 0),
            inss_discount: Number(r.inss ?? 0),
            irrf_discount: Number(r.irrf ?? 0),
            fgts_base: Number(r.proportional_salary ?? 0),
            fgts_value: Number(r.fgts ?? 0),
            other_discounts: Number(r.other_discounts ?? 0) + Number(r.infraction_discount ?? 0),
            total_earnings: Number(r.total_earnings ?? 0),
            total_discounts: Number(r.total_discounts ?? 0),
            net_amount: Number(r.net_pay ?? 0),
            payable_id: null,
            worked_days: r.worked_days != null ? Number(r.worked_days) : null,
          }))
          .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "")),
      );

      const synth: Record<string, RubricRow[]> = {};
      calcList.forEach((r) => {
        const rubs: RubricRow[] = [];
        const push = (description: string, kind: "earning" | "deduction", value: number) => {
          if (Number(value) === 0) return;
          rubs.push({
            id: `${r.id}-${description}`, row_id: r.id, code: null,
            description, reference: null, kind, value: Number(value),
          });
        };
        push("Produtividade 5%", "earning", r.productivity);
        push("Adicional Noturno", "earning", Number(r.calculation_details?.night_addition ?? 0));
        push("Feriados Trabalhados", "earning", Number(r.calculation_details?.holiday_pay ?? 0));
        push("Salario Familia", "earning", r.family_allowance);
        push("Adiantamentos", "deduction", r.advance);
        push("Falta", "deduction", Number(r.absence_discount ?? r.calculation_details?.absence_discount ?? 0));
        push("DSR Falta", "deduction", Number(r.dsr_loss_discount ?? r.calculation_details?.dsr_loss_discount ?? 0));
        push("Desc. VT", "deduction", r.transport_discount);
        push("Desc. VT Não Utilizado", "deduction", Number(r.calculation_details?.vt_unused_adjustment ?? 0));
        push("Co-participacao em Plano de Saude", "deduction", r.health_plan);
        synth[r.id] = rubs;
      });
      setRubricsByRow(synth);
      setLoading(false);
      return;
    }

    setMeta(imp as ImportMeta);

    const { data: rs } = await (supabase as any)
      .from("payroll_import_rows")
      .select("*")
      .eq("import_id", imp.id)
      .order("full_name");
    const list = (rs ?? []) as any[];
    setRows(list.map((r) => ({
      ...r,
      salary: Number(r.salary), base_salary: Number(r.salary), advance_discount: Number(r.advance_discount),
      food_voucher_discount: Number(r.food_voucher_discount), vt_discount: Number(r.vt_discount),
      health_plan_discount: Number(r.health_plan_discount), inss_discount: Number(r.inss_discount),
      irrf_discount: Number(r.irrf_discount ?? 0),
      fgts_base: Number(r.fgts_base ?? 0), fgts_value: Number(r.fgts_value ?? 0),
      other_discounts: Number(r.other_discounts), total_earnings: Number(r.total_earnings),
      total_discounts: Number(r.total_discounts), net_amount: Number(r.net_amount),
    })));

    if (list.length > 0) {
      const ids = list.map((r) => r.id);
      const { data: rubs } = await (supabase as any)
        .from("payroll_import_rubrics")
        .select("*")
        .in("row_id", ids)
        .order("position");
      const map: Record<string, RubricRow[]> = {};
      ((rubs ?? []) as any[]).forEach((r) => {
        if (!map[r.row_id]) map[r.row_id] = [];
        map[r.row_id].push({ ...r, value: Number(r.value) });
      });
      setRubricsByRow(map);
    } else {
      setRubricsByRow({});
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [refYear, refMonth]);
  useEffect(() => { loadEmployees(); }, []);

  const totals = useMemo(() => rows.reduce((a, r) => ({
    salary: a.salary + r.salary,
    inss: a.inss + r.inss_discount,
    irrf: a.irrf + r.irrf_discount,
    fgts: a.fgts + r.fgts_value,
    earnings: a.earnings + r.total_earnings,
    discounts: a.discounts + r.total_discounts,
    net: a.net + r.net_amount,
  }), { salary: 0, inss: 0, irrf: 0, fgts: 0, earnings: 0, discounts: 0, net: 0 }), [rows]);

  const pending = useMemo(() => rows.filter((r) => !r.employee_id), [rows]);

  // Valor de uma coluna fixa para uma linha (soma das rubricas cuja descrição normalizada bate)
  const extraValue = (rowId: string, col: ExtraColumn): number => {
    const rubs = rubricsByRow[rowId] ?? [];
    return rubs
      .filter((rb) => rb.kind === col.kind && norm((rb.description ?? rb.code ?? "")) === col.key)
      .reduce((s, rb) => s + Number(rb.value || 0), 0);
  };

  const extraTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    extraColumns.forEach((c) => {
      totals[c.key] = rows.reduce((s, r) => s + extraValue(r.id, c), 0);
    });
    return totals;
  }, [extraColumns, rows, rubricsByRow]);

  const isLocked = !!meta?.consolidated_at;
  const isExported = !!meta?.exported_at;
  const isSentToAccounting = !!meta?.sent_to_accounting_at;
  const isAccountingOk = !!meta?.accounting_ok_at;

  // Notifica Payroll.tsx para desabilitar "Gerar nova folha" quando travada pela contabilidade/consolidação
  useEffect(() => {
    try {
      window.dispatchEvent(new CustomEvent("payroll:locked-state", {
        detail: { locked: isAccountingOk || isLocked, reason: isLocked ? "consolidada" : isAccountingOk ? "aprovada" : null },
      }));
    } catch {}
  }, [isAccountingOk, isLocked]);

  // Etapa atual do workflow para o stepper visual
  // Não existe mais a etapa "gerar": ao gerar/importar a folha já entra em revisão.
  const workflowStage: PayrollStage =
    isExported ? "paga"
    : isLocked ? "consolidar"
    : isAccountingOk ? "consolidar"
    : isSentToAccounting ? "revisao_contabil"
    : "revisao";

  // Modo revisão: enquanto não estiver consolidada, mostra apenas o primeiro
  // colaborador não revisado. Quando todos forem aprovados, libera Salvar.
  const inReview = !!meta && !isLocked && rows.length > 0;
  const allApproved = inReview && rows.every((r) => approvedIds.has(r.id));
  const currentReviewRow = inReview && !allApproved
    ? rows.find((r) => !approvedIds.has(r.id)) ?? null
    : null;
  // Em modo somente-leitura (folha sendo editada por outro usuário), libera navegação
  // individual mesmo sem ter aprovado, para que o usuário consiga folhear prev/próximo.
  const showingIndividualReadOnly =
    inReview && rows.length > 0 && (
      (allApproved && forceShowIndividualSheets) ||
      editLock.blockedByOther
    );
  const showingReadOnlyPayrollView =
    (inReview && allApproved && !isLocked && !isAccountingOk && (forceShowList || forceShowIndividualSheets)) ||
    (inReview && editLock.blockedByOther);
  const currentIndividualRow = showingIndividualReadOnly
    ? rows[Math.min(individualSheetIndex, rows.length - 1)] ?? null
    : null;
  const displayRows = showingIndividualReadOnly && currentIndividualRow
    ? [currentIndividualRow]
    : inReview && !allApproved && currentReviewRow
    ? [currentReviewRow]
    : rows;
  const showIndividualSheet = inReview && displayRows.length === 1 && (!allApproved || showingIndividualReadOnly);
  const reviewedCount = inReview ? rows.filter((r) => approvedIds.has(r.id)).length : 0;

  useEffect(() => {
    setIndividualSheetIndex((prev) => Math.min(prev, Math.max(rows.length - 1, 0)));
  }, [rows.length]);

  // Recalcula totais de uma linha a partir de todas as suas rubricas e persiste em payroll_import_rows
  const recomputeRowTotals = async (rowId: string, rubs: RubricRow[]) => {
    const earnings = rubs.filter((r) => r.kind === "earning").reduce((s, r) => s + Number(r.value || 0), 0);
    const deductions = rubs.filter((r) => r.kind === "deduction").reduce((s, r) => s + Number(r.value || 0), 0);
    const net = Math.max(0, earnings - deductions);
    await (supabase as any)
      .from("payroll_import_rows")
      .update({ total_earnings: earnings, total_discounts: deductions, net_amount: net })
      .eq("id", rowId);
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, total_earnings: earnings, total_discounts: deductions, net_amount: net } : r))
    );
  };

  // Salva valor de uma coluna extra (rubrica) para uma linha. Cria se não existir, atualiza se existir.
  const saveExtraValue = async (rowId: string, col: ExtraColumn, newValue: number) => {
    if (isLocked) return;
    const value = Math.max(0, Number.isFinite(newValue) ? newValue : 0);
    const isCalculated = !!meta?.id?.startsWith("calculated-");

    if (isCalculated) {
      const { data: cur, error: selErr } = await (supabase as any)
        .from("payroll_calculated")
        .select("productivity, family_allowance, advance, transport_discount, health_plan, absence_discount, dsr_loss_discount, total_earnings, total_discounts, net_pay, calculation_details")
        .eq("id", rowId)
        .single();
      if (selErr) {
        toast({ title: "Erro ao salvar", description: selErr.message, variant: "destructive" });
        return;
      }

      const details = { ...(cur?.calculation_details ?? {}) };
      const payload: Record<string, any> = {};
      let oldValue = extraValue(rowId, col);

      if (col.key === "produtividade 5%") payload.productivity = value;
      else if (col.key === "salario familia") payload.family_allowance = value;
      else if (col.key === "adiantamentos") payload.advance = value;
      else if (col.key === "desc. vt") payload.transport_discount = value;
      else if (col.key === "co-participacao em plano de saude") payload.health_plan = value;
      else if (col.key === "falta") {
        oldValue = Number(cur?.absence_discount ?? details.absence_discount ?? oldValue ?? 0);
        payload.absence_discount = value;
        details.absence_discount = value;
      } else if (col.key === "dsr falta") {
        oldValue = Number(cur?.dsr_loss_discount ?? details.dsr_loss_discount ?? oldValue ?? 0);
        payload.dsr_loss_discount = value;
        details.dsr_loss_discount = value;
      } else if (col.key === "adicional noturno") {
        oldValue = Number(details.night_addition ?? oldValue ?? 0);
        details.night_addition_manual = value;
        details.night_addition = value;
      } else if (col.key === "feriados trabalhados") {
        oldValue = Number(details.holiday_pay ?? oldValue ?? 0);
        details.holiday_pay = value;
      }

      const delta = value - Number(oldValue || 0);
      const totalEarnings = Number(cur?.total_earnings ?? 0) + (col.kind === "earning" ? delta : 0);
      const totalDiscounts = Number(cur?.total_discounts ?? 0) + (col.kind === "deduction" ? delta : 0);
      payload.total_earnings = Math.max(0, totalEarnings);
      payload.total_discounts = Math.max(0, totalDiscounts);
      payload.net_pay = Math.max(0, payload.total_earnings - payload.total_discounts);
      payload.calculation_details = details;

      const { error: updErr } = await (supabase as any)
        .from("payroll_calculated")
        .update(payload)
        .eq("id", rowId);
      if (updErr) {
        toast({ title: "Erro ao salvar", description: updErr.message, variant: "destructive" });
        return;
      }
      await load();
      return;
    }

    const current = rubricsByRow[rowId] ?? [];
    const matches = current.filter(
      (rb) => rb.kind === col.kind && norm(rb.description ?? rb.code ?? "") === col.key
    );
    let updated: RubricRow[] = current;

    if (matches.length === 0) {
      // inserir nova
      const { data, error } = await (supabase as any)
        .from("payroll_import_rubrics")
        .insert({
          row_id: rowId,
          code: null,
          description: col.label,
          reference: null,
          kind: col.kind,
          value,
          position: current.length,
        })
        .select("*")
        .single();
      if (error) {
        toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
        return;
      }
      updated = [...current, { ...data, value: Number(data.value) } as RubricRow];
    } else {
      // atualiza a primeira correspondência e remove as demais (consolidando)
      const [first, ...rest] = matches;
      const { error } = await (supabase as any)
        .from("payroll_import_rubrics")
        .update({ value })
        .eq("id", first.id);
      if (error) {
        toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
        return;
      }
      if (rest.length > 0) {
        await (supabase as any)
          .from("payroll_import_rubrics")
          .delete()
          .in("id", rest.map((r) => r.id));
      }
      updated = current
        .filter((r) => !rest.find((x) => x.id === r.id))
        .map((r) => (r.id === first.id ? { ...r, value } : r));
    }

    setRubricsByRow((prev) => ({ ...prev, [rowId]: updated }));
    await recomputeRowTotals(rowId, updated);
  };

  // 5º dia útil de um (ano, mês 1-12)
  const fifthBusinessDay = (year: number, month: number): Date => {
    const d = new Date(year, month - 1, 1);
    let count = 0;
    while (count < 5) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) count++;
      if (count < 5) d.setDate(d.getDate() + 1);
    }
    return d;
  };

  const handleConsolidate = async (opts: { skipConfirm?: boolean } = {}) => {
    if (!meta || rows.length === 0) return;
    const eligible = rows.filter((r) => r.net_amount > 0);
    if (eligible.length === 0) {
      toast({ title: "Nada a lançar", description: "Nenhum colaborador com líquido > 0.", variant: "destructive" });
      return;
    }
    if (!opts.skipConfirm && !confirm(
      `Consolidar a folha de ${fmtMonthLabel(refDate)}?\n\n` +
      `Serão lançados ${eligible.length} pagamento(s) no contas a pagar e a folha ficará bloqueada para edição.`
    )) return;

    try {
      // Categoria "Folha de pagamento"
      const { data: cat } = await (supabase as any)
        .from("finance_categories")
        .select("id")
        .ilike("name", "folha de pagamento")
        .eq("kind", "expense")
        .eq("is_active", true)
        .maybeSingle();
      const categoryId = cat?.id ?? null;

      // Vencimento: 5º dia útil do mês de pagamento (mês seguinte ao de referência)
      const payYear = refMonth === 12 ? refYear + 1 : refYear;
      const payMonth = refMonth === 12 ? 1 : refMonth + 1;
      const due = fifthBusinessDay(payYear, payMonth);
      const dueDate = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
      const competence = `${String(refMonth).padStart(2, "0")}/${refYear}`;

      // Centro de custo = loja alocada do colaborador (Fábrica como padrão)
      const resolvedStoreIds = await Promise.all(
        eligible.map(async (r) => {
          const name = r.full_name ?? "";
          if (!name) return null;
          const { data } = await (supabase as any).rpc("get_employee_cost_center_by_name", {
            _full_name: name,
          });
          return (data as string | null) ?? null;
        }),
      );

      const fallbackStoreId = resolvedStoreIds.find((s) => !!s) ?? null;
      if (!fallbackStoreId) {
        toast({ title: "Erro", description: "Nenhuma loja física cadastrada.", variant: "destructive" });
        return;
      }

      const payables = eligible.map((r, i) => ({
        store_id: resolvedStoreIds[i] ?? fallbackStoreId,
        installment_number: 1,
        due_date: dueDate,
        amount: r.net_amount,
        beneficiary: r.full_name ?? "Colaborador",
        supplier_name: r.full_name ?? "Colaborador",
        description: `Folha ${competence} · ${r.full_name ?? ""}`.trim(),
        category_id: categoryId,
        status: "pending",
        created_by: user?.id ?? null,
      }));

      const { data: inserted, error: pErr } = await (supabase as any)
        .from("accounts_payable")
        .insert(payables)
        .select("id");
      if (pErr) throw pErr;

      // Liga payable_id a cada row
      const updates = eligible.map((r, i) => ({ rowId: r.id, payableId: (inserted as any[])[i].id }));
      for (const u of updates) {
        await (supabase as any)
          .from("payroll_import_rows")
          .update({ payable_id: u.payableId })
          .eq("id", u.rowId);
      }

      await (supabase as any)
        .from("payroll_imports")
        .update({ consolidated_at: new Date().toISOString(), consolidated_by: user?.id ?? null })
        .eq("id", meta.id);

      toast({
        title: "Folha consolidada",
        description: `${eligible.length} lançamento(s) criados em contas a pagar com vencimento em ${due.toLocaleDateString("pt-BR")}.`,
      });
      await load();
    } catch (e: any) {
      toast({ title: "Falha ao consolidar", description: e.message ?? String(e), variant: "destructive" });
    }
  };

  const handleUnconsolidate = async () => {
    if (!meta) return;
    if (!confirm("Desconsolidar a folha? Os lançamentos do contas a pagar gerados serão removidos e a folha voltará a ser editável.")) return;
    try {
      const ids = rows.map((r) => r.payable_id).filter(Boolean) as string[];
      if (ids.length > 0) {
        await (supabase as any).from("accounts_payable").delete().in("id", ids);
        await (supabase as any).from("payroll_import_rows").update({ payable_id: null }).eq("import_id", meta.id);
      }
      await (supabase as any)
        .from("payroll_imports")
        .update({ consolidated_at: null, consolidated_by: null })
        .eq("id", meta.id);
      toast({ title: "Folha desconsolidada", description: "Lançamentos removidos do contas a pagar." });
      await load();
    } catch (e: any) {
      toast({ title: "Falha ao desconsolidar", description: e.message ?? String(e), variant: "destructive" });
    }
  };

  // ===== Envio à contabilidade =====
  // Gera um XML com os dados consolidados da folha (colaboradores + rubricas)
  // para envio ao escritório contábil. Marca a folha como "enviada".
  const buildAccountingXml = (): string => {
    const xmlEscape = (s: string) =>
      String(s ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
    const fmt = (n: number) => Number(n || 0).toFixed(2);
    const competence = `${String(refMonth).padStart(2, "0")}/${refYear}`;
    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push(`<PayrollExport competence="${competence}" generatedAt="${new Date().toISOString()}" employees="${rows.length}">`);
    for (const r of rows) {
      const rubs = rubricsByRow[r.id] ?? [];
      lines.push(`  <Employee>`);
      lines.push(`    <FullName>${xmlEscape(r.full_name ?? "")}</FullName>`);
      lines.push(`    <Cpf>${xmlEscape(r.cpf ?? "")}</Cpf>`);
      lines.push(`    <Registration>${xmlEscape(r.registration_number ?? "")}</Registration>`);
      lines.push(`    <Position>${xmlEscape(r.position ?? "")}</Position>`);
      lines.push(`    <AdmissionDate>${xmlEscape(r.admission_date ?? "")}</AdmissionDate>`);
      lines.push(`    <BaseSalary>${fmt(r.salary)}</BaseSalary>`);
      lines.push(`    <TotalEarnings>${fmt(r.total_earnings)}</TotalEarnings>`);
      lines.push(`    <TotalDiscounts>${fmt(r.total_discounts)}</TotalDiscounts>`);
      lines.push(`    <NetAmount>${fmt(r.net_amount)}</NetAmount>`);
      lines.push(`    <FgtsBase>${fmt(r.fgts_base)}</FgtsBase>`);
      lines.push(`    <FgtsValue>${fmt(r.fgts_value)}</FgtsValue>`);
      lines.push(`    <Inss>${fmt(r.inss_discount)}</Inss>`);
      lines.push(`    <Irrf>${fmt(r.irrf_discount)}</Irrf>`);
      lines.push(`    <Rubrics>`);
      for (const rb of rubs) {
        lines.push(
          `      <Rubric kind="${rb.kind}" code="${xmlEscape(rb.code ?? "")}" description="${xmlEscape(rb.description ?? "")}" reference="${xmlEscape(rb.reference ?? "")}" value="${fmt(rb.value)}" />`,
        );
      }
      lines.push(`    </Rubrics>`);
      lines.push(`  </Employee>`);
    }
    lines.push(`</PayrollExport>`);
    return lines.join("\n");
  };

  const handleSendToAccounting = async () => {
    if (!meta || rows.length === 0) return;
    if (!confirm(
      `Marcar a folha de ${fmtMonthLabel(refDate)} como conferida e enviar para a contabilidade?\n\n` +
      `A contabilidade fará a verificação dentro do sistema (painel /contabilidade). ` +
      `Após a aprovação dela, você poderá consolidar a folha e gerar o contas a pagar / envio C6.`,
    )) return;
    try {
      const nowIso = new Date().toISOString();
      // Persiste o estado "enviado" (apenas para imports reais; pseudo-meta não persiste)
      if (!meta.id.startsWith("calculated-")) {
        await (supabase as any)
          .from("payroll_imports")
          .update({ sent_to_accounting_at: nowIso, sent_to_accounting_by: user?.id ?? null })
          .eq("id", meta.id);
      }
      setMeta({ ...meta, sent_to_accounting_at: nowIso, sent_to_accounting_by: user?.id ?? null });
      try { window.dispatchEvent(new CustomEvent("payroll:status-changed")); } catch {}

      toast({
        title: "Conferência registrada",
        description: "A folha foi enviada para a contabilidade. Aguarde a aprovação dela para consolidar.",
      });
    } catch (e: any) {
      toast({ title: "Falha ao enviar", description: e.message ?? String(e), variant: "destructive" });
    }
  };

  // Função reusável: gera holerites e dispara assinaturas
  const sendSignaturesAction = async (): Promise<{ generated: number; skipped: number; errors: number }> => {
    const { data, error } = await supabase.functions.invoke("generate-payslip-pdf", {
      body: { year: refYear, month: refMonth },
    });
    if (error) throw error;
    const d: any = data || {};
    return {
      generated: Number(d.generated ?? 0),
      skipped: Number(d.skipped ?? 0),
      errors: Array.isArray(d.errors) ? d.errors.length : Number(d.errors ?? 0),
    };
  };

  // Abre o dialog sequencial de consolidação. Marca contabilidade OK previamente.
  const handleOpenConsolidate = async () => {
    if (!meta) return;
    // Marca contabilidade OK (se ainda não estiver) antes de iniciar a consolidação
    if (!isAccountingOk) {
      const nowIso = new Date().toISOString();
      if (!meta.id.startsWith("calculated-")) {
        await (supabase as any)
          .from("payroll_imports")
          .update({ accounting_ok_at: nowIso, accounting_ok_by: user?.id ?? null })
          .eq("id", meta.id);
      }
      setMeta((prev) => prev ? { ...prev, accounting_ok_at: nowIso, accounting_ok_by: user?.id ?? null } : prev);
    }
    // Reseta estado das sub-etapas conforme o que já foi feito
    setStepPayables(isLocked ? { status: "done", message: "Já lançado anteriormente." } : { status: "pending" });
    setStepSignatures({ status: "pending" });
    setStepC6(isExported ? { status: "done", message: "Já exportado anteriormente." } : { status: "pending" });
    setConsolidateDialogOpen(true);
  };

  const runStepPayables = async () => {
    setStepPayables({ status: "running" });
    try {
      await handleConsolidate({ skipConfirm: true });
      setStepPayables({ status: "done", message: "Lançamentos criados em contas a pagar." });
    } catch (e: any) {
      setStepPayables({ status: "error", message: e?.message ?? String(e) });
    }
  };

  const runStepSignatures = async () => {
    setStepSignatures({ status: "running" });
    try {
      const r = await sendSignaturesAction();
      setStepSignatures({
        status: "done",
        message: `${r.generated} holerite(s) gerado(s)${r.skipped ? `, ${r.skipped} ignorado(s)` : ""}${r.errors ? `, ${r.errors} erro(s)` : ""}.`,
      });
    } catch (e: any) {
      setStepSignatures({ status: "error", message: e?.message ?? String(e) });
    }
  };

  const runStepC6 = async () => {
    setStepC6({ status: "running" });
    try {
      await handleExport({ skipConfirm: true });
      setStepC6({ status: "done", message: "Arquivo C6 (PIX) baixado." });
    } catch (e: any) {
      setStepC6({ status: "error", message: e?.message ?? String(e) });
    }
  };

  // Competência máxima permitida = mês anterior ao atual.
  // A folha do mês corrente só fica disponível depois que o mês fecha.
  const maxRefDate = (() => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d;
  })();
  const isAtMax =
    refDate.getFullYear() === maxRefDate.getFullYear() &&
    refDate.getMonth() === maxRefDate.getMonth();
  const goPrev = () => { const d = new Date(refDate); d.setMonth(d.getMonth() - 1); setRefDate(d); };
  const goNext = () => {
    if (isAtMax) return;
    const d = new Date(refDate); d.setMonth(d.getMonth() + 1); setRefDate(d);
  };
  const goCurrent = () => setRefDate(new Date(maxRefDate));
  // "Atual" agora significa a competência a pagar (mês anterior ao corrente).
  const isCurrentMonth = isAtMax;

  const matchEmployee = (
    block: ParsedBlock,
    byReg: Map<string, string>,
    byCpf: Map<string, string>,
    byName: Map<string, string>,
  ): string | null => {
    if (block.registration_number) {
      const id = byReg.get(block.registration_number.trim());
      if (id) return id;
    }
    if (block.cpf) {
      const id = byCpf.get(block.cpf.replace(/\D/g, ""));
      if (id) return id;
    }
    if (block.full_name) {
      const id = byName.get(norm(block.full_name));
      if (id) return id;
    }
    return null;
  };

  const handleGenerateInternal = async () => {
    // Bloqueio: folha já aprovada pela contabilidade não pode ser regerada/substituída
    if (isAccountingOk || isLocked) {
      toast({
        title: "Folha bloqueada",
        description: "Esta folha já foi aprovada pela contabilidade e não pode ser alterada nem substituída. Use apenas para visualização.",
        variant: "destructive",
      });
      return;
    }
    // Bloqueio: feriados trabalhados precisam ter sido aprovados para o mês
    try {
      const { data: review } = await (supabase as any)
        .from("payroll_holiday_worked_review")
        .select("id")
        .eq("reference_year", refYear)
        .eq("reference_month", refMonth)
        .maybeSingle();
      if (!review) {
        toast({
          title: "Feriados trabalhados não aprovados",
          description: `Acesse Pagamentos > Feriados trabalhados, revise as marcações de ${String(refMonth).padStart(2, "0")}/${refYear} e clique em "Aprovar feriados deste mês" antes de gerar a folha.`,
          variant: "destructive",
        });
        return;
      }
    } catch (err) {
      console.warn("Falha ao validar aprovação de feriados:", err);
    }

    // Bloqueio: VT precisa ter sido aprovado para o mês
    try {
      const { data: vtReview } = await (supabase as any)
        .from("payroll_vt_review")
        .select("id")
        .eq("reference_year", refYear)
        .eq("reference_month", refMonth)
        .maybeSingle();
      if (!vtReview) {
        toast({
          title: "Vale-Transporte não aprovado",
          description: `Acesse Pagamentos > Vale Transporte, revise os lançamentos de ${String(refMonth).padStart(2, "0")}/${refYear} e clique em "Aprovar VT deste mês" antes de gerar a folha.`,
          variant: "destructive",
        });
        return;
      }
    } catch (err) {
      console.warn("Falha ao validar aprovação de VT:", err);
    }

    // Bloqueio: Adicional Noturno precisa ter sido aprovado para o mês
    try {
      const { data: nightReview } = await (supabase as any)
        .from("payroll_night_addition_review")
        .select("id")
        .eq("reference_year", refYear)
        .eq("reference_month", refMonth)
        .maybeSingle();
      if (!nightReview) {
        toast({
          title: "Adicional noturno não aprovado",
          description: `Acesse Pagamentos > Adicional Noturno, revise os lançamentos de ${String(refMonth).padStart(2, "0")}/${refYear} e clique em "Aprovar adicional noturno deste mês" antes de gerar a folha.`,
          variant: "destructive",
        });
        return;
      }
    } catch (err) {
      console.warn("Falha ao validar aprovação de adicional noturno:", err);
    }

    // Bloqueio: Acréscimos e descontos precisam ter sido aprovados para o mês
    try {
      const { data: advReview } = await (supabase as any)
        .from("payroll_advances_review")
        .select("id")
        .eq("reference_year", refYear)
        .eq("reference_month", refMonth)
        .maybeSingle();
      if (!advReview) {
        toast({
          title: "Acréscimos e descontos não aprovados",
          description: `Acesse Pagamentos > Acréscimos e descontos, revise os lançamentos de ${String(refMonth).padStart(2, "0")}/${refYear} e clique em "Aprovar acréscimos/descontos deste mês" antes de gerar a folha.`,
          variant: "destructive",
        });
        return;
      }
    } catch (err) {
      console.warn("Falha ao validar aprovação de acréscimos/descontos:", err);
    }

    try {
      const { getMissingS2200Fields } = await import("@/lib/esocialS2200Export");
      const { data: emps } = await supabase
        .from("employees")
        .select("id, full_name, contract_type, status, cpf, birth_date, gender, mother_name, admission_date, hire_date, termination_date, position, salary, esocial_category, ctps_number, work_regime, journey_type, weekly_hours, salary_type")
        .eq("status", "active")
        .eq("exclude_from_payroll", false);
      // Só bloqueia por colaboradores que efetivamente entram nesta folha:
      // admissão até o último dia do mês de referência (e não desligados antes do início).
      const periodEnd = new Date(refYear, refMonth, 0).toISOString().slice(0, 10); // último dia do mês
      const periodStart = `${refYear}-${String(refMonth).padStart(2, "0")}-01`;
      const blocking = (emps ?? [])
        .filter((e: any) => !isInternshipEmployee(e))
        .filter((e: any) => {
          const adm = e.admission_date ?? e.hire_date ?? null;
          if (adm && adm > periodEnd) return false; // ainda não entrou nesta folha
          if (e.termination_date && e.termination_date < periodStart) return false;
          return true;
        })
        .map((e: any) => ({ name: e.full_name, miss: getMissingS2200Fields(e) }))
        .filter((x) => x.miss.length > 0);
      if (blocking.length > 0) {
        const sample = blocking.slice(0, 5).map((b) => `• ${b.name}: ${b.miss.join(", ")}`).join("\n");
        const more = blocking.length > 5 ? `\n…e mais ${blocking.length - 5} colaborador(es).` : "";
        toast({
          title: "Folha bloqueada — dados do eSocial incompletos",
          description: `${blocking.length} colaborador(es) sem dados obrigatórios do eSocial S-2200. Complete o cadastro antes de gerar a folha.\n\n${sample}${more}`,
          variant: "destructive",
        });
        return;
      }
    } catch (err) {
      console.warn("Falha ao validar pendências do eSocial:", err);
    }

    if (!confirm(
      `Gerar a folha de ${refMonth.toString().padStart(2, "0")}/${refYear} a partir dos dados internos do sistema?\n\n` +
      `Serão calculados: salário proporcional, vale-transporte, bonificações, salário-família, descontos de infrações, INSS, IRRF e FGTS.\n\n` +
      `Linhas já importadas via XML da contabilidade NÃO serão sobrescritas.`
    )) return;
    setUploading(true);
    try {
      const { data, error } = await supabase.functions.invoke("calculate-payroll", {
        body: { year: refYear, month: refMonth },
      });
      if (error) throw error;
      toast({
        title: "Folha gerada",
        description: `${data?.processed ?? 0} colaboradores calculados${data?.skipped_xml ? ` (${data.skipped_xml} preservados do XML)` : ""}.`,
      });
      // Reset das aprovações: novas linhas devem ser revisadas novamente
      try { localStorage.removeItem(approvedKey); } catch {}
      // Recarregar a visualização
      window.location.reload();
    } catch (e: any) {
      toast({ title: "Erro ao gerar folha", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      if (file.size === 0) {
        throw new Error("Arquivo vazio (0 bytes). Faça o download novamente do seu sistema de folha e tente outra vez.");
      }
      const ext = file.name.toLowerCase().split(".").pop() ?? "";
      if (ext !== "xml") {
        throw new Error(
          "Formato não aceito. Importe apenas o XML QXDocument exportado pelo escritório contábil (Exact). PDF, XLSX e outros formatos não são mais suportados."
        );
      }
      const xmlText = await file.text();
      if (!xmlText.trim()) {
        throw new Error("XML vazio. Faça o download novamente do seu sistema de folha e tente outra vez.");
      }
      if (!isQxDocumentXml(xmlText)) {
        throw new Error(
          "Este XML não é um QXDocument (formato exportado pela Exact). Apenas XML QXDocument é aceito para importar a folha."
        );
      }
      const parsed = parseQxDocumentXml(xmlText);

      const { competence, blocks } = parsed;
      if (blocks.length === 0)
        throw new Error("Não foi possível identificar colaboradores no arquivo.");

      // Mapas de vínculo
      const { data: emps } = await supabase
        .from("employees")
        .select("id, full_name, cpf, registration_number, position, contract_type, esocial_category");
      const byReg = new Map<string, string>();
      const byCpf = new Map<string, string>();
      const byName = new Map<string, string>();
      const byId = new Map<string, EmployeeLookup>();
      ((emps ?? []) as EmployeeLookup[]).forEach((e) => {
        byId.set(e.id, e);
        if (e.registration_number) byReg.set(String(e.registration_number).trim(), e.id);
        if (e.cpf) byCpf.set(String(e.cpf).replace(/\D/g, ""), e.id);
        if (e.full_name) byName.set(norm(e.full_name), e.id);
      });

      // Salva o arquivo original
      const baseName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${refYear}-${String(refMonth).padStart(2, "0")}/${Date.now()}_${baseName}`;
      await supabase.storage.from("payroll-imports").upload(path, file, { upsert: true });

      // Substitui mês
      await (supabase as any).from("payroll_imports")
        .delete().eq("ref_year", refYear).eq("ref_month", refMonth);

      const { data: imp, error: ierr } = await (supabase as any)
        .from("payroll_imports")
        .insert({
          ref_year: refYear, ref_month: refMonth,
          file_name: file.name, competence,
          uploaded_by: user?.id ?? null,
        })
        .select("id").single();
      if (ierr) throw ierr;

      const payrollBlocks = blocks.filter((b) => {
        const employeeId = matchEmployee(b, byReg, byCpf, byName);
        const employee = employeeId ? byId.get(employeeId) : null;
        return !isInternshipEmployee({
          contract_type: employee?.contract_type ?? null,
          position: b.position ?? employee?.position ?? null,
          esocial_category: employee?.esocial_category ?? null,
        });
      });

      const rowsPayload = payrollBlocks.map((b) => {
        const employeeId = matchEmployee(b, byReg, byCpf, byName);
        const employee = employeeId ? byId.get(employeeId) : null;
        return {
          import_id: imp.id,
          employee_id: employeeId,
          registration_number: b.registration_number ?? employee?.registration_number ?? null,
          full_name: b.full_name || employee?.full_name || "Colaborador não identificado",
          cpf: b.cpf,
          position: b.position ?? employee?.position ?? null,
          admission_date: b.admission_date,
          salary: b.salary,
          advance_discount: b.advance_discount,
          food_voucher_discount: b.food_voucher_discount,
          vt_discount: b.vt_discount,
          health_plan_discount: b.health_plan_discount,
          inss_discount: b.inss_discount,
          irrf_discount: b.irrf_discount,
          fgts_base: b.fgts_base,
          fgts_value: b.fgts_value,
          other_discounts: b.other_discounts,
          total_earnings: b.total_earnings,
          total_discounts: b.total_discounts,
          net_amount: b.net_amount,
          entry_status: b.entry_status ?? "active",
        };
      });
      const { data: insertedRows, error: rerr } = await (supabase as any)
        .from("payroll_import_rows").insert(rowsPayload).select("id");
      if (rerr) throw rerr;

      // Insere rubricas por linha
      const rubricsPayload: any[] = [];
      (insertedRows as any[]).forEach((r, idx) => {
        const block = payrollBlocks[idx];
        block.rubrics.forEach((rb, i) => {
          rubricsPayload.push({
            row_id: r.id,
            code: rb.code,
            description: rb.description,
            reference: rb.reference,
            kind: rb.kind,
            value: rb.value,
            position: i,
          });
        });
      });
      if (rubricsPayload.length > 0) {
        // Insere em lotes para evitar limite
        const chunkSize = 500;
        for (let i = 0; i < rubricsPayload.length; i += chunkSize) {
          const chunk = rubricsPayload.slice(i, i + chunkSize);
          const { error } = await (supabase as any)
            .from("payroll_import_rubrics").insert(chunk);
          if (error) throw error;
        }
      }

      const noMatch = rowsPayload.filter((r) => !r.employee_id).length;
      toast({
        title: "Folha importada",
        description: `${rowsPayload.length} colaboradores · ${rubricsPayload.length} rubricas${competence ? ` · ${competence}` : ""}${noMatch ? ` · ${noMatch} pendente(s) de vínculo` : ""}.`,
      });
      await load();
    } catch (e: any) {
      toast({ title: "Falha ao importar", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!meta) return;
    if (isLocked) {
      toast({
        title: "Folha consolidada",
        description: "Folhas já consolidadas não podem ser removidas.",
        variant: "destructive",
      });
      return;
    }
    const isCalculated = meta.id.startsWith("calculated-");
    const msg = isCalculated
      ? "Remover a folha CALCULADA internamente deste mês? (Os dados podem ser regerados depois clicando em 'Gerar folha'.)"
      : "Remover a folha importada deste mês?";
    if (!confirm(msg)) return;
    if (isCalculated) {
      const { error } = await (supabase as any)
        .from("payroll_calculated")
        .delete()
        .eq("reference_year", refYear)
        .eq("reference_month", refMonth);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    } else {
      const { error } = await supabase.from("payroll_imports").delete().eq("id", meta.id);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    }
    toast({ title: "Folha removida" });
    setApprovedIds(new Set());
    await load();
  };

  // Permite que botões externos (cabeçalho da página /folha) disparem
  // "Gerar folha do mês" e "Remover" sem precisar de prop drilling.
  useEffect(() => {
    const onGenerate = () => { handleGenerateInternal(); };
    const onDelete = () => { handleDelete(); };
    const onColumns = () => { setColumnsDialogOpen(true); };
    const onEsocial = async () => {
      try {
        const { buildS1200Xml, downloadS1200Xml } = await import("@/lib/esocialS1200Export");
        const exportRows = rows
          .filter((r) => r.cpf && (rubricsByRow[r.id] ?? []).length > 0)
          .map((r) => ({
            full_name: r.full_name,
            cpf: r.cpf,
            registration_number: r.registration_number,
            rubrics: (rubricsByRow[r.id] ?? []).map((rb) => ({
              code: rb.code, description: rb.description, reference: rb.reference,
              kind: rb.kind, value: Number(rb.value || 0),
            })),
          }));
        if (exportRows.length === 0) {
          toast({ title: "Sem dados", description: "Nenhum colaborador com CPF e rubricas.", variant: "destructive" });
          return;
        }
        const xml = buildS1200Xml({ rows: exportRows, refYear, refMonth, cnpj: "44932369000108" });
        downloadS1200Xml(xml, refYear, refMonth);
        toast({ title: "eSocial S-1200 gerado", description: `${exportRows.length} evento(s) no XML.` });
      } catch (e: any) {
        toast({ title: "Falha", description: e?.message ?? String(e), variant: "destructive" });
      }
    };
    const onChangeApplied = () => { void load(); };
    const onSendAccounting = () => {
      if (!meta || rows.length === 0) {
        toast({ title: "Nada a enviar", description: "Gere ou importe a folha do mês primeiro.", variant: "destructive" });
        return;
      }
      if (!allApproved) {
        toast({
          title: "Revise antes de enviar",
          description: `Ainda faltam ${rows.length - reviewedCount} colaborador(es) para aprovar.`,
          variant: "destructive",
        });
        return;
      }
      void handleSendToAccounting();
    };
    window.addEventListener("payroll:generate", onGenerate);
    window.addEventListener("payroll:delete", onDelete);
    window.addEventListener("payroll:columns", onColumns);
    window.addEventListener("payroll:export-esocial", onEsocial);
    window.addEventListener("payroll:change-applied", onChangeApplied);
    window.addEventListener("payroll:send-accounting", onSendAccounting);
    return () => {
      window.removeEventListener("payroll:generate", onGenerate);
      window.removeEventListener("payroll:delete", onDelete);
      window.removeEventListener("payroll:columns", onColumns);
      window.removeEventListener("payroll:export-esocial", onEsocial);
      window.removeEventListener("payroll:change-applied", onChangeApplied);
      window.removeEventListener("payroll:send-accounting", onSendAccounting);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, refDate, refYear, refMonth, uploading, rows, rubricsByRow]);

  const openLink = (row: ImportRow) => {
    setLinkSelection("");
    setLinkDialog(row);
  };

  const confirmLink = async () => {
    if (!linkDialog || !linkSelection) return;
    const empId = linkSelection;
    // Atualiza linha
    await (supabase as any).from("payroll_import_rows")
      .update({ employee_id: empId }).eq("id", linkDialog.id);
    // Se o colaborador ainda não tem matrícula e a linha tem, sincroniza
    const reg = linkDialog.registration_number?.trim();
    if (reg) {
      const emp = employees.find((e) => e.id === empId);
      if (emp && !emp.registration_number) {
        await supabase.from("employees")
          .update({ registration_number: reg }).eq("id", empId);
      }
    }
    toast({ title: "Vinculado" });
    setLinkDialog(null);
    await Promise.all([load(), loadEmployees()]);
  };

  const deleteRow = async (row: ImportRow) => {
    const who = row.full_name || "este colaborador";
    if (!confirm(`Excluir ${who} da folha importada?`)) return;
    const { error } = await (supabase as any)
      .from("payroll_import_rows").delete().eq("id", row.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Colaborador removido da folha" });
    await load();
  };

  const handleExport = async (opts: { skipConfirm?: boolean } = {}) => {
    if (rows.length === 0) return;

    const elegiveis = rows.filter((r) => Number(r.net_amount) > 0);
    if (elegiveis.length === 0) {
      toast({ title: "Nada a exportar", description: "Nenhum colaborador com líquido a pagar.", variant: "destructive" });
      return;
    }

    // Busca chave PIX dos colaboradores vinculados
    const employeeIds = Array.from(new Set(elegiveis.map((r) => r.employee_id).filter(Boolean))) as string[];
    const pixByEmployee = new Map<string, { key: string; type: string | null }>();
    if (employeeIds.length > 0) {
      const { data: emps, error: empErr } = await supabase
        .from("employees")
        .select("id, pix_key, pix_key_type")
        .in("id", employeeIds);
      if (empErr) {
        toast({ title: "Erro ao buscar chaves PIX", description: empErr.message, variant: "destructive" });
        return;
      }
      (emps ?? []).forEach((e: any) => {
        if (e.pix_key && String(e.pix_key).trim()) {
          pixByEmployee.set(e.id, { key: String(e.pix_key).trim(), type: e.pix_key_type ?? null });
        }
      });
    }

    const semVinculo = elegiveis.filter((r) => !r.employee_id);
    const semChave = elegiveis.filter((r) => r.employee_id && !pixByEmployee.has(r.employee_id!));
    const ignorados = [...semVinculo, ...semChave];
    if (ignorados.length > 0 && !opts.skipConfirm) {
      const nomes = ignorados.slice(0, 5).map((r) => r.full_name ?? "(sem nome)").join("\n- ");
      const ok = window.confirm(
        `${ignorados.length} colaborador(es) sem vínculo ou sem chave PIX serão IGNORADOS na exportação:\n\n- ${nomes}${ignorados.length > 5 ? "\n- ..." : ""}\n\nDeseja continuar?`
      );
      if (!ok) return;
    }

    const monthStr = `${refYear}-${String(refMonth).padStart(2, "0")}`;
    try {
      const { included } = await exportC6PixFile({
        rows: elegiveis.map((r) => {
          const pix = r.employee_id ? pixByEmployee.get(r.employee_id) : undefined;
          return {
            name: r.full_name ?? "",
            pixKey: pix?.key ?? "",
            pixKeyType: pix?.type ?? null,
            amount: Number(r.net_amount),
            description: `Folha ${monthStr}`,
          };
        }),
        fileName: `c6-folha-${monthStr}`,
      });
      if (included === 0) {
        toast({ title: "Sem chaves PIX", description: "Nenhum colaborador desta folha tem chave PIX cadastrada.", variant: "destructive" });
        return;
      }
      toast({ title: "Planilha C6 gerada", description: `${included} pagamento(s) prontos para upload no C6.` });

      // Marca a folha como exportada (trava o mês definitivamente).
      // Só persiste para folhas reais (importadas/consolidadas), não para a pseudo-meta "calculated-".
      if (meta && !meta.id.startsWith("calculated-")) {
        const nowIso = new Date().toISOString();
        const { error: updErr } = await (supabase as any)
          .from("payroll_imports")
          .update({ exported_at: nowIso, exported_by: user?.id ?? null })
          .eq("id", meta.id);
        if (updErr) {
          toast({ title: "Atenção", description: "Arquivo gerado, mas não foi possível travar a folha: " + updErr.message, variant: "destructive" });
        } else {
          setMeta({ ...meta, exported_at: nowIso, exported_by: user?.id ?? null });
        }
      }
    } catch (e: any) {
      toast({ title: "Falhou ao gerar", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const headerSlot = typeof document !== "undefined" ? document.getElementById("payroll-header-actions") : null;
  const headerActions = (
    <>
      {meta && rows.length > 0 && !isLocked && !allApproved && !isSentToAccounting && (
        <Button disabled title={`Revise todos os colaboradores (${reviewedCount}/${rows.length}) antes de confirmar a conferência`} className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white">
          <Lock className="h-4 w-4 mr-2" /> Aguardando contabilidade ({reviewedCount}/{rows.length})
        </Button>
      )}
      {meta && rows.length > 0 && !isLocked && allApproved && !isSentToAccounting && (
        <Button onClick={handleSendToAccounting} disabled={uploading} className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white" title="Confirmar a conferência e enviar para a contabilidade verificar dentro do sistema">
          <CheckCircle2 className="h-4 w-4 mr-2" /> Aguardando contabilidade
        </Button>
      )}
      {meta && rows.length > 0 && !isLocked && allApproved && isSentToAccounting && !isAccountingOk && (
        <Button disabled variant="outline" className="w-full sm:w-auto" title="A contabilidade está verificando a folha no painel /contabilidade. Quando aprovar, o botão Consolidar será liberado.">
          <Lock className="h-4 w-4 mr-2" /> Aguardando contabilidade…
        </Button>
      )}
      {meta && rows.length > 0 && !isLocked && isAccountingOk && (
        <Button onClick={handleOpenConsolidate} disabled={uploading} className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white" title="Consolidar a folha: gera o contas a pagar e o arquivo de envio para o C6 Bank">
          <Lock className="h-4 w-4 mr-2" /> Consolidar folha
        </Button>
      )}
      {meta && rows.length > 0 && isLocked && !isExported && (
        <Button onClick={handleOpenConsolidate} disabled={uploading} className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white" title="Continuar consolidação (assinaturas e exportação C6)">
          <Send className="h-4 w-4 mr-2" /> Continuar consolidação
        </Button>
      )}
    </>
  );

  return (
    <div className={cn("md:h-full md:min-h-0 flex flex-col gap-4", editLock.blockedByOther && "[&_button:not([data-lock-bypass])]:pointer-events-none [&_button:not([data-lock-bypass])]:opacity-60 [&_input]:pointer-events-none [&_[role=combobox]]:pointer-events-none")}>
      {headerSlot && createPortal(headerActions, headerSlot)}
      <div className="shrink-0 flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-6 lg:justify-between">
        {meta ? (
          <div className="flex-1 min-w-0 overflow-x-auto">
            <PayrollWorkflowStepper stage={workflowStage} />
          </div>
        ) : <div className="flex-1" />}
        <div className="flex flex-col gap-1 shrink-0">
          <Label className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" /> Mês de referência
          </Label>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="icon" onClick={goPrev} aria-label="Mês anterior" className="shrink-0 h-9 w-9" data-lock-bypass>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="capitalize text-sm font-medium min-w-[160px] text-center px-2">
              {fmtMonthLabel(refDate)}
              {isCurrentMonth && <span className="ml-1 text-primary text-xs normal-case">(atual)</span>}
            </span>
            <Button variant="outline" size="icon" onClick={goNext} aria-label="Próximo mês" className="shrink-0 h-9 w-9" disabled={isAtMax} data-lock-bypass>
              <ChevronRight className="h-4 w-4" />
            </Button>
            {!isCurrentMonth && (
              <Button variant="ghost" size="sm" onClick={goCurrent} className="text-xs h-9">Atual</Button>
            )}
          </div>
        </div>
      </div>
      {meta && !meta.id.startsWith("calculated-") && (
        <div className="shrink-0">
          <PayrollChangeRequestsPanel importId={meta.id} canReview={true} />
        </div>
      )}
      {/* Cabeçalho: mês + upload */}
      <div className="shrink-0 flex flex-col lg:flex-row lg:flex-wrap lg:items-end gap-3 lg:justify-end">
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xml,text/xml,application/xml"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
          />

          {/* Etapa 1 — sem folha do mês: ações ficam no cabeçalho da página */}

          {/* Os botões de fluxo (Conferido / Aguardando / Consolidar) foram movidos
              para o cabeçalho da página /folha via portal — ver bloco abaixo. */}

          {/* Etapa 4 — exportada: nenhum botão de ação (folha travada / somente leitura) */}

          {/* O seletor de colunas agora é acionado pelo botão fixo no cabeçalho da página (/folha). */}
          <Dialog open={columnsDialogOpen} onOpenChange={setColumnsDialogOpen}>
            <DialogContent className="max-w-sm p-0 gap-0">
              <DialogHeader className="p-4 border-b">
                <DialogTitle>Mostrar / ocultar colunas</DialogTitle>
              </DialogHeader>
              <p className="px-4 pt-3 text-[11px] text-muted-foreground">
                Desmarque para ocultar e facilitar o preenchimento.
              </p>
              <div className="max-h-72 overflow-y-auto p-2">
                {ALL_TOGGLEABLE.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                    <Checkbox
                      checked={isVisible(c.id)}
                      onCheckedChange={() => toggleCol(c.id)}
                    />
                    <span className="flex-1 truncate">{c.label}</span>
                  </label>
                ))}
              </div>
              {hiddenCols.size > 0 && (
                <div className="p-2 border-t">
                  <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setHiddenCols(new Set())}>
                    Mostrar todas
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Banner: outro usuário editando esta competência */}
      {editLock.blockedByOther && editLock.lock && (
        <div className="rounded-md border border-amber-500/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm flex flex-col gap-2 sm:flex-row sm:items-center">
          <Lock className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="flex-1">
            <strong>{editLock.lock.user_name ?? "Outro usuário"}</strong> está editando esta folha agora.
            Você está em modo <strong>somente leitura</strong> até a sessão ser liberada.
          </span>
          <Button
            size="sm"
            variant="outline"
            data-lock-bypass
            onClick={async () => {
              if (!confirm("Assumir o controle? O outro usuário perderá a edição.")) return;
              const ok = await editLock.acquire(true);
              if (ok) toast({ title: "Controle assumido" });
              else toast({ title: "Não foi possível assumir", variant: "destructive" });
            }}
          >
            Assumir controle
          </Button>
        </div>
      )}


      {/* Banner folha travada após exportação */}
      {meta && isExported && (
        <div className="rounded-md border border-slate-500/60 bg-slate-50 dark:bg-slate-900/40 px-3 py-2 text-sm flex items-center gap-2">
          <Lock className="h-4 w-4 text-slate-600" />
          <span className="flex-1">
            Folha <strong>encerrada</strong> e exportada para o C6 em {new Date(meta.exported_at!).toLocaleString("pt-BR")}.
            O mês está travado em modo somente leitura.
          </span>
        </div>
      )}

      {/* Banner de pendências */}
      {pending.length > 0 && (
        <div className="rounded-md border border-amber-500/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <span className="flex-1">
            <strong>{pending.length}</strong> colaborador(es) da folha sem vínculo no sistema. Use o botão <em>Vincular</em> ao lado de cada linha.
          </span>
        </div>
      )}

      {/* Banner consolidada */}
      {meta && isLocked && (
        <div className="rounded-md border border-emerald-500/60 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-sm flex flex-col sm:flex-row sm:items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span className="flex-1">
            Folha <strong>consolidada</strong> em {new Date(meta.consolidated_at!).toLocaleString("pt-BR")}.
            Lançamentos foram gerados em <strong>contas a pagar</strong>. A edição está bloqueada — clique em <em>Desconsolidar</em> para alterar.
          </span>
          <Button
            size="sm"
            variant="outline"
            data-lock-bypass
            onClick={async () => {
              try {
                toast({ title: "Enviando holerites…", description: "Gerando PDFs e disparando assinaturas." });
                const r = await sendSignaturesAction();
                toast({
                  title: "Holerites enviados",
                  description: `${r.generated} gerado(s)${r.skipped ? `, ${r.skipped} ignorado(s)` : ""}${r.errors ? `, ${r.errors} erro(s)` : ""}.`,
                });
              } catch (e: any) {
                toast({ title: "Falha ao enviar", description: e?.message ?? String(e), variant: "destructive" });
              }
            }}
          >
            <Send className="h-4 w-4 mr-1" /> Enviar holerites
          </Button>
        </div>
      )}

      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : !meta ? (
        <div className="text-center text-muted-foreground py-12 border rounded-md text-sm px-3">
          Nenhuma folha gerada para {fmtMonthLabel(refDate)}.<br />
          Clique em <strong>Gerar nova folha</strong> para iniciar.
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">A planilha enviada não possui colaboradores reconhecíveis.</div>
      ) : meta && rows.length > 0 && !isLocked && allApproved && !isAccountingOk && !forceShowList && !forceShowIndividualSheets ? (
        <div className="flex-1 min-h-0 flex items-center justify-center p-6 overflow-auto">
          <div className="w-full max-w-xl rounded-xl border bg-card p-8 text-center space-y-5">
            <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <div>
              <div className="text-lg font-semibold">
                {isSentToAccounting ? "Aguardando revisão contábil" : "Folha pronta para envio à contabilidade"}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Todos os {rows.length} colaboradores foram revisados e aprovados pelo gestor.
              </p>
            </div>

            {/* Totais */}
            <div className="grid grid-cols-2 gap-3 text-left">
              <div className="rounded-lg border bg-card px-3 py-2 col-span-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Colaboradores</div>
                <div className="text-base font-semibold">{rows.length}</div>
              </div>
              <div className="rounded-lg border bg-emerald-50/60 dark:bg-emerald-950/20 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total proventos</div>
                <div className="text-base font-semibold text-emerald-700 dark:text-emerald-400">{money(totals.earnings)}</div>
              </div>
              <div className="rounded-lg border bg-destructive/5 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total descontos</div>
                <div className="text-base font-semibold text-destructive">- {money(totals.discounts)}</div>
              </div>
              <div className="rounded-lg border bg-card px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">INSS</div>
                <div className="text-base font-semibold">{money(totals.inss)}</div>
              </div>
              <div className="rounded-lg border bg-card px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">IRRF</div>
                <div className="text-base font-semibold">{money(totals.irrf)}</div>
              </div>
              <div className="rounded-lg border bg-card px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">FGTS</div>
                <div className="text-base font-semibold">{money(totals.fgts)}</div>
              </div>
              <div className="rounded-lg border bg-primary/5 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Líquido a pagar</div>
                <div className="text-base font-bold text-emerald-600">{money(totals.net)}</div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {isSentToAccounting
                ? <>A folha foi enviada à contabilidade em {meta?.sent_to_accounting_at ? new Date(meta.sent_to_accounting_at).toLocaleString("pt-BR") : "—"}. Aguardando aprovação para liberar a consolidação.</>
                : <>Use o botão <strong>Conferido</strong> no topo da página para concluir a conferência e enviar para a contabilidade.</>}
            </p>

            <div className="flex flex-col sm:flex-row justify-center gap-2">
              <Button variant="outline" size="sm" data-lock-bypass onClick={() => { setForceShowIndividualSheets(true); setIndividualSheetIndex(0); }}>
                Ver folhas individuais (somente leitura)
              </Button>
              <Button variant="outline" size="sm" data-lock-bypass onClick={() => setForceShowList(true)}>
                Ver tabela completa (somente leitura)
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
        {(forceShowList || forceShowIndividualSheets) && allApproved && !isLocked && !isAccountingOk && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" data-lock-bypass onClick={() => { setForceShowList(false); setForceShowIndividualSheets(false); }}>
              ← Voltar ao resumo
            </Button>
          </div>
        )}
        {/* Mobile: cards */}
        <div className="md:hidden space-y-2">
          {displayRows.map((r) => {
            const isOpen = expanded.has(r.id) || (inReview && !allApproved) || showingIndividualReadOnly;
            const rubs = rubricsByRow[r.id] ?? [];
            return (
              <div key={r.id} className="rounded-lg border bg-card p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate flex items-center gap-1.5">
                      {r.full_name ?? "—"}
                      {!r.employee_id && (
                        <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-700">Sem vínculo</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.position ?? "—"}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-muted-foreground">Líquido</div>
                    <div className="font-bold">{money(r.net_amount)}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  {isVisible("earnings")  && <div className="rounded bg-muted/50 p-1.5"><div className="text-muted-foreground">Proventos</div><div className="font-medium">{money(r.total_earnings)}</div></div>}
                  {isVisible("discounts") && <div className="rounded bg-destructive/10 p-1.5"><div className="text-muted-foreground">Descontos</div><div className="text-destructive font-medium">- {money(r.total_discounts)}</div></div>}
                  {isVisible("inss") && r.inss_discount > 0 && <div className="rounded bg-muted/30 p-1.5"><div className="text-muted-foreground">INSS</div><div className="font-medium">{money(r.inss_discount)}</div></div>}
                  {isVisible("irrf") && r.irrf_discount > 0 && <div className="rounded bg-muted/30 p-1.5"><div className="text-muted-foreground">IRRF</div><div className="font-medium">{money(r.irrf_discount)}</div></div>}
                  {isVisible("fgts") && r.fgts_value > 0 && <div className="rounded bg-muted/30 p-1.5"><div className="text-muted-foreground">FGTS</div><div className="font-medium">{money(r.fgts_value)}</div></div>}
                </div>
                {(visibleEarningExtras.length + visibleDeductionExtras.length) > 0 && (
                  <div className="grid grid-cols-2 gap-1.5 text-xs border-t pt-2">
                    {[...visibleEarningExtras, ...visibleDeductionExtras].map((c) => (
                      <div key={c.key} className="rounded bg-muted/30 p-1.5">
                        <div className={`text-[10px] ${c.kind === "deduction" ? "text-destructive" : "text-emerald-600"}`}>
                          {c.label} {c.kind === "deduction" ? "(desc.)" : "(adic.)"}
                        </div>
                        <EditableExtraCell
                          value={extraValue(r.id, c)}
                          kind={c.kind}
                          locked={isLocked || showingReadOnlyPayrollView}
                          onSave={(nv) => saveExtraValue(r.id, c, nv)}
                        />
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5 [&>button]:h-9">
                  {!r.employee_id && !showingIndividualReadOnly && (
                    <Button size="sm" variant="outline" onClick={() => openLink(r)} className="w-full justify-start">
                      <Link2 className="h-3.5 w-3.5 mr-1" /> Vincular
                    </Button>
                  )}
                  {rubs.length > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => toggleExpand(r.id)} className="w-full justify-start">
                      {isOpen ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
                      {rubs.length} rubrica(s)
                    </Button>
                  )}
                  {showingIndividualReadOnly && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setIndividualSheetIndex((prev) => Math.max(prev - 1, 0))} disabled={individualSheetIndex === 0} data-lock-bypass aria-label="Folha individual anterior">
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setIndividualSheetIndex((prev) => Math.min(prev + 1, rows.length - 1))} disabled={individualSheetIndex >= rows.length - 1} data-lock-bypass aria-label="Próxima folha individual">
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                  {!isLocked && !showingIndividualReadOnly && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteRow(r)}
                      className="w-10 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      aria-label="Excluir colaborador da folha"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {inReview && !allApproved && reviewedCount > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={goPreviousReview}
                      className="w-10 shrink-0"
                      aria-label="Voltar ao colaborador anterior"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {inReview && !allApproved && (
                    <Button
                      size="sm"
                      onClick={() => approveRow(r.id)}
                      className="min-w-20 flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                      aria-label="Aprovar colaborador e ir para o próximo"
                    >
                      <Check className="h-3.5 w-3.5 mr-1" /> OK
                    </Button>
                  )}
                </div>
                {isOpen && rubs.length > 0 && (
                  <div className="border-t pt-2 space-y-1">
                    {rubs.map((rb) => (
                      <div key={rb.id} className="flex justify-between gap-2 text-xs">
                        <span className="truncate">
                          {rb.code && <span className="text-muted-foreground">{rb.code} </span>}
                          {rb.description}
                        </span>
                        <span className={
                          rb.kind === "deduction" ? "text-destructive font-medium" :
                          rb.kind === "earning" ? "text-foreground font-medium" :
                          "text-muted-foreground"
                        }>
                          {rb.kind === "deduction" ? "- " : ""}{money(rb.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Desktop: ficha de revisão (um colaborador por vez) */}
        {showIndividualSheet && (() => {
          const r = displayRows[0];
          const rubs = rubricsByRow[r.id] ?? [];
          const earnings = rubs.filter((rb) => rb.kind === "earning");
          const deductions = rubs.filter((rb) => rb.kind === "deduction");
          const info = rubs.filter((rb) => rb.kind !== "earning" && rb.kind !== "deduction");
          return (
            <div className="hidden md:flex flex-1 min-h-0 overflow-y-auto">
              <div className="w-full max-w-5xl mx-auto p-3 flex flex-col gap-2">
                {/* Cabeçalho do colaborador */}
                <div className="rounded-lg border bg-card px-4 py-2 flex items-center justify-between gap-4 shrink-0">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {showingIndividualReadOnly ? `Folha individual ${individualSheetIndex + 1}/${rows.length}` : "Revisando colaborador"}
                    </div>
                    <div className="text-lg font-bold truncate flex items-center gap-2 leading-tight">
                      {r.full_name ?? "—"}
                      {!r.employee_id && (
                        <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-700">Sem vínculo</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{r.position ?? "—"}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Líquido a pagar</div>
                    <div className="text-2xl font-bold text-emerald-600 leading-tight">{money(r.net_amount)}</div>
                  </div>
                </div>

                {/* Período trabalhado e salário base (somente visualização) */}
                <div className="rounded-md border bg-muted/30 px-3 py-2 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs shrink-0">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Período trabalhado</div>
                    <div className="font-medium">
                      {(() => {
                        const y = refDate.getFullYear();
                        const m = refDate.getMonth();
                        const lastDay = new Date(y, m + 1, 0);
                        const adm = r.admission_date ? new Date(r.admission_date + "T00:00:00") : null;
                        const start = adm && adm.getFullYear() === y && adm.getMonth() === m ? adm : new Date(y, m, 1);
                        const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
                        return `${fmt(start)} a ${fmt(lastDay)}`;
                      })()}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Salário base contratual</div>
                    <div className="font-medium">{money(r.base_salary || r.salary)}</div>
                  </div>
                  {r.base_salary > 0 && Math.abs(r.base_salary - r.salary) > 0.01 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Salário proporcional</div>
                      <div className="font-medium">{money(r.salary)}</div>
                    </div>
                  )}
                </div>
                {/* KPIs principais — uma linha */}
                <div className="grid grid-cols-5 gap-2 shrink-0">
                  {isVisible("earnings") && (
                    <div className="rounded-md border bg-emerald-50/60 dark:bg-emerald-950/20 px-2 py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Proventos</div>
                      <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{money(r.total_earnings)}</div>
                    </div>
                  )}
                  {isVisible("discounts") && (
                    <div className="rounded-md border bg-destructive/5 px-2 py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Descontos</div>
                      <div className="text-sm font-semibold text-destructive">- {money(r.total_discounts)}</div>
                    </div>
                  )}
                  {isVisible("inss") && (
                    <div className="rounded-md border bg-card px-2 py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">INSS</div>
                      <div className="text-sm font-semibold">{money(r.inss_discount)}</div>
                    </div>
                  )}
                  {isVisible("irrf") && (
                    <div className="rounded-md border bg-card px-2 py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">IRRF</div>
                      <div className="text-sm font-semibold">{money(r.irrf_discount)}</div>
                    </div>
                  )}
                  {isVisible("fgts") && (
                    <div className="rounded-md border bg-card px-2 py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">FGTS</div>
                      <div className="text-sm font-semibold">{money(r.fgts_value)}</div>
                    </div>
                  )}
                </div>

                {/* Adicionais e descontos editáveis (extras) */}
                {(visibleEarningExtras.length + visibleDeductionExtras.length) > 0 && (
                  <div className="rounded-lg border bg-card px-3 py-2 shrink-0">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                      Adicionais e descontos editáveis
                    </div>
                    <div className="grid grid-cols-3 lg:grid-cols-4 gap-2">
                      {visibleEarningExtras.map((c) => (
                        <div key={c.key} className="rounded bg-muted/40 px-2 py-1">
                          <div className="text-[10px] text-emerald-600 font-medium leading-tight truncate">{c.label}</div>
                          <EditableExtraCell
                            value={extraValue(r.id, c)}
                            kind={c.kind}
                            locked={isLocked || showingReadOnlyPayrollView}
                            onSave={(nv) => saveExtraValue(r.id, c, nv)}
                          />
                        </div>
                      ))}
                      {visibleDeductionExtras.map((c) => (
                        <div key={c.key} className="rounded bg-muted/40 px-2 py-1">
                          <div className="text-[10px] text-destructive font-medium leading-tight truncate">{c.label}</div>
                          <EditableExtraCell
                            value={extraValue(r.id, c)}
                            kind={c.kind}
                            locked={isLocked || showingReadOnlyPayrollView}
                            onSave={(nv) => saveExtraValue(r.id, c, nv)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rubricas detalhadas — área flexível com scroll interno */}
                {rubs.length > 0 && (
                  <div className="rounded-lg border bg-card px-3 py-2 flex flex-col">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 shrink-0">
                      Rubricas detalhadas
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-0">
                      <div>
                        <div className="text-[11px] font-semibold text-emerald-600 border-b pb-0.5 mb-0.5 sticky top-0 bg-card">Proventos</div>
                        {earnings.length === 0 ? (
                          <div className="text-xs text-muted-foreground italic py-0.5">Sem rubricas</div>
                        ) : earnings.map((rb) => (
                          <div key={rb.id} className="flex justify-between gap-2 text-xs border-b border-border/40 py-0.5">
                            <span className="truncate">
                              {rb.code && <span className="text-muted-foreground mr-1">{rb.code}</span>}
                              {rb.description}
                              {rb.reference && <span className="text-muted-foreground ml-1">({rb.reference})</span>}
                            </span>
                            <span className="font-medium">{money(rb.value)}</span>
                          </div>
                        ))}
                        {info.length > 0 && (
                          <>
                            <div className="text-[11px] font-semibold text-muted-foreground border-b pb-0.5 mb-0.5 mt-2">Informativos</div>
                            {info.map((rb) => (
                              <div key={rb.id} className="flex justify-between gap-2 text-xs border-b border-border/40 py-0.5">
                                <span className="truncate">
                                  {rb.code && <span className="text-muted-foreground mr-1">{rb.code}</span>}
                                  {rb.description}
                                </span>
                                <span className="text-muted-foreground italic">{money(rb.value)}</span>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold text-destructive border-b pb-0.5 mb-0.5 sticky top-0 bg-card">Descontos</div>
                        {deductions.length === 0 ? (
                          <div className="text-xs text-muted-foreground italic py-0.5">Sem rubricas</div>
                        ) : deductions.map((rb) => (
                          <div key={rb.id} className="flex justify-between gap-2 text-xs border-b border-border/40 py-0.5">
                            <span className="truncate">
                              {rb.code && <span className="text-muted-foreground mr-1">{rb.code}</span>}
                              {rb.description}
                              {rb.reference && <span className="text-muted-foreground ml-1">({rb.reference})</span>}
                            </span>
                            <span className="text-destructive font-medium">- {money(rb.value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Ações */}
                <div className="flex items-center justify-end gap-2 shrink-0">
                  {showingIndividualReadOnly && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIndividualSheetIndex((prev) => Math.max(prev - 1, 0))}
                      disabled={individualSheetIndex === 0}
                      title="Folha individual anterior"
                      data-lock-bypass
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                    </Button>
                  )}
                  {!showingIndividualReadOnly && reviewedCount > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={goPreviousReview}
                      title="Voltar ao colaborador anterior"
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                    </Button>
                  )}
                  {!r.employee_id && !showingIndividualReadOnly && (
                    <Button size="sm" variant="outline" onClick={() => openLink(r)}>
                      <Link2 className="h-4 w-4 mr-1" /> Vincular
                    </Button>
                  )}
                  {!isLocked && !showingIndividualReadOnly && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteRow(r)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4 mr-1" /> Remover
                    </Button>
                  )}
                  {showingIndividualReadOnly ? (
                    <Button
                      onClick={() => setIndividualSheetIndex((prev) => Math.min(prev + 1, rows.length - 1))}
                      disabled={individualSheetIndex >= rows.length - 1}
                      className="px-5"
                      data-lock-bypass
                    >
                      Próxima <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  ) : (
                    <Button
                      onClick={() => approveRow(r.id)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-5"
                    >
                      <Check className="h-4 w-4 mr-1" /> Aprovar e próximo
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Desktop: tabela (visão geral / após revisão) */}
        <div className={`${showIndividualSheet ? "hidden" : "hidden md:block"} flex-1 min-h-0 overflow-auto [&_table]:text-xs [&_td]:px-2 [&_td]:py-6 [&_th]:px-2 [&_th]:py-2 [&_th]:h-auto [&_th]:align-bottom`}>
          <PayrollTable>
            <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-background [&_th]:shadow-[inset_0_-1px_0_hsl(var(--border))]">
              <TableRow>
                <TableHead className="w-8"></TableHead>
                
                <TableHead className="min-w-[140px]">Colaborador</TableHead>
                {isVisible("position") && <TableHead className="min-w-[90px]">Cargo</TableHead>}
                {isVisible("worked_days") && <TableHead className="text-center min-w-[60px]">Dias trab.</TableHead>}
                {isVisible("earnings") && <TableHead className="text-right">Proventos</TableHead>}
                {isVisible("inss") && <TableHead className="text-right">INSS</TableHead>}
                {isVisible("irrf") && <TableHead className="text-right">IRRF</TableHead>}
                {isVisible("fgts") && <TableHead className="text-right">FGTS</TableHead>}
                {visibleEarningExtras.map((c) => (
                  <TableHead key={c.key} className="text-right max-w-[80px] leading-tight">
                    <span className="text-emerald-600 block whitespace-normal break-words">{c.label}</span>
                  </TableHead>
                ))}
                {visibleDeductionExtras.map((c) => (
                  <TableHead key={c.key} className="text-right max-w-[80px] leading-tight">
                    <span className="text-destructive block whitespace-normal break-words">{c.label}</span>
                  </TableHead>
                ))}
                {isVisible("discounts") && (
                  <TableHead className="text-right max-w-[80px] leading-tight">
                    <span className="block whitespace-normal break-words">Total Descontos</span>
                  </TableHead>
                )}
                <TableHead className="text-right">Líquido</TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayRows.map((r) => {
                const isOpen = expanded.has(r.id) || (inReview && !allApproved);
                const rubs = rubricsByRow[r.id] ?? [];
                return (
                  <Fragment key={r.id}>
                  <TableRow className={!r.employee_id ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}>
                    <TableCell>
                      {rubs.length > 0 && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleExpand(r.id)}>
                          {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                    </TableCell>
                    
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {r.full_name ?? "—"}
                        {!r.employee_id && !showingReadOnlyPayrollView && (
                          <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-700">Sem vínculo</Badge>
                        )}
                      </div>
                    </TableCell>
                    {isVisible("position") && <TableCell className="text-xs">{r.position ?? "—"}</TableCell>}
                    {isVisible("worked_days") && <TableCell className="text-center font-mono">{r.worked_days ?? "—"}</TableCell>}
                    {isVisible("earnings") && <TableCell className="text-right">{money(r.total_earnings)}</TableCell>}
                    {isVisible("inss") && <TableCell className="text-right">{money(r.inss_discount)}</TableCell>}
                    {isVisible("irrf") && <TableCell className="text-right">{money(r.irrf_discount)}</TableCell>}
                    {isVisible("fgts") && <TableCell className="text-right">{money(r.fgts_value)}</TableCell>}
                    {visibleEarningExtras.map((c) => (
                      <TableCell key={c.key} className="text-right p-1">
                        <EditableExtraCell
                          value={extraValue(r.id, c)}
                          kind={c.kind}
                          locked={isLocked || showingReadOnlyPayrollView}
                          onSave={(nv) => saveExtraValue(r.id, c, nv)}
                        />
                      </TableCell>
                    ))}
                    {visibleDeductionExtras.map((c) => (
                      <TableCell key={c.key} className="text-right p-1">
                        <EditableExtraCell
                          value={extraValue(r.id, c)}
                          kind={c.kind}
                          locked={isLocked || showingReadOnlyPayrollView}
                          onSave={(nv) => saveExtraValue(r.id, c, nv)}
                        />
                      </TableCell>
                    ))}
                    {isVisible("discounts") && <TableCell className="text-right text-destructive">- {money(r.total_discounts)}</TableCell>}
                    <TableCell className="text-right font-bold">{money(r.net_amount)}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {!r.employee_id && (
                          <Button size="sm" variant="outline" onClick={() => openLink(r)}>
                            <Link2 className="h-3.5 w-3.5 mr-1" /> Vincular
                          </Button>
                        )}
                        {!isLocked && !showingReadOnlyPayrollView && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteRow(r)}
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            aria-label="Excluir colaborador da folha"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {inReview && !allApproved && (
                          <Button
                            size="sm"
                            onClick={() => approveRow(r.id)}
                            className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                            aria-label="Aprovar colaborador e ir para o próximo"
                          >
                            <Check className="h-3.5 w-3.5 mr-1" /> OK
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {isOpen && rubs.length > 0 && (
                    <TableRow>
                      <TableCell colSpan={4 + ["position","worked_days","earnings","inss","irrf","fgts","discounts"].filter((id) => isVisible(id as ColumnId)).length + visibleEarningExtras.length + visibleDeductionExtras.length} className="bg-muted/30 p-3">
                        <div className="text-xs font-semibold mb-2">Rubricas detalhadas</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">
                          {rubs.map((rb) => (
                            <div key={rb.id} className="flex justify-between gap-2 text-xs border-b border-border/50 py-0.5">
                              <span className="truncate">
                                {rb.code && <span className="text-muted-foreground mr-1">{rb.code}</span>}
                                {rb.description}
                                {rb.reference && <span className="text-muted-foreground ml-1">({rb.reference})</span>}
                              </span>
                              <span className={
                                rb.kind === "deduction" ? "text-destructive font-medium" :
                                rb.kind === "earning" ? "font-medium" :
                                "text-muted-foreground italic"
                              }>
                                {rb.kind === "deduction" ? "- " : ""}{money(rb.value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  </Fragment>
                );
              })}
            </TableBody>
            {(!inReview || allApproved) && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2 + (isVisible("position") ? 1 : 0)} className="font-semibold">Totais</TableCell>
                  {isVisible("worked_days") && <TableCell></TableCell>}
                  {isVisible("earnings") && <TableCell className="text-right font-semibold">{money(totals.earnings)}</TableCell>}
                  {isVisible("inss") && <TableCell className="text-right">{money(totals.inss)}</TableCell>}
                  {isVisible("irrf") && <TableCell className="text-right">{money(totals.irrf)}</TableCell>}
                  {isVisible("fgts") && <TableCell className="text-right">{money(totals.fgts)}</TableCell>}
                  {visibleEarningExtras.map((c) => (
                    <TableCell key={c.key} className="text-right font-semibold">
                      {extraTotals[c.key] > 0 ? money(extraTotals[c.key]) : "—"}
                    </TableCell>
                  ))}
                  {visibleDeductionExtras.map((c) => (
                    <TableCell key={c.key} className="text-right font-semibold text-destructive">
                      {extraTotals[c.key] > 0 ? `- ${money(extraTotals[c.key])}` : "—"}
                    </TableCell>
                  ))}
                  {isVisible("discounts") && <TableCell className="text-right text-destructive font-semibold">- {money(totals.discounts)}</TableCell>}
                  <TableCell className="text-right font-bold">{money(totals.net)}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableFooter>
            )}
          </PayrollTable>
        </div>
        </>
      )}

      {/* Dialog sequencial de consolidação: contas a pagar → assinaturas → C6 */}
      <ConsolidateSequentialDialog
        open={consolidateDialogOpen}
        onOpenChange={setConsolidateDialogOpen}
        monthLabel={fmtMonthLabel(refDate)}
        stepPayables={stepPayables}
        stepSignatures={stepSignatures}
        stepC6={stepC6}
        onRunPayables={runStepPayables}
        onRunSignatures={runStepSignatures}
        onRunC6={runStepC6}
      />

      {/* Modal de vínculo */}
      <Dialog open={!!linkDialog} onOpenChange={(o) => !o && setLinkDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular ao colaborador</DialogTitle>
          </DialogHeader>
          {linkDialog && (
            <div className="space-y-3">
              <div className="rounded border bg-muted/30 p-2 text-sm">
                <div><strong>Folha:</strong> {linkDialog.full_name ?? "—"}</div>
                <div className="text-xs text-muted-foreground">
                  {linkDialog.registration_number && <>Matrícula {linkDialog.registration_number} · </>}
                  {linkDialog.cpf && <>CPF {linkDialog.cpf} · </>}
                  {linkDialog.position}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Selecione o colaborador</Label>
                <Select value={linkSelection} onValueChange={setLinkSelection}>
                  <SelectTrigger><SelectValue placeholder="Buscar..." /></SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.full_name}{e.registration_number ? ` (mat. ${e.registration_number})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {linkDialog.registration_number && (
                  <p className="text-[11px] text-muted-foreground">
                    A matrícula <strong>{linkDialog.registration_number}</strong> será gravada no cadastro do colaborador (se ele ainda não tiver uma).
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialog(null)}>Cancelar</Button>
            <Button onClick={confirmLink} disabled={!linkSelection}>Vincular</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: marcar feriados trabalhados (colaboradores dispensados de ponto) */}
    </div>
  );
}
