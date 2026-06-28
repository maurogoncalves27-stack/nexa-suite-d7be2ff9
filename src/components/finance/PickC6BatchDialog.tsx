import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Boxes } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { sortStores } from "@/lib/storeSort";

export interface C6BatchCandidate {
  id: string;
  source: string;
  source_ref: string | null;
  payment_date: string;
  total: number;
  line_count: number;
  default_store_id: string | null;
}

interface Line {
  id: string;
  name: string;
  amount: number;
  store_id: string | null;
}

interface Store { id: string; name: string }

interface Props {
  tx: { id: string; posted_at: string; amount: number; payee: string | null; memo: string | null } | null;
  candidates: C6BatchCandidate[];
  onOpenChange: (o: boolean) => void;
  onApplied: () => void;
}

const fmtBRL = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");

const SOURCE_LABEL: Record<string, string> = {
  payroll: "Folha",
  weekly_bonus: "Bonificação semanal",
  internship: "Estágio",
  freelancer: "Freelancer",
  rescission: "Rescisão",
  training: "Treinamento",
  other: "Outro",
};

export default function PickC6BatchDialog({ tx, candidates, onOpenChange, onApplied }: Props) {
  const single = candidates.length === 1;
  const [selectedId, setSelectedId] = useState<string>("");
  const [lines, setLines] = useState<Line[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [defaultStoreId, setDefaultStoreId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!tx) return;
    setSelectedId(single ? candidates[0].id : "");
    setDefaultStoreId("");
    setLines([]);
  }, [tx, candidates, single]);

  useEffect(() => {
    if (!tx) return;
    (async () => {
      const { data } = await supabase
        .from("stores")
        .select("id, name, store_type")
        .eq("is_virtual", false)
        .neq("store_type", "central")
        .order("name");
      setStores(sortStores((data ?? [])) as Store[]);
    })();
  }, [tx]);

  const selected = useMemo(
    () => candidates.find((c) => c.id === selectedId) ?? null,
    [candidates, selectedId],
  );

  useEffect(() => {
    if (!selected) { setLines([]); return; }
    setDefaultStoreId(selected.default_store_id ?? "");
    setLoadingLines(true);
    (async () => {
      const { data, error } = await supabase
        .from("c6_payment_batch_lines" as any)
        .select("id, name, amount, store_id")
        .eq("batch_id", selected.id);
      setLoadingLines(false);
      if (error) {
        toast({ title: "Erro ao carregar linhas", description: error.message, variant: "destructive" });
        return;
      }
      setLines((data ?? []) as unknown as Line[]);
    })();
  }, [selected]);

  const linesMissingStore = lines.filter((l) => !l.store_id).length;
  const needsDefaultStore = linesMissingStore > 0;
  const canApply = !!selected && !loadingLines && (!needsDefaultStore || !!defaultStoreId);

  const apply = async () => {
    if (!tx || !selected) return;
    setSubmitting(true);
    try {
      // Se faltou loja padrão, grava no lote antes de chamar a RPC
      if (needsDefaultStore && defaultStoreId && defaultStoreId !== selected.default_store_id) {
        const { error: upErr } = await supabase
          .from("c6_payment_batches" as any)
          .update({ default_store_id: defaultStoreId })
          .eq("id", selected.id);
        if (upErr) throw upErr;
      }
      const { data, error } = await supabase.rpc("reconcile_bank_tx_with_c6_batch" as any, {
        _transaction_id: tx.id,
        _batch_id: selected.id,
      });
      if (error) throw error;
      toast({
        title: "Lote conciliado",
        description: `${data ?? lines.length} lançamento(s) criado(s).`,
      });
      onOpenChange(false);
      onApplied();
    } catch (e: any) {
      toast({ title: "Falhou ao conciliar lote", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!tx} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-primary" /> Conciliar com lote C6
          </DialogTitle>
          <DialogDescription>
            {tx && `${fmtBRL(Math.abs(tx.amount))} em ${new Date(tx.posted_at + "T00:00:00").toLocaleDateString("pt-BR")} — ${tx.payee || tx.memo || "—"}`}
          </DialogDescription>
        </DialogHeader>

        {!single && (
          <div className="space-y-2">
            <Label>Lote correspondente</Label>
            <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${selectedId === c.id ? "bg-primary/5" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{SOURCE_LABEL[c.source] ?? c.source}</span>
                    <span className="font-medium">{fmtBRL(c.total)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.source_ref || "—"} • {fmtDate(c.payment_date)} • {c.line_count} linha(s)
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {selected && (
          <div className="space-y-3">
            <div className="rounded-md border p-3 bg-muted/30 text-sm">
              <div className="flex justify-between font-medium">
                <span>{SOURCE_LABEL[selected.source] ?? selected.source}</span>
                <span>{fmtBRL(selected.total)}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {selected.source_ref || "—"} • Pago em {fmtDate(selected.payment_date)} • {selected.line_count} linha(s)
              </div>
            </div>

            {needsDefaultStore && (
              <div className="space-y-1">
                <Label>Loja padrão *</Label>
                <p className="text-xs text-muted-foreground">
                  {linesMissingStore} linha(s) do lote não têm loja específica. Escolha a loja que receberá esses lançamentos.
                </p>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={defaultStoreId}
                  onChange={(e) => setDefaultStoreId(e.target.value)}
                >
                  <option value="">Selecione...</option>
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            <div>
              <Label className="text-xs">Beneficiários ({lines.length})</Label>
              <div className="mt-1 border rounded-md max-h-64 overflow-y-auto divide-y text-sm">
                {loadingLines ? (
                  <div className="p-4 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>
                ) : lines.length === 0 ? (
                  <p className="p-3 text-muted-foreground text-center text-xs">Sem linhas neste lote.</p>
                ) : (
                  lines.map((l) => (
                    <div key={l.id} className="flex items-center justify-between px-3 py-1.5">
                      <span className="truncate">{l.name}</span>
                      <span className="font-medium whitespace-nowrap">{fmtBRL(Number(l.amount))}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={apply} disabled={submitting || !canApply}>
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Conciliar e criar {lines.length || ""} lançamento(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
