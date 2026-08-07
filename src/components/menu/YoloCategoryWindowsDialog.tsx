// Janelas de disponibilidade (dia/hora) da categoria exclusiva Yolo, por loja.
import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Store { id: string; name: string; }

interface WindowRow {
  id?: string;
  store_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categoryId: string | null;
  categoryName: string;
  stores: Store[];
}

export default function YoloCategoryWindowsDialog({
  open, onOpenChange, categoryId, categoryName, stores,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<WindowRow[]>([]);

  useEffect(() => {
    if (!open || !categoryId) return;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("menu_category_store_windows")
        .select("id,store_id,weekday,start_time,end_time")
        .eq("category_id", categoryId);
      setRows(((data ?? []) as any[]).map((r) => ({
        id: r.id,
        store_id: r.store_id,
        weekday: Number(r.weekday),
        start_time: String(r.start_time).slice(0, 5),
        end_time: String(r.end_time).slice(0, 5),
      })));
      setLoading(false);
    })();
  }, [open, categoryId]);

  const storeRows = (storeId: string) => rows.filter((r) => r.store_id === storeId);

  const addRow = (storeId: string, weekday: number) => {
    setRows((p) => [...p, { store_id: storeId, weekday, start_time: "11:00", end_time: "15:00" }]);
  };

  const toggleWeekday = (storeId: string, weekday: number) => {
    const has = rows.some((r) => r.store_id === storeId && r.weekday === weekday);
    if (has) setRows((p) => p.filter((r) => !(r.store_id === storeId && r.weekday === weekday)));
    else addRow(storeId, weekday);
  };

  const updateRow = (index: number, patch: Partial<WindowRow>) => {
    setRows((p) => p.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  async function save() {
    if (!categoryId) return;
    setSaving(true);
    try {
      await (supabase as any).from("menu_category_store_windows").delete().eq("category_id", categoryId);
      if (rows.length) {
        const payload = rows.map((r) => ({
          category_id: categoryId,
          store_id: r.store_id,
          weekday: r.weekday,
          start_time: r.start_time,
          end_time: r.end_time,
        }));
        const { error } = await (supabase as any).from("menu_category_store_windows").insert(payload);
        if (error) throw error;
      }
      toast({ title: "Janelas salvas" });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Disponibilidade Yolo — {categoryName}</DialogTitle>
          <DialogDescription>
            Escolha os dias e horários em que a categoria pode aparecer, por loja. Loja sem dia marcado nunca exibe a categoria.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="space-y-4">
            {stores.map((store) => (
              <div key={store.id} className="space-y-2 rounded-md border p-3">
                <Label className="text-sm font-semibold">{store.name}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((label, weekday) => {
                    const checked = rows.some((r) => r.store_id === store.id && r.weekday === weekday);
                    return (
                      <button
                        type="button"
                        key={weekday}
                        onClick={() => toggleWeekday(store.id, weekday)}
                        className={`px-2.5 py-1 rounded-md border text-xs transition-colors ${
                          checked ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                {storeRows(store.id)
                  .sort((a, b) => a.weekday - b.weekday)
                  .map((row) => {
                    const index = rows.indexOf(row);
                    return (
                      <div key={index} className="flex items-center gap-2">
                        <span className="w-10 text-xs text-muted-foreground">{WEEKDAYS[row.weekday]}</span>
                        <Input
                          type="time" value={row.start_time}
                          onChange={(e) => updateRow(index, { start_time: e.target.value })}
                          className="h-8 flex-1"
                        />
                        <span className="text-xs text-muted-foreground">até</span>
                        <Input
                          type="time" value={row.end_time}
                          onChange={(e) => updateRow(index, { end_time: e.target.value })}
                          className="h-8 flex-1"
                        />
                        <Button
                          size="icon" variant="ghost" className="h-8 w-8"
                          onClick={() => setRows((p) => p.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                <Button
                  size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => addRow(store.id, new Date().getDay())}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Faixa extra
                </Button>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
