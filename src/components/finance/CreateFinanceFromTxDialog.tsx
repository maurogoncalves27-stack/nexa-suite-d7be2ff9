import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, Plus, Pencil, Trash2, Check, X, SplitSquareHorizontal } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { FinanceCategory } from "./FinanceCategoriesPanel";
import { sortStores } from "@/lib/storeSort";

interface BankTx {
  id: string;
  posted_at: string;
  amount: number;
  memo: string | null;
  payee: string | null;
  bank_account_id: string;
}

interface Store { id: string; name: string }

interface Suggestion {
  description: string | null;
  party_name: string | null;
  category_id: string | null;
  similarity_score: number;
}

interface Props {
  tx: BankTx | null;
  onOpenChange: (o: boolean) => void;
  onCreated?: () => void;
}

interface SplitLine {
  store_id: string;
  description: string;
  party_name: string;
  category_id: string;
  competence_date: string; // yyyy-mm-dd
  amount: number;          // positivo
}

const fmtBRL = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const round2 = (n: number) => Math.round(n * 100) / 100;

export default function CreateFinanceFromTxDialog({ tx, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const isCredit = (tx?.amount ?? 0) > 0;
  const kind = isCredit ? "income" : "expense";
  const total = Math.abs(tx?.amount ?? 0);

  const [stores, setStores] = useState<Store[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [lines, setLines] = useState<SplitLine[]>([]);
  const [focusedLine, setFocusedLine] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [managingCategories, setManagingCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");

  const reloadCategories = async () => {
    const { data } = await supabase
      .from("finance_categories")
      .select("*")
      .in("kind", [kind, "both"])
      .eq("is_active", true)
      .order("sort_order")
      .order("name");
    setCategories((data ?? []) as FinanceCategory[]);
  };

  useEffect(() => {
    if (!tx) return;
    (async () => {
      const [s, sg] = await Promise.all([
        supabase.from("stores").select("id, name, store_type").eq("is_virtual", false).neq("store_type", "central").order("name"),
        supabase.rpc("suggest_finance_entry", { _memo: tx.memo || tx.payee || "", _kind: kind }),
      ]);
      const sortedStores = sortStores((s.data ?? [])) as Store[];
      setStores(sortedStores);
      setSuggestions(((sg.data ?? []) as Suggestion[]));
      setLines([{
        store_id: sortedStores[0]?.id ?? "",
        description: tx.memo || tx.payee || "",
        party_name: tx.payee || "",
        category_id: "",
        competence_date: tx.posted_at ? String(tx.posted_at).slice(0, 10) : "",
        amount: Math.abs(tx.amount),
      }]);
      setFocusedLine(0);
      setManagingCategories(false);
      setNewCategoryName("");
      setEditingCategoryId(null);
      setEditingCategoryName("");
      await reloadCategories();
    })();
  }, [tx, kind]);

  const updateLine = (idx: number, patch: Partial<SplitLine>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const addLine = () => {
    setLines((prev) => {
      const sumSoFar = prev.reduce((a, l) => a + (Number(l.amount) || 0), 0);
      const remaining = round2(total - sumSoFar);
      const next: SplitLine = {
        store_id: stores[0]?.id ?? "",
        description: tx?.memo || tx?.payee || "",
        party_name: tx?.payee || "",
        category_id: "",
        competence_date: tx?.posted_at ? String(tx.posted_at).slice(0, 10) : "",
        amount: remaining > 0 ? remaining : 0,
      };
      return [...prev, next];
    });
    setFocusedLine(lines.length);
  };

  const removeLine = (idx: number) => {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
  };

  const splitEqually = () => {
    setLines((prev) => {
      const n = prev.length;
      if (n === 0) return prev;
      const base = Math.floor((total * 100) / n) / 100;
      const remainder = round2(total - base * n);
      return prev.map((l, i) => ({
        ...l,
        amount: i === n - 1 ? round2(base + remainder) : base,
      }));
    });
  };

  const applySuggestion = (s: Suggestion) => {
    updateLine(focusedLine, {
      description: s.description ?? lines[focusedLine]?.description ?? "",
      party_name: s.party_name ?? lines[focusedLine]?.party_name ?? "",
      category_id: s.category_id ?? lines[focusedLine]?.category_id ?? "",
    });
  };

  const createCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    const { data, error } = await supabase
      .from("finance_categories")
      .insert({ name, kind, is_active: true, sort_order: 0 })
      .select("id")
      .single();
    if (error) {
      toast({ title: "Erro ao criar categoria", description: error.message, variant: "destructive" });
      return;
    }
    setNewCategoryName("");
    await reloadCategories();
    if (data?.id) updateLine(focusedLine, { category_id: data.id });
    toast({ title: "Categoria criada" });
  };

  const updateCategoryName = async (id: string) => {
    const name = editingCategoryName.trim();
    if (!name) return;
    const { error } = await supabase.from("finance_categories").update({ name }).eq("id", id);
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
      return;
    }
    setEditingCategoryId(null);
    setEditingCategoryName("");
    await reloadCategories();
  };

  const removeCategory = async (id: string) => {
    const { error } = await supabase
      .from("finance_categories")
      .update({ is_active: false })
      .eq("id", id);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      return;
    }
    setLines((prev) => prev.map((l) => (l.category_id === id ? { ...l, category_id: "" } : l)));
    await reloadCategories();
    toast({ title: "Categoria removida" });
  };

  const sum = lines.reduce((a, l) => a + (Number(l.amount) || 0), 0);
  const diff = round2(total - sum);
  const balanced = Math.abs(diff) <= 0.01;
  const allValid = lines.every((l) => l.store_id && l.description.trim() && Number(l.amount) > 0);

  const create = async () => {
    if (!tx || !user?.id) return;
    if (!allValid) {
      toast({ title: "Preencha loja, descrição e valor em todas as linhas", variant: "destructive" });
      return;
    }
    if (!balanced) {
      toast({ title: "Soma das linhas não bate", description: `Diferença: ${fmtBRL(diff)}`, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const fnName = isCredit ? "create_receivables_from_bank_tx" : "create_payables_from_bank_tx";
    const payload = lines.map((l) => ({
      store_id: l.store_id,
      description: l.description.trim(),
      party_name: l.party_name.trim() || null,
      category_id: l.category_id || null,
      competence_date: l.competence_date || null,
      amount: Number(l.amount),
    }));
    const { error } = await supabase.rpc(fnName as any, { _transaction_id: tx.id, _lines: payload as any });
    setSubmitting(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: isCredit ? "Contas a receber criadas" : "Contas a pagar criadas",
      description: `${lines.length} lançamento(s) gerado(s).`,
    });
    onOpenChange(false);
    onCreated?.();
  };

  return (
    <Dialog open={!!tx} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isCredit ? "Gerar conta a receber" : "Gerar conta a pagar"}</DialogTitle>
          <DialogDescription>
            {tx && `${fmtBRL(total)} em ${new Date(tx.posted_at + "T00:00:00").toLocaleDateString("pt-BR")} — ${tx.payee || tx.memo || "—"}`}
          </DialogDescription>
        </DialogHeader>

        {suggestions.length > 0 && (
          <div className="border rounded-md p-2 bg-muted/40">
            <div className="text-xs font-medium flex items-center gap-1 mb-1">
              <Sparkles className="h-3 w-3" /> Sugestões do histórico (aplica na linha em foco)
            </div>
            <div className="space-y-1">
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => applySuggestion(s)}
                  className="w-full text-left px-2 py-1 rounded hover:bg-background text-xs">
                  <span className="font-medium">{s.description}</span>
                  {s.party_name && <span className="text-muted-foreground"> • {s.party_name}</span>}
                  <span className="text-muted-foreground"> ({Math.round(s.similarity_score * 100)}%)</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">
            {lines.length === 1 ? "Lançamento" : `${lines.length} lançamentos`}
          </div>
          <div className="flex gap-2">
            {lines.length >= 2 && (
              <Button type="button" variant="outline" size="sm" onClick={splitEqually}>
                <SplitSquareHorizontal className="h-3.5 w-3.5 mr-1" /> Dividir igualmente
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar linha
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {lines.map((line, idx) => (
            <div
              key={idx}
              className={`border rounded-md p-3 space-y-2 ${focusedLine === idx ? "border-primary/60 bg-muted/20" : ""}`}
              onClick={() => setFocusedLine(idx)}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Linha {idx + 1}</span>
                {lines.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeLine(idx)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="space-y-1">
                <Label>Descrição *</Label>
                <Input
                  value={line.description}
                  onChange={(e) => updateLine(idx, { description: e.target.value })}
                  onFocus={() => setFocusedLine(idx)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>{isCredit ? "Pagador" : "Fornecedor"}</Label>
                  <Input
                    value={line.party_name}
                    onChange={(e) => updateLine(idx, { party_name: e.target.value })}
                    onFocus={() => setFocusedLine(idx)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Categoria</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={line.category_id}
                    onChange={(e) => updateLine(idx, { category_id: e.target.value })}
                    onFocus={() => setFocusedLine(idx)}
                  >
                    <option value="">—</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1 col-span-1">
                  <Label>Loja *</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={line.store_id}
                    onChange={(e) => updateLine(idx, { store_id: e.target.value })}
                    onFocus={() => setFocusedLine(idx)}
                  >
                    <option value="">Selecione...</option>
                    {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Data de competência</Label>
                  <Input
                    type="date"
                    value={line.competence_date}
                    onChange={(e) => updateLine(idx, { competence_date: e.target.value })}
                    onFocus={() => setFocusedLine(idx)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Valor *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.amount}
                    onChange={(e) => updateLine(idx, { amount: Number(e.target.value) })}
                    onFocus={() => setFocusedLine(idx)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="border rounded-md p-2 mt-1">
          <button
            type="button"
            onClick={() => setManagingCategories((v) => !v)}
            className="text-xs text-primary hover:underline"
          >
            {managingCategories ? "Fechar gerenciamento de categorias" : "Gerenciar categorias"}
          </button>
          {managingCategories && (
            <div className="mt-2 border rounded-md p-2 space-y-2 bg-muted/30">
              <div className="flex gap-1">
                <Input
                  placeholder="Nova categoria..."
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      createCategory();
                    }
                  }}
                  className="h-8 text-sm"
                />
                <Button type="button" size="sm" onClick={createCategory} className="h-8 px-2">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {categories.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma categoria ainda.</p>
                ) : (
                  categories.map((c) => (
                    <div key={c.id} className="flex items-center gap-1 text-sm">
                      {editingCategoryId === c.id ? (
                        <>
                          <Input
                            value={editingCategoryName}
                            onChange={(e) => setEditingCategoryName(e.target.value)}
                            className="h-7 text-sm"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                updateCategoryName(c.id);
                              }
                            }}
                          />
                          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateCategoryName(c.id)}>
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingCategoryId(null); setEditingCategoryName(""); }}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 truncate">{c.name}</span>
                          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingCategoryId(c.id); setEditingCategoryName(c.name); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeCategory(c.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t pt-3 text-sm">
          <div className="space-x-3">
            <span className="text-muted-foreground">Total da transação:</span>
            <span className="font-medium">{fmtBRL(total)}</span>
          </div>
          <div className="space-x-3">
            <span className="text-muted-foreground">Soma:</span>
            <span className="font-medium">{fmtBRL(sum)}</span>
          </div>
          <div className="space-x-3">
            <span className="text-muted-foreground">Diferença:</span>
            <span className={`font-semibold ${balanced ? "text-success" : "text-destructive"}`}>
              {fmtBRL(diff)}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={create} disabled={submitting || !balanced || !allValid}>
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Criar e marcar como conciliada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
