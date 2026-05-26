import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GraduationCap, Upload, FileDown, Trash2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

interface InternshipContractCardProps {
  employeeId: string;
}

interface InternshipContractRecord {
  id: string;
  file_path: string;
  file_name: string;
  uploaded_at: string;
}

const BUCKET = "employee-documents";

export default function InternshipContractCard({ employeeId }: InternshipContractCardProps) {
  const { user, isAdmin, isManager } = useAuth();
  const canManage = isAdmin || isManager;
  const [contracts, setContracts] = useState<InternshipContractRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("internship_contracts" as any)
      .select("id, file_path, file_name, uploaded_at")
      .eq("employee_id", employeeId)
      .order("uploaded_at", { ascending: false });
    if (error) console.error(error);
    else setContracts((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [employeeId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast({ title: "O arquivo deve ser PDF", variant: "destructive" });
      e.target.value = "";
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 20MB", variant: "destructive" });
      e.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const ts = Date.now();
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `internship-contracts/${employeeId}/${ts}_${safeName}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: "application/pdf", upsert: false });
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from("internship_contracts" as any).insert({
        employee_id: employeeId,
        file_path: path,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        uploaded_by: user?.id ?? null,
      });
      if (insErr) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw insErr;
      }

      toast({ title: "Termo de estágio enviado" });
      await load();
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Erro ao enviar termo",
        description: err?.message ?? "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownload = async (rec: InternshipContractRecord) => {
    setDownloadingId(rec.id);
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(rec.file_path, 60);
      if (error || !data?.signedUrl) throw error || new Error("URL não disponível");
      window.open(data.signedUrl, "_blank");
    } catch (err: any) {
      toast({ title: "Erro ao baixar", description: err?.message ?? "Tente novamente.", variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (rec: InternshipContractRecord) => {
    if (!canManage) return;
    if (!confirm(`Excluir o termo "${rec.file_name}"?`)) return;
    try {
      await supabase.storage.from(BUCKET).remove([rec.file_path]);
      const { error } = await supabase.from("internship_contracts" as any).delete().eq("id", rec.id);
      if (error) throw error;
      toast({ title: "Termo excluído" });
      await load();
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err?.message ?? "Tente novamente.", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <GraduationCap className="h-5 w-5" />
            Termo de Compromisso de Estágio
          </CardTitle>
          <CardDescription>
            {canManage ? "PDF assinado por estagiário, instituição e empresa." : "Termos disponíveis para download."}
          </CardDescription>
        </div>
        {canManage && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="gap-2 shrink-0"
            >
              <Upload className="h-4 w-4" />
              {uploading ? "Enviando..." : "Enviar PDF"}
            </Button>
          </>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : contracts.length === 0 ? (
          <div className="flex items-start gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Nenhum termo de estágio enviado ainda.</span>
          </div>
        ) : (
          <ul className="divide-y rounded-md border">
            {contracts.map((c) => (
              <li key={c.id} className="flex items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{c.file_name}</p>
                  <span className="text-[11px] text-muted-foreground">
                    Enviado em {new Date(c.uploaded_at).toLocaleString("pt-BR")}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownload(c)}
                  disabled={downloadingId === c.id}
                  className="gap-1 shrink-0"
                >
                  <FileDown className="h-4 w-4" />
                  {downloadingId === c.id ? "Abrindo..." : "Baixar"}
                </Button>
                {canManage && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDelete(c)}
                    title="Excluir termo"
                    className="shrink-0"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
