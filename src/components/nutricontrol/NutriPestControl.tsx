import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { Trash2, Plus, FileText, AlertTriangle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MaintenancePhotoCaptureButton } from "@/components/nutricontrol/MaintenancePhotoCaptureButton";

interface PestService {
  id: string;
  service_date: string;
  company_name: string;
  note: string;
  certificate_url: string | null;
}

interface PestOccurrence {
  id: string;
  date: string;
  recorded_at: string;
  pest_type: string;
  location: string;
  note: string;
}

interface Props {
  currentDate: Date;
  storeId: string | null;
}

export const NutriPestControl = ({ currentDate, storeId }: Props) => {
  const { user } = useAuth();
  const [services, setServices] = useState<PestService[]>([]);
  const [occurrences, setOccurrences] = useState<PestOccurrence[]>([]);
  const [loading, setLoading] = useState(true);

  const [serviceDate, setServiceDate] = useState(format(currentDate, "yyyy-MM-dd"));
  const [certFile, setCertFile] = useState<File | null>(null);

  const [pestType, setPestType] = useState<"barata" | "rato" | "mosca" | "formiga" | "outro">("barata");
  const [location, setLocation] = useState("");

  const dateKey = format(currentDate, "yyyy-MM-dd");

  const fetchAll = useCallback(async () => {
    if (!user || !storeId) {
      setServices([]);
      setOccurrences([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: svc }, { data: occ }] = await Promise.all([
      supabase
        .from("nutri_pest_control_records")
        .select("*")
        .eq("store_id", storeId)
        .order("service_date", { ascending: false })
        .limit(20),
      supabase
        .from("nutri_pest_occurrences")
        .select("*")
        .eq("store_id", storeId)
        .eq("date", dateKey)
        .order("recorded_at", { ascending: false }),
    ]);
    setServices(svc ?? []);
    setOccurrences(occ ?? []);
    setLoading(false);
  }, [user, storeId, dateKey]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const sanitizeFileName = (name: string) => {
    const dot = name.lastIndexOf(".");
    const ext = dot >= 0 ? name.slice(dot).toLowerCase() : "";
    const base = (dot >= 0 ? name.slice(0, dot) : name)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 60) || "arquivo";
    return `${base}${ext || ""}`;
  };

  const addService = async () => {
    if (!user) return;
    if (!storeId) return toast.error("Selecione uma loja");
    if (!certFile) return toast.error("Anexe o certificado (foto ou PDF)");

    let certificate_url: string | null = null;
    const safeName = sanitizeFileName(certFile.name || "certificado");
    const path = `${storeId}/pest/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage
      .from("nutricontrol")
      .upload(path, certFile, {
        contentType: certFile.type || "application/octet-stream",
        upsert: false,
      });
    if (upErr) {
      toast.error(`Erro ao enviar certificado: ${upErr.message}`);
      return;
    }
    certificate_url = path;

    const { error } = await supabase.from("nutri_pest_control_records").insert({
      user_id: user.id,
      store_id: storeId,
      service_date: serviceDate,
      company_name: "-",
      note: "",
      certificate_url,
    });
    if (error) {
      toast.error("Erro ao registrar dedetização");
    } else {
      toast.success("Dedetização registrada");
      setCertFile(null);
      fetchAll();
    }
  };

  const removeService = async (id: string) => {
    const { error } = await supabase.from("nutri_pest_control_records").delete().eq("id", id);
    if (error) toast.error("Erro ao remover");
    else fetchAll();
  };

  const addOccurrence = async () => {
    if (!user) return;
    if (!storeId) return toast.error("Selecione uma loja");
    const { error } = await supabase.from("nutri_pest_occurrences").insert({
      user_id: user.id,
      store_id: storeId,
      date: dateKey,
      pest_type: pestType,
      location: location.trim(),
      note: "",
    });
    if (error) {
      toast.error("Erro ao registrar ocorrência");
    } else {
      toast.success("Ocorrência registrada");
      setLocation("");
      fetchAll();
    }
  };

  const removeOccurrence = async (id: string) => {
    const { error } = await supabase.from("nutri_pest_occurrences").delete().eq("id", id);
    if (error) toast.error("Erro ao remover");
    else fetchAll();
  };

  const openCertificate = async (path: string) => {
    const { data } = await supabase.storage.from("nutricontrol").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-lg p-3">
        <h4 className="text-sm font-semibold text-foreground mb-3">Dedetização / Controle de Pragas</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Data do serviço</label>
            <Input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} className="h-9 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Certificado (foto ou PDF)</label>
            <Input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setCertFile(e.target.files?.[0] ?? null)}
              className="h-9 text-sm"
            />
            {certFile && (
              <p className="text-[11px] text-muted-foreground mt-1 truncate">{certFile.name}</p>
            )}
          </div>
        </div>
        <Button onClick={addService} size="sm" className="gap-1">
          <Plus className="h-4 w-4" />
          Registrar dedetização
        </Button>

        <div className="space-y-1.5 mt-3">
          {loading && <p className="text-xs text-muted-foreground text-center py-2">Carregando...</p>}
          {!loading && services.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">Nenhuma dedetização registrada.</p>
          )}
          {!loading &&
            services.map((s) => (
              <div key={s.id} className="flex items-center gap-2 bg-muted/40 rounded-md px-2.5 py-1.5">
                <span className="text-xs font-semibold text-foreground">
                  {format(new Date(s.service_date + "T00:00:00"), "dd/MM/yyyy")}
                </span>
                <span className="text-xs text-foreground">{s.company_name}</span>
                {s.note && <span className="text-xs text-muted-foreground truncate">— {s.note}</span>}
                {s.certificate_url && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={() => openCertificate(s.certificate_url!)}>
                    <FileText className="h-3.5 w-3.5 text-primary" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" className={`h-6 w-6 ${s.certificate_url ? "" : "ml-auto"}`} onClick={() => removeService(s.id)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-3">
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 text-warning" />
          Ocorrências de Pragas (do dia)
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Tipo</label>
            <Select value={pestType} onValueChange={(v) => setPestType(v as typeof pestType)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="barata">Barata</SelectItem>
                <SelectItem value="rato">Rato</SelectItem>
                <SelectItem value="mosca">Mosca</SelectItem>
                <SelectItem value="formiga">Formiga</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Local</label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex: cozinha" className="h-9 text-sm" />
          </div>
          <div className="flex items-end">
            <Button onClick={addOccurrence} size="sm" className="w-full gap-1">
              <Plus className="h-4 w-4" />
              Registrar
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          {!loading && occurrences.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">Nenhuma ocorrência hoje.</p>
          )}
          {!loading &&
            occurrences.map((o) => (
              <div key={o.id} className="flex items-center gap-2 bg-muted/40 rounded-md px-2.5 py-1.5">
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-warning text-warning-foreground capitalize">
                  {o.pest_type}
                </span>
                {o.location && <span className="text-xs text-foreground">{o.location}</span>}
                {o.note && <span className="text-xs text-muted-foreground truncate">— {o.note}</span>}
                <span className="text-xs text-muted-foreground ml-auto">
                  {format(new Date(o.recorded_at), "HH:mm")}
                </span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeOccurrence(o.id)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};
