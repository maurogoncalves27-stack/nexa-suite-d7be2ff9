import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { FinanceCategory } from "./FinanceCategoriesPanel";

export type EditableKind = "payable" | "receivable" | "transfer" | "bank";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: EditableKind | null;
  raw: any | null;
  onSaved?: () => void;
}

interface Store { id: string; name: string }

export default function EditStatementRowDialog({ open, onOpenChange, kind, raw, onSaved }: Props) {
  const [stores, setStores] = useState<Store[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [managingCategories, setManagingCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");

  // common fields
  const [description, setDescription] = useState("");
  const [partyName, setPartyName] = useState("");
  const [storeId, setStoreId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [settledDate, setSettledDate] = useState(""); // paid_at / received_at
  const [issueDate, setIssueDate] = useState(""); // for invoices (read-only display)
  const [competenceDate, setCompetenceDate] = useState(""); // editable competence (payable/receivable sem NF)
  const [amount, setAmount] = useState<string>("");

  const reloadCategories = async () => {
    if (!kind) return;
    const catKind = kind === "receivable" ? "income" : "expense";
    const { data } = await supabase
      .from("finance_categories")
      .select("*")
      .in("kind", [catKind, "both"])
      .eq("is_active", true)
      .order("sort_order")
      .order("name");
    setCategories((data ?? []) as FinanceCategory[]);
  };

  useEffect(() => {
    if (!open || !raw || !kind) return;
    (async () => {
      const { data: s } = await supabase
        .from("stores")
        .select("id, name")
        .eq("is_virtual", false)
        .neq("store_type", "central")
        .order("name");
      setStores((s ?? []) as Store[]);
      await reloadCategories();
    })();

    setDescription(raw.description ?? raw.memo ?? raw.payee ?? "");
    setPartyName(raw.supplier_name ?? raw.beneficiary ?? raw.payer_name ?? raw.payee ?? "");
    setStoreId(raw.store_id ?? "");
    setCategoryId(raw.category_id ?? "");
    setDueDate(raw.due_date ?? "");
    setSettledDate(
      kind === "payable" ? (raw.paid_at ? String(raw.paid_at).slice(0, 10) : "")
      : kind === "receivable" ? (raw.received_at ? String(raw.received_at).slice(0, 10) : "")
      : kind === "bank" ? (raw.posted_at ? String(raw.posted_at).slice(0, 10) : "")
      : kind === "transfer" ? (raw.transferred_at ? String(raw.transferred_at).slice(0, 10) : "")
      : ""
    );
    setIssueDate(raw.inventory_invoices?.issue_date ?? "");
    setCompetenceDate(raw.competence_date ? String(raw.competence_date).slice(0, 10) : "");
    setAmount(String(Math.abs(Number(raw.amount ?? 0))));
    setManagingCategories(false);
    setNewCategoryName("");
    setEditingCategoryId(null);
    setEditingCategoryName("");
  }, [open, raw, kind]);

  if (!kind || !raw) return null;

  const catKind: "expense" | "income" = kind === "receivable" ? "income" : "expense";

  const createCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    const { data, error } = await supabase
      .from("finance_categories")
      .insert({ name, kind: catKind, is_active: true, sort_order: 0 })
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
    // Soft-delete (deactivate) to preserve historical references
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

  const save = async () => {
    setSubmitting(true);
    let error: any = null;

    if (kind === "payable") {
      const { error: e } = await supabase.from("accounts_payable").update({
        description: description || null,
        supplier_name: partyName || null,
        store_id: storeId || raw.store_id,
        category_id: categoryId || null,
        due_date: dueDate || null,
        competence_date: competenceDate || null,
        paid_at: settledDate ? new Date(settledDate + "T12:00:00").toISOString() : null,
        amount: Number(amount) || 0,
      }).eq("id", raw.id);
      error = e;
    } else if (kind === "receivable") {
      const { error: e } = await supabase.from("accounts_receivable").update({
        description: description || "—",
        payer_name: partyName || null,
        store_id: storeId || raw.store_id,
        category_id: categoryId || null,
        due_date: dueDate || null,
        received_at: settledDate ? new Date(settledDate + "T12:00:00").toISOString() : null,
        amount: Number(amount) || 0,
      }).eq("id", raw.id);
      error = e;
    } else if (kind === "transfer") {
      const { error: e } = await supabase.from("bank_transfers").update({
        description: description || null,
        transferred_at: settledDate ? new Date(settledDate + "T12:00:00").toISOString() : raw.transferred_at,
        amount: Number(amount) || 0,
      }).eq("id", raw.id);
      error = e;
    } else if (kind === "bank") {
      const { error: e } = await supabase.from("bank_transactions").update({
        memo: description || null,
        payee: partyName || null,
      }).eq("id", raw.id);
      error = e;
    }

    setSubmitting(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Lançamento atualizado" });
    onOpenChange(false);
    onSaved?.();
  };

  const title =
    kind === "payable" ? "Editar conta a pagar"
    : kind === "receivable" ? "Editar conta a receber"
    : kind === "transfer" ? "Editar transferência"
    : "Editar movimentação bancária";

  const showInvoiceDate = kind === "payable" && !!raw.inventory_invoices;
  const showStoreCategory = kind === "payable" || kind === "receivable";

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Edite os campos do lançamento. Alterações refletem no extrato unificado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          {(kind === "payable" || kind === "receivable" || kind === "bank") && (
            <div className="space-y-1">
              <Label>{kind === "receivable" ? "Pagador" : "Fornecedor / Beneficiário"}</Label>
              <Input value={partyName} onChange={(e) => setPartyName(e.target.value)} />
            </div>
          )}

          {showStoreCategory && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Loja</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value)}
                >
                  <option value="">—</option>
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
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
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
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
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => updateCategoryName(c.id)}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => {
                                    setEditingCategoryId(null);
                                    setEditingCategoryName("");
                                  }}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <span className="flex-1 truncate">{c.name}</span>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => {
                                    setEditingCategoryId(c.id);
                                    setEditingCategoryName(c.name);
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-destructive"
                                  onClick={() => removeCategory(c.id)}
                                >
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
          )}

          <div className="grid grid-cols-2 gap-3">
            {showInvoiceDate && (
              <div className="space-y-1">
                <Label>Data competência (NF)</Label>
                <Input type="date" value={issueDate} disabled />
              </div>
            )}
            {(kind === "payable" || kind === "receivable") && (
              <div className="space-y-1">
                <Label>Vencimento</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            )}
            <div className="space-y-1">
              <Label>
                {kind === "payable" ? "Data pagamento"
                : kind === "receivable" ? "Data recebimento"
                : kind === "transfer" ? "Data transferência"
                : "Data lançamento"}
              </Label>
              <Input type="date" value={settledDate} onChange={(e) => setSettledDate(e.target.value)} />
            </div>
            {(kind === "payable" || kind === "receivable" || kind === "transfer") && (
              <div className="space-y-1">
                <Label>Valor (R$)</Label>
                <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            )}
          </div>

          {kind === "bank" && (
            <p className="text-xs text-muted-foreground">
              Movimentações bancárias importadas via OFX só permitem ajuste do descritivo.
              Para alterar valor ou data, gere uma conta vinculada a partir da Conciliação.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={save} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
