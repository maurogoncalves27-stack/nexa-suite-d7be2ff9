import { Check, Send, Lock, CreditCard, FileCheck2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type PayrollStage = "revisao" | "revisao_contabil" | "consolidar" | "paga";

interface Props {
  stage: PayrollStage;
}

const STEPS: { id: PayrollStage; label: string; short: string; icon: typeof Check }[] = [
  { id: "revisao",          label: "Revisão",          short: "Revisão",  icon: Send },
  { id: "revisao_contabil", label: "Revisão contábil", short: "Contábil", icon: FileCheck2 },
  { id: "consolidar",       label: "Consolidar",       short: "Consol.",  icon: Lock },
  { id: "paga",             label: "Paga",             short: "Paga",     icon: CreditCard },
];

export default function PayrollWorkflowStepper({ stage }: Props) {
  const currentIdx = STEPS.findIndex((s) => s.id === stage);

  return (
    <div className="w-full">
      <ol className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-1">
        {STEPS.map((step, idx) => {
          const isDone = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          const Icon = step.icon;
          return (
            <li key={step.id} className="flex items-center gap-1 sm:gap-2 shrink-0">
              <div
                className={cn(
                  "flex items-center gap-1.5 sm:gap-2 rounded-full px-2.5 py-1 sm:px-3 sm:py-1.5 border text-xs sm:text-sm",
                  isDone && "bg-emerald-100 border-emerald-300 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200",
                  isCurrent && "bg-primary text-primary-foreground border-primary shadow-sm",
                  !isDone && !isCurrent && "bg-muted/40 border-border text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold shrink-0",
                    isDone && "bg-emerald-600 text-white",
                    isCurrent && "bg-primary-foreground/20",
                    !isDone && !isCurrent && "bg-muted",
                  )}
                >
                  {isDone ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                </span>
                <span className="hidden sm:inline">{step.label}</span>
                <span className="sm:hidden">{step.short}</span>
              </div>
              {idx < STEPS.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 w-3 sm:w-6 rounded",
                    idx < currentIdx ? "bg-emerald-500" : "bg-border",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
