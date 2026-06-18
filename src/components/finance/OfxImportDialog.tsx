import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { parseOfx } from "@/lib/ofxParser";
import type { BankAccount } from "./BankAccountsManager";

interface Props {
  accounts: BankAccount[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onImported?: () => void;
}

export default function OfxImportDialog({ accounts, open, onOpenChange, onImported }: Props) {
  const [accountId, setAccountId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setAccountId("");
    setFile(null);
  };

  const importNow = async () => {
    if (!accountId || !file) {
      toast({ title: "Selecione conta e arquivo", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    let createdStatementId: string | null = null;
    let inserted = 0;
    try {
      const text = await file.text();
      const parsed = parseOfx(text);
      if (parsed.transactions.length === 0) {
        throw new Error("Nenhuma transação encontrada no arquivo OFX");
      }

      const fileDuplicatesByFitId = new Set<string>();
      const uniqueRowsMap = new Map<string, {
        bank_account_id: string;
        fit_id: string;
        posted_at: string;
        amount: number;
        trn_type: string | null;
        memo: string | null;
        check_number: string | null;
        payee: string | null;
      }>();

      for (const t of parsed.transactions) {
        const key = t.fitId.trim();
        if (!key) continue;
        if (uniqueRowsMap.has(key)) {
          fileDuplicatesByFitId.add(key);
          continue;
        }
        uniqueRowsMap.set(key, {
          bank_account_id: accountId,
          fit_id: key,
          posted_at: t.postedAt,
          amount: t.amount,
          trn_type: t.trnType || null,
          memo: t.memo || null,
          check_number: t.checkNumber,
          payee: t.payee,
        });
      }

      const uniqueRows = Array.from(uniqueRowsMap.values());
      const existingFitIds = new Set<string>();
      for (let i = 0; i < uniqueRows.length; i += 500) {
        const fitIds = uniqueRows.slice(i, i + 500).map((row) => row.fit_id);
        const { data, error } = await supabase
          .from("bank_transactions")
          .select("fit_id")
          .eq("bank_account_id", accountId)
          .in("fit_id", fitIds);
        if (error) throw error;
        for (const item of data ?? []) {
          if (item.fit_id) existingFitIds.add(item.fit_id);
        }
      }

      const rowsToInsert = uniqueRows.filter((row) => !existingFitIds.has(row.fit_id));
      const duplicatesInDatabase = uniqueRows.length - rowsToInsert.length;

      if (rowsToInsert.length === 0) {
        toast({
          title: "Arquivo já importado",
          description:
            `Nenhuma transação nova encontrada.` +
            `${duplicatesInDatabase > 0 ? ` ${duplicatesInDatabase} já existiam na conta.` : ""}` +
            `${fileDuplicatesByFitId.size > 0 ? ` ${fileDuplicatesByFitId.size} duplicadas no próprio OFX foram ignoradas.` : ""}`,
        });
        return;
      }

      const { data: stmt, error: stmtErr } = await supabase
        .from("bank_statements")
        .insert({
          bank_account_id: accountId,
          file_name: file.name,
          period_start: parsed.periodStart,
          period_end: parsed.periodEnd,
          opening_balance: parsed.openingBalance,
          closing_balance: parsed.closingBalance,
          ofx_bank_id: parsed.bankId,
          ofx_account_id: parsed.accountId,
        })
        .select("id")
        .single();
      if (stmtErr) throw stmtErr;
      createdStatementId = stmt.id;

      for (let i = 0; i < rowsToInsert.length; i += 500) {
        const chunk = rowsToInsert.slice(i, i + 500).map((row) => ({
          ...row,
          statement_id: stmt.id,
        }));
        const { data, error } = await supabase
          .from("bank_transactions")
          .upsert(chunk, { onConflict: "bank_account_id,fit_id", ignoreDuplicates: true })
          .select("id");
        if (error) throw error;
        inserted += data?.length ?? 0;
      }

      const duplicates = duplicatesInDatabase + fileDuplicatesByFitId.size + (rowsToInsert.length - inserted);

      toast({
        title: "Extrato importado",
        description: `${inserted} transações novas${duplicates > 0 ? `, ${duplicates} duplicadas ignoradas` : ""}.`,
      });
      reset();
      onOpenChange(false);
      onImported?.();
    } catch (err: any) {
      if (createdStatementId && inserted === 0) {
        await supabase.from("bank_statements").delete().eq("id", createdStatementId);
      }
      console.error("[OFX import] erro:", err);
      const description =
        err?.message ||
        err?.error_description ||
        err?.hint ||
        err?.details ||
        (typeof err === "string" ? err : JSON.stringify(err));
      toast({
        title: "Erro ao importar",
        description,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent
        className="max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Importar extrato OFX</DialogTitle>
          <DialogDescription>
            Selecione a conta bancária e envie o arquivo .ofx baixado do internet banking. Transações já importadas são ignoradas automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Conta bancária *</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">Selecione...</option>
              {accounts.filter((a) => a.is_active).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Arquivo OFX *</Label>
            <Input
              type="file"
              accept=".ofx,application/x-ofx,text/plain"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={importNow} disabled={submitting || !accountId || !file}>
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
