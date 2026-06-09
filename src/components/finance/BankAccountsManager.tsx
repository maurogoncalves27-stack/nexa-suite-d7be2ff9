import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Landmark } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export interface BankAccount {
  id: string;
  name: string;
  bank_code: string | null;
  bank_name: string | null;
  agency: string | null;
  account_number: string | null;
  account_type: string | null;
  initial_balance: number;
  is_active: boolean;
  notes: string | null;
}

interface Props {
  onChanged?: () => void;
}

export default function BankAccountsManager({ onChanged }: Props) {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<BankAccount> | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("bank_accounts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setAccounts((data ?? []) as BankAccount[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing?.name) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const payload = {
      name: editing.name,
      bank_code: editing.bank_code || null,
      bank_name: editing.bank_name || null,
      agency: editing.agency || null,
      account_number: editing.account_number || null,
      account_type: editing.account_type || "checking",
      initial_balance: Number(editing.initial_balance ?? 0),
      is_active: editing.is_active ?? true,
      notes: editing.notes || null,
    };
    const { error } = editing.id
      ? await supabase.from("bank_accounts").update(payload).eq("id", editing.id)
      : await supabase.from("bank_accounts").insert(payload);
    setSubmitting(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing.id ? "Conta atualizada" : "Conta criada" });
    setEditing(null);
    await load();
    onChanged?.();
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-end gap-3">
          <Button size="sm" onClick={() => setEditing({ is_active: true, account_type: "checking", initial_balance: 0 })}>
            <Plus className="h-4 w-4 mr-1" /> Nova conta
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma conta cadastrada.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((a) => (
              <div key={a.id} className="border rounded-md p-3 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium">{a.name}</div>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(a)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  {a.bank_name || a.bank_code || "Banco —"} {a.agency && `• Ag. ${a.agency}`} {a.account_number && `• Cc. ${a.account_number}`}
                </div>
                <Badge variant={a.is_active ? "default" : "secondary"} className="text-xs">
                  {a.is_active ? "Ativa" : "Inativa"}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !submitting && !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar conta" : "Nova conta bancária"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1">
              <Label>Nome *</Label>
              <Input value={editing?.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Conta principal Itaú" />
            </div>
            <div className="space-y-1">
              <Label>Banco (nome)</Label>
              <Input value={editing?.bank_name ?? ""} onChange={(e) => setEditing({ ...editing, bank_name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Código (3 dígitos)</Label>
              <Input value={editing?.bank_code ?? ""} onChange={(e) => setEditing({ ...editing, bank_code: e.target.value })} placeholder="341" />
            </div>
            <div className="space-y-1">
              <Label>Agência</Label>
              <Input value={editing?.agency ?? ""} onChange={(e) => setEditing({ ...editing, agency: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Conta</Label>
              <Input value={editing?.account_number ?? ""} onChange={(e) => setEditing({ ...editing, account_number: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Saldo inicial</Label>
              <Input
                type="number"
                step="0.01"
                value={editing?.initial_balance ?? 0}
                onChange={(e) => setEditing({ ...editing, initial_balance: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1">
              <Label>Tipo</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={editing?.account_type ?? "checking"}
                onChange={(e) => setEditing({ ...editing, account_type: e.target.value })}
              >
                <option value="checking">Conta corrente</option>
                <option value="savings">Poupança</option>
                <option value="other">Outro</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={submitting}>Cancelar</Button>
            <Button onClick={save} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
