import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { GripVertical, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  editing: boolean;
  hidden: boolean;
  onToggleHidden: () => void;
  children: React.ReactNode;
}

export default function SortableCard({ id, editing, hidden, onToggleHidden, children }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !editing,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  if (hidden && !editing) return null;

  return (
    <div ref={setNodeRef} style={style} className={cn("relative", hidden && "opacity-50")}>
      {editing && (
        <div className="absolute -top-2 -right-2 z-10 flex items-center gap-1 rounded-md border bg-card shadow-md p-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onToggleHidden}
            title={hidden ? "Exibir" : "Ocultar"}
          >
            {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted cursor-grab active:cursor-grabbing"
            title="Arrastar para reordenar"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </div>
      )}
      {editing && (
        <div className="pointer-events-none absolute inset-0 z-[5] rounded-lg border-2 border-dashed border-primary/40" />
      )}
      <div className={editing ? "pointer-events-none" : ""}>{children}</div>
    </div>
  );
}
