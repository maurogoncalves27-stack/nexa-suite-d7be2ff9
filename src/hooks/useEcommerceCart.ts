// Carrinho do e-commerce Grupo Aquela Parmê.
// Etapa 2: client-side via localStorage. Será sincronizado com edge function
// `ecommerce-cart` na Etapa 3 quando o Mercado Pago for ligado.
import { useCallback, useEffect, useState } from "react";

export type CartItem = {
  id: string; // uuid local
  menu_item_id: string;
  brand_code: "aquela-parme" | "aquele-estrogonofe" | "box-caipira";
  item_name: string;
  unit_price: number;
  quantity: number;
  notes?: string;
};

export type CartState = {
  storeSlug: string;
  items: CartItem[];
  customer_name?: string;
  customer_phone?: string;
  pickup_eta?: string; // ISO
};

const STORAGE_PREFIX = "pedir.cart.v1.";

function read(slug: string): CartState {
  if (typeof window === "undefined") return { storeSlug: slug, items: [] };
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + slug);
    if (!raw) return { storeSlug: slug, items: [] };
    const parsed = JSON.parse(raw) as CartState;
    return { ...parsed, storeSlug: slug, items: parsed.items ?? [] };
  } catch {
    return { storeSlug: slug, items: [] };
  }
}

function write(state: CartState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_PREFIX + state.storeSlug, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function useEcommerceCart(storeSlug: string) {
  const [state, setState] = useState<CartState>(() => read(storeSlug));

  useEffect(() => {
    setState(read(storeSlug));
  }, [storeSlug]);

  useEffect(() => {
    write(state);
  }, [state]);

  const addItem = useCallback((item: Omit<CartItem, "id" | "quantity"> & { quantity?: number }) => {
    setState((s) => {
      const existing = s.items.find(
        (i) => i.menu_item_id === item.menu_item_id && (i.notes ?? "") === (item.notes ?? ""),
      );
      if (existing) {
        return {
          ...s,
          items: s.items.map((i) =>
            i.id === existing.id ? { ...i, quantity: i.quantity + (item.quantity ?? 1) } : i,
          ),
        };
      }
      return {
        ...s,
        items: [
          ...s.items,
          {
            ...item,
            id: crypto.randomUUID(),
            quantity: item.quantity ?? 1,
          },
        ],
      };
    });
  }, []);

  const setQuantity = useCallback((id: string, qty: number) => {
    setState((s) => ({
      ...s,
      items:
        qty <= 0
          ? s.items.filter((i) => i.id !== id)
          : s.items.map((i) => (i.id === id ? { ...i, quantity: qty } : i)),
    }));
  }, []);

  const removeItem = useCallback((id: string) => {
    setState((s) => ({ ...s, items: s.items.filter((i) => i.id !== id) }));
  }, []);

  const clear = useCallback(() => {
    setState({ storeSlug, items: [] });
  }, [storeSlug]);

  const updateCustomer = useCallback((patch: Partial<Pick<CartState, "customer_name" | "customer_phone" | "pickup_eta">>) => {
    setState((s) => ({ ...s, ...patch }));
  }, []);

  const subtotal = state.items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);

  const brandBreakdown = state.items.reduce<Record<string, number>>((acc, i) => {
    acc[i.brand_code] = (acc[i.brand_code] ?? 0) + i.unit_price * i.quantity;
    return acc;
  }, {});

  const totalItems = state.items.reduce((sum, i) => sum + i.quantity, 0);

  return {
    state,
    items: state.items,
    subtotal,
    totalItems,
    brandBreakdown,
    addItem,
    setQuantity,
    removeItem,
    clear,
    updateCustomer,
  };
}

export function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
