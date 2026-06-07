/**
 * Catálogo dos 54 passos do roteiro Setis PayGo v20241216.
 * Integração alvo: "Biblioteca Windows" (ACBrLibTEFD).
 * Passos 47–50 (ControlPay REST) são marcados como N/A nesta rodada.
 */
import type { TefPaymentRequest } from "@/lib/tef";

export type StepKind =
  | "manual"          // operador faz no PdC / pinpad e marca OK
  | "sale"            // dispara venda via ACBr
  | "sale-cancel"     // venda que vai ser usada para cancelamento posterior
  | "cancel-prev"     // cancela uma venda anterior (por NSU)
  | "admin"           // operação de menu administrativo (relatórios, teste comunicação)
  | "power-cut"       // simulação de queda de energia
  | "generic-input"   // dado genérico digitado/seleção
  | "pending"         // teste de transação pendente / confirmação / desfazimento
  | "controlpay-na";  // fora do escopo desta rodada

export interface HomologationStep {
  number: number;
  name: string;
  description: string;
  mandatory: boolean;
  kind: StepKind;
  /** Parâmetros sugeridos quando aplicável (venda). */
  sale?: Partial<TefPaymentRequest> & { acquirer?: string };
  /** Para `cancel-prev`: número do passo de venda que será cancelado. */
  cancelsStep?: number;
  /** Para `admin`: código da operação ACBr (0=menu, 1=teste com., 4/5/6=relatórios). */
  adminCode?: number;
  /** Resultado esperado pra orientar o operador. */
  expected: string;
}

export const HOMOLOGATION_STEPS: HomologationStep[] = [
  { number: 1, name: "Instalação", mandatory: true, kind: "manual",
    description: "Realize a instalação do PdC com os dados PayGo (PdC 111476, host pos-transac-sb.tpgweb.io:31735, CNPJ 44.932.369/0001-08).",
    expected: "Instalação concluída, recibo impresso." },

  { number: 2, name: "Venda valor máximo", mandatory: true, kind: "sale",
    description: "Venda DEMO no valor máximo permitido pela automação (R$ 100.000,00).",
    sale: { amount: 100000, method: "credit", acquirer: "DEMO" },
    expected: "TRANSAÇÃO APROVADA, recibo impresso." },

  { number: 3, name: "Venda pré-seleção", mandatory: true, kind: "sale",
    description: "Venda DEMO com pré-seleção: Cartão Crédito À Vista.",
    sale: { amount: 10, method: "credit", installments: 1, acquirer: "DEMO" },
    expected: "Aprovada e confirmada." },

  { number: 4, name: "Venda negada", mandatory: true, kind: "sale",
    description: "Venda DEMO no valor de R$ 1000,01 → deve ser NEGADA 01.",
    sale: { amount: 1000.01, method: "credit", acquirer: "DEMO" },
    expected: "NEGADA 01, transação não realizada." },

  { number: 5, name: "Menu adquirente cancelado", mandatory: true, kind: "manual",
    description: "Iniciar venda e cancelar no menu de seleção da rede (Esc/Cancelar).",
    expected: "OPERAÇÃO CANCELADA." },

  { number: 6, name: "Venda crédito", mandatory: true, kind: "sale",
    description: "Venda crédito de qualquer valor — inserir cartão no pinpad.",
    sale: { amount: 5, method: "credit", acquirer: "DEMO" },
    expected: "Aprovada com cartão de crédito." },

  { number: 7, name: "Venda débito", mandatory: true, kind: "sale",
    description: "Venda débito de qualquer valor — inserir cartão no pinpad.",
    sale: { amount: 5, method: "debit", acquirer: "DEMO" },
    expected: "Aprovada com cartão de débito." },

  { number: 8, name: "Venda parcelada 99x", mandatory: true, kind: "sale",
    description: "Venda crédito parcelada pelo estabelecimento em 99 parcelas.",
    sale: { amount: 99, method: "credit", installments: 99, acquirer: "DEMO" },
    expected: "Aprovada em 99 parcelas (loja)." },

  { number: 9, name: "Recibos diferenciados #1", mandatory: false, kind: "sale",
    description: "Venda DEMO. Conferir: reduzido portador + diferenciado lojista.",
    sale: { amount: 3, method: "credit", acquirer: "DEMO" },
    expected: "Vias impressas corretamente." },

  { number: 10, name: "Recibos diferenciados #2", mandatory: true, kind: "sale",
    description: "Venda DEMO. Conferir: diferenciado portador + diferenciado lojista.",
    sale: { amount: 4, method: "credit", acquirer: "DEMO" },
    expected: "Vias impressas corretamente." },

  { number: 11, name: "QR Code PIX C6 BANK", mandatory: true, kind: "sale",
    description: "Venda pré-selecionando rede PIX C6 BANK. Aguardar aprovação automática.",
    sale: { amount: 1, method: "pix", acquirer: "PIX C6 BANK" },
    expected: "QR exibido e aprovação automática." },

  { number: 12, name: "Teste de comunicação", mandatory: true, kind: "admin", adminCode: 1,
    description: "Executar teste de comunicação no menu administrativo.",
    expected: "Sucesso, sem recibo." },

  { number: 13, name: "Relatório sintético", mandatory: false, kind: "admin", adminCode: 4,
    description: "Emitir relatório sintético no menu administrativo.", expected: "Relatório impresso." },
  { number: 14, name: "Relatório detalhado", mandatory: false, kind: "admin", adminCode: 5,
    description: "Emitir relatório detalhado.", expected: "Relatório impresso." },
  { number: 15, name: "Relatório resumido", mandatory: false, kind: "admin", adminCode: 6,
    description: "Emitir relatório resumido.", expected: "Relatório impresso." },

  { number: 16, name: "Operação cancelada (menu adm)", mandatory: true, kind: "manual",
    description: "Entrar no menu administrativo e cancelar a operação.",
    expected: "OPERAÇÃO CANCELADA." },

  { number: 17, name: "Venda base p/ cancelamento #1", mandatory: false, kind: "sale-cancel",
    description: "Venda DEMO crédito que será cancelada no passo 20.",
    sale: { amount: 5, method: "credit", acquirer: "DEMO" }, expected: "Aprovada, anotar NSU." },
  { number: 18, name: "Venda base p/ cancelamento #2", mandatory: false, kind: "sale-cancel",
    description: "Venda DEMO débito que será cancelada no passo 22.",
    sale: { amount: 6, method: "debit", acquirer: "DEMO" }, expected: "Aprovada, anotar NSU." },
  { number: 19, name: "Venda base p/ cancelamento #3", mandatory: true, kind: "sale-cancel",
    description: "Venda DEMO crédito que será cancelada no passo 21.",
    sale: { amount: 7, method: "credit", acquirer: "DEMO" }, expected: "Aprovada, anotar NSU." },

  { number: 20, name: "Cancelamento #1", mandatory: false, kind: "cancel-prev", cancelsStep: 17,
    description: "Cancelar a venda do passo 17.", expected: "Cancelamento aprovado, recibo impresso." },
  { number: 21, name: "Cancelamento #2", mandatory: true, kind: "cancel-prev", cancelsStep: 19,
    description: "Cancelar a venda do passo 19.", expected: "Cancelamento aprovado, recibo impresso." },
  { number: 22, name: "Cancelamento #3", mandatory: false, kind: "cancel-prev", cancelsStep: 18,
    description: "Cancelar a venda do passo 18.", expected: "Cancelamento aprovado." },
  { number: 23, name: "Cancelamento #4", mandatory: false, kind: "cancel-prev",
    description: "Cancelamento adicional opcional (informe NSU/valor/data no campo abaixo).",
    expected: "Cancelamento aprovado." },

  { number: 24, name: "Queda de energia durante venda", mandatory: true, kind: "power-cut",
    description: "Iniciar venda, derrubar energia, religar e validar tratamento de pendência.",
    expected: "Pendência detectada e resolvida pelo fluxo de confirmação/desfazimento." },
  { number: 25, name: "Queda de energia durante operação adm", mandatory: true, kind: "power-cut",
    description: "Idem 24, dentro do menu administrativo.", expected: "Sem corrupção, retomada normal." },

  { number: 26, name: "Dado genérico digitado #1", mandatory: true, kind: "generic-input",
    description: "Tratar solicitação de dado genérico digitado pelo PdC.", expected: "Dado enviado e venda concluída." },
  { number: 27, name: "Dado genérico digitado #2", mandatory: true, kind: "generic-input",
    description: "Segunda variação de dado genérico digitado.", expected: "Idem 26." },
  { number: 28, name: "Menu genérico #1", mandatory: true, kind: "generic-input",
    description: "Tratar menu genérico com várias opções.", expected: "Opção selecionada e enviada." },
  { number: 29, name: "Menu genérico #2 (ABCDEF)", mandatory: true, kind: "generic-input",
    description: "Selecionar item ABCDEF no menu genérico.", expected: "Item ABCDEF selecionado." },

  { number: 30, name: "Mensagem tamanho máximo", mandatory: true, kind: "sale",
    description: "Venda com mensagem resultado no tamanho máximo.",
    sale: { amount: 2, method: "credit", acquirer: "DEMO" },
    expected: "Mensagem exibida sem truncamento." },

  { number: 31, name: "Transação pendente #1", mandatory: true, kind: "pending",
    description: "Forçar transação pendente cenário 1.", expected: "Pendência tratada." },
  { number: 32, name: "Transação pendente #2", mandatory: true, kind: "pending",
    description: "Forçar transação pendente cenário 2.", expected: "Pendência tratada." },
  { number: 33, name: "Pendente não encontrada #1", mandatory: true, kind: "pending",
    description: "Cenário onde a pendente não é encontrada.", expected: "Tratamento correto." },
  { number: 34, name: "Pendente não encontrada #2", mandatory: true, kind: "pending",
    description: "Segunda variação.", expected: "Tratamento correto." },

  { number: 35, name: "Confirmação manual #1", mandatory: true, kind: "pending",
    description: "Confirmação positiva manual da transação.", expected: "Confirmada com sucesso." },
  { number: 36, name: "Confirmação manual #2", mandatory: false, kind: "pending",
    description: "Variação opcional.", expected: "Confirmada com sucesso." },

  { number: 37, name: "Desfazimento manual #1", mandatory: true, kind: "pending",
    description: "Desfazimento manual de uma transação.", expected: "Desfeita com sucesso." },
  { number: 38, name: "Desfazimento manual #2", mandatory: false, kind: "pending",
    description: "Variação opcional.", expected: "Desfeita com sucesso." },

  { number: 39, name: "Desfazimento por falha (auto-atendimento) #1", mandatory: true, kind: "pending",
    description: "Simular falha na liberação da mercadoria no totem.", expected: "Desfazimento automático." },
  { number: 40, name: "Desfazimento por falha (auto-atendimento) #2", mandatory: true, kind: "pending",
    description: "Variação do passo 39.", expected: "Desfazimento automático." },

  { number: 41, name: "Cancelamento referência local #1 (subadquirente)", mandatory: true, kind: "cancel-prev",
    description: "Cancelamento aprovado solicitando Referência Local — variação 1.",
    expected: "Cancelado com sucesso." },
  { number: 42, name: "Cancelamento referência local #2 (subadquirente)", mandatory: true, kind: "cancel-prev",
    description: "Cancelamento aprovado solicitando Referência Local — variação 2.",
    expected: "Cancelado com sucesso." },
  { number: 43, name: "Cancelamento referência externa #1 (adquirente)", mandatory: true, kind: "cancel-prev",
    description: "Cancelamento aprovado solicitando Referência Externa — variação 1.",
    expected: "Cancelado com sucesso." },
  { number: 44, name: "Cancelamento referência externa #2 (adquirente)", mandatory: true, kind: "cancel-prev",
    description: "Cancelamento aprovado solicitando Referência Externa — variação 2.",
    expected: "Cancelado com sucesso." },

  { number: 45, name: "Venda contactless aprovada", mandatory: true, kind: "sale",
    description: "Venda crédito por aproximação (contactless).",
    sale: { amount: 8, method: "credit", acquirer: "DEMO" },
    expected: "Aprovada via contactless." },
  { number: 46, name: "Venda contactless sem senha", mandatory: true, kind: "sale",
    description: "Venda crédito por aproximação sem solicitação de senha.",
    sale: { amount: 9, method: "credit", acquirer: "DEMO" },
    expected: "Aprovada via contactless sem PIN." },

  { number: 47, name: "Consulta de terminais (ControlPay)", mandatory: false, kind: "controlpay-na",
    description: "Fora do escopo: ControlPay REST.", expected: "N/A" },
  { number: 48, name: "Status de transação #1 (ControlPay)", mandatory: false, kind: "controlpay-na",
    description: "Fora do escopo: ControlPay REST.", expected: "N/A" },
  { number: 49, name: "Status de transação #2 (ControlPay)", mandatory: false, kind: "controlpay-na",
    description: "Fora do escopo: ControlPay REST.", expected: "N/A" },
  { number: 50, name: "Status de transação #3 (ControlPay)", mandatory: false, kind: "controlpay-na",
    description: "Fora do escopo: ControlPay REST.", expected: "N/A" },

  { number: 51, name: "Queda de energia após aprovação", mandatory: true, kind: "power-cut",
    description: "Derrubar energia logo após aprovação da venda. Validar tratamento.",
    expected: "Confirmação correta na retomada." },

  { number: 52, name: "QR Code variação #1", mandatory: true, kind: "sale",
    description: "Variação de venda PIX/QR conforme apêndice.",
    sale: { amount: 1, method: "pix", acquirer: "PIX C6 BANK" },
    expected: "Aprovada." },
  { number: 53, name: "QR Code variação #2", mandatory: true, kind: "sale",
    description: "Segunda variação de venda PIX/QR.",
    sale: { amount: 2, method: "pix", acquirer: "PIX CIELO" },
    expected: "Aprovada." },
  { number: 54, name: "QR Code variação #3", mandatory: true, kind: "sale",
    description: "Terceira variação de venda PIX/QR.",
    sale: { amount: 3, method: "pix", acquirer: "PIX C6 BANK" },
    expected: "Aprovada." },
];
