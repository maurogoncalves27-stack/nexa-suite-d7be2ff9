import EmployeeArea from "./EmployeeArea";

/**
 * Área do Gestor (/area-gestor)
 *
 * Página dedicada ao gestor, clonada da Área do Colaborador.
 * Reutiliza exatamente o mesmo componente (mesmas regras, cards e
 * funcionalidades), mas vive em uma rota própria — permitindo que o
 * AppLayout exiba o FAB de microfone (voz) somente aqui e na Dashboard.
 *
 * Importante: NÃO duplicar a lógica de EmployeeArea aqui. Qualquer
 * mudança na experiência deve ser feita em src/pages/EmployeeArea.tsx
 * para que as duas rotas continuem espelhadas.
 */
export default function ManagerArea() {
  return <EmployeeArea />;
}
