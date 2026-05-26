// Teclado virtual para totem touch.
// Suporta layout QWERTY (texto) e NUMERIC (CPF/números).
import { Button } from "@/components/ui/button";
import { Delete, CornerDownLeft } from "lucide-react";

interface Props {
  onKey: (k: string) => void;
  onBackspace: () => void;
  onEnter?: () => void;
  onSpace?: () => void;
  layout?: "qwerty" | "numeric";
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

export function VirtualKeyboard({ onKey, onBackspace, onEnter, onSpace, layout = "qwerty" }: Props) {
  const rows = layout === "numeric" ? NUMERIC_ROWS : QWERTY_ROWS;
  const keyCls =
    layout === "numeric"
      ? "h-20 w-20 text-3xl font-black border-primary/40 hover:bg-primary/10"
      : "h-14 w-14 text-xl font-bold border-primary/40 hover:bg-primary/10";

  return (
    <div className="select-none bg-muted/40 rounded-xl p-3 space-y-2 w-full border border-primary/20 shadow-inner">
      {rows.map((row, i) => (
        <div key={i} className="flex justify-center gap-2">
          {row.map((k) => (
            <Button
              key={k}
              type="button"
              variant="outline"
              className={keyCls}
              onClick={() => onKey(k)}
            >
              {k}
            </Button>
          ))}
        </div>
      ))}
      <div className="flex justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          className={layout === "numeric" ? "h-20 px-8 text-xl font-bold border-primary/40 hover:bg-primary/10" : "h-14 px-6 text-base font-bold border-primary/40 hover:bg-primary/10"}
          onClick={onBackspace}
        >
          <Delete className="h-5 w-5 mr-2" /> Apagar
        </Button>
        {onSpace && layout === "qwerty" && (
          <Button
            type="button"
            variant="outline"
            className="h-14 flex-1 text-base font-bold border-primary/40 hover:bg-primary/10"
            onClick={onSpace}
          >
            Espaço
          </Button>
        )}
        {onEnter && (
          <Button
            type="button"
            variant="outline"
          className={layout === "numeric" ? "h-20 px-8 text-xl font-bold border-primary/40 hover:bg-primary/10" : "h-14 px-6 text-base font-bold border-primary/40 hover:bg-primary/10"}
            onClick={onEnter}
          >
            <CornerDownLeft className="h-5 w-5 mr-2" /> OK
          </Button>
        )}
      </div>
    </div>
  );
}
