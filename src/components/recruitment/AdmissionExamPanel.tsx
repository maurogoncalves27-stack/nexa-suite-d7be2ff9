import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Stethoscope, Upload, CheckCircle2, AlertTriangle, Download, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  employeeId: string;
  scheduleId: string | null;
  requestedAt: string | null;
  documentId: string | null;
  onChanged: () => void;
}

interface DocRow {
  id: string;
  file_name: string;
  file_path: string;
  uploaded_at: string;
}

export default function AdmissionExamPanel({
  employeeId,
  scheduleId,
  requestedAt,
  documentId,
  onChanged,
}: Props) {
  const [doc, setDoc] = useState<DocRow | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!documentId) { setDoc(null); return; }
    supabase
      .from("employee_documents")
      .select("id, file_name, file_path, uploaded_at")
      .eq("id", documentId)
      .maybeSingle()
      .then(({ data }) => setDoc((data ?? null) as DocRow | null));
  }, [documentId]);

  const markRequested = async () => {
    if (!scheduleId) {
      toast({ title: "Agende o treinamento primeiro", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("training_schedules")
      .update({
        admission_exam_requested_at: new Date().toISOString(),
        admission_exam_requested_by: u.user?.id ?? null,
      })
      .eq("id", scheduleId);
    setBusy(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Exame admissional marcado como solicitado" });
    onChanged();
  };

  const onUpload = async (file: File) => {
    if (!scheduleId) {
      toast({ title: "Agende o treinamento primeiro", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() ?? "pdf";
      const path = `${employeeId}/admission-exam/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("employee-documents")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;

      const { data: u } = await supabase.auth.getUser();
      const { data: docRow, error: docErr } = await supabase
        .from("employee_documents")
        .insert({
          employee_id: employeeId,
          doc_type: "admission_exam",
          file_name: file.name,
          file_path: path,
          mime_type: file.type,
          size_bytes: file.size,
          uploaded_by: u.user?.id ?? null,
        })
        .select("id")
        .single();
      if (docErr) throw docErr;

      const { error: updErr } = await supabase
        .from("training_schedules")
        .update({ admission_exam_document_id: docRow.id })
        .eq("id", scheduleId);
      if (updErr) throw updErr;

      toast({ title: "Exame admissional anexado" });
      onChanged();
    } catch (e: any) {
      toast({ title: "Erro no upload", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const download = async () => {
    if (!doc) return;
    const { data, error } = await supabase.storage
      .from("employee-documents")
      .createSignedUrl(doc.file_path, 60);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <Card className={!doc ? "border-amber-500/40" : "border-emerald-500/40"}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-primary" />
          Exame admissional
          {doc ? (
            <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700 ml-auto">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Anexado
            </Badge>
          ) : requestedAt ? (
            <Badge variant="secondary" className="ml-auto">Solicitado</Badge>
          ) : (
            <Badge variant="outline" className="ml-auto">Pendente</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">
          <strong>Dia 3:</strong> solicitar o exame ao colaborador.
          <br />
          <strong>Dia 7:</strong> anexar o resultado para finalizar a contratação.
        </p>

        <div className="flex flex-col gap-2">
          {requestedAt ? (
            <p className="text-xs">
              ✅ Solicitado em{" "}
              <strong>{new Date(requestedAt).toLocaleDateString("pt-BR")}</strong>
            </p>
          ) : (
            <Button size="sm" variant="outline" onClick={markRequested} disabled={busy} className="gap-2">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Stethoscope className="h-3.5 w-3.5" />}
              Marcar como solicitado
            </Button>
          )}

          {doc ? (
            <div className="flex items-center justify-between border rounded-md px-3 py-2 bg-muted/30">
              <span className="text-xs truncate">{doc.file_name}</span>
              <Button size="sm" variant="ghost" onClick={download} className="gap-1">
                <Download className="h-3.5 w-3.5" /> Abrir
              </Button>
            </div>
          ) : (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(f);
                }}
              />
              <Button
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="gap-2"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Anexar exame admissional
              </Button>
            </>
          )}
        </div>

        {!doc && (
          <Alert variant="default" className="border-amber-500/40 bg-amber-500/5">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-xs">Documento obrigatório</AlertTitle>
            <AlertDescription className="text-xs">
              Sem o exame anexado, o candidato pode ser contratado mas a pendência ficará registrada.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
