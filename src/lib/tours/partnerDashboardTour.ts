import type { DriveStep } from "driver.js";

/**
 * Tour de boas-vindas do Painel do Sócio (/painel-socio).
 * Visão geral: cabeçalho, KPIs de faturamento, sino e atalhos rápidos.
 */
export function getPartnerDashboardTourSteps(): DriveStep[] {
  return [
    {
      popover: {
        title: "👋 Bem-vindo(a), sócio(a)!",
        description:
          "Em poucos passos vou te mostrar o seu painel. Você pode fechar a qualquer momento.",
      },
    },
    {
      element: '[data-tour="partner-header"]',
      popover: {
        title: "Painel do Sócio",
        description:
          "Esta é sua tela inicial — pensada para acompanhar o negócio em poucos toques.",
        side: "bottom",
        align: "start",
      },
    },
    {
      element: '[data-tour="notification-bell"]',
      popover: {
        title: "🔔 Notificações",
        description:
          "Avisos importantes (faturamento, manutenções, RH) chegam aqui em tempo real.",
        side: "bottom",
        align: "end",
      },
    },
    {
      element: '[data-tour="partner-kpis"]',
      popover: {
        title: "📊 Faturamento do mês",
        description:
          "Total do mês atual e do mês anterior, somando todas as lojas, com a variação percentual.",
        side: "bottom",
        align: "center",
      },
    },
    {
      element: '[data-tour="partner-quick-links"]',
      popover: {
        title: "⚡ Atalhos rápidos",
        description:
          "Faturamento, DRE, CMV, Precificação, Conciliação, Ranking, Ocorrências e mais. Toque para abrir.",
        side: "top",
        align: "center",
      },
    },
    {
      popover: {
        title: "Pronto! 🎉",
        description:
          "Você já conhece o painel. Esse tutorial não vai aparecer de novo automaticamente. Boas vendas!",
      },
    },
  ];
}
