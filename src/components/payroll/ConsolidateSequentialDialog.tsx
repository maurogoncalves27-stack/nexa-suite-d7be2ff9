import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Check, AlertTriangle, CreditCard, Send, Upload, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepStatus = "pending" | "running" | "done" | "error";
export interface StepState {
  status: StepStatus;
  message?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  monthLabel: string;
  stepPayables: StepState;
  stepSignatures: StepState;
  stepC6: StepState;
  onRunPayables: () => void | Promise<void>;
  onRunSignatures: () => void | Promise<void>;
  onRunC6: () => void | Promise<void>;
}

const StepRow = ({
  number, title, description, icon: Icon, state, onRun, runLabel, disabled,
}: {
  number: number;
  title: string;
  description: string;
  icon: typeof Check;
  state: StepState;
  onRun: () => void | Promise<void>;
  runLabel: string;
  disabled: boolean;
}) => {
  const isDone = state.status === "done";
  const isRunning = state.status === "running";
  const isError = state.status === "error";

  return (
    <div
      className={cn(
        "rounded-lg border p-3 sm:p-4 space-y-2",
        isDone && "border-emerald-500/60 bg-emerald-50/60 dark:bg-emerald-950/20",
        isError && "border-destructive/60 bg-destructive/5",
        !isDone && !isError && "bg-card",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex items-center justify-center h-8 w-8 rounded-full text-xs font-bold shrink-0",
            isDone && "bg-emerald-600 text-white",
            isError && "bg-destructive text-destructive-foreground",
            isRunning && "bg-primary text-primary-foreground",
            !isDone && !isError && !isRunning && "bg-muted text-muted-foreground",
          )}
        >
          {isDone ? <Check className="h-4 w-4" /> : isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : isError ? <AlertTriangle className="h-4 w-4" /> : number}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Icon className="h-4 w-4 text-muted-foreground" />
            {title}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          {state.message && (
            <p
              className={cn(
                "text-xs mt-1.5",
                isDone && "text-emerald-700 dark:text-emerald-400",
                isError && "text-destructive",
                !isDone && !isError && "text-muted-foreground",
              )}
            >
              {state.message}
            </p>
          )}
        </div>
      </div>

      {!isDone && (
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={onRun}
            disabled={disabled || isRunning}
            variant={isError ? "outline" : "default"}
            className={cn(!isError && "bg-emerald-600 hover:bg-emerald-700 text-white")}
          >
            {isRunning ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Executando…</>
            ) : isError ? (
              <><RefreshCw className="h-4 w-4 mr-2" /> Tentar novamente</>
            ) : (
              <>{runLabel}</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

export default function ConsolidateSequentialDialog({
  open, onOpenChange, monthLabel,
  stepPayables, stepSignatures, stepC6,
  onRunPayables, onRunSignatures, onRunC6,
}: Props) {
  const anyRunning =
    stepPayables.status === "running" ||
    stepSignatures.status === "running" ||
    stepC6.status === "running";
  const allDone =
    stepPayables.status === "done" &&
    stepSignatures.status === "done" &&
    stepC6.status === "done";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!anyRunning) onOpenChange(o); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Consolidar folha de {monthLabel}</DialogTitle>
          <DialogDescription>
            Execute as três etapas em sequência. Cada uma roda independente — se falhar, é só reexecutar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <StepRow
            number={1}
            title="Lançar no contas a pagar"
            description="Cria os pagamentos individuais no extrato com vencimento no 5º dia útil."
            icon={CreditCard}
            state={stepPayables}
            onRun={onRunPayables}
            runLabel="Lançar pagamentos"
            disabled={false}
          />

          <StepRow
            number={2}
            title="Enviar holerites para assinatura"
            description="Gera o PDF de cada colaborador e dispara o pedido de assinatura digital."
            icon={Send}
            state={stepSignatures}
            onRun={onRunSignatures}
            runLabel="Enviar para assinatura"
            disabled={stepPayables.status !== "done"}
          />

          <StepRow
            number={3}
            title="Exportar arquivo C6 Bank (PIX)"
            description="Baixa a planilha pronta para upload no portal do C6. Trava a folha em modo somente leitura."
            icon={Upload}
            state={stepC6}
            onRun={onRunC6}
            runLabel="Gerar arquivo C6"
            disabled={stepSignatures.status !== "done"}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={anyRunning}
          >
            {allDone ? "Fechar" : "Cancelar"}
          </Button>
          {allDone && (
            <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <Check className="h-4 w-4" /> Folha consolidada com sucesso
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
