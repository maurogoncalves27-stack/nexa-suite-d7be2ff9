import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ListChecks, RotateCcw, Download } from "lucide-react";
import { toast } from "sonner";

type Passo = {
  n: number;
  titulo: string;
  desc: string;
};

type Secao = {
  id: string;
  titulo: string;
  passos: Passo[];
};

const ROTEIRO: Secao[] = [
  {
    id: "s1",
    titulo: "1. Instalação e vendas básicas",
    passos: [
      { n: 1, titulo: "Instalação", desc: "Instalar com os dados enviados pela PayGo. Esperado: 'TRANSAÇÃO APROVADA' e recibo impresso." },
      { n: 2, titulo: "Venda valor máximo", desc: "Venda com o valor máximo permitido pela automação (ex.: R$ 100.000,00). Esperado: aprovada e confirmada." },
      { n: 3, titulo: "Venda pré-seleção (DEMO/Cartão/Crédito/À vista)", desc: "Venda pré-selecionando Autorizador DEMO, Cartão, Crédito, À vista. Esperado: aprovada e confirmada." },
      { n: 4, titulo: "Venda negada", desc: "Venda de R$ 1.000,01 no DEMO. Esperado: NEGADA 01 retornada à automação." },
      { n: 5, titulo: "Venda negada - rede desconhecida", desc: "No menu de seleção de rede, pressionar Esc/Cancelar. Esperado: 'OPERAÇÃO CANCELADA'." },
      { n: 6, titulo: "Venda crédito (inserir cartão no PIN-Pad)", desc: "Venda na modalidade crédito inserindo cartão. Esperado: aprovada e confirmada." },
      { n: 7, titulo: "Venda débito (inserir cartão no PIN-Pad)", desc: "Venda na modalidade débito inserindo cartão. Esperado: aprovada e confirmada." },
      { n: 8, titulo: "Venda crédito parcelado loja em 99x", desc: "Venda crédito parcelada pelo estabelecimento em 99 parcelas. Esperado: aprovada e confirmada." },
    ],
  },
  {
    id: "s2",
    titulo: "2. Recibos diferenciados e QR Code PIX C6",
    passos: [
      { n: 10, titulo: "Recibos diferenciados #2", desc: "Venda DEMO. Esperado: vias DIFERENCIADAS para portador e lojista." },
      { n: 11, titulo: "QR Code PIX C6 BANK", desc: "Venda pré-selecionando rede 'PIX C6 BANK'. Esperado: aprovação automática e recibo impresso." },
    ],
  },
  {
    id: "s3",
    titulo: "3. Comunicação e menu administrativo",
    passos: [
      { n: 12, titulo: "Teste de comunicação", desc: "Executar Teste de Comunicação no menu administrativo. Esperado: sucesso sem recibo." },
      { n: 16, titulo: "Operação cancelada no menu administrativo", desc: "Entrar no menu administrativo e cancelar. Esperado: retorno 'OPERAÇÃO CANCELADA' à automação." },
    ],
  },
  {
    id: "s4",
    titulo: "4. Vendas para teste de cancelamento",
    passos: [
      { n: 19, titulo: "Venda bem-sucedida (p/ cancelar depois)", desc: "Venda comum para gerar transação cancelável." },
      { n: 21, titulo: "Cancelamento bem-sucedido", desc: "Cancelar venda do Passo 19. Esperado: aprovado e confirmado." },
    ],
  },
  {
    id: "s5",
    titulo: "5. Quedas de energia",
    passos: [
      { n: 24, titulo: "Queda de energia durante venda", desc: "Iniciar venda e simular queda (kill do processo). Esperado: ao reabrir, transação é recuperada/desfeita corretamente." },
      { n: 25, titulo: "Queda de energia durante operação administrativa", desc: "Iniciar operação no menu admin e simular queda. Esperado: recuperação correta na próxima execução." },
    ],
  },
  {
    id: "s6",
    titulo: "6. Dado genérico, menu genérico e mensagem máxima",
    passos: [
      { n: 26, titulo: "Dado genérico digitado #1", desc: "Responder solicitação de dado genérico via teclado. Esperado: dado entregue corretamente." },
      { n: 27, titulo: "Dado genérico digitado #2", desc: "Repetir solicitação de dado genérico digitado em outro fluxo." },
      { n: 28, titulo: "Menu genérico #1", desc: "Selecionar opção em menu genérico apresentado pelo TEF." },
      { n: 29, titulo: "Menu genérico #2 (selecionar 'ABCDEF')", desc: "Selecionar o item 'ABCDEF' no menu genérico." },
      { n: 30, titulo: "Mensagem resultado tamanho máximo", desc: "Venda em que a mensagem de resultado utiliza o tamanho máximo. Esperado: tratada sem truncar." },
    ],
  },
  {
    id: "s7",
    titulo: "7. Transação pendente e confirmação",
    passos: [
      { n: 31, titulo: "Preparar transação pendente", desc: "Realizar venda mantendo pendente para os próximos testes." },
      { n: 32, titulo: "Transação pendente #2", desc: "Tratamento adicional da transação pendente conforme roteiro." },
      { n: 33, titulo: "Pendente não encontrada #1", desc: "Solicitar confirmação de uma pendente inexistente. Esperado: tratada sem erro." },
      { n: 34, titulo: "Pendente não encontrada #2", desc: "Repetir cenário de pendente inexistente em outro fluxo." },
      { n: 35, titulo: "Confirmação manual", desc: "Confirmar manualmente uma transação previamente realizada." },
    ],
  },
  {
    id: "s8",
    titulo: "8. Desfazimento",
    passos: [
      { n: 37, titulo: "Desfazimento manual", desc: "Solicitar desfazimento de uma transação. Esperado: aceito pelo TEF." },
    ],
  },
  {
    id: "s9",
    titulo: "9. Cancelamento por referência",
    passos: [
      { n: 41, titulo: "Cancelamento por Referência Local #1", desc: "Cancelar informando 'Referência Local'. Esperado: aprovado." },
      { n: 42, titulo: "Cancelamento por Referência Local #2", desc: "Variação do cancelamento por Referência Local." },
      { n: 43, titulo: "Cancelamento por Referência Externa #1", desc: "Cancelar informando 'Referência Externa'. Esperado: aprovado." },
      { n: 44, titulo: "Cancelamento por Referência Externa #2", desc: "Variação do cancelamento por Referência Externa." },
    ],
  },
  {
    id: "s10",
    titulo: "10. Contactless / aproximação",
    passos: [
      { n: 45, titulo: "Venda contactless aprovada", desc: "Venda por aproximação com senha. Esperado: aprovada e confirmada." },
      { n: 46, titulo: "Venda contactless aprovada sem senha", desc: "Venda por aproximação dispensando senha. Esperado: aprovada e confirmada." },
    ],
  },
  {
    id: "s11",
    titulo: "11. Queda após aprovação e QR Code finais",
    passos: [
      { n: 51, titulo: "Queda de energia após aprovação", desc: "Aprovar venda e simular queda antes da confirmação. Esperado: tratamento correto na próxima execução." },
      { n: 52, titulo: "QR Code — aprovação", desc: "Venda por QR Code com aprovação. Esperado: aprovada e confirmada." },
      { n: 53, titulo: "QR Code — cancelamento", desc: "Cancelar venda QR Code. Esperado: aprovado." },
      { n: 54, titulo: "QR Code — variação final", desc: "Variação final do fluxo QR Code conforme roteiro PayGo." },
    ],
  },
];

const STORAGE_KEY = "tef-paygo-roteiro-obrig-v1";

type Estado = Record<number, "done" | undefined>;

export function TefRoteiroTestesCard() {
  const [estado, setEstado] = useState<Estado>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setEstado(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(estado));
    } catch {}
  }, [estado]);

  const todos = useMemo(() => ROTEIRO.flatMap((s) => s.passos), []);
  const concluidos = todos.filter((p) => estado[p.n] === "done").length;
  const pct = Math.round((concluidos / todos.length) * 100);

  const toggle = (n: number) => {
    setEstado((e) => ({ ...e, [n]: e[n] === "done" ? undefined : "done" }));
  };

  const resetar = () => {
    setEstado({});
    toast.success("Roteiro resetado");
  };

  const exportar = () => {
    const linhas: string[] = [];
    linhas.push("Roteiro de Testes PayGo C6 — Obrigatórios");
    linhas.push(`Concluídos: ${concluidos}/${todos.length} (${pct}%)`);
    linhas.push("");
    ROTEIRO.forEach((sec) => {
      linhas.push(`# ${sec.titulo}`);
      sec.passos.forEach((p) => {
        const mark = estado[p.n] === "done" ? "[X]" : "[ ]";
        linhas.push(`  ${mark} Passo ${String(p.n).padStart(2, "0")} - ${p.titulo}`);
      });
      linhas.push("");
    });
    const blob = new Blob([linhas.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `roteiro-paygo-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Checklist exportado");
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" />
            Roteiro de Testes PayGo C6
          </h3>
          <p className="text-xs text-muted-foreground">
            Apenas itens obrigatórios do roteiro v20241216 + planilha v20240306 (PGWebLib).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportar}>
            <Download className="h-4 w-4 mr-1" /> Exportar
          </Button>
          <Button variant="ghost" size="sm" onClick={resetar}>
            <RotateCcw className="h-4 w-4 mr-1" /> Resetar
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Concluídos</span>
          <span className="font-medium text-foreground">
            {concluidos} de {todos.length} ({pct}%)
          </span>
        </div>
        <Progress value={pct} className="h-2" />
      </div>

      <Accordion type="multiple" defaultValue={["s1"]} className="w-full">
        {ROTEIRO.map((sec) => {
          const ok = sec.passos.filter((p) => estado[p.n] === "done").length;
          return (
            <AccordionItem key={sec.id} value={sec.id}>
              <AccordionTrigger className="text-sm hover:no-underline">
                <div className="flex items-center justify-between w-full pr-2 gap-2">
                  <span className="text-left">{sec.titulo}</span>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {ok}/{sec.passos.length}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-2">
                  {sec.passos.map((p) => {
                    const done = estado[p.n] === "done";
                    return (
                      <li
                        key={p.n}
                        className={`flex gap-3 items-start p-2 rounded-md border ${
                          done ? "bg-muted/50 opacity-70" : "bg-background"
                        }`}
                      >
                        <Checkbox
                          checked={done}
                          onCheckedChange={() => toggle(p.n)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono text-muted-foreground">
                              Passo {String(p.n).padStart(2, "0")}
                            </span>
                            <span
                              className={`text-sm font-medium ${
                                done ? "line-through" : ""
                              }`}
                            >
                              {p.titulo}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{p.desc}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </Card>
  );
}

export default TefRoteiroTestesCard;
