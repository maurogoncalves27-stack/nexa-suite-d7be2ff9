import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown, Loader2, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface CboItem {
  code: string;
  title: string;
  synonyms: string | null;
}

interface FreePosition {
  name: string;
}

export interface PositionCboValue {
  /** Nome do cargo livre (texto que aparece no holerite/contrato) */
  name: string;
  /** Código CBO (vazio = isento) */
  cboCode: string | null;
  /** Título oficial do CBO escolhido */
  cboTitle: string | null;
}

interface Props {
  value: PositionCboValue;
  onChange: (v: PositionCboValue) => void;
  placeholder?: string;
}

/**
 * Combobox que permite:
 * 1) Selecionar um cargo da tabela CBO (busca por código/título/sinônimos) — preenche nome + CBO.
 * 2) Digitar um cargo manualmente → fica salvo SEM CBO (isento).
 */
export default function PositionCboCombobox({
  value,
  onChange,
  placeholder = "Buscar CBO ou digitar cargo livre...",
}: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CboItem[]>([]);
  const [freePositions, setFreePositions] = useState<FreePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: cboData }, { data: posData }] = await Promise.all([
        supabase
          .from("cbo_codes")
          .select("code, title, synonyms")
          .order("title", { ascending: true }),
        supabase
          .from("positions")
          .select("name, cbo_code, is_active")
          .eq("is_active", true)
          .is("cbo_code", null)
          .order("name", { ascending: true }),
      ]);
      setItems((cboData ?? []) as CboItem[]);
      setFreePositions(((posData ?? []) as { name: string }[]).map((p) => ({ name: p.name })));
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items.slice(0, 200);
    return items
      .filter(
        (i) =>
          i.code.toLowerCase().includes(q) ||
          i.title.toLowerCase().includes(q) ||
          (i.synonyms ?? "").toLowerCase().includes(q),
      )
      .slice(0, 200);
  }, [items, search]);

  const filteredFree = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return freePositions;
    return freePositions.filter((p) => p.name.toLowerCase().includes(q));
  }, [freePositions, search]);

  const pickCbo = (item: CboItem) => {
    onChange({ name: item.title, cboCode: item.code, cboTitle: item.title });
    setOpen(false);
    setSearch("");
  };

  const pickFree = (name: string) => {
    onChange({ name, cboCode: null, cboTitle: null });
    setOpen(false);
    setSearch("");
  };

  const useFreeText = () => {
    const name = search.trim();
    if (!name) return;
    onChange({ name, cboCode: null, cboTitle: null });
    setOpen(false);
    setSearch("");
  };

  const clear = () => {
    onChange({ name: "", cboCode: null, cboTitle: null });
    setSearch("");
  };

  const hasValue = !!value.name;

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
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                useFreeText();
              }
            }}
            placeholder="Buscar por código, nome ou digitar livre..."
            className="border-0 focus-visible:ring-0 h-8 px-0"
          />
          {hasValue && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                clear();
                setOpen(false);
              }}
              title="Limpar"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Botão para usar o texto digitado como cargo livre (sem CBO) */}
        {search.trim() &&
          !filtered.some(
            (i) => i.title.toLowerCase() === search.trim().toLowerCase(),
          ) && (
            <button
              type="button"
              onClick={useFreeText}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2 border-b"
            >
              <Plus className="h-4 w-4 text-primary shrink-0" />
              <span className="truncate">
                Usar <strong>"{search.trim()}"</strong> como cargo livre
                <span className="text-muted-foreground ml-1">(isento de CBO)</span>
              </span>
            </button>
          )}

        <div className="max-h-[300px] overflow-y-auto">
          {loading ? (
            <div className="p-6 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 && filteredFree.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Nenhum cargo encontrado. Pressione Enter para usar como cargo livre.
            </div>
          ) : (
            <>
              {filteredFree.length > 0 && (
                <div>
                  <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Cargos sem CBO (isentos)
                  </div>
                  <ul className="py-1">
                    {filteredFree.map((p) => {
                      const selected = !value.cboCode && value.name === p.name;
                      return (
                        <li key={`free-${p.name}`}>
                          <button
                            type="button"
                            onClick={() => pickFree(p.name)}
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
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground italic">
                                isento de CBO
                              </div>
                              <div className="break-words">{p.name}</div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {filtered.length > 0 && (
                <div>
                  {filteredFree.length > 0 && (
                    <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-t">
                      Tabela CBO
                    </div>
                  )}
                  <ul className="py-1">
                    {filtered.map((item) => {
                      const selected = value.cboCode === item.code;
                      return (
                        <li key={item.code}>
                          <button
                            type="button"
                            onClick={() => pickCbo(item)}
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
                                {item.code}
                              </div>
                              <div className="break-words">{item.title}</div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
