import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, Plus, Pencil, Trash2, Check, X } from "lucide-react";
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

const fmtBRL = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function CreateFinanceFromTxDialog({ tx, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const isCredit = (tx?.amount ?? 0) > 0;
  const kind = isCredit ? "income" : "expense";
  const [stores, setStores] = useState<Store[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [storeId, setStoreId] = useState("");
  const [description, setDescription] = useState("");
  const [partyName, setPartyName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [competenceDate, setCompetenceDate] = useState("");
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
      setStores(sortStores((s.data ?? [])) as Store[]);
      setSuggestions(((sg.data ?? []) as Suggestion[]));
      setStoreId(((s.data ?? [])[0]?.id) ?? "");
      setDescription(tx.memo || tx.payee || "");
      setPartyName(tx.payee || "");
      setCategoryId("");
      setCompetenceDate(tx.posted_at ? String(tx.posted_at).slice(0, 10) : "");
      setManagingCategories(false);
      setNewCategoryName("");
      setEditingCategoryId(null);
      setEditingCategoryName("");
      await reloadCategories();
    })();
  }, [tx, kind]);

  const applySuggestion = (s: Suggestion) => {
    if (s.description) setDescription(s.description);
    if (s.party_name) setPartyName(s.party_name);
    if (s.category_id) setCategoryId(s.category_id);
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
    if (data?.id) setCategoryId(data.id);
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
    if (categoryId === id) setCategoryId("");
    await reloadCategories();
    toast({ title: "Categoria removida" });
  };

  const create = async () => {
    if (!tx || !storeId || !description || !user?.id) {
      toast({ title: "Loja e descrição são obrigatórias", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const fnName = isCredit ? "create_receivable_from_bank_tx" : "create_payable_from_bank_tx";
    const params = isCredit
      ? { _transaction_id: tx.id, _store_id: storeId, _description: description, _payer_name: partyName || null, _category_id: categoryId || null, _competence_date: competenceDate || null }
      : { _transaction_id: tx.id, _store_id: storeId, _description: description, _supplier_name: partyName || null, _category_id: categoryId || null, _competence_date: competenceDate || null };
    const { error } = await supabase.rpc(fnName as any, params as any);
    setSubmitting(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: isCredit ? "Conta a receber criada" : "Conta a pagar criada" });
    onOpenChange(false);
    onCreated?.();
  };

  return (
    <Dialog open={!!tx} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isCredit ? "Gerar conta a receber" : "Gerar conta a pagar"}</DialogTitle>
          <DialogDescription>
            {tx && `${fmtBRL(Math.abs(tx.amount))} em ${new Date(tx.posted_at + "T00:00:00").toLocaleDateString("pt-BR")} — ${tx.payee || tx.memo || "—"}`}
          </DialogDescription>
        </DialogHeader>

        {suggestions.length > 0 && (
          <div className="border rounded-md p-2 bg-muted/40">
            <div className="text-xs font-medium flex items-center gap-1 mb-1"><Sparkles className="h-3 w-3" /> Sugestões do histórico</div>
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

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Descrição *</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{isCredit ? "Pagador" : "Fornecedor"}</Label>
              <Input value={partyName} onChange={(e) => setPartyName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label>Categoria</Label>
                <button
                  type="button"
                  onClick={() => setManagingCategories((v) => !v)}
                  className="text-xs text-primary hover:underline"
                >
                  {managingCategories ? "Fechar" : "Gerenciar"}
                </button>
              </div>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">—</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>

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
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Loja *</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                <option value="">Selecione...</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Data de competência</Label>
              <Input type="date" value={competenceDate} onChange={(e) => setCompetenceDate(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={create} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Criar e marcar como conciliada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
