import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Loader2, Plus, ChevronsUpDown, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved?: () => void;
}

interface Store { id: string; name: string }
interface Category { id: string; name: string }
interface Supplier { id: string; trade_name: string | null; legal_name: string; cnpj: string | null }

export default function NewPayableDialog({ open, onOpenChange, onSaved }: Props) {
  const { user } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [newSupplierOpen, setNewSupplierOpen] = useState(false);

  const [description, setDescription] = useState("");
  const [storeId, setStoreId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [competenceDate, setCompetenceDate] = useState(today);
  const [dueDate, setDueDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [digitableLine, setDigitableLine] = useState("");
  const [recurrence, setRecurrence] = useState<"none" | "weekly" | "monthly" | "yearly">("none");
  const [recurrenceCount, setRecurrenceCount] = useState("12");
  const [installments, setInstallments] = useState("1");
  const [installmentIntervalDays, setInstallmentIntervalDays] = useState("30");

  const loadSuppliers = async () => {
    const { data } = await supabase
      .from("suppliers")
      .select("id, trade_name, legal_name, cnpj")
      .eq("status", "approved")
      .order("trade_name");
    setSuppliers((data ?? []) as Supplier[]);
  };

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [{ data: s }, { data: c }] = await Promise.all([
        supabase.from("stores").select("id, name, store_type").eq("is_virtual", false).neq("store_type", "central").order("name"),
        supabase.from("finance_categories").select("id, name").in("kind", ["expense", "both"]).eq("is_active", true).order("sort_order").order("name"),
      ]);
      setStores((s ?? []) as Store[]);
      setCategories((c ?? []) as Category[]);
      await loadSuppliers();
    })();
    setSupplierId("");
    setSupplierName("");
    setDescription("");
    setStoreId("");
    setCategoryId("");
    setCompetenceDate(today);
    setDueDate(today);
    setAmount("");
    setDigitableLine("");
    setRecurrence("none");
    setRecurrenceCount("12");
    setInstallments("1");
    setInstallmentIntervalDays("30");
  }, [open]);

  const addInterval = (iso: string, i: number, kind: "weekly" | "monthly" | "yearly") => {
    const d = new Date(iso + "T12:00:00");
    if (kind === "weekly") d.setDate(d.getDate() + 7 * i);
    else if (kind === "monthly") d.setMonth(d.getMonth() + i);
    else d.setFullYear(d.getFullYear() + i);
    return d.toISOString().slice(0, 10);
  };

  const addDays = (iso: string, days: number) => {
    const d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const save = async () => {
    if (!user?.id) {
      toast({ title: "Erro", description: "Usuário não autenticado.", variant: "destructive" });
      return;
    }
    const valor = Number(amount);
    if (!valor || valor <= 0) {
      toast({ title: "Valor inválido", variant: "destructive" });
      return;
    }
    const installmentsCount = Math.max(1, Math.min(120, parseInt(installments) || 1));
    const recurrenceN = recurrence === "none" ? 1 : Math.max(1, Math.min(120, parseInt(recurrenceCount) || 1));
    // Mode: parcelamento divide o valor; recorrência repete o mesmo valor.
    // Se ambos > 1, parcelamento prevalece (com aviso visual já no UI).
    const isParcelado = installmentsCount > 1;
    const stepKind: "weekly" | "monthly" | "yearly" =
      isParcelado ? "monthly" : (recurrence !== "none" ? recurrence : "monthly");
    const count = isParcelado ? installmentsCount : recurrenceN;
    const intervalDays = Math.max(1, Math.min(365, parseInt(installmentIntervalDays) || 30));
    const groupId = count > 1 ? (crypto?.randomUUID?.() ?? null) : null;

    // Distribuir valor com ajuste de centavos na última parcela
    const baseCents = isParcelado ? Math.floor((valor * 100) / count) : Math.round(valor * 100);
    const totalBaseCents = baseCents * count;
    const remainderCents = isParcelado ? Math.round(valor * 100) - totalBaseCents : 0;

    const rows = Array.from({ length: count }, (_, i) => {
      const cents = baseCents + (i === count - 1 ? remainderCents : 0);
      return {
        supplier_name: supplierName || null,
        description: description
          ? (count > 1 ? `${description} (${i + 1}/${count})` : description)
          : null,
        store_id: storeId || null,
        category_id: categoryId || null,
        competence_date: competenceDate
          ? (count === 1 ? competenceDate : addInterval(competenceDate, i, stepKind))
          : null,
        due_date: count === 1
          ? (dueDate || today)
          : (isParcelado
              ? addDays(dueDate || today, i * intervalDays)
              : addInterval(dueDate || today, i, stepKind)),
        amount: cents / 100,
        digitable_line: i === 0 ? (digitableLine || null) : null,
        status: "pending",
        installment_number: i + 1,
        recurrence_group_id: groupId,
        created_by: user.id,
      };
    });

    setSubmitting(true);
    const { error } = await supabase.from("accounts_payable").insert(rows as any);
    setSubmitting(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: count > 1 ? `${count} ${isParcelado ? "parcelas" : "lançamentos"} incluído(s)` : "Pagamento incluído" });
    onOpenChange(false);
    onSaved?.();
  };

  const supplierLabel = (s: Supplier) => s.trade_name || s.legal_name;

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo pagamento</DialogTitle>
          <DialogDescription>Inclua manualmente uma conta a pagar (boleto, despesa, etc).</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Fornecedor / Beneficiário</Label>
            <div className="flex gap-2">
              <Popover open={supplierPickerOpen} onOpenChange={setSupplierPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    className="flex-1 justify-between font-normal"
                  >
                    <span className={cn("truncate", !supplierName && "text-muted-foreground")}>
                      {supplierName || "Selecionar fornecedor..."}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar fornecedor..." />
                    <CommandList>
                      <CommandEmpty>Nenhum fornecedor encontrado.</CommandEmpty>
                      <CommandGroup>
                        {suppliers.map((s) => (
                          <CommandItem
                            key={s.id}
                            value={`${supplierLabel(s)} ${s.cnpj ?? ""}`}
                            onSelect={() => {
                              setSupplierId(s.id);
                              setSupplierName(supplierLabel(s));
                              setSupplierPickerOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", supplierId === s.id ? "opacity-100" : "opacity-0")} />
                            <div className="flex-1 min-w-0">
                              <div className="truncate">{supplierLabel(s)}</div>
                              {s.cnpj && <div className="text-xs text-muted-foreground truncate">{s.cnpj}</div>}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setNewSupplierOpen(true)}
                title="Cadastrar novo fornecedor"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Aluguel, energia, boleto..." />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Loja</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                <option value="">—</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Categoria</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">—</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Competência</Label>
              <Input type="date" value={competenceDate} onChange={(e) => setCompetenceDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Vencimento</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Valor total (R$)</Label>
              <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Parcelar em (x)</Label>
              <Input
                type="number"
                min="1"
                max="120"
                value={installments}
                onChange={(e) => setInstallments(e.target.value)}
              />
              {Number(installments) > 1 && Number(amount) > 0 && (
                <p className="text-xs text-muted-foreground">
                  {installments}x de aprox. R$ {(Number(amount) / Math.max(1, parseInt(installments) || 1)).toFixed(2)}
                </p>
              )}
            </div>
          </div>
          {Number(installments) > 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Vencimento da 1ª parcela</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Dias entre parcelas</Label>
                <Input
                  type="number"
                  min="1"
                  max="365"
                  value={installmentIntervalDays}
                  onChange={(e) => setInstallmentIntervalDays(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Próximas parcelas vencem a cada {Math.max(1, parseInt(installmentIntervalDays) || 30)} dia(s) após a anterior.
                </p>
              </div>
            </div>
          )}
          <div className="space-y-1">
            <Label>Recorrência {Number(installments) > 1 && <span className="text-xs text-muted-foreground">(desativada com parcelamento)</span>}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
              value={recurrence}
              disabled={Number(installments) > 1}
              onChange={(e) => setRecurrence(e.target.value as any)}
            >
              <option value="none">Sem recorrência</option>
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensal</option>
              <option value="yearly">Anual</option>
            </select>
          </div>
          {recurrence !== "none" && Number(installments) <= 1 && (
            <div className="space-y-1">
              <Label>Quantidade de repetições</Label>
              <Input
                type="number"
                min="1"
                max="120"
                value={recurrenceCount}
                onChange={(e) => setRecurrenceCount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Serão geradas {Math.max(1, Math.min(120, parseInt(recurrenceCount) || 1))} contas a pagar com o mesmo valor, avançando {recurrence === "weekly" ? "semanalmente" : recurrence === "monthly" ? "mensalmente" : "anualmente"}.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={save} disabled={submitting} className="gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <QuickSupplierDialog
      open={newSupplierOpen}
      onOpenChange={setNewSupplierOpen}
      onCreated={async (s) => {
        await loadSuppliers();
        setSupplierId(s.id);
        setSupplierName(s.trade_name || s.legal_name);
      }}
    />
    </>
  );
}

function QuickSupplierDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (s: Supplier) => void;
}) {
  const [legalName, setLegalName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLegalName(""); setTradeName(""); setCnpj(""); setEmail(""); setPhone("");
  }, [open]);

  const save = async () => {
    if (!legalName.trim()) {
      toast({ title: "Razão social obrigatória", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("suppliers")
      .insert({
        legal_name: legalName.trim(),
        trade_name: tradeName.trim() || null,
        cnpj: cnpj.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        status: "approved",
      } as any)
      .select("id, trade_name, legal_name, cnpj")
      .single();
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao cadastrar fornecedor", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Fornecedor cadastrado" });
    onOpenChange(false);
    if (data) onCreated(data as Supplier);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo fornecedor</DialogTitle>
          <DialogDescription>Cadastro rápido. Você pode completar dados depois em Fornecedores.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Razão social *</Label>
            <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Nome fantasia</Label>
            <Input value={tradeName} onChange={(e) => setTradeName(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>CNPJ</Label>
              <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Telefone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>E-mail</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Cadastrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
