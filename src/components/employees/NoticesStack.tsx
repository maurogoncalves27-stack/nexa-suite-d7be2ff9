import { useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Bell, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
  /** Título do bloco. */
  title?: string;
  /** Se true, abre por padrão. */
  defaultOpen?: boolean;
}

/**
 * Empilha vários banners/alertas internamente num único card colapsável.
 * Cada banner filho continua decidindo se renderiza (null quando vazio),
 * então o stack só serve para reduzir ruído visual quando há muitos avisos.
 *
 * Não altera comportamento de nenhum banner — apenas agrupa visualmente.
 */
export default function NoticesStack({ children, title = "Avisos e pendências", defaultOpen = true }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-muted/40 transition-colors"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Bell className="h-4 w-4 text-primary" />
          {title}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <CardContent className="p-3 pt-0 space-y-2 border-t">
          {children}
        </CardContent>
      )}
    </Card>
  );
}
