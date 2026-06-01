import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Hourglass, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Plus, Save, Trash2,
} from "lucide-react";

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

interface Employee {
  id: string;
  full_name: string;
  position: string | null;
  store_id: string | null;
  night_shift_eligible: boolean | null;
}

interface NightRow {
  employee_id: string;
  amount: number;
  source: "auto" | "manual";
  notes: string | null;
}

const money = (v: number) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function NightAddition() {
  const { user } = useAuth();
  const today = new Date();
  const initialMonth = today.getMonth() === 0 ? 12 : today.getMonth();
  const initialYear = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();

  const [refMonth, setRefMonth] = useState<number>(initialMonth);
  const [refYear, setRefYear] = useState<number>(initialYear);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rows, setRows] = useState<Record<string, NightRow>>({});
  const [autoMap, setAutoMap] = useState<Record<string, number>>({});
  const [approved, setApproved] = useState(false);
  const [savingApproval, setSavingApproval] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});

  // Manual add dialog
  const [openAdd, setOpenAdd] = useState(false);
  const [addEmpId, setAddEmpId] = useState<string>("");
  const [addAmount, setAddAmount] = useState<string>("");
  const [addNotes, setAddNotes] = useState<string>("");
  const [savingAdd, setSavingAdd] = useState(false);

  const load = async () => {
    setLoading(true);
    // Cálculo automático agora vem da edge function compute-night-addition,
    // que lê o ponto direto (independe de payroll_calculated / folha gerada).
    const [empRes, nightRes, computeRes, revRes] = await Promise.all([
      supabase
        .from("employees")
        .select("id, full_name, position, store_id, night_shift_eligible")
        .eq("status", "active")
        .order("full_name"),
      (supabase as any)
        .from("payroll_night_addition")
        .select("employee_id, amount, source, notes")
        .eq("reference_year", refYear)
        .eq("reference_month", refMonth),
      supabase.functions.invoke("compute-night-addition", {
        body: { year: refYear, month: refMonth },
      }),
      (supabase as any)
        .from("payroll_night_addition_review")
        .select("id")
        .eq("reference_year", refYear)
        .eq("reference_month", refMonth)
        .maybeSingle(),
    ]);

    setEmployees((empRes.data ?? []) as unknown as Employee[]);
    const map: Record<string, NightRow> = {};
    ((nightRes.data ?? []) as any[]).forEach((r) => {
      map[r.employee_id] = {
        employee_id: r.employee_id,
        amount: Number(r.amount ?? 0),
        source: (r.source ?? "manual") as "auto" | "manual",
        notes: r.notes,
      };
    });
    setRows(map);

    const auto: Record<string, number> = {};
    const results = (computeRes?.data as any)?.results ?? [];
    results.forEach((r: any) => {
      const v = Number(r.amount ?? 0);
      if (v > 0) auto[r.employee_id] = v;
    });
    setAutoMap(auto);

    setApproved(!!revRes.data);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [refYear, refMonth]);

  // Sincroniza valores automáticos: cria row com source='auto' para quem tem
  // adicional noturno calculado pelo ponto e ainda não tem override.
  const syncAuto = async () => {
    const upserts: any[] = [];
    for (const [empId, v] of Object.entries(autoMap)) {
      const existing = rows[empId];
      if (existing?.source === "manual") continue;
      if (existing?.source === "auto" && Number(existing.amount ?? 0) === Number(v ?? 0)) continue;
      upserts.push({
        employee_id: empId,
        reference_year: refYear,
        reference_month: refMonth,
        amount: v,
        source: "auto",
        notes: existing?.source === "auto" ? existing.notes : null,
        created_by: user?.id ?? null,
      });
    }
    if (upserts.length === 0) {
      toast({ title: "Nada a sincronizar", description: "Todos os valores automáticos já estão atualizados na lista." });
      return;
    }
    const { error } = await (supabase as any)
      .from("payroll_night_addition")
      .upsert(upserts, { onConflict: "employee_id,reference_year,reference_month" });
    if (error) {
      toast({ title: "Erro ao sincronizar", description: error.message, variant: "destructive" });
      return;
    }
    await invalidateApproval();
    toast({ title: "Sincronizado", description: `${upserts.length} colaborador(es) automático(s) atualizado(s).` });
    load();
  };

  const invalidateApproval = async () => {
    if (!approved) return;
    await (supabase as any)
      .from("payroll_night_addition_review")
      .delete()
      .eq("reference_year", refYear)
      .eq("reference_month", refMonth);
    setApproved(false);
  };

  const updateAmount = (empId: string, value: string) => {
    setDraftValues((prev) => ({ ...prev, [empId]: value }));
    setRows((prev) => ({
      ...prev,
      [empId]: {
        ...(prev[empId] ?? { employee_id: empId, source: "manual", notes: null, amount: 0 }),
        amount: Number(value.replace(",", ".")) || 0,
      },
    }));
  };

  const saveRow = async (empId: string) => {
    const r = rows[empId];
    if (!r) return;
    setSavingId(empId);
    try {
      const { error } = await (supabase as any)
        .from("payroll_night_addition")
        .upsert({
          employee_id: empId,
          reference_year: refYear,
          reference_month: refMonth,
          amount: r.amount,
          source: r.source ?? "manual",
          notes: r.notes,
          created_by: user?.id ?? null,
        }, { onConflict: "employee_id,reference_year,reference_month" });
      if (error) throw error;
      await invalidateApproval();
      toast({ title: "Salvo" });
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  const removeRow = async (empId: string) => {
    if (!confirm("Remover o lançamento de adicional noturno deste colaborador no mês?")) return;
    const { error } = await (supabase as any)
      .from("payroll_night_addition")
      .delete()
      .eq("employee_id", empId)
      .eq("reference_year", refYear)
      .eq("reference_month", refMonth);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      return;
    }
    await invalidateApproval();
    toast({ title: "Removido" });
    load();
  };

  const addManual = async () => {
    if (!addEmpId) return toast({ title: "Selecione o colaborador", variant: "destructive" });
    const amt = Number(addAmount.replace(",", "."));
    if (!amt || amt <= 0) return toast({ title: "Informe um valor válido", variant: "destructive" });
    setSavingAdd(true);
    try {
      const { error } = await (supabase as any)
        .from("payroll_night_addition")
        .upsert({
          employee_id: addEmpId,
          reference_year: refYear,
          reference_month: refMonth,
          amount: amt,
          source: "manual",
          notes: addNotes.trim() || null,
          created_by: user?.id ?? null,
        }, { onConflict: "employee_id,reference_year,reference_month" });
      if (error) throw error;
      await invalidateApproval();
      toast({ title: "Adicionado" });
      setOpenAdd(false);
      setAddEmpId(""); setAddAmount(""); setAddNotes("");
      load();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setSavingAdd(false);
    }
  };

  const handleApprove = async () => {
    setSavingApproval(true);
    try {
      const { error } = await (supabase as any)
        .from("payroll_night_addition_review")
        .upsert({
          reference_year: refYear,
          reference_month: refMonth,
          approved_by: user?.id ?? null,
          approved_at: new Date().toISOString(),
        }, { onConflict: "reference_year,reference_month" });
      if (error) throw error;
      setApproved(true);
      toast({ title: "Adicional noturno aprovado", description: `Já é possível gerar a folha de ${MONTHS[refMonth - 1]}/${refYear}.` });
    } catch (e: any) {
      toast({ title: "Erro ao aprovar", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setSavingApproval(false);
    }
  };

  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  // Lista a exibir: todo elegível + todo com override
  const visibleIds = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => { if (e.night_shift_eligible) set.add(e.id); });
    Object.keys(rows).forEach((id) => set.add(id));
    return Array.from(set);
  }, [employees, rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visibleIds
      .map((id) => empById.get(id))
      .filter((e): e is Employee => !!e)
      .filter((e) => !q || e.full_name.toLowerCase().includes(q))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [visibleIds, empById, search]);

  const totalMonth = useMemo(
    () => Object.values(rows).reduce((acc, r) => acc + Number(r.amount ?? 0), 0),
    [rows],
  );

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-xl font-bold flex items-center gap-2">
          <Hourglass className="md: md: h-6 w-6 md:h-7 md:w-7 text-primary" /> Adicional Noturno
        </h1>
        <p className="text-sm md:text-base text-muted-foreground">
          O valor automático é calculado <strong>direto do ponto</strong> (não depende de gerar a folha antes).
          Clique em <strong>Sincronizar do ponto</strong> para preencher os elegíveis e adicione manualmente quem não bate ponto.
          <strong> Aprove o mês para liberar a geração da folha.</strong>
        </p>
      </div>

      <Card>
        <CardHeader className="py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Hourglass className="h-5 w-5 text-primary" />
              Adicional noturno de {MONTHS[refMonth - 1]}/{refYear}
              {approved && (
                <Badge className="ml-2 bg-emerald-600 hover:bg-emerald-600 text-white gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Aprovado
                </Badge>
              )}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Mês anterior"
                  onClick={() => {
                    if (refMonth === 1) { setRefMonth(12); setRefYear(refYear - 1); }
                    else setRefMonth(refMonth - 1);
                  }}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="capitalize text-sm font-medium min-w-[140px] text-center px-2">
                  {MONTHS[refMonth - 1]} {refYear}
                </span>
                <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Próximo mês"
                  onClick={() => {
                    if (refMonth === 12) { setRefMonth(1); setRefYear(refYear + 1); }
                    else setRefMonth(refMonth + 1);
                  }}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <Button variant="outline" size="sm" onClick={syncAuto}>
                Sincronizar do ponto
              </Button>
              <Dialog open={openAdd} onOpenChange={(o) => { setOpenAdd(o); if (!o) { setAddEmpId(""); setAddAmount(""); setAddNotes(""); } }}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Adicionar manual</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Adicional noturno manual</DialogTitle>
                    <DialogDescription>Para colaboradores sem cálculo automático pelo ponto.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Colaborador</Label>
                      <Select value={addEmpId} onValueChange={setAddEmpId}>
                        <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                        <SelectContent>
                          {employees.map((e) => (
                            <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Valor (R$)</Label>
                      <Input inputMode="decimal" value={addAmount} onChange={(e) => setAddAmount(e.target.value)} placeholder="0,00" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Observação (opcional)</Label>
                      <Textarea value={addNotes} onChange={(e) => setAddNotes(e.target.value)} placeholder="Ex.: lançamento manual referente a turno extra noturno" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpenAdd(false)} disabled={savingAdd}>Cancelar</Button>
                    <Button onClick={addManual} disabled={savingAdd}>
                      {savingAdd && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Salvar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              {!approved ? (
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleApprove} disabled={savingApproval}>
                  {savingApproval && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Aprovar adicional noturno deste mês
                </Button>
              ) : (
                <Badge variant="outline" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Aprovado para folha</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-3 py-2 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <Input
              placeholder="Buscar colaborador..."
              className="sm:max-w-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="text-sm text-muted-foreground">
              Total do mês: <strong>{money(totalMonth)}</strong> · {filtered.length} colaborador(es)
            </div>
          </div>

          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Auto (ponto)</TableHead>
                  <TableHead className="text-right">Valor folha (R$)</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum colaborador.</TableCell></TableRow>
                ) : filtered.map((e) => {
                  const r = rows[e.id];
                  const auto = autoMap[e.id] ?? 0;
                  const value = r?.amount ?? 0;
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.full_name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{e.position ?? "—"}</TableCell>
                      <TableCell>
                        {r ? (
                          <Badge variant={r.source === "auto" ? "default" : "secondary"}>
                            {r.source === "auto" ? "Automático" : "Manual"}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">— sem lançamento —</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{auto > 0 ? money(auto) : "—"}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          inputMode="decimal"
                          className="w-32 ml-auto text-right"
                          value={value === 0 && !r ? "" : String(value).replace(".", ",")}
                          onChange={(ev) => updateAmount(e.id, ev.target.value)}
                          placeholder="0,00"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => saveRow(e.id)} disabled={savingId === e.id}>
                            {savingId === e.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          </Button>
                          {r && (
                            <Button size="sm" variant="ghost" onClick={() => removeRow(e.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile */}
          <div className="md:hidden divide-y">
            {filtered.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Nenhum colaborador.</p>
            ) : filtered.map((e) => {
              const r = rows[e.id];
              const auto = autoMap[e.id] ?? 0;
              const value = r?.amount ?? 0;
              return (
                <div key={e.id} className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-sm">{e.full_name}</div>
                      <div className="text-xs text-muted-foreground">{e.position ?? "—"}</div>
                    </div>
                    {r && (
                      <Badge variant={r.source === "auto" ? "default" : "secondary"} className="text-[10px]">
                        {r.source === "auto" ? "Auto" : "Manual"}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Auto (ponto): {auto > 0 ? money(auto) : "—"}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      inputMode="decimal"
                      className="flex-1"
                      value={value === 0 && !r ? "" : String(value).replace(".", ",")}
                      onChange={(ev) => updateAmount(e.id, ev.target.value)}
                      placeholder="0,00"
                    />
                    <Button size="sm" variant="outline" onClick={() => saveRow(e.id)} disabled={savingId === e.id}>
                      {savingId === e.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    </Button>
                    {r && (
                      <Button size="sm" variant="ghost" onClick={() => removeRow(e.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
