import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Star, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  title: string;
  icon: LucideIcon;
  description?: string;
  open: boolean;
  isFavorite: boolean;
  onToggleOpen: () => void;
  onToggleFavorite: () => void;
  badge?: string | number;
  badgeVariant?: "default" | "destructive" | "outline";
  children: ReactNode;
}

export default function DashboardSection({
  title,
  icon: Icon,
  description,
  open,
  isFavorite,
  onToggleOpen,
  onToggleFavorite,
  badge,
  badgeVariant = "outline",
  children,
}: Props) {
  return (
    <Card
      className={cn(
        "overflow-hidden transition-colors",
        isFavorite && "border-primary/50 ring-1 ring-primary/20",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4 bg-muted/30 border-b">
        <button
          type="button"
          onClick={onToggleOpen}
          className="flex flex-1 items-center gap-2.5 text-left min-w-0"
          aria-expanded={open}
        >
          <Icon className="h-5 w-5 text-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-foreground text-sm sm:text-base truncate">{title}</span>
              {badge !== undefined && badge !== 0 && (
                <Badge variant={badgeVariant} className="h-5 text-[10px]">{badge}</Badge>
              )}
              {isFavorite && (
                <Badge variant="outline" className="h-5 text-[10px] border-primary/40 text-primary">
                  Favorito
                </Badge>
              )}
            </div>
            {description && (
              <p className="text-[11px] sm:text-xs text-muted-foreground truncate">{description}</p>
            )}
          </div>
          <ChevronDown
            className={cn("h-4 w-4 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")}
          />
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={onToggleFavorite}
          title={isFavorite ? "Remover favorito" : "Marcar como favorito"}
        >
          <Star className={cn("h-4 w-4", isFavorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
        </Button>
      </div>
      {open && <div className="p-3 sm:p-4 space-y-3">{children}</div>}
    </Card>
  );
}
