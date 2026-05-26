export type Severity = "critical" | "high" | "medium" | "low";

export const SEVERITY_OPTIONS: { value: Severity; label: string }[] = [
  { value: "critical", label: "Gravíssima" },
  { value: "high", label: "Grave" },
  { value: "medium", label: "Média" },
  { value: "low", label: "Baixa" },
];

export const severityLabel = (s: Severity | string | null | undefined): string => {
  const found = SEVERITY_OPTIONS.find((o) => o.value === s);
  return found?.label ?? "—";
};

// Classes de cor (badge) baseadas em tokens semânticos / utilitários neutros.
export const severityBadgeClass = (s: Severity | string | null | undefined): string => {
  switch (s) {
    case "critical":
      return "bg-destructive text-destructive-foreground hover:bg-destructive/90";
    case "high":
      return "bg-orange-500 text-white hover:bg-orange-500/90";
    case "medium":
      return "bg-amber-500 text-white hover:bg-amber-500/90";
    case "low":
    default:
      return "bg-secondary text-secondary-foreground hover:bg-secondary/90";
  }
};

// Estilo de tile (botão grande) por gravidade — cores fortes quando selecionado,
// cores suaves quando não selecionado, mantendo legibilidade.
export const severityTileClass = (
  s: Severity | string | null | undefined,
  selected: boolean,
): string => {
  if (selected) {
    switch (s) {
      case "critical":
        return "border-red-600 bg-red-600 text-white ring-2 ring-red-600/40 hover:bg-red-700";
      case "high":
        return "border-orange-500 bg-orange-500 text-white ring-2 ring-orange-500/40 hover:bg-orange-600";
      case "medium":
        return "border-yellow-500 bg-yellow-500 text-black ring-2 ring-yellow-500/40 hover:bg-yellow-600";
      case "low":
      default:
        return "border-blue-600 bg-blue-600 text-white ring-2 ring-blue-600/40 hover:bg-blue-700";
    }
  }
  switch (s) {
    case "critical":
      return "border-red-600 text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50";
    case "high":
      return "border-orange-500 text-orange-700 bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/30 dark:text-orange-300 dark:hover:bg-orange-950/50";
    case "medium":
      return "border-yellow-500 text-yellow-800 bg-yellow-50 hover:bg-yellow-100 dark:bg-yellow-950/30 dark:text-yellow-200 dark:hover:bg-yellow-950/50";
    case "low":
    default:
      return "border-blue-600 text-blue-700 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/50";
  }
};
