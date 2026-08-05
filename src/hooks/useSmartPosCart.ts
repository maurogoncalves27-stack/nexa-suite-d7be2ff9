import { useCallback, useState } from "react";
import type { SelectedComplement } from "@/lib/menuCatalog";

export interface SmartPosCartItem {
  uid: string;
  menu_item_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  notes?: string;
  complements?: SelectedComplement[];
}

export function useSmartPosCart() {
  const [items, setItems] = useState<SmartPosCartItem[]>([]);

  const signature = (complements?: SelectedComplement[]) =>
    (complements ?? []).map((c) => c.option_id).sort().join("|");

  const add = useCallback((it: {
    id: string;
    name: string;
    price: number;
    notes?: string;
    complements?: SelectedComplement[];
  }) => {
    setItems((prev) => {
      const sig = signature(it.complements);
      const existing = prev.find(
        (p) =>
          p.menu_item_id === it.id &&
          (p.notes || "") === (it.notes || "") &&
          signature(p.complements) === sig,
      );
      if (existing) {
        return prev.map((p) =>
          p.uid === existing.uid ? { ...p, quantity: p.quantity + 1 } : p,
        );
      }
      return [
        ...prev,
        {
          uid: crypto.randomUUID(),
          menu_item_id: it.id,
          name: it.name,
          unit_price: Number(it.price) || 0,
          quantity: 1,
          notes: it.notes,
          complements: it.complements,
        },
      ];
    });
  }, []);

  const inc = useCallback((uid: string) => {
    setItems((prev) =>
      prev.map((p) => (p.uid === uid ? { ...p, quantity: p.quantity + 1 } : p)),
    );
  }, []);

  const dec = useCallback((uid: string) => {
    setItems((prev) =>
      prev
        .map((p) => (p.uid === uid ? { ...p, quantity: p.quantity - 1 } : p))
        .filter((p) => p.quantity > 0),
    );
  }, []);

  const remove = useCallback((uid: string) => {
    setItems((prev) => prev.filter((p) => p.uid !== uid));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const count = items.reduce((s, i) => s + i.quantity, 0);
  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

  return { items, add, inc, dec, remove, clear, count, total };
}

