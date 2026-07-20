import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, format, addDays } from "date-fns";

export interface SegmentMetrics {
  // Financeiro
  payablesOpen: number;
  payablesOverdue: number;
  payablesDueWeek: number;
  payablesAmountOpen: number;
  receivablesOpen: number;
  receivablesAmountOpen: number;
  // Operações
  maintenancePending: number;
  maintenanceUrgent: number;
  announcementsActive: number;
  tasksActive: number;
  occurrencesMonth: number;
  occurrencesPending: number;
  checklistsToday: number;
  // Estoque & Cardápio
  productsOutOfStock: number;
  productsLowStock: number;
  posSalesMonth: number;
  posRevenueMonth: number;
  unmappedPosItems: number;
  loading: boolean;
}

const EMPTY: Omit<SegmentMetrics, "loading"> = {
  payablesOpen: 0,
  payablesOverdue: 0,
  payablesDueWeek: 0,
  payablesAmountOpen: 0,
  receivablesOpen: 0,
  receivablesAmountOpen: 0,
  maintenancePending: 0,
  maintenanceUrgent: 0,
  announcementsActive: 0,
  tasksActive: 0,
  occurrencesMonth: 0,
  occurrencesPending: 0,
  checklistsToday: 0,
  productsOutOfStock: 0,
  productsLowStock: 0,
  posSalesMonth: 0,
  posRevenueMonth: 0,
  unmappedPosItems: 0,
};

async function fetchSegmentMetrics(): Promise<Omit<SegmentMetrics, "loading">> {
  const today = format(new Date(), "yyyy-MM-dd");
  const in7 = format(addDays(new Date(), 7), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");

  const [
    payOpen,
    payOverdue,
    payWeek,
    payAmt,
    recOpen,
    recAmt,
    maintPending,
    maintUrgent,
    announcements,
    tasks,
    stock,
    posMonth,
  ] = await Promise.all([
    supabase.from("accounts_payable").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("accounts_payable").select("id", { count: "exact", head: true }).eq("status", "open").lt("due_date", today),
    supabase.from("accounts_payable").select("id", { count: "exact", head: true }).eq("status", "open").gte("due_date", today).lte("due_date", in7),
    supabase.from("accounts_payable").select("amount").eq("status", "open"),
    supabase.from("accounts_receivable").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("accounts_receivable").select("amount").eq("status", "open"),
    supabase.from("nutri_maintenance_requests").select("id", { count: "exact", head: true }).in("status", ["pending", "approved"]),
    supabase.from("nutri_maintenance_requests").select("id", { count: "exact", head: true }).in("status", ["pending", "approved"]).eq("urgency", "high"),
    supabase.from("hr_announcements").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("employee_tasks").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("inventory_stock").select("quantity, min_qty"),
    supabase.from("pdv_orders").select("total").eq("status", "concluded").gte("concluded_at", monthStart).lte("concluded_at", monthEnd + "T23:59:59"),
  ]);

  const sumAmount = (rows: any[] | null | undefined) =>
    (rows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);

  const stockRows = (stock.data ?? []) as { quantity: number | null; min_qty: number | null }[];
  const productsOutOfStock = stockRows.filter((s) => Number(s.quantity ?? 0) <= 0).length;
  const productsLowStock = stockRows.filter(
    (s) => Number(s.min_qty ?? 0) > 0 && Number(s.quantity ?? 0) > 0 && Number(s.quantity ?? 0) <= Number(s.min_qty ?? 0),
  ).length;

  const posRows = (posMonth.data ?? []) as { total: number | null }[];
  const posRevenueMonth = posRows.reduce((s, r) => s + Number(r.total ?? 0), 0);

  return {
    payablesOpen: payOpen.count ?? 0,
    payablesOverdue: payOverdue.count ?? 0,
    payablesDueWeek: payWeek.count ?? 0,
    payablesAmountOpen: sumAmount(payAmt.data),
    receivablesOpen: recOpen.count ?? 0,
    receivablesAmountOpen: sumAmount(recAmt.data),
    maintenancePending: maintPending.count ?? 0,
    maintenanceUrgent: maintUrgent.count ?? 0,
    announcementsActive: announcements.count ?? 0,
    tasksActive: tasks.count ?? 0,
    checklistsToday: 0,
    productsOutOfStock,
    productsLowStock,
    posSalesMonth: posRows.length,
    posRevenueMonth,
    unmappedPosItems: 0,
  };
}

export function useSegmentMetrics(): SegmentMetrics {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-segment-metrics"],
    queryFn: fetchSegmentMetrics,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
  return { ...(data ?? EMPTY), loading: isLoading && !data };
}
