/**
 * Card "Roteiro de testes" — passo a passo para validar a integração PayGo sandbox.
 * Estado apenas local (sem persistência).
 */
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ListChecks, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  title: string;
  description: string;
}

const STEPS: Step[] = [
  {
    title: "Pinpad conectado",
    description: 'Confirme no card "Pinpad" o status "OK na porta X" antes de iniciar.',
  },
  {
    title: "Venda Débito aprovada",
    description: 'Clique "Débito" em Venda de Teste, valor R$ 1,00, senha sandbox 1234. Esperado: comprovante na impressora simulada.',
  },
  {
    title: "Venda Crédito à vista aprovada",
    description: 'Botão "Crédito", à vista, senha 1234. Esperado: aprovação + cupom.',
  },
  {
    title: "Venda Crédito parcelado (2x sem juros)",
    description: 'Botão "Crédito", escolha "Parcelado loja" no menu DEMO, 2 parcelas.',
  },
  {
    title: "Venda negada",
    description: "Repita um débito digitando senha errada (0000). Esperado: retorno negado, sem cupom.",
  },
  {
    title: "Cancelamento de venda",
    description: 'No "Extrator de RECNUM" pegue o NSU da última venda aprovada e cancele.',
  },
  {
    title: "PIX QR Code C6 BANK",
    description: 'Botão "PIX" em Venda de Teste, valor R$ 1,00. QR aparece no pinpad, simule o pagamento.',
  },
  {
    title: "Reimpressão (opcional)",
    description: "Verifique o histórico no card da impressora simulada.",
  },
  {
    title: "Checklist de homologação",
    description: 'Marque os cenários concluídos no card "Checklist" para registrar evidências.',
  },
];

const TefRoteiroTestesCard = () => {
  const [done, setDone] = useState<Record<number, boolean>>({});

  const toggle = (i: number) =>
    setDone((prev) => ({ ...prev, [i]: !prev[i] }));

  const reset = () => setDone({});

  const completed = Object.values(done).filter(Boolean).length;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <ListChecks className="h-5 w-5 text-primary shrink-0" />
          <div className="min-w-0">
            <h2 className="font-semibold text-sm">Roteiro de testes</h2>
            <p className="text-xs text-muted-foreground">
              Siga na ordem para validar a integração — {completed}/{STEPS.length} concluídos.
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={reset} className="shrink-0 h-8">
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          Resetar
        </Button>
      </div>

      <ol className="space-y-2">
        {STEPS.map((step, i) => {
          const checked = !!done[i];
          return (
            <li
              key={i}
              className={cn(
                "flex items-start gap-3 rounded-md border bg-muted/30 p-2.5 transition",
                checked && "opacity-60",
              )}
            >
              <Checkbox
                id={`roteiro-${i}`}
                checked={checked}
                onCheckedChange={() => toggle(i)}
                className="mt-0.5"
              />
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold text-primary shrink-0">
                  {i + 1}
                </span>
                <label
                  htmlFor={`roteiro-${i}`}
                  className="min-w-0 flex-1 cursor-pointer select-none"
                >
                  <div
                    className={cn(
                      "text-sm font-medium leading-tight",
                      checked && "line-through",
                    )}
                  >
                    {step.title}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {step.description}
                  </div>
                </label>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
};

export default TefRoteiroTestesCard;
