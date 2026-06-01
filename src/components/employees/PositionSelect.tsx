import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePositions, type Position } from "@/hooks/usePositions";

export interface PositionSelectValue {
  positionId: string | null;
  name: string;
  cboCode: string | null;
  cboTitle: string | null;
}

interface Props {
  value: PositionSelectValue;
  onChange: (v: PositionSelectValue) => void;
  placeholder?: string;
}

/**
 * Fonte única de cargos.
 * Lista fechada da tabela `positions` (gerida em Configurações → Cargos).
 * Não permite texto livre — o CBO vem amarrado ao cargo escolhido.
 */
export default function PositionSelect({
  value,
  onChange,
  placeholder = "Selecione um cargo...",
}: Props) {
  const { positions, loading } = usePositions(true);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return positions;
    return positions.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.cbo_code ?? "").toLowerCase().includes(q) ||
        (p.cbo_title ?? "").toLowerCase().includes(q),
    );
  }, [positions, search]);

  const pick = (p: Position) => {
    onChange({
      positionId: p.id,
      name: p.name,
      cboCode: p.cbo_code ?? null,
      cboTitle: p.cbo_title ?? null,
    });
    setOpen(false);
    setSearch("");
  };

  const hasValue = !!value.positionId || !!value.name;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="w-full justify-between font-normal"
        >
          <span className="truncate text-left">
            {hasValue ? (
              <span className="flex items-center gap-2 min-w-0">
                {value.cboCode ? (
                  <span className="font-mono text-xs text-muted-foreground shrink-0">
                    {value.cboCode}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground italic shrink-0">
                    isento
                  </span>
                )}
                <span className="truncate">{value.name}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[--radix-popover-trigger-width] max-w-[95vw]"
        align="start"
      >
        <div className="p-2 border-b flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cargo..."
            className="border-0 focus-visible:ring-0 h-8 px-0"
          />
        </div>

        <div className="max-h-[300px] overflow-y-auto">
          {loading ? (
            <div className="p-6 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Nenhum cargo encontrado. Cadastre em Configurações → Cargos.
            </div>
          ) : (
            <ul className="py-1">
              {filtered.map((p) => {
                const selected = value.positionId === p.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => pick(p)}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-start gap-2",
                        selected && "bg-accent",
                      )}
                    >
                      <Check
                        className={cn(
                          "h-4 w-4 mt-0.5 shrink-0",
                          selected ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-xs text-muted-foreground">
                          {p.cbo_code ? `CBO ${p.cbo_code}` : "isento de CBO"}
                        </div>
                        <div className="break-words">{p.name}</div>
                        {p.cbo_title && (
                          <div className="text-xs text-muted-foreground italic break-words">
                            {p.cbo_title}
                          </div>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          Cargos são gerenciados em <strong>Configurações → Cargos</strong>.
        </div>
      </PopoverContent>
    </Popover>
  );
}
