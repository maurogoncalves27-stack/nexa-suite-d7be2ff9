// ---------------- Types ----------------
export interface ComplementOption {
  id: string;
  group_id: string;
  name: string;
  price: number;
  sort_order: number;
}
export interface ComplementGroup {
  id: string;
  recipe_id: string;
  name: string;
  is_required: boolean;
  sort_order: number;
  options: ComplementOption[];
}
export interface MenuItem {
  product_id: string;
  recipe_id: string | null;
  name: string;
  category: string;
  price: number;
  pos_item_name: string | null;
  groups: ComplementGroup[];
}

// ---------------- Helpers ----------------
export const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
