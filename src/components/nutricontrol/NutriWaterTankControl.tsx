import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { Trash2, Plus, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Cleaning {
  id: string;
  cleaning_date: string;
  responsible: string;
  note: string;
  report_url: string | null;
}

interface Props {
  currentDate: Date;
  storeId: string | null;
}

export const NutriWaterTankControl = ({ currentDate, storeId }: Props) => {
  const { user } = useAuth();
  const [records, setRecords] = useState<Cleaning[]>([]);
  const [loading, setLoading] = useState(true);

  const [cleaningDate, setCleaningDate] = useState(format(currentDate, "yyyy-MM-dd"));
  const [responsible, setResponsible] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const fetchRecords = useCallback(async () => {
    if (!user || !storeId) {
      setRecords([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("nutri_water_tank_cleanings")
      .select("*")
      .eq("store_id", storeId)
      .order("cleaning_date", { ascending: false })
      .limit(20);
    if (error) toast.error("Erro ao carregar registros");
    else setRecords(data ?? []);
    setLoading(false);
  }, [user, storeId]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const addRecord = async () => {
    if (!user) return;
    if (!storeId) return toast.error("Selecione uma loja");
    if (!responsible.trim()) return toast.error("Informe o responsável");

    let report_url: string | null = null;
    if (file) {
      const path = `${storeId}/water-tank/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("nutricontrol").upload(path, file);
      if (upErr) {
        toast.error("Erro ao enviar laudo");
        return;
      }
      report_url = path;
    }

    const { error } = await supabase.from("nutri_water_tank_cleanings").insert({
      user_id: user.id,
      store_id: storeId,
      cleaning_date: cleaningDate,
      responsible: responsible.trim(),
      note: note.trim(),
      report_url,
    });

    if (error) {
      toast.error("Erro ao registrar limpeza");
    } else {
      toast.success("Limpeza registrada");
      setResponsible("");
      setNote("");
      setFile(null);
      fetchRecords();
    }
  };

  const removeRecord = async (id: string) => {
    const { error } = await supabase.from("nutri_water_tank_cleanings").delete().eq("id", id);
    if (error) toast.error("Erro ao remover");
    else fetchRecords();
  };

  const openReport = async (path: string) => {
    const { data } = await supabase.storage.from("nutricontrol").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <h4 className="text-sm font-semibold text-foreground mb-3">Limpeza da Caixa d'Água</h4>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Data da limpeza</label>
          <Input type="date" value={cleaningDate} onChange={(e) => setCleaningDate(e.target.value)} className="h-9 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Responsável / empresa</label>
          <Input value={responsible} onChange={(e) => setResponsible(e.target.value)} placeholder="Nome" className="h-9 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Observação</label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" className="h-9 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Laudo (PDF/imagem)</label>
          <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="h-9 text-sm" />
        </div>
      </div>

      <Button onClick={addRecord} size="sm" className="gap-1">
        <Plus className="h-4 w-4" />
        Registrar limpeza
      </Button>

      <div className="space-y-1.5 mt-3">
        {loading && <p className="text-xs text-muted-foreground text-center py-2">Carregando...</p>}
        {!loading && records.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">Nenhuma limpeza registrada.</p>
        )}
        {!loading &&
          records.map((r) => (
            <div key={r.id} className="flex items-center gap-2 bg-muted/40 rounded-md px-2.5 py-1.5">
              <span className="text-xs font-semibold text-foreground">
                {format(new Date(r.cleaning_date + "T00:00:00"), "dd/MM/yyyy")}
              </span>
              <span className="text-xs text-foreground">{r.responsible}</span>
              {r.note && <span className="text-xs text-muted-foreground truncate">— {r.note}</span>}
              {r.report_url && (
                <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={() => openReport(r.report_url!)}>
                  <FileText className="h-3.5 w-3.5 text-primary" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className={`h-6 w-6 ${r.report_url ? "" : "ml-auto"}`} onClick={() => removeRecord(r.id)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
      </div>
    </div>
  );
};
