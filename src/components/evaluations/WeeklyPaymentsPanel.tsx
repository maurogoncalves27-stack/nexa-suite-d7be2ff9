import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { exportC6PixFile } from "@/lib/c6Export";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, ShieldAlert, Check, FileSpreadsheet, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

const BONIFICACAO_CATEGORY_ID = "91ac9252-07dd-4426-8b4c-40393064f256";

interface EmployeeRow {
  id: string;
  full_name: string;
  position: string | null;
  store_id: string;
  admission_date: string | null;
  hire_date: string | null;
  created_at: string | null;
  cpf: string | null;
  pix_key: string | null;
  pix_key_type: string | null;
  bank_name: string | null;
  bank_agency: string | null;
  bank_account: string | null;
  contracting_store?: { name: string } | null;
}
interface PositionBonusRow {
  position_id: string;
  bonus_amount: number;
}
interface PositionRow {
  id: string;
  name: string;
  cbo_code: string | null;
  cbo_title: string | null;
}
interface InfractionRow {
  id: string;
  employee_id: string;
  occurred_on: string;
  applied_weight: number;
}
interface SuspensionRow {
  id: string;
  employee_id: string;
  suspension_start_date: string;
  suspension_end_date: string;
}
interface AdjustmentRow {
  id: string;
  employee_id: string;
  week_start: string;
  amount: number;
  notes: string | null;
}

interface WeeklyPaymentsPanelProps {
  weekStart: Date;
}

// Cada ponto de infração desconta 1% do bônus do cargo.
const REAIS_PER_POINT = 1;

const money = (v: number) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const weekStartOf = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
};

const weekEndOf = (weekStart: Date): Date => {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
};

const isoDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export default function WeeklyPaymentsPanel({ weekStart }: WeeklyPaymentsPanelProps) {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [positionBonuses, setPositionBonuses] = useState<PositionBonusRow[]>([]);
  const [infractions, setInfractions] = useState<InfractionRow[]>([]);
  const [suspensions, setSuspensions] = useState<SuspensionRow[]>([]);
  const [adjustments, setAdjustments] = useState<Record<string, AdjustmentRow>>({});
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [launchingPayables, setLaunchingPayables] = useState(false);

  const normalizedWeekStart = useMemo(() => weekStartOf(weekStart), [weekStart]);
  const weekEnd = useMemo(() => weekEndOf(normalizedWeekStart), [normalizedWeekStart]);
  const startIso = useMemo(() => isoDate(normalizedWeekStart), [normalizedWeekStart]);
  const endIso = useMemo(() => isoDate(weekEnd), [weekEnd]);

  const load = async () => {
    setLoading(true);
    const [
      { data: emps, error: ee },
      { data: pbs },
      { data: poss },
      { data: infs, error: ie },
      { data: susps, error: se },
      { data: adjs, error: ae },
    ] = await Promise.all([
      supabase
        .from("employees")
        .select("id, full_name, position, store_id, admission_date, hire_date, created_at, cpf, pix_key, pix_key_type, bank_name, bank_agency, bank_account, contracting_store:stores!employees_store_id_fkey(name)")
        .eq("status", "active")
        .order("full_name"),
      supabase.from("position_bonuses").select("position_id, bonus_amount"),
      supabase.from("positions").select("id, name, cbo_code, cbo_title").eq("is_active", true),
      supabase
        .from("employee_infractions")
        .select("id, employee_id, occurred_on, applied_weight")
        .gte("occurred_on", startIso)
        .lte("occurred_on", endIso),
      supabase
        .from("employee_infractions")
        .select("id, employee_id, suspension_start_date, suspension_end_date")
        .gt("suspension_weeks", 0)
        .is("suspension_revoked_at", null)
        .lte("suspension_start_date", endIso)
        .gte("suspension_end_date", startIso),
      supabase
        .from("weekly_payment_adjustments")
        .select("id, employee_id, week_start, amount, notes")
        .eq("week_start", startIso),
    ]);
    if (ee) toast({ title: "Erro", description: ee.message, variant: "destructive" });
    if (ie) toast({ title: "Erro", description: ie.message, variant: "destructive" });
    if (se) toast({ title: "Erro", description: se.message, variant: "destructive" });
    if (ae) toast({ title: "Erro", description: ae.message, variant: "destructive" });
    setEmployees((emps ?? []) as unknown as EmployeeRow[]);
    setPositionBonuses((pbs ?? []) as PositionBonusRow[]);
    setPositions((poss ?? []) as PositionRow[]);
    setInfractions((infs ?? []) as InfractionRow[]);
    setSuspensions((susps ?? []) as SuspensionRow[]);
    const map: Record<string, AdjustmentRow> = {};
    const dr: Record<string, string> = {};
    for (const a of (adjs ?? []) as AdjustmentRow[]) {
      map[a.employee_id] = a;
      dr[a.employee_id] = String(a.amount);
    }
    setAdjustments(map);
    setDrafts(dr);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [startIso, endIso]);

  // Resolve o bônus do cargo do colaborador.
  // O vínculo oficial é position_bonuses.position_id → positions.id.
  // Como employees.position armazena o NOME (string), mapeamos:
  //   employee.position (nome ou cbo_title) → positions.id → bonus_amount
  const resolveBonusForPosition = useMemo(() => {
    const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
    const bonusByPositionId: Record<string, number> = {};
    for (const pb of positionBonuses) bonusByPositionId[pb.position_id] = Number(pb.bonus_amount);

    const positionIdByKey: Record<string, string> = {};
    for (const p of positions) {
      positionIdByKey[norm(p.name)] = p.id;
      if (p.cbo_title) positionIdByKey[norm(p.cbo_title)] = p.id;
    }

    return (empPosition: string | null | undefined): number => {
      const key = norm(empPosition);
      if (!key) return 0;
      const pid = positionIdByKey[key];
      if (!pid) return 0;
      return bonusByPositionId[pid] ?? 0;
    };
  }, [positionBonuses, positions]);

  const infractionsByEmp = useMemo(() => {
    const map: Record<string, { points: number; count: number }> = {};
    for (const i of infractions) {
      const cur = map[i.employee_id] ?? { points: 0, count: 0 };
      cur.points += Number(i.applied_weight);
      cur.count += 1;
      map[i.employee_id] = cur;
    }
    return map;
  }, [infractions]);

  const suspensionByEmp = useMemo(() => {
    const map: Record<string, SuspensionRow> = {};
    for (const s of suspensions) {
      const cur = map[s.employee_id];
      if (!cur || s.suspension_end_date > cur.suspension_end_date) {
        map[s.employee_id] = s;
      }
    }
    return map;
  }, [suspensions]);

  const rows = useMemo(() => {
    return employees.map((e) => {
      const pos = e.position?.trim() ?? "";
      const bonusBaseRaw = resolveBonusForPosition(pos);

      // Regra: só tem direito a bônus após 15 dias completos como ativo.
      // Usamos admission_date > hire_date > created_at e comparamos com o fim da semana.
      const activeSinceStr = e.admission_date ?? e.hire_date ?? e.created_at ?? null;
      let ineligibleNewbie = false;
      if (activeSinceStr) {
        const since = new Date(
          activeSinceStr.length === 10 ? activeSinceStr + "T00:00:00" : activeSinceStr,
        );
        const diffDays = Math.floor((weekEnd.getTime() - since.getTime()) / 86400000);
        ineligibleNewbie = diffDays < 15;
      }
      const bonusBase = ineligibleNewbie ? 0 : bonusBaseRaw;

      const inf = infractionsByEmp[e.id] ?? { points: 0, count: 0 };
      const susp = suspensionByEmp[e.id] ?? null;
      const descontoRaw = inf.points * REAIS_PER_POINT;
      const desconto = +Math.min(bonusBase, descontoRaw).toFixed(2);
      const adj = Number(adjustments[e.id]?.amount ?? 0);
      const liquidoBase = Math.max(0, bonusBase - desconto + adj);
      const liquido = susp ? 0 : liquidoBase;
      return {
        id: e.id,
        employee: e,
        full_name: e.full_name,
        position: pos || "—",
        store: e.contracting_store?.name ?? "—",
        store_id: e.store_id,
        bonus: bonusBase,
        points: inf.points,
        percent: 0,
        count: inf.count,
        desconto,
        adjustment: adj,
        ineligibleNewbie,
        liquido,
        suspendedUntil: susp?.suspension_end_date ?? null,
      };
    });
  }, [employees, resolveBonusForPosition, infractionsByEmp, suspensionByEmp, adjustments, weekEnd]);

  const totals = useMemo(() => {
    let bonus = 0, desconto = 0, liquido = 0, adj = 0;
    rows.forEach((r) => { bonus += r.bonus; desconto += r.desconto; liquido += r.liquido; adj += r.adjustment; });
    return { bonus, desconto, liquido, adj };
  }, [rows]);

  const saveAdjustment = async (employeeId: string) => {
    const raw = (drafts[employeeId] ?? "").replace(",", ".").trim();
    const amount = raw === "" ? 0 : Number(raw);
    if (Number.isNaN(amount)) {
      toast({ title: "Valor inválido", description: "Informe um número (use - para desconto).", variant: "destructive" });
      return;
    }
    setSavingId(employeeId);
    const { data: { user } } = await supabase.auth.getUser();
    const existing = adjustments[employeeId];

    if (amount === 0 && existing) {
      const { error } = await supabase
        .from("weekly_payment_adjustments")
        .delete()
        .eq("id", existing.id);
      setSavingId(null);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      const next = { ...adjustments };
      delete next[employeeId];
      setAdjustments(next);
      toast({ title: "Ajuste removido" });
      return;
    }

    const { data, error } = await supabase
      .from("weekly_payment_adjustments")
      .upsert(
        {
          employee_id: employeeId,
          week_start: startIso,
          amount,
          created_by: user?.id ?? null,
        },
        { onConflict: "employee_id,week_start" },
      )
      .select()
      .single();

    setSavingId(null);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setAdjustments((prev) => ({ ...prev, [employeeId]: data as AdjustmentRow }));
    toast({ title: "Ajuste salvo" });
  };

  const isDirty = (employeeId: string) => {
    const cur = String(adjustments[employeeId]?.amount ?? "");
    const draft = (drafts[employeeId] ?? "").replace(",", ".");
    if (draft === "" && cur === "") return false;
    if (draft === "" && Number(cur) === 0) return false;
    return draft !== cur;
  };

  const payableRows = useMemo(() => rows.filter((r) => !r.suspendedUntil && r.liquido > 0), [rows]);
  const payableTotal = useMemo(() => payableRows.reduce((s, r) => s + r.liquido, 0), [payableRows]);

  const exportBonusSheet = async () => {
    if (payableRows.length === 0) {
      toast({ title: "Nada a exportar", description: "Nenhum colaborador com líquido a pagar nesta semana.", variant: "destructive" });
      return;
    }

    const semChave = payableRows.filter((r) => !r.employee.pix_key || !r.employee.pix_key.trim());
    if (semChave.length > 0) {
      const nomes = semChave.slice(0, 5).map((r) => r.full_name).join("\n- ");
      const ok = window.confirm(
        `${semChave.length} colaborador(es) sem chave PIX cadastrada serão IGNORADOS na exportação:\n\n- ${nomes}${semChave.length > 5 ? "\n- ..." : ""}\n\nDeseja continuar?`
      );
      if (!ok) return;
    }

    setExporting(true);
    try {
      const periodoBR = `${normalizedWeekStart.toLocaleDateString("pt-BR")} a ${weekEnd.toLocaleDateString("pt-BR")}`;
      const { included } = await exportC6PixFile({
        rows: payableRows.map((r) => ({
          name: r.full_name,
          pixKey: r.employee.pix_key ?? "",
          pixKeyType: r.employee.pix_key_type ?? null,
          amount: r.liquido,
          description: `Bonificação ${periodoBR}`,
        })),
        fileName: `c6-bonificacoes-${startIso}`,
      });

      if (included === 0) {
        toast({ title: "Sem chaves PIX", description: "Nenhum colaborador a pagar tem chave PIX cadastrada.", variant: "destructive" });
        return;
      }
      toast({
        title: "Planilha C6 gerada",
        description: `${included} pagamento(s) prontos para upload no C6.`,
      });
    } catch (e: any) {
      toast({ title: "Falhou ao gerar", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const launchBonusPayables = async () => {
    if (payableRows.length === 0) {
      toast({ title: "Nada a lançar", description: "Nenhum colaborador com líquido a pagar nesta semana.", variant: "destructive" });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const periodoBR = `${normalizedWeekStart.toLocaleDateString("pt-BR")} a ${weekEnd.toLocaleDateString("pt-BR")}`;
    const descTag = `Bonificação ${periodoBR}`;

    const { data: existing } = await supabase
      .from("accounts_payable")
      .select("supplier_name, description")
      .eq("category_id", BONIFICACAO_CATEGORY_ID)
      .like("description", `%${normalizedWeekStart.toLocaleDateString("pt-BR")}%`);

    const dupNames = new Set<string>();
    (existing ?? []).forEach((p: any) => {
      if (payableRows.some((r) => r.full_name === p.supplier_name)) dupNames.add(p.supplier_name);
    });

    let confirmMsg = `Lançar ${payableRows.length} pagamento(s) de bonificação no contas a pagar?\n\nVencimento: ${new Date().toLocaleDateString("pt-BR")} (hoje).\nReferente à semana ${periodoBR}.\nTotal: ${money(payableTotal)}.`;
    if (dupNames.size > 0) {
      confirmMsg += `\n\n⚠️ Já existem ${dupNames.size} lançamento(s) desta semana (serão duplicados):\n- ${Array.from(dupNames).slice(0, 5).join("\n- ")}${dupNames.size > 5 ? "\n- ..." : ""}`;
    }
    if (!window.confirm(confirmMsg)) return;

    setLaunchingPayables(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        toast({ title: "Erro", description: "Usuário não autenticado.", variant: "destructive" });
        return;
      }

      // Centro de custo = loja alocada do colaborador (Fábrica como padrão)
      const resolvedStoreIds = await Promise.all(
        payableRows.map(async (r) => {
          const { data } = await (supabase as any).rpc("get_employee_cost_center_by_name", {
            _full_name: r.full_name,
          });
          return (data as string | null) ?? r.store_id ?? null;
        }),
      );

      const inserts = payableRows
        .map((r, i) => ({
          store_id: resolvedStoreIds[i],
          category_id: BONIFICACAO_CATEGORY_ID,
          supplier_name: r.full_name,
          description: descTag,
          amount: Number(r.liquido.toFixed(2)),
          due_date: today,
          status: "pending" as const,
          installment_number: 1,
          created_by: user.id,
        }))
        .filter((r) => r.store_id);

      if (inserts.length === 0) {
        toast({ title: "Sem loja vinculada", description: "Nenhum colaborador tem loja e nenhuma loja física padrão foi encontrada.", variant: "destructive" });
        return;
      }

      const { error: insErr } = await supabase.from("accounts_payable").insert(inserts as any);
      if (insErr) {
        toast({ title: "Falhou ao lançar contas a pagar", description: insErr.message, variant: "destructive" });
        return;
      }

      toast({ title: "Lançado", description: `${inserts.length} pagamento(s) criado(s) no contas a pagar.` });
    } finally {
      setLaunchingPayables(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Ações: exportar planilha + lançar a pagar (sticky no topo) */}
      <div className="sticky top-0 z-10 -mx-3 md:-mx-4 px-3 md:px-4 py-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b">
        <div className="flex flex-row gap-2 items-center justify-between">
          <div className="text-sm min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">A pagar</div>
            <div className="font-bold text-base text-foreground leading-tight truncate">
              {money(payableTotal)}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                ({payableRows.length})
              </span>
            </div>
          </div>
          <div className="flex flex-row gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={exportBonusSheet}
              disabled={exporting || loading || payableRows.length === 0}
              className="gap-1.5"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              <span className="hidden sm:inline">Exportar para C6</span>
              <span className="sm:hidden">C6</span>
            </Button>
            <Button
              size="sm"
              onClick={launchBonusPayables}
              disabled={launchingPayables || loading || payableRows.length === 0}
              className="gap-1.5"
            >
              {launchingPayables ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              <span className="hidden sm:inline">Lançar a pagar</span>
              <span className="sm:hidden">Lançar</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Resumo compacto apenas no mobile */}
      <div className="md:hidden text-xs text-muted-foreground grid grid-cols-2 gap-2 rounded-md border bg-muted/30 p-2">
        <div>Bruto: <span className="font-semibold text-foreground">{money(totals.bonus)}</span></div>
        <div>Desc.: <span className="font-semibold text-destructive">- {money(totals.desconto)}</span></div>
        <div>Ajustes: <span className={`font-semibold ${totals.adj < 0 ? "text-destructive" : "text-foreground"}`}>{totals.adj >= 0 ? "+ " : "- "}{money(Math.abs(totals.adj))}</span></div>
        <div>Total: <span className="font-bold text-foreground">{money(totals.liquido)}</span></div>
      </div>

      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">Nenhum colaborador ativo encontrado.</div>
      ) : (
        <>
        {/* Mobile cards */}
        <div className="md:hidden space-y-2">
          {rows.map((r) => {
            const suspended = !!r.suspendedUntil;
            const dirty = isDirty(r.id);
            return (
              <div key={r.id} className={`rounded-lg border p-2.5 space-y-2 ${suspended ? "bg-destructive/5" : "bg-card"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate text-sm">{r.full_name}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Líquido</div>
                    <div className="font-bold text-base leading-tight">{suspended ? <span className="text-destructive">{money(0)}</span> : money(r.liquido)}</div>
                  </div>
                </div>
                {suspended && (
                  <Badge variant="destructive" className="gap-1 text-xs">
                    <ShieldAlert className="h-3 w-3" />
                    Suspenso até {new Date(r.suspendedUntil! + "T00:00:00").toLocaleDateString("pt-BR")}
                  </Badge>
                )}
                {!suspended && r.ineligibleNewbie && (
                  <Badge variant="outline" className="gap-1 text-xs border-amber-500/40 text-amber-700">
                    Em carência (15 dias)
                  </Badge>
                )}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded bg-muted/50 p-1.5">
                    <div className="text-muted-foreground">Bônus</div>
                    <div className="font-medium">{money(r.bonus)}</div>
                  </div>
                  <div className="rounded bg-muted/50 p-1.5">
                    <div className="text-muted-foreground">Infrações</div>
                    <div className={r.count > 0 ? "text-destructive font-medium" : "text-muted-foreground"}>
                      {r.count > 0 ? `${r.count} (- ${money(r.desconto)})` : "—"}
                    </div>
                  </div>
                  <div className="rounded bg-muted/50 p-1.5">
                    <div className="text-muted-foreground">Desc.</div>
                    <div className="text-destructive font-medium">{r.desconto > 0 ? `- ${money(r.desconto)}` : "—"}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs shrink-0">Ajuste +/-</Label>
                  <Input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={drafts[r.id] ?? ""}
                    onChange={(e) => setDrafts((p) => ({ ...p, [r.id]: e.target.value }))}
                    className="h-8 text-right"
                    disabled={suspended}
                  />
                  <Button
                    size="icon"
                    variant={dirty ? "default" : "ghost"}
                    className="h-8 w-8 shrink-0"
                    onClick={() => saveAdjustment(r.id)}
                    disabled={suspended || savingId === r.id || !dirty}
                    aria-label="Salvar ajuste"
                  >
                    {savingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
        <Table className="[&_th]:h-9 [&_td]:py-1.5 text-sm">
          <TableHeader>
            <TableRow>
              <TableHead>Colaborador</TableHead>
              <TableHead className="text-right w-32">Bônus do cargo</TableHead>
              <TableHead className="text-right w-28">Infrações</TableHead>
              <TableHead className="text-right w-32">Desconto</TableHead>
              <TableHead className="text-right w-44">Ajuste manual (+/-)</TableHead>
              <TableHead className="text-right w-32">Líquido</TableHead>
            </TableRow>
            {/* Linha de totais alinhada a cada coluna */}
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Totais</TableHead>
              <TableHead className="text-right font-semibold text-foreground">{money(totals.bonus)}</TableHead>
              <TableHead className="text-right text-muted-foreground">—</TableHead>
              <TableHead className="text-right font-semibold text-destructive">
                {totals.desconto > 0 ? `- ${money(totals.desconto)}` : money(0)}
              </TableHead>
              <TableHead className={`text-right font-semibold ${totals.adj < 0 ? "text-destructive" : "text-foreground"}`}>
                {totals.adj === 0 ? money(0) : `${totals.adj > 0 ? "+ " : "- "}${money(Math.abs(totals.adj))}`}
              </TableHead>
              <TableHead className="text-right font-bold text-foreground text-base">{money(totals.liquido)}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const suspended = !!r.suspendedUntil;
              const dirty = isDirty(r.id);
              return (
                <TableRow key={r.id} className={suspended ? "bg-destructive/5" : undefined}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2 flex-wrap">
                      {r.full_name}
                      {suspended && (
                        <Badge variant="destructive" className="gap-1 text-[10px] py-0 h-5">
                          <ShieldAlert className="h-3 w-3" />
                          Suspenso até {new Date(r.suspendedUntil! + "T00:00:00").toLocaleDateString("pt-BR")}
                        </Badge>
                      )}
                      {!suspended && r.ineligibleNewbie && (
                        <Badge variant="outline" className="gap-1 text-[10px] py-0 h-5 border-amber-500/40 text-amber-700">
                          Em carência (15 dias)
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{money(r.bonus)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.count > 0 ? (
                      <span className="text-destructive">{r.count} (-{r.percent.toFixed(0)}%)</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-destructive tabular-nums">
                    {r.desconto > 0 ? `- ${money(r.desconto)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        placeholder="0,00"
                        value={drafts[r.id] ?? ""}
                        onChange={(e) => setDrafts((p) => ({ ...p, [r.id]: e.target.value }))}
                        className="h-8 w-24 text-right tabular-nums"
                        disabled={suspended}
                      />
                      <Button
                        size="icon"
                        variant={dirty ? "default" : "ghost"}
                        className="h-8 w-8"
                        onClick={() => saveAdjustment(r.id)}
                        disabled={suspended || savingId === r.id || !dirty}
                        aria-label="Salvar ajuste"
                      >
                        {savingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {suspended ? <span className="text-destructive">{money(0)}</span> : money(r.liquido)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
        </>
      )}
    </div>
  );
}
