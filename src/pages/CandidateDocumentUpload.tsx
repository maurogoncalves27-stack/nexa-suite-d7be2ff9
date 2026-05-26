import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, FileUp, Loader2, ShieldCheck, Upload, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface DocItem { label: string; received: boolean }

interface CandidateInfo {
  candidate_id: string;
  full_name: string;
  requested_documents: DocItem[] | null;
  documents_requested_notes: string | null;
}

interface UploadRow {
  id: string;
  doc_type: string;
  file_name: string;
  uploaded_at: string;
}

const ACCEPT = "image/*,application/pdf";
const MAX_SIZE = 15 * 1024 * 1024; // 15 MB

export default function CandidateDocumentUpload() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<CandidateInfo | null>(null);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [extraType, setExtraType] = useState("");

  const load = async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.rpc("candidate_info_by_upload_token", { _token: token });
    if (error || !data || (Array.isArray(data) && data.length === 0)) {
      setInfo(null);
      setLoading(false);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setInfo({
      candidate_id: row.candidate_id,
      full_name: row.full_name,
      requested_documents: (row.requested_documents as unknown as DocItem[]) ?? null,
      documents_requested_notes: row.documents_requested_notes ?? null,
    });
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);

  const pendingDocs = useMemo(() => {
    if (!info?.requested_documents) return [];
    return info.requested_documents.filter((d) => !d.received).map((d) => d.label);
  }, [info]);

  const sendFile = async (docType: string, file: File) => {
    if (!token || !info) return;
    if (file.size > MAX_SIZE) {
      toast({ title: "Arquivo muito grande", description: "O limite é 15 MB.", variant: "destructive" });
      return;
    }
    setBusy(docType);
    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const safeType = docType.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 60);
      const path = `${token}/${Date.now()}-${safeType}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("candidate-documents")
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (upErr) throw upErr;

      const { error: regErr } = await supabase.rpc("register_candidate_document_upload", {
        _token: token,
        _doc_type: docType,
        _file_name: file.name,
        _file_path: path,
        _mime_type: file.type || null,
        _size_bytes: file.size,
      });
      if (regErr) throw regErr;

      toast({ title: "Documento enviado", description: docType });
      setUploads((prev) => [
        { id: crypto.randomUUID(), doc_type: docType, file_name: file.name, uploaded_at: new Date().toISOString() },
        ...prev,
      ]);
    } catch (e: any) {
      toast({ title: "Erro no envio", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!info) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <CardTitle>Link inválido ou expirado</CardTitle>
            </div>
            <CardDescription>
              Este link de envio de documentos não é válido. Entre em contato com nossa equipe
              para receber um novo link.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const types = pendingDocs.length > 0
    ? pendingDocs
    : (info.requested_documents?.map((d) => d.label) ?? []);

  return (
    <div className="min-h-screen bg-muted/20 p-3 md:p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <CardTitle>Olá, {info.full_name}!</CardTitle>
            </div>
            <CardDescription>
              Esta é sua área segura para envio de documentos. Você pode enviar fotos (JPG/PNG)
              ou PDFs de cada item da lista abaixo. Os arquivos vão direto para nossa equipe.
            </CardDescription>
          </CardHeader>
          {info.documents_requested_notes && (
            <CardContent className="pt-0">
              <div className="text-sm bg-amber-500/10 border border-amber-500/30 rounded-md p-3 text-foreground">
                <strong>Observações:</strong> {info.documents_requested_notes}
              </div>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileUp className="h-4 w-4" /> Documentos solicitados
            </CardTitle>
            <CardDescription>
              Toque em "Selecionar arquivo" em cada item. Aceitamos imagem ou PDF (até 15 MB).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {types.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum documento pendente. Obrigado! 🎉</p>
            ) : types.map((label) => {
              const sent = uploads.filter((u) => u.doc_type === label);
              return (
                <div key={label} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <Label className="text-sm font-medium leading-snug">{label}</Label>
                    {sent.length > 0 && (
                      <Badge variant="secondary" className="gap-1 shrink-0">
                        <CheckCircle2 className="h-3 w-3" /> {sent.length} enviado{sent.length > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                  <Input
                    type="file"
                    accept={ACCEPT}
                    disabled={busy === label}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) sendFile(label, f);
                      e.currentTarget.value = "";
                    }}
                  />
                  {busy === label && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Enviando...
                    </div>
                  )}
                  {sent.length > 0 && (
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      {sent.map((s) => (
                        <li key={s.id}>✓ {s.file_name}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}

            <div className="border-2 border-dashed rounded-lg p-3 space-y-2 mt-4">
              <Label className="text-sm font-medium">Outro documento (opcional)</Label>
              <Input
                placeholder="Descrição do documento (ex.: comprovante de curso)"
                value={extraType}
                onChange={(e) => setExtraType(e.target.value)}
              />
              <Input
                type="file"
                accept={ACCEPT}
                disabled={!extraType.trim() || busy === "__extra__"}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f && extraType.trim()) {
                    setBusy("__extra__");
                    sendFile(extraType.trim(), f).finally(() => setBusy(null));
                    setExtraType("");
                  }
                  e.currentTarget.value = "";
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4 text-xs text-muted-foreground flex items-start gap-2">
            <Upload className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              Seus documentos são enviados de forma segura. Caso precise enviar novamente
              algum item, basta selecionar o arquivo de novo — o último envio é o que valerá.
              Em caso de dúvidas, responda ao e-mail que recebeu.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
