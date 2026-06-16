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
import { ListChecks, RotateCcw, Download, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Passo = {
  n: number;
  titulo: string;
  desc: string;
  valor?: string;       // valor sugerido (ex.: "R$ 2,07")
  rede?: string;        // ex.: "DEMO" | "PIX C6 BANK"
  modalidade?: string;  // ex.: "Crédito à vista"
  comoFazer?: string[]; // passo-a-passo no pinpad/app
  esperado?: string;    // resultado esperado
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
      {
        n: 1,
        titulo: "Instalação",
        desc: "Instalar com os dados enviados pela PayGo.",
        comoFazer: [
          "Abrir PayGo Integrado (Windows) e confirmar CNPJ 44.932.369/0001-08 + PdC 111476",
          "Garantir modo DEMO (3 cliques no logo, host pos-transac-sb.tpgweb.io:31735)",
          "No card Venda de teste: rodar 1 venda de R$ 1,00 débito DEMO",
        ],
        esperado: "TRANSAÇÃO APROVADA e recibo impresso.",
      },
      {
        n: 2,
        titulo: "Venda valor máximo",
        desc: "Venda com o valor máximo permitido pela automação.",
        valor: "R$ 100.000,00",
        rede: "DEMO",
        modalidade: "Crédito",
        comoFazer: [
          "Card Venda de teste → Valor: 100000,00",
          "Clicar Crédito → escolher DEMO",
          "No pinpad: inserir cartão DEMO → digitar senha",
        ],
        esperado: "Aprovada e confirmada automaticamente.",
      },
      {
        n: 3,
        titulo: "Venda pré-seleção (DEMO / Crédito / À vista)",
        desc: "Pré-seleciona rede, tipo e modalidade — pinpad não pergunta.",
        valor: "R$ 2,07",
        rede: "DEMO",
        modalidade: "Crédito à vista",
        comoFazer: [
          "Card Venda de teste → Valor: 2,07",
          "Clicar Crédito → escolher DEMO no diálogo de rede",
          "No pinpad: inserir cartão DEMO → digitar senha",
        ],
        esperado: "Pinpad NÃO pergunta débito/crédito nem à vista/parcelado. Aprovada direto.",
      },
      {
        n: 4,
        titulo: "Venda negada",
        desc: "Valor mágico que força negativa no DEMO.",
        valor: "R$ 1.000,01",
        rede: "DEMO",
        modalidade: "Crédito",
        comoFazer: [
          "Card Venda de teste → Valor: 1000,01",
          "Clicar Crédito → escolher DEMO",
          "No pinpad: inserir cartão → senha",
        ],
        esperado: "NEGADA 01 retornada à automação.",
      },
      {
        n: 5,
        titulo: "Venda cancelada na seleção de rede",
        desc: "Cancelar no menu de rede do PayGo.",
        valor: "R$ 5,00",
        comoFazer: [
          "Card Venda de teste → Valor: 5,00 → Crédito",
          "Quando abrir o diálogo de seleção de rede → clicar Cancelar",
        ],
        esperado: "Mensagem 'OPERAÇÃO CANCELADA'.",
      },
      {
        n: 6,
        titulo: "Venda crédito (inserir cartão)",
        desc: "Crédito à vista com cartão inserido.",
        valor: "R$ 10,00",
        rede: "DEMO",
        modalidade: "Crédito à vista",
        comoFazer: [
          "Card Venda de teste → Valor: 10,00 → Crédito → DEMO",
          "No pinpad: inserir cartão → senha",
        ],
        esperado: "Aprovada e confirmada.",
      },
      {
        n: 7,
        titulo: "Venda débito (inserir cartão)",
        desc: "Débito à vista com cartão inserido.",
        valor: "R$ 15,00",
        rede: "DEMO",
        modalidade: "Débito",
        comoFazer: [
          "Card Venda de teste → Valor: 15,00 → Débito → DEMO",
          "No pinpad: inserir cartão → senha",
        ],
        esperado: "Aprovada e confirmada.",
      },
      {
        n: 8,
        titulo: "Venda crédito parcelado loja em 99x",
        desc: "Parcelamento pelo estabelecimento, 99 parcelas.",
        valor: "R$ 9.900,00",
        rede: "DEMO",
        modalidade: "Crédito parcelado loja — 99x",
        comoFazer: [
          "Card Venda de teste → Valor: 9900,00 → Crédito → DEMO",
          "No menu de parcelamento: selecionar Parcelado LOJA → digitar 99",
          "No pinpad: inserir cartão → senha",
        ],
        esperado: "Aprovada e confirmada com 99 parcelas no recibo.",
      },
    ],
  },
  {
    id: "s2",
    titulo: "2. Recibos diferenciados e QR Code PIX C6",
    passos: [
      {
        n: 10,
        titulo: "Recibos diferenciados",
        desc: "Confirma que sai via portador + via lojista distintas.",
        valor: "R$ 3,33",
        rede: "DEMO",
        modalidade: "Crédito",
        comoFazer: [
          "Card Venda de teste → Valor: 3,33 → Crédito → DEMO",
          "No pinpad: inserir cartão → senha",
          "Conferir no painel de recibos: via Lojista e via Portador",
        ],
        esperado: "Duas vias DIFERENCIADAS impressas.",
      },
      {
        n: 11,
        titulo: "QR Code PIX C6 BANK",
        desc: "Pré-seleciona rede PIX C6 BANK.",
        valor: "R$ 1,50",
        rede: "PIX C6 BANK",
        modalidade: "PIX",
        comoFazer: [
          "Card Venda de teste → Valor: 1,50",
          "Clicar no botão PIX C6 BANK",
          "Ler QR Code com o app DEMO PayGo (ou aguardar simulação)",
        ],
        esperado: "Aprovação automática e recibo impresso.",
      },
    ],
  },
  {
    id: "s3",
    titulo: "3. Comunicação e menu administrativo",
    passos: [
      {
        n: 12,
        titulo: "Teste de comunicação",
        desc: "Executa apenas o teste de comunicação (sem venda).",
        comoFazer: [
          "Card TEF → botão Abrir menu ADM",
          "No pinpad: escolher 'Teste de Comunicação'",
        ],
        esperado: "Sucesso sem recibo.",
      },
      {
        n: 16,
        titulo: "Cancelar dentro do menu administrativo",
        desc: "Abrir o menu ADM e cancelar.",
        comoFazer: [
          "Card TEF → botão Abrir menu ADM",
          "No pinpad: pressionar Cancelar/Esc no menu",
        ],
        esperado: "Retorno 'OPERAÇÃO CANCELADA' para a automação.",
      },
    ],
  },
  {
    id: "s4",
    titulo: "4. Vendas para teste de cancelamento",
    passos: [
      {
        n: 19,
        titulo: "Venda bem-sucedida (para cancelar depois)",
        desc: "Venda comum que vai ser cancelada no passo 21.",
        valor: "R$ 20,00",
        rede: "DEMO",
        modalidade: "Crédito",
        comoFazer: [
          "Card Venda de teste → Valor: 20,00 → Crédito → DEMO",
          "No pinpad: inserir cartão → senha",
          "Anotar o NSU exibido no painel",
        ],
        esperado: "Aprovada e confirmada.",
      },
      {
        n: 21,
        titulo: "Cancelamento bem-sucedido",
        desc: "Cancela a venda do passo 19.",
        comoFazer: [
          "Card TEF → botão Cancelar última venda (ou menu ADM → Cancelamento)",
          "Informar o NSU do passo 19 se solicitado",
          "No pinpad: passar cartão de supervisor (DEMO) → senha",
        ],
        esperado: "Cancelamento aprovado e confirmado.",
      },
    ],
  },
  {
    id: "s5",
    titulo: "5. Quedas de energia",
    passos: [
      {
        n: 24,
        titulo: "Queda de energia durante venda",
        desc: "Simular queda no meio de uma venda.",
        valor: "R$ 7,00",
        comoFazer: [
          "Iniciar venda R$ 7,00 → Crédito → DEMO",
          "Quando o pinpad pedir senha, FECHAR o agente PayGo (kill no Gerenciador de Tarefas)",
          "Reabrir o agente e tentar nova venda",
        ],
        esperado: "Pendência é recuperada / desfeita automaticamente.",
      },
      {
        n: 25,
        titulo: "Queda durante operação administrativa",
        desc: "Simular queda no meio de operação no menu ADM.",
        comoFazer: [
          "Abrir menu ADM → escolher uma opção",
          "FECHAR o agente PayGo antes de concluir",
          "Reabrir o agente",
        ],
        esperado: "Recuperação correta na próxima execução.",
      },
    ],
  },
  {
    id: "s6",
    titulo: "6. Dado genérico, menu genérico e mensagem máxima",
    passos: [
      {
        n: 26,
        titulo: "Dado genérico digitado #1",
        desc: "Responder solicitação de dado genérico no pinpad.",
        valor: "R$ 4,00",
        comoFazer: [
          "Iniciar venda DEMO que dispare entrada de dado (ex.: CPF, parcelas)",
          "No pinpad: digitar o dado solicitado",
        ],
        esperado: "Dado entregue corretamente e venda segue.",
      },
      {
        n: 27,
        titulo: "Dado genérico digitado #2",
        desc: "Repetir em outro fluxo (ex.: débito).",
        valor: "R$ 4,50",
        comoFazer: [
          "Iniciar venda Débito DEMO",
          "Digitar dado quando solicitado",
        ],
        esperado: "Dado entregue e venda concluída.",
      },
      {
        n: 28,
        titulo: "Menu genérico #1",
        desc: "Selecionar opção em menu genérico exibido pelo TEF.",
        comoFazer: [
          "Iniciar venda que dispare menu genérico",
          "No pinpad: escolher a primeira opção",
        ],
        esperado: "Opção aceita e fluxo segue.",
      },
      {
        n: 29,
        titulo: "Menu genérico #2 — selecionar 'ABCDEF'",
        desc: "Mesmo cenário, escolhendo o item 'ABCDEF'.",
        comoFazer: [
          "Iniciar venda que dispare menu genérico",
          "No pinpad: navegar até 'ABCDEF' e confirmar",
        ],
        esperado: "Item 'ABCDEF' aceito.",
      },
      {
        n: 30,
        titulo: "Mensagem de resultado no tamanho máximo",
        desc: "Venda cuja mensagem final ocupa o tamanho máximo.",
        valor: "R$ 8,88",
        comoFazer: [
          "Rodar venda DEMO Crédito R$ 8,88",
          "Conferir no painel a mensagem completa (não truncada)",
        ],
        esperado: "Mensagem tratada sem truncar.",
      },
    ],
  },
  {
    id: "s7",
    titulo: "7. Transação pendente e confirmação",
    passos: [
      {
        n: 31,
        titulo: "Preparar transação pendente",
        desc: "Forçar uma venda a ficar pendente para os próximos passos.",
        valor: "R$ 6,00",
        comoFazer: [
          "Iniciar venda R$ 6,00 → Crédito → DEMO",
          "Concluir digitação no pinpad",
          "DESCONECTAR a rede do PC imediatamente após o OK do pinpad",
          "Aguardar erro 'pendência' aparecer no painel",
        ],
        esperado: "Status fica pending_confirmation no painel.",
      },
      {
        n: 32,
        titulo: "Transação pendente #2",
        desc: "Tratamento adicional da pendente.",
        comoFazer: [
          "Reconectar a rede",
          "No card Venda de teste: clicar Confirmar pendência",
        ],
        esperado: "Pinpad liberado e transação marcada como aprovada.",
      },
      {
        n: 33,
        titulo: "Pendente não encontrada #1",
        desc: "Pedir confirmação de uma pendente que não existe.",
        comoFazer: [
          "Sem ter pendência ativa: clicar Confirmar pendência",
        ],
        esperado: "Tratada sem erro (mensagem amigável).",
      },
      {
        n: 34,
        titulo: "Pendente não encontrada #2",
        desc: "Mesmo cenário em outro fluxo (Desfazer).",
        comoFazer: [
          "Sem pendência ativa: clicar Desfazer pendência",
        ],
        esperado: "Tratada sem erro.",
      },
      {
        n: 35,
        titulo: "Confirmação manual",
        desc: "Confirmar manualmente uma venda já feita.",
        comoFazer: [
          "Após uma venda aprovada, clicar Confirmar pendência no card",
        ],
        esperado: "Confirmação aceita pelo TEF.",
      },
    ],
  },
  {
    id: "s8",
    titulo: "8. Desfazimento",
    passos: [
      {
        n: 37,
        titulo: "Desfazimento manual",
        desc: "Solicitar desfazimento manual de transação.",
        comoFazer: [
          "Após uma venda recém-aprovada (mesma sessão), clicar Desfazer pendência",
        ],
        esperado: "Desfazimento aceito pelo TEF.",
      },
    ],
  },
  {
    id: "s9",
    titulo: "9. Cancelamento por referência",
    passos: [
      {
        n: 41,
        titulo: "Cancelamento por Referência Local #1",
        desc: "Cancelar usando a Referência Local da venda.",
        comoFazer: [
          "Rodar venda DEMO R$ 12,00 → anotar a Referência Local (locRef) no painel",
          "Menu ADM → Cancelamento por Referência Local → digitar locRef",
          "Pinpad: cartão supervisor → senha",
        ],
        esperado: "Cancelamento aprovado.",
      },
      {
        n: 42,
        titulo: "Cancelamento por Referência Local #2",
        desc: "Variação do anterior em outra venda.",
        comoFazer: [
          "Repetir o passo 41 com uma nova venda (R$ 13,00)",
        ],
        esperado: "Cancelamento aprovado.",
      },
      {
        n: 43,
        titulo: "Cancelamento por Referência Externa #1",
        desc: "Cancelar usando a Referência Externa (extRef).",
        comoFazer: [
          "Rodar venda DEMO R$ 14,00 → anotar extRef no painel",
          "Menu ADM → Cancelamento por Referência Externa → digitar extRef",
          "Pinpad: cartão supervisor → senha",
        ],
        esperado: "Cancelamento aprovado.",
      },
      {
        n: 44,
        titulo: "Cancelamento por Referência Externa #2",
        desc: "Variação em outra venda.",
        comoFazer: [
          "Repetir o passo 43 com nova venda (R$ 16,00)",
        ],
        esperado: "Cancelamento aprovado.",
      },
    ],
  },
  {
    id: "s10",
    titulo: "10. Contactless / aproximação",
    passos: [
      {
        n: 45,
        titulo: "Venda contactless COM senha",
        desc: "Aproximação acima do limite (pede PIN).",
        valor: "R$ 250,00",
        rede: "DEMO",
        modalidade: "Crédito contactless",
        comoFazer: [
          "Card Venda de teste → Valor: 250,00 → Crédito → DEMO",
          "No pinpad: APROXIMAR cartão DEMO contactless",
          "Digitar a senha quando solicitada",
        ],
        esperado: "Aprovada e confirmada.",
      },
      {
        n: 46,
        titulo: "Venda contactless SEM senha",
        desc: "Aproximação abaixo do limite — dispensa PIN.",
        valor: "R$ 30,00",
        rede: "DEMO",
        modalidade: "Crédito contactless",
        comoFazer: [
          "Card Venda de teste → Valor: 30,00 → Crédito → DEMO",
          "No pinpad: APROXIMAR cartão DEMO contactless",
        ],
        esperado: "Aprovada sem pedir senha.",
      },
    ],
  },
  {
    id: "s11",
    titulo: "11. Queda após aprovação e QR Code finais",
    passos: [
      {
        n: 51,
        titulo: "Queda de energia após aprovação",
        desc: "Aprovar venda e simular queda ANTES da confirmação.",
        valor: "R$ 18,00",
        comoFazer: [
          "Rodar venda R$ 18,00 → Crédito → DEMO",
          "Assim que o pinpad mostrar APROVADA, FECHAR o agente (kill)",
          "Reabrir o agente",
        ],
        esperado: "Recuperação correta na próxima execução (pendência resolvida).",
      },
      {
        n: 52,
        titulo: "QR Code — aprovação",
        desc: "Venda QR Code aprovada.",
        valor: "R$ 2,00",
        rede: "PIX C6 BANK",
        comoFazer: [
          "Card Venda de teste → Valor: 2,00 → botão PIX C6 BANK",
          "Pagar QR Code no app DEMO",
        ],
        esperado: "Aprovada e confirmada.",
      },
      {
        n: 53,
        titulo: "QR Code — cancelamento",
        desc: "Cancelar venda QR Code aprovada.",
        comoFazer: [
          "Após o passo 52, abrir menu ADM → Cancelamento → informar NSU PIX",
        ],
        esperado: "Cancelamento aprovado.",
      },
      {
        n: 54,
        titulo: "QR Code — variação final",
        desc: "Variação final do fluxo QR Code conforme roteiro PayGo.",
        valor: "R$ 3,00",
        rede: "PIX C6 BANK",
        comoFazer: [
          "Rodar nova venda PIX C6 BANK R$ 3,00 e seguir variação solicitada pela PayGo",
        ],
        esperado: "Conforme orientação do homologador.",
      },
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

  const flat = useMemo(
    () => ROTEIRO.flatMap((s) => s.passos.map((p) => ({ sec: s, passo: p }))),
    [],
  );
  const todos = useMemo(() => ROTEIRO.flatMap((s) => s.passos), []);
  const isDone = (n: number) => estado[n] === "done" || autoEv.has(n);
  const concluidos = todos.filter((p) => isDone(p.n)).length;
  const autoCount = todos.filter((p) => autoEv.has(p.n)).length;
  const pct = Math.round((concluidos / todos.length) * 100);

  // Índice atual do carrossel (controlado, mas se o passo for concluído avança auto)
  const [idx, setIdx] = useState(0);
  // Quando concluir o passo atual (auto ou manual), avança automaticamente
  useEffect(() => {
    const cur = flat[idx];
    if (cur && isDone(cur.passo.n) && idx < flat.length - 1) {
      const t = window.setTimeout(() => setIdx((i) => Math.min(flat.length - 1, i + 1)), 400);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEv, estado, idx, flat.length]);
  const goPrev = () => setIdx((i) => Math.max(0, i - 1));
  const goNext = () => setIdx((i) => Math.min(flat.length - 1, i + 1));


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

      {(() => {
        const cur = flat[Math.min(idx, flat.length - 1)];
        if (!cur) return null;
        const { sec, passo: p } = cur;
        const ev = autoEv.get(p.n);
        const done = isDone(p.n);
        return (
          <div className="space-y-3">
            {/* Navegação topo */}
            <div className="flex items-center justify-between gap-2">
              <Button variant="outline" size="sm" onClick={goPrev} disabled={idx === 0}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <div className="text-xs text-muted-foreground text-center flex-1 min-w-0 truncate">
                <span className="font-medium text-foreground">{sec.titulo}</span>
                <span className="mx-2">·</span>
                <span>{idx + 1} de {flat.length}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={goNext}
                disabled={idx >= flat.length - 1}
              >
                Avançar <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>

            {/* Card do passo atual — altura mínima fixa para não “pular” */}
            <div
              className={`rounded-md border p-4 min-h-[420px] flex gap-3 items-start ${
                done ? "bg-muted/50 border-success/30" : "bg-background"
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
                  <span className={`text-xs font-mono ${done ? "text-success" : "text-muted-foreground"}`}>
                    Passo {String(p.n).padStart(2, "0")}
                  </span>
                  <span className={`text-base font-semibold ${done ? "text-success line-through" : ""}`}>
                    {p.titulo}
                  </span>
                  {ev && (
                    <Badge variant="secondary" className="text-[10px] gap-1">
                      <Sparkles className="h-3 w-3" /> auto
                    </Badge>
                  )}
                </div>
                <p className={`text-sm mt-1 ${done ? "text-success" : "text-muted-foreground"}`}>{p.desc}</p>

                {/* Sanfona fechada: só mostra detalhes quando pendente */}
                {!done && (
                  <>
                    {(p.valor || p.rede || p.modalidade) && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {p.valor && (
                          <Badge variant="default" className="text-xs font-mono">
                            💰 {p.valor}
                          </Badge>
                        )}
                        {p.rede && (
                          <Badge variant="outline" className="text-xs">Rede: {p.rede}</Badge>
                        )}
                        {p.modalidade && (
                          <Badge variant="outline" className="text-xs">{p.modalidade}</Badge>
                        )}
                      </div>
                    )}

                    {p.comoFazer && p.comoFazer.length > 0 && (
                      <div className="mt-3 rounded border bg-muted/30 p-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                          Como fazer
                        </div>
                        <ol className="list-decimal list-inside space-y-1 text-sm text-foreground/90">
                          {p.comoFazer.map((passo, i) => (
                            <li key={i} className="leading-snug">{passo}</li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {p.esperado && (
                      <div className="mt-3 text-sm">
                        <span className="font-semibold text-success">✓ Esperado:</span>{" "}
                        <span className="text-muted-foreground">{p.esperado}</span>
                      </div>
                    )}
                  </>
                )}

                {ev && (
                  <p className="text-[11px] text-muted-foreground mt-3 font-mono">
                    auto · {ev.label} · NSU {ev.nsu ?? "—"} · {formatBRL(ev.amount)}
                    {ev.acquirer ? ` · ${ev.acquirer}` : ""}
                  </p>
                )}
              </div>
            </div>

            {/* Navegação inferior + pular para próximo não-concluído */}
            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={goPrev} disabled={idx === 0}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const next = flat.findIndex((f, i) => i > idx && !isDone(f.passo.n));
                  if (next >= 0) setIdx(next);
                  else toast.success("Nenhum passo pendente à frente.");
                }}
              >
                Pular para próximo pendente
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={goNext}
                disabled={idx >= flat.length - 1}
              >
                Próximo <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        );
      })()}
    </Card>
  );
}


export default TefRoteiroTestesCard;
