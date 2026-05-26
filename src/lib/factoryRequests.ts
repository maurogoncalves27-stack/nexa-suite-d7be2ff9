import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export type Status = "pending" | "approved" | "rejected" | "shipped" | "received" | "cancelled";

export interface Store {
  id: string;
  name: string;
  store_type: string;
}
export interface Product {
  id: string;
  name: string;
  unit: string;
}
export interface DraftItem {
  product_id: string;
  quantity: string;
  notes: string;
}
export interface RequestItem {
  id: string;
  product_id: string;
  quantity_requested: number;
  quantity_approved: number | null;
  quantity_delivered: number | null;
  unit: string;
  notes: string | null;
  inventory_products: { name: string; unit: string } | null;
}
export interface FactoryRequest {
  id: string;
  store_id: string;
  status: Status;
  notes: string | null;
  rejection_reason: string | null;
  requested_at: string;
  approved_at: string | null;
  shipped_at: string | null;
  received_at: string | null;
  store: { name: string } | null;
  items: RequestItem[];
}

export const STATUS_LABEL: Record<Status, string> = {
  pending: "Aguardando",
  approved: "Aprovado",
  rejected: "Recusado",
  shipped: "Enviado",
  received: "Recebido",
  cancelled: "Cancelado",
};

export const STATUS_VARIANT: Record<Status, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
  shipped: "default",
  received: "outline",
  cancelled: "destructive",
};

export const fmtDate = (iso: string | null) =>
  iso ? format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—";

export const fmtNum = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
