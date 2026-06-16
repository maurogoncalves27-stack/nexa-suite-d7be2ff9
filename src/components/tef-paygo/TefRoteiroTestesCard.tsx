import { useCallback, useEffect, useMemo, useState } from "react";
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
import { ListChecks, RotateCcw, Download, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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

const ASA_SUL_ID = "fcf435c2-c382-444c-b499-4d95f07b2633";

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

const STORAGE_KEY = "tef-paygo-roteiro-obrig-v2";

type Estado = Record<number, "done" | undefined>;
type Persisted = { estado: Estado; runStartedAt: string };

type Tx = {
  id: string;
  amount: number | null;
  status: string | null;
  message: string | null;
  nsu: string | null;
  acquirer: string | null;
  installments: number | null;
  finished_at: string | null;
  raw_response: any;
};

type Evidence = { nsu?: string | null; amount?: number | null; acquirer?: string | null; label: string };

const isApproved = (s: string | null | undefined) => (s ?? "").toLowerCase().includes("approv");
const isCancelled = (s: string | null | undefined) => {
  const v = (s ?? "").toLowerCase();
  return v.includes("cancel") || v.includes("declin") || v.includes("error");
};
const rawText = (raw: any) => JSON.stringify(raw ?? {}).toLowerCase();
const methodOf = (raw: any): string => {
  const t = rawText(raw);
  if (t.includes('"method":"pix"') || t.includes("pix")) return "pix";
  if (t.includes('"method":"credit"') || t.includes("credito") || t.includes("crédito") || t.includes("credit")) return "credit";
  if (t.includes('"method":"debit"') || t.includes("debito") || t.includes("débito") || t.includes("debit")) return "debit";
  return "";
};

const formatBRL = (v: number | null | undefined) =>
  typeof v === "number" ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

const mkEv = (t: Tx, label: string): Evidence => ({
  nsu: t.nsu,
  amount: t.amount,
  acquirer: t.acquirer,
  label,
});

function computeAutoEvidence(txs: Tx[]): Map<number, Evidence> {
  const m = new Map<number, Evidence>();
  const approved = txs.filter((t) => isApproved(t.status));
  const cancelled = txs.filter((t) => isCancelled(t.status));

  // 2 — valor máximo (>= R$ 99.999)
  const max = approved.find((t) => (t.amount ?? 0) >= 99999);
  if (max) m.set(2, mkEv(max, "valor máximo aprovado"));

  // 3 — DEMO crédito à vista aprovada
  const demoCredVista = approved.find(
    (t) => (t.acquirer ?? "").toUpperCase() === "DEMO" && methodOf(t.raw_response) === "credit" && (t.installments ?? 1) <= 1,
  );
  if (demoCredVista) m.set(3, mkEv(demoCredVista, "DEMO crédito à vista"));

  // 4 — negada R$ 1.000,01
  const negada = txs.find((t) => Math.abs((t.amount ?? 0) - 1000.01) < 0.005 && !isApproved(t.status));
  if (negada) m.set(4, mkEv(negada, "negada R$ 1.000,01"));

  // 5 — cancelada na seleção de rede
  const cancRede = cancelled.find((t) => {
    const msg = `${t.message ?? ""} ${rawText(t.raw_response)}`.toUpperCase();
    return msg.includes("OPERAÇÃO CANCELADA") || msg.includes("OPERACAO CANCELADA") || msg.includes("REDE");
  });
  if (cancRede) m.set(5, mkEv(cancRede, "operação cancelada"));

  // 6 — crédito aprovada
  const cred = approved.find((t) => methodOf(t.raw_response) === "credit");
  if (cred) m.set(6, mkEv(cred, "crédito aprovada"));

  // 7 — débito aprovada
  const deb = approved.find((t) => methodOf(t.raw_response) === "debit");
  if (deb) m.set(7, mkEv(deb, "débito aprovada"));

  // 8 — crédito 99x
  const cred99 = approved.find((t) => (t.installments ?? 0) >= 99);
  if (cred99) m.set(8, mkEv(cred99, "99x aprovada"));

  // 11 — PIX C6 BANK
  const pixC6 = approved.find((t) => (t.acquirer ?? "").toUpperCase().includes("PIX C6"));
  if (pixC6) m.set(11, mkEv(pixC6, "PIX C6 aprovada"));

  // 19 + 21 — venda + cancelamento subsequente
  const venda19 = approved.find(
    (t) => (t.acquirer ?? "").toUpperCase() !== "DEMO" || methodOf(t.raw_response) !== "credit" || (t.installments ?? 1) > 1,
  ) ?? approved[0];
  if (venda19) m.set(19, mkEv(venda19, "venda aprovada"));
  if (venda19) {
    const after = cancelled.find((t) => (t.finished_at ?? "") > (venda19.finished_at ?? ""));
    if (after) m.set(21, mkEv(after, "cancelamento confirmado"));
  }

  // 41–44 — cancelamento por referência (local/externa)
  const refLocais = cancelled.filter((t) => {
    const txt = rawText(t.raw_response);
    return txt.includes("referencialocal") || txt.includes("referência local") || txt.includes("referencia local");
  });
  if (refLocais[0]) m.set(41, mkEv(refLocais[0], "ref. local"));
  if (refLocais[1]) m.set(42, mkEv(refLocais[1], "ref. local #2"));
  const refExt = cancelled.filter((t) => {
    const txt = rawText(t.raw_response);
    return txt.includes("referenciaexterna") || txt.includes("referência externa") || txt.includes("referencia externa");
  });
  if (refExt[0]) m.set(43, mkEv(refExt[0], "ref. externa"));
  if (refExt[1]) m.set(44, mkEv(refExt[1], "ref. externa #2"));

  // 45/46 — contactless
  const ctls = approved.filter((t) => {
    const txt = rawText(t.raw_response);
    return txt.includes("ctls") || txt.includes("contactless") || txt.includes("aproxim");
  });
  const ctlsComPin = ctls.find((t) => {
    const txt = rawText(t.raw_response);
    return txt.includes("senha") || txt.includes('"pin":"yes"') || txt.includes("pinrequired");
  });
  const ctlsSemPin = ctls.find((t) => t !== ctlsComPin);
  if (ctlsComPin) m.set(45, mkEv(ctlsComPin, "contactless c/ senha"));
  if (ctlsSemPin) m.set(46, mkEv(ctlsSemPin, "contactless s/ senha"));

  // 52/53 — QR Code aprovada/cancelada
  const qr = approved.find((t) => methodOf(t.raw_response) === "pix");
  if (qr) m.set(52, mkEv(qr, "QR aprovada"));
  const qrCanc = cancelled.find((t) => methodOf(t.raw_response) === "pix");
  if (qrCanc) m.set(53, mkEv(qrCanc, "QR cancelada"));
  const qrs = txs.filter((t) => methodOf(t.raw_response) === "pix");
  if (qrs.length >= 3) m.set(54, mkEv(qrs[qrs.length - 1], "QR variação"));

  return m;
}

export function TefRoteiroTestesCard() {
  const [estado, setEstado] = useState<Estado>({});
  const [runStartedAt, setRunStartedAt] = useState<string>(() => new Date().toISOString());
  const [txs, setTxs] = useState<Tx[]>([]);

  // Carregar persistido (com migração graciosa do v1)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Persisted;
        if (parsed && typeof parsed === "object" && "estado" in parsed) {
          setEstado(parsed.estado || {});
          if (parsed.runStartedAt) setRunStartedAt(parsed.runStartedAt);
          return;
        }
      }
      const old = localStorage.getItem("tef-paygo-roteiro-obrig-v1");
      if (old) {
        try {
          setEstado(JSON.parse(old) || {});
        } catch {}
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ estado, runStartedAt } as Persisted));
    } catch {}
  }, [estado, runStartedAt]);

  // Polling das transações desde runStartedAt
  const fetchTxs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("pdv_tef_transactions")
        .select("id, amount, status, message, nsu, acquirer, installments, finished_at, raw_response")
        .eq("store_id", ASA_SUL_ID)
        .eq("provider", "paygo")
        .gte("finished_at", runStartedAt)
        .order("finished_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      setTxs((data ?? []) as Tx[]);
    } catch {
      /* silencioso */
    }
  }, [runStartedAt]);

  useEffect(() => {
    fetchTxs();
    const id = window.setInterval(fetchTxs, 10000);
    const onVis = () => {
      if (document.visibilityState === "visible") fetchTxs();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fetchTxs]);

  const autoEv = useMemo(() => computeAutoEvidence(txs), [txs]);

  const todos = useMemo(() => ROTEIRO.flatMap((s) => s.passos), []);
  const isDone = (n: number) => estado[n] === "done" || autoEv.has(n);
  const concluidos = todos.filter((p) => isDone(p.n)).length;
  const autoCount = todos.filter((p) => autoEv.has(p.n)).length;
  const pct = Math.round((concluidos / todos.length) * 100);

  const toggle = (n: number) => {
    // Não permitir desmarcar quando há evidência automática
    if (autoEv.has(n)) {
      toast.info("Este passo foi validado automaticamente pelo log da transação.");
      return;
    }
    setEstado((e) => ({ ...e, [n]: e[n] === "done" ? undefined : "done" }));
  };

  const resetar = () => {
    setEstado({});
    setRunStartedAt(new Date().toISOString());
    setTxs([]);
    toast.success("Roteiro resetado — nova rodada iniciada");
  };

  const exportar = () => {
    const linhas: string[] = [];
    linhas.push("Roteiro de Testes PayGo C6 — Obrigatórios");
    linhas.push(`Rodada iniciada em: ${new Date(runStartedAt).toLocaleString("pt-BR")}`);
    linhas.push(`Concluídos: ${concluidos}/${todos.length} (${pct}%) — ${autoCount} auto-validados`);
    linhas.push("");
    ROTEIRO.forEach((sec) => {
      linhas.push(`# ${sec.titulo}`);
      sec.passos.forEach((p) => {
        const ev = autoEv.get(p.n);
        const mark = ev ? "[A]" : estado[p.n] === "done" ? "[X]" : "[ ]";
        const extra = ev ? ` — auto: NSU ${ev.nsu ?? "—"} ${formatBRL(ev.amount)}${ev.acquirer ? ` (${ev.acquirer})` : ""}` : "";
        linhas.push(`  ${mark} Passo ${String(p.n).padStart(2, "0")} - ${p.titulo}${extra}`);
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
            Apenas itens obrigatórios. Passos com log de transação são auto-validados.
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
          <span>
            Concluídos · rodada desde {new Date(runStartedAt).toLocaleTimeString("pt-BR")}
          </span>
          <span className="font-medium text-foreground">
            {concluidos} de {todos.length} ({pct}%)
            {autoCount > 0 && <span className="ml-1 text-primary">· {autoCount} auto</span>}
          </span>
        </div>
        <Progress value={pct} className="h-2" />
      </div>

      <Accordion type="multiple" defaultValue={["s1"]} className="w-full">
        {ROTEIRO.map((sec) => {
          const ok = sec.passos.filter((p) => isDone(p.n)).length;
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
                    const ev = autoEv.get(p.n);
                    const done = isDone(p.n);
                    return (
                      <li
                        key={p.n}
                        className={`flex gap-3 items-start p-2 rounded-md border ${
                          done ? "bg-muted/50 opacity-80" : "bg-background"
                        }`}
                      >
                        <Checkbox
                          checked={done}
                          onCheckedChange={() => toggle(p.n)}
                          className="mt-1"
                          disabled={!!ev}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono text-muted-foreground">
                              Passo {String(p.n).padStart(2, "0")}
                            </span>
                            <span className={`text-sm font-medium ${done ? "line-through" : ""}`}>
                              {p.titulo}
                            </span>
                            {ev && (
                              <Badge variant="secondary" className="text-[10px] gap-1">
                                <Sparkles className="h-3 w-3" />
                                auto
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{p.desc}</p>
                          {ev && (
                            <p className="text-[11px] text-muted-foreground mt-1 font-mono">
                              {ev.label} · NSU {ev.nsu ?? "—"} · {formatBRL(ev.amount)}
                              {ev.acquirer ? ` · ${ev.acquirer}` : ""}
                            </p>
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
