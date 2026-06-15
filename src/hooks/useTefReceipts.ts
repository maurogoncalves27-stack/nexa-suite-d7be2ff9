/**
 * Pequeno store em memória para a impressora simulada PayGo.
 * Cada venda de teste empurra um item com os textos de cupom devolvidos
 * pela PGWebLib (customerReceipt / merchantReceipt). Sem persistência.
 */
import { useSyncExternalStore } from "react";

export interface TefReceiptEntry {
  id: string;
  ts: number;
  label: string;
  customer?: string;
  merchant?: string;
  reduced?: string;
  diff1?: string;
  diff2?: string;
}

const MAX = 10;
let items: TefReceiptEntry[] = [];
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export const pushTefReceipt = (entry: Omit<TefReceiptEntry, "id" | "ts">) => {
  const next: TefReceiptEntry = {
    id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    ts: Date.now(),
    ...entry,
  };
  items = [next, ...items].slice(0, MAX);
  emit();
};

export const clearTefReceipts = () => {
  items = [];
  emit();
};

export const useTefReceipts = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => items,
    () => items,
  );
