import { useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ReservationSettings = {
  maxPerDay?: number;
  pausedDates?: string[];
  whatsappStorePhone?: string;
  notifyEnabled?: boolean;
};

type Props = { open: boolean; onOpenChange: (v: boolean) => void };

export function ReservationSettingsDialog({ open, onOpenChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [maxPerDay, setMaxPerDay] = useState<string>("");
  const [pausedDates, setPausedDates] = useState<string[]>([]);
  const [newDate, setNewDate] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      try {
        const { data } = await supabase
          .from("parme_site_settings")
          .select("value")
          .eq("key", "reservations")
          .maybeSingle();
        const cfg = ((data?.value ?? {}) as ReservationSettings);
        setMaxPerDay(cfg.maxPerDay ? String(cfg.maxPerDay) : "");
        setPausedDates(Array.isArray(cfg.pausedDates) ? cfg.pausedDates : []);
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  async function save() {
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from("parme_site_settings")
        .select("value")
        .eq("key", "reservations")
        .maybeSingle();
      const prev = (existing?.value ?? {}) as ReservationSettings;
      const next: ReservationSettings = {
        ...prev,
        maxPerDay: maxPerDay ? Math.max(0, Number(maxPerDay)) : 0,
        pausedDates: [...new Set(pausedDates)].sort(),
      };
      const { error } = await supabase
        .from("parme_site_settings")
        .upsert({ key: "reservations", value: next }, { onConflict: "key" });
      if (error) throw error;
      toast.success("Configurações salvas");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  function addDate() {
    if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return;
    setPausedDates((p) => (p.includes(newDate) ? p : [...p, newDate]));
    setNewDate("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configurações de reservas</DialogTitle>
          <DialogDescription>
            Defina o limite por dia e pause datas específicas. No site, datas
            pausadas ou cheias aparecerão como esgotadas.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="maxPerDay">Reservas máximas por dia</Label>
              <Input
                id="maxPerDay"
                type="number"
                min={0}
                placeholder="0 = ilimitado"
                value={maxPerDay}
                onChange={(e) => setMaxPerDay(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Conta o nº de reservas (não a soma de pessoas). 0 = sem limite.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Datas pausadas (esgotadas)</Label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                />
                <Button type="button" size="icon" variant="secondary" onClick={addDate}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {pausedDates.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma data pausada.</p>
              ) : (
                <ul className="space-y-1 max-h-44 overflow-auto rounded border p-2">
                  {pausedDates.map((d) => (
                    <li key={d} className="flex items-center justify-between text-sm">
                      <span>{new Date(d + "T00:00").toLocaleDateString("pt-BR")}</span>
                      <button
                        type="button"
                        onClick={() => setPausedDates((p) => p.filter((x) => x !== d))}
                        className="rounded p-1 hover:bg-muted"
                        aria-label="Remover"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
