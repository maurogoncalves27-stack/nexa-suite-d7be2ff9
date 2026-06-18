import EmployeeArea from "./EmployeeArea";

/**
 * Área do Gestor (/area-gestor)
 *
 * Reusa EmployeeArea com a flag managerView, que esconde a bottom tab bar
 * fixa, esconde o atalho "Controle de Gás" e troca as abas Ponto/Escala
 * por um grid de cards (Férias / Uniforme / Docs) seguindo o mesmo padrão
 * visual dos atalhos rápidos do gestor.
 */
export default function ManagerArea() {
  return <EmployeeArea managerView />;
}
