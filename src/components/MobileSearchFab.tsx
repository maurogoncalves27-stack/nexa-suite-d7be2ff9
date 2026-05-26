import { Search } from "lucide-react";
import { openCommandPalette } from "@/components/CommandPalette";
import { cn } from "@/lib/utils";

/**
 * Botão flutuante (FAB) de busca exibido em mobile e desktop.
 * Fica fixo no canto inferior direito acima da safe area do iOS.
 */
export function MobileSearchFab() {
  return (
    <button
      type="button"
      onClick={openCommandPalette}
      aria-label="Buscar páginas e ações"
      className={cn(
        "fixed z-40 right-4 bottom-4",
        "h-14 w-14 rounded-full",
        "bg-primary text-primary-foreground",
        "shadow-lg shadow-primary/30",
        "flex items-center justify-center",
        "active:scale-95 transition-transform",
        "hover:bg-primary/90",
      )}
      style={{
        // Respeita a safe area de iPhones com notch / barra inferior
        bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <Search className="h-6 w-6" />
    </button>
  );
}
