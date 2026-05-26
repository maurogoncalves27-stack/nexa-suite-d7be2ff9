import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { Trash2, Plus, Droplet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OilRecord {
  id: string;
  recorded_at: string;
  quality: string;
  changed: boolean;
  user_id: string;
}

interface Props {
  currentDate: Date;
  storeId: string | null;
}

export const NutriOilQualityControl = ({ currentDate, storeId }: Props) => {
  const { user } = useAuth();
  const [records, setRecords] = useState<OilRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [quality, setQuality] = useState<"bom" | "ruim">("bom");
  const [changed, setChanged] = useState<"sim" | "nao">("nao");

  const dateKey = format(currentDate, "yyyy-MM-dd");

  const fetchRecords = useCallback(async () => {
    if (!user || !storeId) {
      setRecords([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("nutri_oil_quality_records")
      .select("*")
      .eq("store_id", storeId)
      .eq("date", dateKey)
      .order("recorded_at", { ascending: false });
    if (error) toast.error("Erro ao carregar registros");
    else setRecords(data ?? []);
    setLoading(false);
  }, [user, dateKey, storeId]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const addRecord = async () => {
    if (!user) return;
    if (!storeId) return toast.error("Selecione uma loja");
    const { error } = await supabase.from("nutri_oil_quality_records").insert({
      user_id: user.id,
      store_id: storeId,
      date: dateKey,
      quality,
      changed: changed === "sim",
    });
    if (error) {
      toast.error("Erro ao registrar");
    } else {
      toast.success("Registro adicionado");
      setQuality("bom");
      setChanged("nao");
      fetchRecords();
    }
  };

  const removeRecord = async (id: string) => {
    const { error } = await supabase.from("nutri_oil_quality_records").delete().eq("id", id);
    if (error) toast.error("Erro ao remover");
    else fetchRecords();
  };

  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <Droplet className="h-4 w-4 text-primary" />
        Qualidade do Óleo da Fritadeira
      </h4>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Qualidade</label>
          <Select value={quality} onValueChange={(v) => setQuality(v as "bom" | "ruim")}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bom">Bom</SelectItem>
              <SelectItem value="ruim">Ruim</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Troca realizada?</label>
          <Select value={changed} onValueChange={(v) => setChanged(v as "sim" | "nao")}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nao">Não</SelectItem>
              <SelectItem value="sim">Sim</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button onClick={addRecord} size="sm" className="w-full gap-1">
            <Plus className="h-4 w-4" />
            Registrar
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        {loading && <p className="text-xs text-muted-foreground text-center py-2">Carregando...</p>}
        {!loading && records.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">Nenhum registro hoje.</p>
        )}
        {!loading &&
          records.map((r) => (
            <div key={r.id} className="flex items-center gap-2 bg-muted/40 rounded-md px-2.5 py-1.5">
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  r.quality === "bom"
                    ? "bg-primary text-primary-foreground"
                    : "bg-destructive text-destructive-foreground"
                }`}
              >
                {r.quality === "bom" ? "Bom" : "Ruim"}
              </span>
              <span className="text-xs text-foreground">
                Troca: <strong>{r.changed ? "Sim" : "Não"}</strong>
              </span>
              <span className="text-xs text-muted-foreground ml-auto">
                {format(new Date(r.recorded_at), "HH:mm")}
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRecord(r.id)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
      </div>
    </div>
  );
};
