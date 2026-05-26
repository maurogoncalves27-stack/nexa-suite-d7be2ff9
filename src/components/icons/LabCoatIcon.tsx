import { forwardRef, type SVGProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Ícone de jaleco feminino — line-icon estilo Lucide.
 *
 * Estrutura:
 * - Gola em V profunda
 * - Ombros arredondados e mangas curtas
 * - Silhueta entalhada na cintura (princesa)
 * - Barra evasê (mais larga embaixo)
 * - Linha central de abotoamento com 2 botões
 * - Bolso lateral
 */
const LabCoatIcon = forwardRef<SVGSVGElement, SVGProps<SVGSVGElement>>(
  ({ className, strokeWidth = 2, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("lucide", className)}
      aria-hidden="true"
      {...props}
    >
      {/* Lado esquerdo: ombro → manga → cintura entalhada → barra evasê */}
      <path d="M9 3 L4.5 5 L3 10 L5.5 10 L6.5 14 L5 21 L12 21" />
      {/* Lado direito: simétrico */}
      <path d="M15 3 L19.5 5 L21 10 L18.5 10 L17.5 14 L19 21 L12 21" />
      {/* Gola em V profunda */}
      <path d="M9 3 L12 10 L15 3" />
      {/* Linha central de abotoamento */}
      <path d="M12 10 L12 21" />
      {/* Botões */}
      <circle cx="12" cy="13" r="0.4" fill="currentColor" />
      <circle cx="12" cy="17" r="0.4" fill="currentColor" />
      {/* Bolso lateral */}
      <path d="M14.5 16 L17 16" />
    </svg>
  ),
);

LabCoatIcon.displayName = "LabCoatIcon";

export default LabCoatIcon;
