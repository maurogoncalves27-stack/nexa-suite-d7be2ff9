import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { Wallet, ChevronLeft, ChevronRight, CalendarDays, Trophy } from "lucide-react";
import WeeklyPaymentsPanel from "@/components/evaluations/WeeklyPaymentsPanel";

const weekStartOf = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
};

const weekEndOf = (weekStart: Date): Date => {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
};

const fmtDate = (d: Date) =>
  d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

export default function WeeklyPayments() {
  // Pagamento é feito normalmente na quarta, referente à semana ANTERIOR (dom-sáb).
  // Por isso o padrão abre na semana passada, não na atual.
  const previousWeekStart = () => {
    const d = weekStartOf(new Date());
    d.setDate(d.getDate() - 7);
    return d;
  };
  const [weekStart, setWeekStart] = useState<Date>(() => previousWeekStart());
  const weekEnd = useMemo(() => weekEndOf(weekStart), [weekStart]);
  const currentWeekStart = weekStartOf(new Date());
  const isCurrentWeek = currentWeekStart.getTime() === weekStart.getTime();
  const isPreviousWeek = previousWeekStart().getTime() === weekStart.getTime();

  const goPrev = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  };

  const goNext = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  };

  const goPreviousWeek = () => setWeekStart(previousWeekStart());

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Cabeçalho compacto: título + seletor de semana em uma linha no desktop */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl md:text-3xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            Bonificações
            <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 ml-1">
              <Link to="/ranking">
                <Trophy className="h-4 w-4 text-amber-500" />
                <span className="hidden sm:inline">Ver ranking</span>
                <span className="sm:hidden">Ranking</span>
              </Link>
            </Button>
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Pagamento semanal por cargo · quarta-feira · semana anterior (dom–sáb)
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap md:flex-nowrap md:shrink-0">
          <CalendarDays className="h-4 w-4 text-muted-foreground hidden sm:block" />
          <Button variant="outline" size="icon" onClick={goPrev} aria-label="Semana anterior" className="shrink-0 h-9 w-9">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="px-2 py-1.5 border rounded-md text-xs text-center bg-background min-w-[150px]">
            <div>
              <span className="font-semibold">{fmtDate(weekStart)}</span>
              <span className="text-muted-foreground"> a </span>
              <span className="font-semibold">{fmtDate(weekEnd)}</span>
            </div>
            {isPreviousWeek && <div className="text-[10px] uppercase tracking-wide text-primary font-semibold">Semana a pagar</div>}
            {isCurrentWeek && <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Em curso</div>}
          </div>
          <Button variant="outline" size="icon" onClick={goNext} aria-label="Próxima semana" className="shrink-0 h-9 w-9">
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isPreviousWeek && (
            <Button variant="ghost" size="sm" onClick={goPreviousWeek} className="text-xs h-9">Semana a pagar</Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-3 md:p-4">
          <WeeklyPaymentsPanel weekStart={weekStart} />
        </CardContent>
      </Card>
    </div>
  );
}
