import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, ArrowRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { BankAccount } from "./BankAccountsManager";

interface Transfer {
  id: string;
  from_account_id: string;
  to_account_id: string;
  amount: number;
  transferred_at: string;
  description: string | null;
  notes: string | null;
  from_account?: { name: string } | null;
  to_account?: { name: string } | null;
}

const fmtBRL = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (iso: string | null) => iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "—";

export default function BankTransfersPanel() {
  const { user } = useAuth();
  const [items, setItems] = useState<Transfer[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Transfer> | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    const [t, a] = await Promise.all([
      supabase.from("bank_transfers")
        .select("*, from_account:bank_accounts!bank_transfers_from_account_id_fkey(name), to_account:bank_accounts!bank_transfers_to_account_id_fkey(name)")
        .order("transferred_at", { ascending: false })
        .limit(200),
      supabase.from("bank_accounts").select("*").eq("is_active", true).order("name"),
    ]);
    if (t.error) toast({ title: "Erro", description: t.error.message, variant: "destructive" });
    else setItems((t.data ?? []) as unknown as Transfer[]);
    setAccounts((a.data ?? []) as BankAccount[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing?.from_account_id || !editing?.to_account_id || !editing?.amount || !user?.id) {
      toast({ title: "Conta origem, destino e valor são obrigatórios", variant: "destructive" });
      return;
    }
    if (editing.from_account_id === editing.to_account_id) {
      toast({ title: "Origem e destino devem ser diferentes", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("bank_transfers").insert({
      from_account_id: editing.from_account_id,
      to_account_id: editing.to_account_id,
      amount: Number(editing.amount),
      transferred_at: editing.transferred_at || new Date().toISOString().slice(0,10),
      description: editing.description || null,
      notes: editing.notes || null,
      created_by: user.id,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Transferência registrada" });
    setEditing(null);
    await load();
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Transferências entre contas</h3>
            <p className="text-sm text-muted-foreground">Movimentações entre contas bancárias próprias.</p>
          </div>
          <Button size="sm" onClick={() => setEditing({ transferred_at: new Date().toISOString().slice(0,10) })}>
            <Plus className="h-4 w-4 mr-1" /> Nova transferência
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma transferência registrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>De</TableHead>
                  <TableHead></TableHead>
                  <TableHead>Para</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap text-sm">{fmtDate(t.transferred_at)}</TableCell>
                    <TableCell className="text-sm">{t.from_account?.name ?? "—"}</TableCell>
                    <TableCell><ArrowRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                    <TableCell className="text-sm">{t.to_account?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[260px] truncate">{t.description || "—"}</TableCell>
                    <TableCell className="text-right font-medium whitespace-nowrap">{fmtBRL(Number(t.amount))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !submitting && !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nova transferência</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Conta de origem *</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={editing?.from_account_id ?? ""} onChange={(e) => setEditing({ ...editing, from_account_id: e.target.value })}>
                <option value="">Selecione...</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Conta de destino *</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={editing?.to_account_id ?? ""} onChange={(e) => setEditing({ ...editing, to_account_id: e.target.value })}>
                <option value="">Selecione...</option>
                {accounts.filter((a) => a.id !== editing?.from_account_id).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Valor *</Label>
                <Input type="number" step="0.01" value={editing?.amount ?? ""}
                  onChange={(e) => setEditing({ ...editing, amount: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1">
                <Label>Data *</Label>
                <Input type="date" value={editing?.transferred_at ?? ""}
                  onChange={(e) => setEditing({ ...editing, transferred_at: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Input value={editing?.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Observações</Label>
              <Textarea rows={2} value={editing?.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={submitting}>Cancelar</Button>
            <Button onClick={save} disabled={submitting}>{submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
