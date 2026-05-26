import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

export interface Metric {
  label: string;
  value: number | string;
  icon: LucideIcon;
  color?: string;
  to?: string;
  hint?: string;
}

interface Props {
  metrics: Metric[];
  loading?: boolean;
}

export default function MetricsCard({ metrics, loading }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
      {metrics.map((c) => {
        const inner = (
          <Card className="shadow-sm hover:shadow-md transition-shadow h-full">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-1 pt-3 px-3 space-y-0">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground leading-tight truncate">
                {c.label}
              </CardTitle>
              <c.icon className={`h-4 w-4 sm:h-5 sm:w-5 shrink-0 ${c.color ?? "text-primary"}`} />
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              <div className="text-2xl sm:text-3xl font-bold text-foreground tabular-nums leading-none">
                {loading ? "—" : c.value}
              </div>
              {c.hint && <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 truncate">{c.hint}</p>}
            </CardContent>
          </Card>
        );
        return c.to ? (
          <Link key={c.label} to={c.to} className="block">{inner}</Link>
        ) : (
          <div key={c.label}>{inner}</div>
        );
      })}
    </div>
  );
}
