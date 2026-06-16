import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Split } from "lucide-react";

export interface AllocationSplit {
  store_id: string;
  amount: number;
  percent: number;
}

export interface StoreLite { id: string; name: string }

interface Props {
  stores: StoreLite[];
  totalAmount: number;
  value: AllocationSplit[];
  onChange: (splits: AllocationSplit[]) => void;
  disabled?: boolean;
}

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Editor reutilizável de rateio por loja (centro de custo).
 * Mantém a soma dos amounts == totalAmount (ajusta o último ao recalcular).
 * Não persiste nada — quem usa salva via supabase.from('finance_allocations').
 */
export default function AllocationEditor({ stores, totalAmount, value, onChange, disabled }: Props) {
  const [rows, setRows] = useState<AllocationSplit[]>(value);

  useEffect(() => { setRows(value); }, [value]);

  const emit = (next: AllocationSplit[]) => {
    setRows(next);
    onChange(next);
  };

  const recalcFromPercents = (next: AllocationSplit[]) => {
    if (totalAmount <= 0 || next.length === 0) return next;
    let allocated = 0;
    const out = next.map((r, i) => {
      if (i === next.length - 1) {
        const amount = round2(totalAmount - allocated);
        return { ...r, amount, percent: round2((amount / totalAmount) * 100) };
      }
      const amount = round2((r.percent / 100) * totalAmount);
      allocated += amount;
      return { ...r, amount };
    });
    return out;
  };

  const addRow = () => {
    const used = rows.reduce((s, r) => s + r.percent, 0);
    const remaining = Math.max(0, round2(100 - used));
    const next = [...rows, { store_id: "", amount: 0, percent: remaining }];
    emit(recalcFromPercents(next));
  };

  const removeRow = (idx: number) => {
    const next = rows.filter((_, i) => i !== idx);
    // Redistribui igualmente
    if (next.length > 0) {
      const pct = round2(100 / next.length);
      next.forEach((r, i) => { r.percent = i === next.length - 1 ? round2(100 - pct * (next.length - 1)) : pct; });
    }
    emit(recalcFromPercents(next));
  };

  const updateStore = (idx: number, store_id: string) => {
    const next = rows.map((r, i) => i === idx ? { ...r, store_id } : r);
    emit(next);
  };

  const updatePercent = (idx: number, percent: number) => {
    const safe = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
    const next = rows.map((r, i) => i === idx ? { ...r, percent: safe } : r);
    emit(recalcFromPercents(next));
  };

  const splitEvenly = () => {
    if (rows.length === 0) return;
    const pct = round2(100 / rows.length);
    const next = rows.map((r, i) => ({ ...r, percent: i === rows.length - 1 ? round2(100 - pct * (rows.length - 1)) : pct }));
    emit(recalcFromPercents(next));
  };

  const totalPct = round2(rows.reduce((s, r) => s + r.percent, 0));
  const totalAmt = round2(rows.reduce((s, r) => s + r.amount, 0));
  const sumOk = totalAmount === 0 || Math.abs(totalAmt - totalAmount) <= 0.02;
  const hasEmptyStore = rows.some((r) => !r.store_id);
  const duplicateStore = new Set(rows.map((r) => r.store_id).filter(Boolean)).size !== rows.filter((r) => r.store_id).length;

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1 text-sm"><Split className="h-3.5 w-3.5" /> Rateio entre lojas</Label>
        <div className="flex gap-1">
          <Button type="button" size="sm" variant="ghost" disabled={disabled || rows.length < 2} onClick={splitEvenly}>
            Dividir igual
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={addRow} className="gap-1">
            <Plus className="h-3.5 w-3.5" /> Loja
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem rateio. O valor inteiro vai para a loja selecionada acima.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_80px_110px_auto] gap-2 items-center">
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={r.store_id}
                disabled={disabled}
                onChange={(e) => updateStore(idx, e.target.value)}
              >
                <option value="">Selecione…</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <div className="relative">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className="h-9 pr-6 text-right"
                  value={r.percent}
                  disabled={disabled}
                  onChange={(e) => updatePercent(idx, parseFloat(e.target.value))}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
              </div>
              <div className="text-right text-sm font-medium tabular-nums">{fmtBRL(r.amount)}</div>
              <Button type="button" size="icon" variant="ghost" disabled={disabled} onClick={() => removeRow(idx)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <div className="flex justify-between text-xs pt-1 border-t">
            <span className={totalPct === 100 ? "text-muted-foreground" : "text-destructive font-medium"}>
              Total: {totalPct}%
            </span>
            <span className={sumOk ? "text-muted-foreground" : "text-destructive font-medium"}>
              {fmtBRL(totalAmt)} / {fmtBRL(totalAmount)}
            </span>
          </div>
          {(hasEmptyStore || duplicateStore || !sumOk) && (
            <p className="text-xs text-destructive">
              {hasEmptyStore && "Selecione a loja em todas as linhas. "}
              {duplicateStore && "Lojas duplicadas. "}
              {!sumOk && "Soma não bate com o valor."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Valida e devolve splits prontos para insert (ou null se inválido). */
export function validateSplits(splits: AllocationSplit[], totalAmount: number): AllocationSplit[] | null {
  if (splits.length === 0) return [];
  if (splits.some((r) => !r.store_id)) return null;
  if (new Set(splits.map((r) => r.store_id)).size !== splits.length) return null;
  const sum = splits.reduce((s, r) => s + r.amount, 0);
  if (Math.abs(sum - totalAmount) > 0.02) return null;
  return splits;
}
