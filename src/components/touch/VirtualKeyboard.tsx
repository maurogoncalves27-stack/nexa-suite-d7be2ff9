// Teclado virtual touch — totem (23.8" vertical) e PDV loja (21.5" horizontal).
import { Button } from "@/components/ui/button";
import { Delete, CornerDownLeft, ChevronDown } from "lucide-react";
import type { TouchKeyboardVariant } from "@/lib/touchScreen";

interface Props {
  onKey: (k: string) => void;
  onBackspace: () => void;
  onEnter?: () => void;
  onSpace?: () => void;
  onDismiss?: () => void;
  layout?: "qwerty" | "numeric";
  variant?: TouchKeyboardVariant;
}

const QWERTY_ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L", "Ç"],
  ["Z", "X", "C", "V", "B", "N", "M", ",", ".", "-"],
];

const NUMERIC_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["0"],
];

export function VirtualKeyboard({
  onKey,
  onBackspace,
  onEnter,
  onSpace,
  onDismiss,
  layout = "qwerty",
  variant = "pdv",
}: Props) {
  const rows = layout === "numeric" ? NUMERIC_ROWS : QWERTY_ROWS;
  const isTotem = variant === "totem";

  const keyCls =
    layout === "numeric"
      ? isTotem
        ? "h-20 w-20 text-3xl font-black border-primary/40 hover:bg-primary/10"
        : "h-16 w-16 text-2xl font-bold border-primary/40 hover:bg-primary/10"
      : isTotem
        ? "h-14 w-14 text-xl font-bold border-primary/40 hover:bg-primary/10"
        : "h-12 w-12 text-lg font-semibold border-primary/40 hover:bg-primary/10";

  const actionCls =
    layout === "numeric"
      ? isTotem
        ? "h-20 px-8 text-xl font-bold border-primary/40 hover:bg-primary/10"
        : "h-16 px-6 text-lg font-bold border-primary/40 hover:bg-primary/10"
      : isTotem
        ? "h-14 px-6 text-base font-bold border-primary/40 hover:bg-primary/10"
        : "h-12 px-5 text-sm font-semibold border-primary/40 hover:bg-primary/10";

  return (
    <div className="select-none bg-card/95 backdrop-blur border-t border-primary/20 shadow-lg p-3 space-y-2 w-full">
      {onDismiss && (
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={onDismiss} className="text-muted-foreground">
            <ChevronDown className="h-4 w-4 mr-1" /> Ocultar teclado
          </Button>
        </div>
      )}
      {rows.map((row, i) => (
        <div key={i} className="flex justify-center gap-2 flex-wrap">
          {row.map((k) => (
            <Button key={k} type="button" variant="outline" className={keyCls} onClick={() => onKey(k)}>
              {k}
            </Button>
          ))}
        </div>
      ))}
      <div className="flex justify-center gap-2 flex-wrap">
        <Button type="button" variant="outline" className={actionCls} onClick={onBackspace}>
          <Delete className="h-5 w-5 mr-2" /> Apagar
        </Button>
        {onSpace && layout === "qwerty" && (
          <Button type="button" variant="outline" className={`${actionCls} flex-1 max-w-md`} onClick={onSpace}>
            Espaço
          </Button>
        )}
        {onEnter && (
          <Button type="button" variant="outline" className={actionCls} onClick={onEnter}>
            <CornerDownLeft className="h-5 w-5 mr-2" /> OK
          </Button>
        )}
      </div>
    </div>
  );
}
