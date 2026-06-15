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

type Obrig = "OBRIG" | "OPC" | "AUTO" | "CTRL";

type Passo = {
  n: number;
  obrig: Obrig;
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
    titulo: "1. Instalação e vendas básicas (1–8)",
    passos: [
      { n: 1, obrig: "OBRIG", titulo: "Instalação", desc: "Instalar com os dados enviados pela PayGo. Esperado: 'TRANSAÇÃO APROVADA' e recibo impresso." },
      { n: 2, obrig: "OBRIG", titulo: "Venda valor máximo", desc: "Venda com o valor máximo permitido pela automação (ex.: R$ 100.000,00). Esperado: aprovada e confirmada." },
      { n: 3, obrig: "OBRIG", titulo: "Venda pré-seleção (DEMO/Cartão/Crédito/À vista)", desc: "Venda pré-selecionando Autorizador DEMO, Cartão, Crédito, À vista. Esperado: aprovada e confirmada." },
      { n: 4, obrig: "OBRIG", titulo: "Venda negada", desc: "Venda de R$ 1.000,01 no DEMO. Esperado: NEGADA 01 retornada à automação." },
      { n: 5, obrig: "OBRIG", titulo: "Venda negada - rede desconhecida", desc: "No menu de seleção de rede, pressionar Esc/Cancelar. Esperado: 'OPERAÇÃO CANCELADA'." },
      { n: 6, obrig: "OBRIG", titulo: "Venda crédito (inserir cartão no PIN-Pad)", desc: "Venda na modalidade crédito inserindo cartão. Esperado: aprovada e confirmada." },
      { n: 7, obrig: "OBRIG", titulo: "Venda débito (inserir cartão no PIN-Pad)", desc: "Venda na modalidade débito inserindo cartão. Esperado: aprovada e confirmada." },
      { n: 8, obrig: "OBRIG", titulo: "Venda crédito parcelado loja em 99x", desc: "Venda crédito parcelada pelo estabelecimento em 99 parcelas. Esperado: aprovada e confirmada." },
    ],
  },
  {
    id: "s2",
    titulo: "2. Recibos diferenciados e QR Code PIX C6 (9–11)",
    passos: [
      { n: 9, obrig: "OPC", titulo: "Recibos diferenciados #1", desc: "Venda DEMO. Esperado: via REDUZIDA para portador e DIFERENCIADA para lojista." },
      { n: 10, obrig: "OBRIG", titulo: "Recibos diferenciados #2", desc: "Venda DEMO. Esperado: vias DIFERENCIADAS para portador e lojista." },
      { n: 11, obrig: "OBRIG", titulo: "QR Code PIX C6 BANK", desc: "Venda pré-selecionando rede 'PIX C6 BANK'. Esperado: aprovação automática e recibo impresso." },
    ],
  },
  {
    id: "s3",
    titulo: "3. Comunicação e relatórios (12–16)",
    passos: [
      { n: 12, obrig: "OBRIG", titulo: "Teste de comunicação", desc: "Executar Teste de Comunicação no menu administrativo. Esperado: sucesso sem recibo." },
      { n: 13, obrig: "OPC", titulo: "Relatório sintético", desc: "Emitir relatório sintético pelo menu administrativo." },
      { n: 14, obrig: "OPC", titulo: "Relatório detalhado", desc: "Emitir relatório detalhado pelo menu administrativo." },
      { n: 15, obrig: "OPC", titulo: "Relatório resumido", desc: "Emitir relatório resumido pelo menu administrativo." },
      { n: 16, obrig: "OBRIG", titulo: "Operação cancelada no menu administrativo", desc: "Entrar no menu administrativo e cancelar. Esperado: retorno 'OPERAÇÃO CANCELADA' à automação." },
    ],
  },
  {
    id: "s4",
    titulo: "4. Vendas para teste de cancelamento (17–23)",
    passos: [
      { n: 17, obrig: "OPC", titulo: "Venda bem-sucedida #1 (p/ cancelar depois)", desc: "Venda comum para gerar transação cancelável." },
      { n: 18, obrig: "OPC", titulo: "Venda bem-sucedida #2 (p/ cancelar depois)", desc: "Venda comum para gerar transação cancelável." },
      { n: 19, obrig: "OBRIG", titulo: "Venda bem-sucedida #3 (p/ cancelar depois)", desc: "Venda comum para gerar transação cancelável." },
      { n: 20, obrig: "OPC", titulo: "Cancelamento bem-sucedido #1", desc: "Cancelar venda do Passo 17. Esperado: aprovado e confirmado." },
      { n: 21, obrig: "OBRIG", titulo: "Cancelamento bem-sucedido #2", desc: "Cancelar venda do Passo 19. Esperado: aprovado e confirmado." },
      { n: 22, obrig: "OPC", titulo: "Cancelamento bem-sucedido #3", desc: "Cancelar venda adicional. Esperado: aprovado e confirmado." },
      { n: 23, obrig: "OPC", titulo: "Cancelamento bem-sucedido #4", desc: "Cancelar venda adicional. Esperado: aprovado e confirmado." },
    ],
  },
  {
    id: "s5",
    titulo: "5. Quedas de energia (24–25)",
    passos: [
      { n: 24, obrig: "OBRIG", titulo: "Queda de energia durante venda", desc: "Iniciar venda e simular queda (kill do processo). Esperado: ao reabrir, transação é recuperada/desfeita corretamente." },
      { n: 25, obrig: "OBRIG", titulo: "Queda de energia durante operação administrativa", desc: "Iniciar operação no menu admin e simular queda. Esperado: recuperação correta na próxima execução." },
    ],
  },
  {
    id: "s6",
    titulo: "6. Dado genérico, menu genérico e mensagem máxima (26–30)",
    passos: [
      { n: 26, obrig: "OBRIG", titulo: "Dado genérico digitado #1", desc: "Responder solicitação de dado genérico via teclado. Esperado: dado entregue corretamente." },
      { n: 27, obrig: "OBRIG", titulo: "Dado genérico digitado #2", desc: "Repetir solicitação de dado genérico digitado em outro fluxo." },
      { n: 28, obrig: "OBRIG", titulo: "Menu genérico #1", desc: "Selecionar opção em menu genérico apresentado pelo TEF." },
      { n: 29, obrig: "OBRIG", titulo: "Menu genérico #2 (selecionar 'ABCDEF')", desc: "Selecionar o item 'ABCDEF' no menu genérico." },
      { n: 30, obrig: "OBRIG", titulo: "Mensagem resultado tamanho máximo", desc: "Venda em que a mensagem de resultado utiliza o tamanho máximo. Esperado: tratada sem truncar." },
    ],
  },
  {
    id: "s7",
    titulo: "7. Transação pendente e confirmação (31–36)",
    passos: [
      { n: 31, obrig: "OBRIG", titulo: "Preparar transação pendente", desc: "Realizar venda mantendo pendente para os próximos testes." },
      { n: 32, obrig: "OBRIG", titulo: "Transação pendente #2", desc: "Tratamento adicional da transação pendente conforme roteiro." },
      { n: 33, obrig: "OBRIG", titulo: "Pendente não encontrada #1", desc: "Solicitar confirmação de uma pendente inexistente. Esperado: tratada sem erro." },
      { n: 34, obrig: "OBRIG", titulo: "Pendente não encontrada #2", desc: "Repetir cenário de pendente inexistente em outro fluxo." },
      { n: 35, obrig: "OBRIG", titulo: "Confirmação manual #1", desc: "Confirmar manualmente uma transação previamente realizada." },
      { n: 36, obrig: "OPC", titulo: "Confirmação manual #2", desc: "Repetir confirmação manual em variação do fluxo." },
    ],
  },
  {
    id: "s8",
    titulo: "8. Desfazimento (37–38)",
    passos: [
      { n: 37, obrig: "OBRIG", titulo: "Desfazimento manual #1", desc: "Solicitar desfazimento de uma transação. Esperado: aceito pelo TEF." },
      { n: 38, obrig: "OPC", titulo: "Desfazimento manual #2", desc: "Repetir desfazimento em variação do fluxo." },
    ],
  },
  {
    id: "s9",
    titulo: "9. Autoatendimento (39–40) — só se totem",
    passos: [
      { n: 39, obrig: "AUTO", titulo: "Desfazimento por falha na liberação #1", desc: "Cenário totem: TEF aprova, mas automação falha em liberar mercadoria. Esperado: desfazimento automático." },
      { n: 40, obrig: "AUTO", titulo: "Desfazimento por falha na liberação #2", desc: "Variação do cenário totem com desfazimento automático." },
    ],
  },
  {
    id: "s10",
    titulo: "10. Cancelamento por referência (41–44)",
    passos: [
      { n: 41, obrig: "OBRIG", titulo: "Cancelamento por Referência Local #1", desc: "Cancelar informando 'Referência Local'. Esperado: aprovado." },
      { n: 42, obrig: "OBRIG", titulo: "Cancelamento por Referência Local #2", desc: "Variação do cancelamento por Referência Local." },
      { n: 43, obrig: "OBRIG", titulo: "Cancelamento por Referência Externa #1", desc: "Cancelar informando 'Referência Externa'. Esperado: aprovado." },
      { n: 44, obrig: "OBRIG", titulo: "Cancelamento por Referência Externa #2", desc: "Variação do cancelamento por Referência Externa." },
    ],
  },
  {
    id: "s11",
    titulo: "11. Contactless / aproximação (45–46)",
    passos: [
      { n: 45, obrig: "OBRIG", titulo: "Venda contactless aprovada", desc: "Venda por aproximação com senha. Esperado: aprovada e confirmada." },
      { n: 46, obrig: "OBRIG", titulo: "Venda contactless aprovada sem senha", desc: "Venda por aproximação dispensando senha. Esperado: aprovada e confirmada." },
    ],
  },
  {
    id: "s12",
    titulo: "12. ControlPay (47–50) — só se Web Service",
    passos: [
      { n: 47, obrig: "CTRL", titulo: "Consulta de terminais", desc: "Apenas ControlPay: consultar terminais via Web Service." },
      { n: 48, obrig: "CTRL", titulo: "Consultar status de transação #1", desc: "Apenas ControlPay: consultar status." },
      { n: 49, obrig: "CTRL", titulo: "Consultar status de transação #2", desc: "Apenas ControlPay: variação da consulta." },
      { n: 50, obrig: "CTRL", titulo: "Consultar status de transação #3", desc: "Apenas ControlPay: variação da consulta." },
    ],
  },
  {
    id: "s13",
    titulo: "13. Queda após aprovação e QR Code finais (51–54)",
    passos: [
      { n: 51, obrig: "OBRIG", titulo: "Queda de energia após aprovação", desc: "Aprovar venda e simular queda antes da confirmação. Esperado: tratamento correto na próxima execução." },
      { n: 52, obrig: "OBRIG", titulo: "QR Code — aprovação", desc: "Venda por QR Code com aprovação. Esperado: aprovada e confirmada." },
      { n: 53, obrig: "OBRIG", titulo: "QR Code — cancelamento", desc: "Cancelar venda QR Code. Esperado: aprovado." },
      { n: 54, obrig: "OBRIG", titulo: "QR Code — variação final", desc: "Variação final do fluxo QR Code conforme roteiro PayGo." },
    ],
  },
];

const STORAGE_KEY = "tef-paygo-roteiro-v20241216";

const OBRIG_LABEL: Record<Obrig, string> = {
  OBRIG: "OBRIGATÓRIO",
  OPC: "OPCIONAL",
  AUTO: "SE AUTOATENDIMENTO",
  CTRL: "SE CONTROLPAY",
};

const OBRIG_VARIANT: Record<Obrig, "default" | "secondary" | "outline"> = {
  OBRIG: "default",
  OPC: "outline",
  AUTO: "secondary",
  CTRL: "secondary",
};

type Estado = Record<number, "done" | "na" | undefined>;

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
  const obrigatorios = todos.filter((p) => p.obrig === "OBRIG");
  const concluidosObrig = obrigatorios.filter((p) => estado[p.n] === "done").length;
  const pct = Math.round((concluidosObrig / obrigatorios.length) * 100);

  const toggle = (n: number) => {
    setEstado((e) => ({ ...e, [n]: e[n] === "done" ? undefined : "done" }));
  };

  const toggleNA = (n: number) => {
    setEstado((e) => ({ ...e, [n]: e[n] === "na" ? undefined : "na" }));
  };

  const resetar = () => {
    setEstado({});
    toast.success("Roteiro resetado");
  };

  const exportar = () => {
    const linhas: string[] = [];
    linhas.push("Roteiro de Testes PayGo C6 — v20241216");
    linhas.push(`Concluídos obrigatórios: ${concluidosObrig}/${obrigatorios.length} (${pct}%)`);
    linhas.push("");
    ROTEIRO.forEach((sec) => {
      linhas.push(`# ${sec.titulo}`);
      sec.passos.forEach((p) => {
        const s = estado[p.n];
        const mark = s === "done" ? "[X]" : s === "na" ? "[N/A]" : "[ ]";
        linhas.push(`  ${mark} Passo ${String(p.n).padStart(2, "0")} (${OBRIG_LABEL[p.obrig]}) - ${p.titulo}`);
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
            Baseado no Roteiro v20241216 + Planilha v20240306 (Biblioteca Windows / PGWebLib).
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
          <span>Obrigatórios concluídos</span>
          <span className="font-medium text-foreground">
            {concluidosObrig} de {obrigatorios.length} ({pct}%)
          </span>
        </div>
        <Progress value={pct} className="h-2" />
      </div>

      <Accordion type="multiple" defaultValue={["s1"]} className="w-full">
        {ROTEIRO.map((sec) => {
          const obrSec = sec.passos.filter((p) => p.obrig === "OBRIG");
          const okSec = obrSec.filter((p) => estado[p.n] === "done").length;
          return (
            <AccordionItem key={sec.id} value={sec.id}>
              <AccordionTrigger className="text-sm hover:no-underline">
                <div className="flex items-center justify-between w-full pr-2 gap-2">
                  <span className="text-left">{sec.titulo}</span>
                  {obrSec.length > 0 && (
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {okSec}/{obrSec.length} obrig.
                    </Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-2">
                  {sec.passos.map((p) => {
                    const st = estado[p.n];
                    const done = st === "done";
                    const na = st === "na";
                    return (
                      <li
                        key={p.n}
                        className={`flex gap-3 items-start p-2 rounded-md border ${
                          done ? "bg-muted/50 opacity-70" : na ? "opacity-50" : "bg-background"
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
                            <Badge
                              variant={OBRIG_VARIANT[p.obrig]}
                              className="text-[10px]"
                            >
                              {OBRIG_LABEL[p.obrig]}
                            </Badge>
                            <span
                              className={`text-sm font-medium ${
                                done ? "line-through" : ""
                              }`}
                            >
                              {p.titulo}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{p.desc}</p>
                          {p.obrig !== "OBRIG" && (
                            <button
                              type="button"
                              onClick={() => toggleNA(p.n)}
                              className="text-[11px] text-muted-foreground hover:text-foreground underline mt-1"
                            >
                              {na ? "Remover N/A" : "Marcar como N/A"}
                            </button>
                          )}
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
