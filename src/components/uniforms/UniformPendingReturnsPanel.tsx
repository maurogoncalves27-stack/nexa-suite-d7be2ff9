import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Undo2, DollarSign, HandHeart, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface PendingRow {
  employee_id: string;
  employee_name: string;
  employee_status: string;
  termination_date: string | null;
  store_id: string | null;
  delivery_item_id: string;
  uniform_item_id: string;
  item_name: string;
  size: string;
  pending_qty: number;
  unit_cost: number;
  pending_value: number;
  delivered_on: string;
}

const BRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function UniformPendingReturnsPanel() {
  const { user } = useAuth();
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("uniform_pending_returns")
      .select("*")
      .order("termination_date", { ascending: false, nullsFirst: false });
    if (error) toast({ title: "Erro ao carregar pendências", description: error.message, variant: "destructive" });
    setRows((data ?? []) as PendingRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(
    () => rows.filter((r) => showAll ? true : r.employee_status === "terminated"),
    [rows, showAll],
  );

  const byEmployee = useMemo(() => {
    const map = new Map<string, { name: string; termination_date: string | null; status: string; store_id: string | null; items: PendingRow[]; total: number }>();
    for (const r of filtered) {
      if (!map.has(r.employee_id)) {
        map.set(r.employee_id, { name: r.employee_name, termination_date: r.termination_date, status: r.employee_status, store_id: r.store_id, items: [], total: 0 });
      }
      const g = map.get(r.employee_id)!;
      g.items.push(r);
      g.total += Number(r.pending_value ?? 0);
    }
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v }));
  }, [filtered]);

  const resolve = async (
    row: PendingRow,
    action: "returned" | "charge" | "forgive",
    employeeId: string,
  ) => {
    setBusy(row.delivery_item_id + action);
    try {
      // 1) cria uma "devolução"
      const { data: ret, error: rErr } = await supabase.from("uniform_returns").insert({
        employee_id: employeeId,
        returned_on: new Date().toISOString().slice(0, 10),
        reason: action === "returned" ? "desligamento" : action === "charge" ? "avaria" : "desligamento",
        notes: action === "charge" ? "Peça não devolvida — descontada em folha" : action === "forgive" ? "Perdoada pelo gestor" : "Devolvida em bom estado",
        created_by: user?.id,
      } as any).select().single();
      if (rErr || !ret) throw rErr ?? new Error("erro");

      // 2) item da devolução (trigger cuida do returned_quantity e do estoque)
      const condition = action === "returned" ? "bom" : action === "charge" ? "perdido" : "danificado";
      const back = action === "returned";
      const { error: iErr } = await supabase.from("uniform_return_items").insert({
        return_id: (ret as any).id,
        delivery_item_id: row.delivery_item_id,
        uniform_item_id: row.uniform_item_id,
        size: row.size,
        quantity: row.pending_qty,
        condition,
        back_to_stock: back,
      } as any);
      if (iErr) throw iErr;

      // 3) desconto em folha
      if (action === "charge") {
        const now = new Date();
        const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        await supabase.from("payroll_advances").insert({
          employee_id: employeeId,
          type: "deduction",
          total_amount: Number(row.pending_value.toFixed(2)),
          installments_count: 1,
          start_year: next.getFullYear(),
          start_month: next.getMonth() + 1,
          description: `Desconto uniforme não devolvido: ${row.item_name} (${row.size}) x${row.pending_qty}`,
          created_by: user?.id,
        } as any);
      }

      toast({
        title:
          action === "returned" ? "Devolução registrada (peça voltou como usada ao estoque)"
          : action === "charge" ? "Peça marcada para desconto em folha"
          : "Perdoada",
      });
      load();
    } catch (e: any) {
      toast({ title: "Falha ao resolver pendência", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" /> Uniformes a devolver
          </CardTitle>
          <CardDescription>
            Peças duráveis ainda em posse de colaboradores. Padrão: desligados. Use as ações para <b>Devolveu</b> (peça volta ao estoque como usada), <b>Descontar</b> (cria desconto na próxima folha) ou <b>Perdoar</b>.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowAll((s) => !s)}>
          {showAll ? "Só desligados" : "Ver ativos também"}
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : byEmployee.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">
            Nenhum uniforme pendente {showAll ? "" : "de desligados"}.
          </div>
        ) : (
          <div className="space-y-3">
            {byEmployee.map((g) => (
              <div key={g.id} className="rounded-lg border bg-card">
                <div className="p-3 flex flex-wrap items-center justify-between gap-2 border-b">
                  <div className="min-w-0">
                    <div className="font-medium">{g.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {g.status === "terminated" ? `Desligado em ${g.termination_date ? new Date(g.termination_date + "T00:00:00").toLocaleDateString("pt-BR") : "—"}` : "Ativo"}
                      {" · "}{g.items.length} peça(s)
                    </div>
                  </div>
                  <Badge variant="destructive" className="whitespace-nowrap">
                    Pendente: {BRL(g.total)}
                  </Badge>
                </div>
                <div className="divide-y">
                  {g.items.map((r) => {
                    const bid = r.delivery_item_id;
                    return (
                      <div key={r.delivery_item_id} className="p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">{r.item_name} <span className="text-muted-foreground font-normal">· tam {r.size} · x{r.pending_qty}</span></div>
                          <div className="text-xs text-muted-foreground">Custo unit. {BRL(Number(r.unit_cost))} · Valor {BRL(Number(r.pending_value))}</div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Button size="sm" variant="outline" className="gap-1 h-8"
                            disabled={busy === bid + "returned"}
                            onClick={() => resolve(r, "returned", g.id)}>
                            {busy === bid + "returned" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                            Devolveu
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1 h-8"
                            disabled={busy === bid + "charge"}
                            onClick={() => resolve(r, "charge", g.id)}>
                            {busy === bid + "charge" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DollarSign className="h-3.5 w-3.5" />}
                            Descontar
                          </Button>
                          <Button size="sm" variant="ghost" className="gap-1 h-8"
                            disabled={busy === bid + "forgive"}
                            onClick={() => resolve(r, "forgive", g.id)}>
                            {busy === bid + "forgive" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <HandHeart className="h-3.5 w-3.5" />}
                            Perdoar
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
