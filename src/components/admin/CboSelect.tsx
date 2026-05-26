import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface CboOption {
  code: string;
  title: string;
  synonyms: string | null;
}

interface CboSelectProps {
  value?: string | null;
  onChange: (code: string | null, title: string | null) => void;
  placeholder?: string;
}

export default function CboSelect({
  value,
  onChange,
  placeholder = "Selecione um CBO...",
}: CboSelectProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CboOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("cbo_codes")
        .select("code, title, synonyms")
        .order("title", { ascending: true });
      setItems((data ?? []) as CboOption[]);
      setLoading(false);
    })();
  }, []);

  const selected = useMemo(
    () => items.find((i) => i.code === value) || null,
    [items, value],
  );

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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="w-full justify-between font-normal"
        >
          <span className="truncate text-left">
            {selected ? (
              <>
                <span className="font-mono text-xs text-muted-foreground mr-2">
                  {selected.code}
                </span>
                {selected.title}
              </>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
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
            placeholder="Buscar por código ou nome..."
            className="border-0 focus-visible:ring-0 h-8 px-0"
          />
          {value && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null, null);
                setOpen(false);
              }}
              title="Limpar"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {loading ? (
            <div className="p-6 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Nenhum CBO encontrado.
            </div>
          ) : (
            <ul className="py-1">
              {filtered.map((item) => (
                <li key={item.code}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(item.code, item.title);
                      setOpen(false);
                      setSearch("");
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-start gap-2",
                      value === item.code && "bg-accent",
                    )}
                  >
                    <Check
                      className={cn(
                        "h-4 w-4 mt-0.5 shrink-0",
                        value === item.code ? "opacity-100" : "opacity-0",
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
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
