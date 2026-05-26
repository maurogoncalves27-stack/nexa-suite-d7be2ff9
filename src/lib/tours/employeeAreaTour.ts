import type { DriveStep } from "driver.js";

/**
 * Tour de boas-vindas da Área do Colaborador.
 *
 * Tabs aparecem em dois lugares dependendo do viewport:
 * - Desktop (md+): TabsList no topo (`[data-tour="tab-*"]`)
 * - Mobile (<md): bottom nav (`[data-tour="tab-*-m"]`)
 *
 * `getEmployeeAreaTourSteps()` escolhe o seletor certo conforme a largura.
 */
export function getEmployeeAreaTourSteps(): DriveStep[] {
  const isMobile =
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  const tab = (key: string) => (isMobile ? `[data-tour="tab-${key}-m"]` : `[data-tour="tab-${key}"]`);

  return [
    {
      popover: {
        title: "👋 Bem-vindo(a)!",
        description:
          "Esse é seu painel pessoal. Em poucos segundos vou te mostrar onde fica cada coisa. Você pode pular a qualquer momento.",
      },
    },
    {
      element: '[data-tour="employee-header"]',
      popover: {
        title: "Seu cabeçalho",
        description:
          "Aqui aparece sua foto, seu nome e sua nota da última avaliação. Toque na foto para atualizá-la.",
        side: "bottom",
        align: "start",
      },
    },
    {
      element: '[data-tour="notification-bell"]',
      popover: {
        title: "🔔 Notificações",
        description:
          "Avisos importantes (escala, atestados, comunicados) chegam aqui em tempo real.",
        side: "bottom",
        align: "end",
      },
    },
    {
      element: tab("timeclock"),
      popover: {
        title: "Bater ponto",
        description:
          "Use esta aba para registrar entrada, saída e intervalos. O reconhecimento facial confirma sua identidade.",
        side: isMobile ? "top" : "bottom",
        align: "center",
      },
    },
    {
      element: tab("schedule"),
      popover: {
        title: "Sua escala",
        description:
          "Veja seus dias de trabalho, folgas e horários da semana. Você também pode pedir troca de turno por aqui.",
        side: isMobile ? "top" : "bottom",
        align: "center",
      },
    },
    {
      element: tab("vacation"),
      popover: {
        title: "Férias",
        description: "Acompanhe seus períodos de férias agendados e o histórico.",
        side: isMobile ? "top" : "bottom",
        align: "center",
      },
    },
    {
      element: tab("uniforms"),
      popover: {
        title: "Uniformes",
        description: "Veja quais peças estão sob sua responsabilidade.",
        side: isMobile ? "top" : "bottom",
        align: "center",
      },
    },
    {
      element: tab("documents"),
      popover: {
        title: "📄 Seus documentos",
        description:
          "Contratos, holerites, atestados e termos para assinar ficam aqui. Pendências aparecem com aviso vermelho.",
        side: isMobile ? "top" : "bottom",
        align: "center",
      },
    },
    {
      popover: {
        title: "Pronto! 🎉",
        description:
          "Esse tutorial não vai aparecer de novo automaticamente. Se quiser refazer, use o botão 'Refazer tutorial' no rodapé desta página.",
      },
    },
  ];
}
