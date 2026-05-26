import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { backfillMissingEmployeeFichas } from "@/lib/backfillEmployeeFichas";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FolderOpen, FileDown, FileText, Loader2, Search } from "lucide-react";

interface EmployeeOption {
  id: string;
  full_name: string;
  position: string | null;
}

interface DocRow {
  id: string;
  doc_type: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_at: string;
}

const formatBytes = (n: number | null) => {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
};

export default function EmployeeFolders() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [selectedId, setSelectedId] = useState<string>("");
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [search, setSearch] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoadingEmployees(true);
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, position")
        .order("full_name", { ascending: true });
      if (error) {
        toast({ title: "Erro ao carregar colaboradores", description: error.message, variant: "destructive" });
      }
      setEmployees(data ?? []);
      setLoadingEmployees(false);
    })();
    // Em background: gera fichas faltantes (silencioso)
    backfillMissingEmployeeFichas(user?.id ?? null);
  }, [user?.id]);

  const loadDocs = async (employeeId: string) => {
    setLoadingDocs(true);
    const { data, error } = await supabase
      .from("employee_documents")
      .select("id, doc_type, file_name, file_path, mime_type, size_bytes, uploaded_at")
      .eq("employee_id", employeeId)
      .order("uploaded_at", { ascending: false });
    if (error) {
      toast({ title: "Erro ao carregar documentos", description: error.message, variant: "destructive" });
    }
    setDocs(data ?? []);
    setLoadingDocs(false);
  };

  useEffect(() => {
    if (selectedId) loadDocs(selectedId);
    else setDocs([]);
  }, [selectedId]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.full_name.toLowerCase().includes(q) ||
        (e.position ?? "").toLowerCase().includes(q),
    );
  }, [employees, search]);

  const selectedEmployee = employees.find((e) => e.id === selectedId);

  const handleDownload = async (doc: DocRow) => {
    setDownloadingId(doc.id);
    try {
      const { data, error } = await supabase.storage
        .from("employee-documents")
        .createSignedUrl(doc.file_path, 60);
      if (error || !data) throw error ?? new Error("URL não gerada");
      window.open(data.signedUrl, "_blank", "noopener");
    } catch (e: any) {
      toast({ title: "Erro ao baixar", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="rounded-md bg-primary/10 text-primary p-2">
          <FolderOpen className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Pasta do Colaborador</h1>
          <p className="text-sm text-muted-foreground">
            Acesse os documentos de cada colaborador.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Selecionar colaborador</CardTitle>
          <CardDescription>Escolha um colaborador para abrir sua pasta de documentos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou cargo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={selectedId} onValueChange={setSelectedId} disabled={loadingEmployees}>
            <SelectTrigger>
              <SelectValue placeholder={loadingEmployees ? "Carregando..." : "Selecione um colaborador"} />
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {filteredEmployees.length === 0 ? (
                <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                  Nenhum colaborador encontrado
                </div>
              ) : (
                filteredEmployees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.full_name}
                    {e.position ? ` — ${e.position}` : ""}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedEmployee && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FolderOpen className="h-4 w-4" /> Documentos ({docs.length})
            </CardTitle>
            <CardDescription>
              Pasta de <strong>{selectedEmployee.full_name}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingDocs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : docs.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                Nenhum documento enviado para este colaborador.
              </div>
            ) : (
              <ul className="divide-y">
                {docs.map((d) => (
                  <li key={d.id} className="py-3 flex items-start gap-3">
                    <div className="rounded-md bg-muted p-2 shrink-0">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-sm truncate">{d.file_name}</span>
                        <Badge variant="secondary" className="text-xs">{d.doc_type}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(d.uploaded_at).toLocaleString("pt-BR")} • {formatBytes(d.size_bytes)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownload(d)}
                      disabled={downloadingId === d.id}
                      className="gap-1 shrink-0"
                    >
                      {downloadingId === d.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileDown className="h-4 w-4" />
                      )}
                      <span className="hidden sm:inline">Baixar</span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
