import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { fmtBRL } from "@/lib/dre";

interface Store { id: string; name: string }
interface Brand { id: string; name: string }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  stores: Store[];
  brands: Brand[];
  defaultYear: number;
  onSaved: () => void;
}

function parseBRL(input: string): number {
  if (!input) return 0;
  const cleaned = input.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}

function normalize(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function brandColor(name: string): string {
  const n = normalize(name);
  if (n.includes("estrogonofe")) return "#7a3b16";
  if (n.includes("box")) return "#ea7a2c";
  if (n.includes("aquela parme")) return "#b91c1c";
  if (n.includes("totem")) return "#0ea5e9";
  if (n.includes("salao")) return "#a855f7";
  return "hsl(var(--foreground))";
}

export function ManualRevenueDialog({ open, onOpenChange, stores, brands, defaultYear, onSaved }: Props) {
  const { toast } = useToast();
  const [date, setDate] = useState<Date>(new Date());
  const [storeId, setStoreId] = useState<string>("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [existing, setExisting] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const selectedStoreName = useMemo(
    () => stores.find(s => s.id === storeId)?.name ?? "",
    [stores, storeId]
  );

  const brandsForStore = useMemo(() => {
    const isAsaNorte = /asa\s*norte/.test(normalize(selectedStoreName));
    return brands
      .filter(b => {
        const n = normalize(b.name);
        if (/fabri/.test(n)) return false;
        if (/salao/.test(n)) return isAsaNorte;
        return /aquela parme|aquele estrogonofe|box caipira|totem/.test(n);
      })
      .sort((a, b) => {
        const order = ["aquela parme", "aquele estrogonofe", "box caipira", "totem", "salao"];
        const ai = order.findIndex(k => normalize(a.name).includes(k));
        const bi = order.findIndex(k => normalize(b.name).includes(k));
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
  }, [brands, selectedStoreName]);

  const dateStr = useMemo(() => format(date, "yyyy-MM-dd"), [date]);

  useEffect(() => {
    if (!open || !storeId) { setExisting({}); setValues({}); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("daily_revenue")
        .select("brand_id,gross_revenue")
        .eq("sale_date", dateStr)
        .eq("store_id", storeId);
      if (cancelled) return;
      const ex: Record<string, number> = {};
      const vals: Record<string, string> = {};
      (data ?? []).forEach((r: any) => {
        if (r.brand_id) {
          ex[r.brand_id] = Number(r.gross_revenue);
          vals[r.brand_id] = Number(r.gross_revenue).toFixed(2).replace(".", ",");
        }
      });
      setExisting(ex);
      setValues(vals);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, dateStr, storeId]);

  useEffect(() => {
    if (open) {
      setDate(new Date());
      setStoreId("");
      setValues({});
      setExisting({});
    }
  }, [open]);

  const totalDigitado = useMemo(
    () => brandsForStore.reduce((acc, b) => acc + parseBRL(values[b.id] || ""), 0),
    [values, brandsForStore]
  );

  async function save() {
    if (!storeId) {
      toast({ title: "Selecione a loja", variant: "destructive" });
      return;
    }
    const records = brandsForStore
      .map(b => ({ brand_id: b.id, num: parseBRL(values[b.id] || "") }))
      .filter(r => r.num > 0 || existing[r.brand_id] != null)
      .map(r => ({
        sale_date: dateStr,
        store_id: storeId,
        brand_id: r.brand_id,
        gross_revenue: r.num,
      }));

    if (!records.length) {
      toast({ title: "Nenhum valor preenchido", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("daily_revenue")
        .upsert(records, { onConflict: "sale_date,store_id,brand_id" });
      if (error) throw error;
      toast({
        title: "Faturamento do dia salvo",
        description: `${selectedStoreName} • ${format(date, "dd/MM/yyyy")} • ${fmtBRL(totalDigitado)}`,
      });
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Lançar faturamento do dia</DialogTitle>
          <DialogDescription>
            Selecione o dia e a loja, depois preencha o bruto de cada marca. O total mensal é somado automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Dia</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("h-11 w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => d && setDate(d)}
                    disabled={(d) => d > new Date()}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Loja</Label>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!storeId && (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Selecione uma loja para preencher o faturamento por marca.
            </div>
          )}

          {storeId && loading && (
            <div className="flex items-center justify-center p-6 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando valores atuais...
            </div>
          )}

          {storeId && !loading && (
            <div className="space-y-3">
              {brandsForStore.map(b => {
                const ex = existing[b.id];
                return (
                  <div
                    key={b.id}
                    className="rounded-lg border p-3 sm:p-4"
                    style={{ borderLeft: `4px solid ${brandColor(b.name)}` }}
                  >
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <Label className="text-base font-semibold" style={{ color: brandColor(b.name) }}>
                        {b.name}
                      </Label>
                      {ex != null && (
                        <span className="text-xs text-muted-foreground">
                          atual: <span className="font-medium">{fmtBRL(ex)}</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-medium text-muted-foreground">R$</span>
                      <Input
                        inputMode="decimal"
                        placeholder="0,00"
                        value={values[b.id] ?? ""}
                        onChange={(e) => setValues(v => ({ ...v, [b.id]: e.target.value }))}
                        className="h-12 text-lg font-medium"
                      />
                    </div>
                  </div>
                );
              })}

              <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
                <span className="text-sm text-muted-foreground">Total da loja no dia</span>
                <span className="text-lg font-semibold">{fmtBRL(totalDigitado)}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving || loading || !storeId}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
