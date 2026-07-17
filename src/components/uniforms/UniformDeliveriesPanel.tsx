import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, Send } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useAuth } from "@/hooks/useAuth";
import {
  DELIVERY_TYPES, CHARGE_REASONS, CONDITION_OPTIONS, UNIFORM_CENTRAL_STORE_ID,
  sizesFor, type UniformItem, type UniformCondition,
} from "@/lib/uniforms";

interface StoreOpt { id: string; name: string }
interface EmployeeOpt { id: string; full_name: string; position: string | null; store_id: string }

interface DraftLine {
  uniform_item_id: string;
  size: string;
  quantity: number;
  unit_cost: number;
  expected_return: boolean;
  condition_at_delivery: UniformCondition;
}

interface DeliveryRow {
  id: string; employee_id: string; store_id: string;
  delivered_on: string; delivery_type: string;
  total_cost: number; charge_to_employee: number; charge_reason: string | null;
  notes: string | null;
  employees?: { full_name: string };
}

interface Props {
  items: UniformItem[];
  stores: StoreOpt[];
  employees: EmployeeOpt[];
}

export function UniformDeliveriesPanel({ items, employees }: Props) {
  const { user } = useAuth();
  const [employeeId, setEmployeeId] = useState("");
  const [deliveryType, setDeliveryType] = useState("inicial");
  const [chargeReason, setChargeReason] = useState("nenhum");
  const [chargeAmount, setChargeAmount] = useState("0");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [autoLoaded, setAutoLoaded] = useState<string | null>(null);

  const [history, setHistory] = useState<DeliveryRow[]>([]);
  const [loadingHist, setLoadingHist] = useState(true);

  const itemMap = Object.fromEntries(items.map((i) => [i.id, i]));
  const selectedEmp = employees.find((e) => e.id === employeeId);

  const loadHistory = async () => {
    setLoadingHist(true);
    const { data } = await supabase
      .from("uniform_deliveries")
      .select("*, employees(full_name)")
      .order("delivered_on", { ascending: false })
      .limit(50);
    setHistory((data ?? []) as DeliveryRow[]);
    setLoadingHist(false);
  };

  useEffect(() => { loadHistory(); }, []);

  const loadKitForPosition = async (silent = false) => {
    if (!selectedEmp?.position) {
      if (!silent) toast({ title: "Colaborador sem cargo", description: "Selecione um cargo no cadastro", variant: "destructive" });
      return;
    }
    const { data } = await supabase
      .from("uniform_kit_items")
      .select("*")
      .eq("position", selectedEmp.position);
    if (!data || data.length === 0) {
      if (!silent) toast({
        title: "Nenhum kit configurado",
        description: `Cargo "${selectedEmp.position}" não tem kit. Adicione itens manualmente.`,
      });
      return;
    }
    const newLines: DraftLine[] = data.map((k: any) => {
      const it = itemMap[k.uniform_item_id];
      return {
        uniform_item_id: k.uniform_item_id,
        size: "",
        quantity: k.quantity,
        unit_cost: it ? Number(it.unit_cost) : 0,
        expected_return: it ? it.is_durable : true,
        condition_at_delivery: "nova",
      };
    });
    setLines(newLines);
    if (!silent) toast({ title: `${newLines.length} item(ns) sugeridos do kit`, description: "Edite tamanhos, quantidades e condição antes de registrar." });
  };

  // Auto-carrega kit ao selecionar colaborador (uma vez por colaborador)
  useEffect(() => {
    if (employeeId && employeeId !== autoLoaded) {
      setAutoLoaded(employeeId);
      setLines([]);
      loadKitForPosition(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  const addLine = () => {
    setLines([...lines, { uniform_item_id: "", size: "", quantity: 1, unit_cost: 0, expected_return: true, condition_at_delivery: "nova" }]);
  };
  const removeLine = (idx: number) => setLines(lines.filter((_, i) => i !== idx));
  const updLine = (idx: number, patch: Partial<DraftLine>) => {
    setLines(lines.map((l, i) => i === idx ? { ...l, ...patch } : l));
  };

  const totalCost = lines.reduce((sum, l) => sum + l.unit_cost * l.quantity, 0);

  const submit = async () => {
    if (!employeeId) { toast({ title: "Selecione o colaborador", variant: "destructive" }); return; }
    if (lines.length === 0) { toast({ title: "Adicione ao menos um item", variant: "destructive" }); return; }
    for (const l of lines) {
      if (!l.uniform_item_id || !l.size || l.quantity < 1) {
        toast({ title: "Preencha todos os itens (item, tamanho, qtd)", variant: "destructive" });
        return;
      }
    }
    if (!selectedEmp) return;
    setSaving(true);
    const { data: del, error } = await supabase.from("uniform_deliveries").insert({
      employee_id: employeeId,
      store_id: selectedEmp.store_id,
      delivery_type: deliveryType,
      total_cost: totalCost,
      charge_to_employee: chargeReason === "nenhum" ? 0 : Number(chargeAmount) || 0,
      charge_reason: chargeReason === "nenhum" ? null : chargeReason,
      notes: notes || null,
      created_by: user?.id,
    }).select().single();
    if (error || !del) {
      setSaving(false);
      toast({ title: "Erro", description: error?.message, variant: "destructive" });
      return;
    }
    const { error: itErr } = await supabase.from("uniform_delivery_items").insert(
      lines.map((l) => ({
        delivery_id: del.id,
        uniform_item_id: l.uniform_item_id,
        size: l.size,
        quantity: l.quantity,
        unit_cost: l.unit_cost,
        expected_return: l.expected_return,
        condition_at_delivery: l.condition_at_delivery,
      })) as any,
    );
    if (itErr) {
      setSaving(false);
      toast({ title: "Erro nos itens", description: itErr.message, variant: "destructive" });
      return;
    }
    // Saída SEMPRE da sede (ESTOQUE CENTRAL), respeitando a condição da peça entregue
    for (const l of lines) {
      const { error: mErr } = await supabase.from("uniform_stock_movements").insert({
        store_id: UNIFORM_CENTRAL_STORE_ID,
        uniform_item_id: l.uniform_item_id,
        size: l.size,
        movement_type: "saida",
        quantity: l.quantity,
        reason: `Entrega para ${selectedEmp.full_name}`,
        related_delivery_id: del.id,
        created_by: user?.id,
        condition: l.condition_at_delivery,
      } as any);
      if (mErr) {
        toast({ title: "Estoque insuficiente na sede", description: `${itemMap[l.uniform_item_id]?.name} (${l.size}, ${l.condition_at_delivery}): ${mErr.message}`, variant: "destructive" });
      }
    }
    setSaving(false);
    toast({ title: "Entrega registrada" });
    setLines([]); setNotes(""); setChargeAmount("0"); setChargeReason("nenhum");
    setAutoLoaded(null);
    setEmployeeId("");
    loadHistory();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova entrega de uniforme</CardTitle>
          <CardDescription>
            Ao selecionar o colaborador o kit do cargo aparece como sugestão. Edite peça a peça (tamanho, quantidade e se é <b>Nova</b> ou <b>Usada</b>) antes de registrar. Toda saída é feita da sede (Estoque Central).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2 md:col-span-2">
              <Label>Colaborador</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.full_name}{e.position ? ` · ${e.position}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de entrega</Label>
              <Select value={deliveryType} onValueChange={setDeliveryType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DELIVERY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap gap-2">
            <Button variant="outline" onClick={() => loadKitForPosition(false)} disabled={!employeeId} className="gap-2 w-full sm:w-auto">
              <Send className="h-4 w-4" /> Recarregar kit sugerido
            </Button>
            <Button variant="outline" onClick={addLine} className="gap-2 w-full sm:w-auto">
              <Plus className="h-4 w-4" /> Adicionar peça
            </Button>
          </div>

          {lines.length > 0 && (
            <div className="space-y-2">
              {lines.map((l, idx) => {
                const it = itemMap[l.uniform_item_id];
                const sizes = it ? sizesFor(it.size_type) : [];
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end p-3 border rounded-lg">
                    <div className="space-y-1 col-span-12 md:col-span-4">
                      <Label className="text-xs">Peça</Label>
                      <Select value={l.uniform_item_id} onValueChange={(v) => {
                        const newIt = items.find((i) => i.id === v);
                        updLine(idx, {
                          uniform_item_id: v,
                          unit_cost: newIt ? Number(newIt.unit_cost) : 0,
                          expected_return: newIt ? newIt.is_durable : true,
                          size: "",
                        });
                      }}>
                        <SelectTrigger><SelectValue placeholder="Peça" /></SelectTrigger>
                        <SelectContent>
                          {items.filter((i) => i.is_active).map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 col-span-4 md:col-span-2">
                      <Label className="text-xs">Tamanho</Label>
                      <Select value={l.size} onValueChange={(v) => updLine(idx, { size: v })} disabled={!it}>
                        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          {sizes.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 col-span-4 md:col-span-2">
                      <Label className="text-xs">Qtd</Label>
                      <Input type="number" min={1} value={l.quantity}
                        onChange={(e) => updLine(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })} />
                    </div>
                    <div className="space-y-1 col-span-4 md:col-span-2">
                      <Label className="text-xs">Condição</Label>
                      <Select value={l.condition_at_delivery} onValueChange={(v) => updLine(idx, { condition_at_delivery: v as UniformCondition })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CONDITION_OPTIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-12 md:col-span-2 flex items-center justify-end gap-2">
                      {l.expected_return && <Badge variant="outline" className="border-primary/50 text-primary">durável</Badge>}
                      <Button variant="ghost" size="icon" onClick={() => removeLine(idx)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              <div className="text-sm text-right text-muted-foreground">
                Total: <span className="font-semibold text-foreground">R$ {totalCost.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Cobrança em folha</Label>
              <Select value={chargeReason} onValueChange={setChargeReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHARGE_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valor a descontar (R$)</Label>
              <Input type="number" step="0.01" value={chargeAmount}
                disabled={chargeReason === "nenhum"}
                onChange={(e) => setChargeAmount(e.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-3">
              <Label>Observação</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="flex justify-stretch sm:justify-end">
            <Button onClick={submit} disabled={saving} className="gap-2 w-full sm:w-auto">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Registrar entrega
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico recente</CardTitle>
          <CardDescription>Últimas 50 entregas</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingHist ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : history.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-sm">Nenhuma entrega ainda.</div>
          ) : (() => {
            const grouped = history.reduce<Record<string, { name: string; rows: DeliveryRow[] }>>((acc, h) => {
              const key = h.employee_id;
              if (!acc[key]) acc[key] = { name: h.employees?.full_name ?? "—", rows: [] };
              acc[key].rows.push(h);
              return acc;
            }, {});
            const groups = Object.entries(grouped).sort((a, b) => a[1].name.localeCompare(b[1].name));
            return (
              <Accordion type="multiple" className="space-y-2">
                {groups.map(([empId, g]) => {
                  const total = g.rows.reduce((s, r) => s + Number(r.total_cost || 0), 0);
                  return (
                    <AccordionItem key={empId} value={empId} className="border rounded-lg px-3">
                      <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="font-medium truncate text-sm">{g.name}</span>
                          <Badge variant="secondary" className="text-[10px]">{g.rows.length}</Badge>
                          <Badge variant="outline" className="ml-auto mr-2 text-[10px]">R$ {total.toFixed(2)}</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <ul className="divide-y divide-border">
                          {g.rows.map((h) => (
                            <li key={h.id} className="py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="text-xs text-muted-foreground">
                                  {new Date(h.delivered_on).toLocaleDateString("pt-BR")} · {h.delivery_type}
                                  {h.charge_to_employee > 0 && ` · cobrança R$ ${Number(h.charge_to_employee).toFixed(2)} (${h.charge_reason})`}
                                </div>
                                {h.notes && <div className="text-xs text-muted-foreground mt-0.5 italic">{h.notes}</div>}
                              </div>
                              <Badge variant="outline" className="self-start sm:self-auto shrink-0">R$ {Number(h.total_cost).toFixed(2)}</Badge>
                            </li>
                          ))}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            );
          })()}

        </CardContent>
      </Card>
    </div>
  );
}
