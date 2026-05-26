export type VacationRisk = "ok" | "warning" | "critical" | "expired";

export interface VacationStatus {
  acquisition_start: string;
  acquisition_end: string;
  concessive_end: string;
  days_scheduled: number;
  days_remaining: number;
  days_until_deadline: number;
  risk_level: VacationRisk;
}

export const RISK_LABEL: Record<VacationRisk, string> = {
  ok: "Em dia",
  warning: "Atenção (60 dias)",
  critical: "Crítico (30 dias)",
  expired: "Vencido",
};

export const RISK_BADGE: Record<VacationRisk, string> = {
  ok: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300",
  warning: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300",
  critical: "bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300",
  expired: "bg-red-100 text-red-900 border-red-300 dark:bg-red-950/40 dark:text-red-300",
};

export const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  approved: "Aprovada",
  in_progress: "Em andamento",
  completed: "Concluída",
  cancelled: "Cancelada",
};

export const formatDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
