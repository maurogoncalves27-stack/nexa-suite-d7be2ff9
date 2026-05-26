import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "colaborador" | "freelancer" | "fornecedor" | "parceiro";

const variantClass: Record<Variant, string> = {
  colaborador: "bg-[hsl(var(--portal-colaborador))] text-[hsl(var(--portal-colaborador-foreground))]",
  freelancer: "bg-[hsl(var(--portal-freelancer))] text-[hsl(var(--portal-freelancer-foreground))]",
  fornecedor: "bg-[hsl(var(--portal-fornecedor))] text-[hsl(var(--portal-fornecedor-foreground))]",
  parceiro: "bg-[hsl(var(--portal-parceiro))] text-[hsl(var(--portal-parceiro-foreground))]",
};

interface Props {
  variant: Variant;
  icon: LucideIcon;
  label: string;
  className?: string;
}

export function AuthRolePill({ variant, icon: Icon, label, className }: Props) {
  return (
    <div
      className={cn(
        "mx-auto inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold shadow-md",
        variantClass[variant],
        className,
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </div>
  );
}
