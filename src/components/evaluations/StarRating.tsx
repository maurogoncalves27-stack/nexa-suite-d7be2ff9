import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  value: number; // 0 to 5, allows .5
  onChange?: (v: number) => void;
  size?: number;
  readOnly?: boolean;
  className?: string;
}

/**
 * Avaliação por estrelas com suporte a meia estrela.
 * Clique na metade esquerda da estrela = 0.5; metade direita = 1.0.
 */
export function StarRating({ value, onChange, size = 24, readOnly, className }: StarRatingProps) {
  const stars = [1, 2, 3, 4, 5];

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>, idx: number) => {
    if (readOnly || !onChange) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const isLeftHalf = e.clientX - rect.left < rect.width / 2;
    const newValue = idx - (isLeftHalf ? 0.5 : 0);
    onChange(newValue === value ? 0 : newValue);
  };

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {stars.map((idx) => {
        const filled = value >= idx;
        const half = !filled && value >= idx - 0.5;
        return (
          <button
            key={idx}
            type="button"
            disabled={readOnly}
            onClick={(e) => handleClick(e, idx)}
            className={cn(
              "relative transition-transform",
              !readOnly && "hover:scale-110 cursor-pointer",
              readOnly && "cursor-default",
            )}
            aria-label={`${idx} estrelas`}
          >
            <Star
              className="text-muted-foreground/40"
              style={{ width: size, height: size }}
              strokeWidth={1.5}
            />
            {(filled || half) && (
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ width: half ? "50%" : "100%" }}
              >
                <Star
                  className="text-yellow-500 fill-yellow-500"
                  style={{ width: size, height: size }}
                  strokeWidth={1.5}
                />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
