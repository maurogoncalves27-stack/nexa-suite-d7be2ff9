import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Sparkles, Stethoscope, FileText, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { addDays, format, parseISO } from "date-fns";
import { compressImage } from "@/lib/imageCompression";
import { MaintenancePhotoCaptureButton } from "@/components/nutricontrol/MaintenancePhotoCaptureButton";

interface Props {
  employeeId: string;
}

interface Certificate {
  id: string;
  certificate_date: string;
  cid_code: string | null;
  cid_description: string | null;
  days_off: number;
  leave_start_date: string | null;
  leave_end_date: string | null;
  doctor_name: string | null;
  doctor_crm: string | null;
  notes: string | null;
  file_path: string | null;
  file_name: string | null;
}

interface FormState {
  certificate_date: string;
  cid_code: string;
  cid_description: string;
  days_off: string;
  leave_start_date: string;
  doctor_name: string;
  doctor_crm: string;
  notes: string;
}

const EMPTY: FormState = {
  certificate_date: format(new Date(), "yyyy-MM-dd"),
  cid_code: "",
  cid_description: "",
  days_off: "1",
  leave_start_date: "",
  doctor_name: "",
  doctor_crm: "",
  notes: "",
};

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = r.result as string;
      resolve(result.split(",")[1]);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });

export default function EmployeeMedicalCertificateUpload({ employeeId }: Props) {
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [lookingUpCid, setLookingUpCid] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("medical_certificates")
      .select("id, certificate_date, cid_code, cid_description, days_off, leave_start_date, leave_end_date, doctor_name, doctor_crm, notes, file_path, file_name")
      .eq("employee_id", employeeId)
      .order("certificate_date", { ascending: false });
    setCerts((data ?? []) as Certificate[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [employeeId]);

  // Auto-busca da descrição do CID
  useEffect(() => {
    const code = form.cid_code.trim();
    if (code.length < 3) return;
    const t = setTimeout(async () => {
      setLookingUpCid(true);
      try {
        const { data, error } = await supabase.functions.invoke("lookup-cid", { body: { cid: code } });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (data?.description) {
          setForm((prev) => (prev.cid_code.trim() === code ? { ...prev, cid_description: data.description } : prev));
        }
      } catch {
        // silencioso
      } finally {
        setLookingUpCid(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [form.cid_code]);

  const reset = () => {
    setForm(EMPTY);
    setFile(null);
  };

  const handleAnalyze = async () => {
    if (!file) {
      toast({ title: "Selecione o arquivo do atestado primeiro", variant: "destructive" });
      return;
    }
    setAnalyzing(true);
    try {
      const base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke("analyze-medical-certificate", {
        body: { fileBase64: base64, mimeType: file.type },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const d = data?.data ?? {};
      setForm((prev) => ({
        ...prev,
        cid_code: d.cid_code ?? prev.cid_code,
        cid_description: d.cid_description ?? prev.cid_description,
        days_off: d.days_off ? String(d.days_off) : prev.days_off,
        certificate_date: d.certificate_date ?? prev.certificate_date,
        leave_start_date: d.leave_start_date ?? prev.leave_start_date,
        doctor_name: d.doctor_name ?? prev.doctor_name,
        doctor_crm: d.doctor_crm ?? prev.doctor_crm,
      }));
      toast({ title: "Atestado analisado!", description: "Confira os campos antes de enviar." });
    } catch (err: any) {
      toast({ title: "Erro ao analisar", description: err.message, variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  const submit = async () => {
    if (!file) {
      toast({ title: "Anexe o arquivo do atestado", variant: "destructive" });
      return;
    }
    const days = parseInt(form.days_off, 10);
    if (!days || days < 1) {
      toast({ title: "Informe os dias de afastamento", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const uploadFile = file.type.startsWith("image/")
        ? await compressImage(file, { maxDimension: 1600, quality: 0.78, maxBytes: 1_800_000 })
        : file;

      // Sanitiza nome de arquivo: storage rejeita acentos, espaços e caracteres especiais.
      const rawName = uploadFile.name || file.name || "atestado";
      const lastDot = rawName.lastIndexOf(".");
      const baseName = lastDot > 0 ? rawName.slice(0, lastDot) : rawName;
      const ext = (lastDot > 0 ? rawName.slice(lastDot + 1) : "bin")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 8) || "bin";
      const safeBase = baseName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]+/g, "_")
        .slice(0, 60) || "atestado";
      const ts = Date.now();
      const path = `${employeeId}/${ts}.${ext}`;
      const safeFileName = `${safeBase}.${ext}`;
      const contentType = uploadFile.type || file.type || "application/octet-stream";

      console.log("[atestado] iniciando upload", {
        employeeId,
        path,
        size: uploadFile.size,
        type: contentType,
        originalName: file.name,
      });

      const { error: upErr } = await supabase.storage
        .from("medical-certificates")
        .upload(path, uploadFile, { contentType, upsert: false });
      if (upErr) {
        console.error("[atestado] erro upload medical-certificates", upErr);
        throw upErr;
      }

      const start = form.leave_start_date || form.certificate_date;
      const end = format(addDays(parseISO(start), days - 1), "yyyy-MM-dd");

      const { data: userData } = await supabase.auth.getUser();

      // Também envia para a pasta do colaborador (cadastro -> aba Documentos).
      // Esse passo é "best-effort": se falhar, não impede o atestado principal.
      try {
        const empDocPath = `${employeeId}/atestados/${ts}-${safeFileName}`;
        const { error: empUpErr } = await supabase.storage
          .from("employee-documents")
          .upload(empDocPath, uploadFile, { contentType, upsert: false });
        if (empUpErr) {
          console.warn("[atestado] falha ao enviar para employee-documents (ignorado)", empUpErr);
        } else {
          const { error: empInsErr } = await supabase.from("employee_documents").insert({
            employee_id: employeeId,
            doc_type: "Atestado Médico",
            file_name: safeFileName,
            file_path: empDocPath,
            mime_type: contentType,
            size_bytes: uploadFile.size,
            uploaded_by: userData.user?.id ?? null,
          });
          if (empInsErr) console.warn("[atestado] falha insert employee_documents (ignorado)", empInsErr);
        }
      } catch (e) {
        console.warn("[atestado] passo employee-documents lançou exceção (ignorado)", e);
      }

      const { error } = await supabase.from("medical_certificates").insert({
        employee_id: employeeId,
        certificate_date: form.certificate_date,
        cid_code: form.cid_code || null,
        cid_description: form.cid_description || null,
        days_off: days,
        leave_start_date: start,
        leave_end_date: end,
        doctor_name: form.doctor_name || null,
        doctor_crm: form.doctor_crm || null,
        notes: form.notes || null,
        file_path: path,
        file_name: safeFileName,
        mime_type: contentType,
        size_bytes: uploadFile.size,
        created_by: userData.user?.id ?? null,
      });
      if (error) {
        console.error("[atestado] erro insert medical_certificates", error);
        throw error;
      }
      toast({ title: "Atestado enviado!", description: "Seu RH foi notificado." });
      reset();
      setFormOpen(false);
      load();
    } catch (err: any) {
      console.error("[atestado] falha geral", err);
      const detail =
        err?.message ||
        err?.error_description ||
        err?.statusText ||
        (typeof err === "string" ? err : "Tente novamente.");
      toast({
        title: "Erro ao enviar atestado",
        description: detail,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const downloadFile = async (c: Certificate) => {
    if (!c.file_path) return;
    const { data, error } = await supabase.storage
      .from("medical-certificates")
      .createSignedUrl(c.file_path, 60);
    if (error || !data) {
      toast({ title: "Erro ao baixar", variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <div className="rounded-md p-2 bg-primary/10 text-primary shrink-0">
          <Stethoscope className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <CardTitle className="text-base">Atestado médico</CardTitle>
          <CardDescription>
            Envie seu atestado para o RH. Você pode usar a IA para preencher os dados a partir do arquivo.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : certs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum atestado registrado.</p>
        ) : (
          <ul className="divide-y">
            {certs.map((c) => (
              <li key={c.id} className="py-2.5 flex items-start gap-3">
                <FileText className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">{format(parseISO(c.certificate_date), "dd/MM/yyyy")}</span>
                    {c.cid_code && <Badge variant="secondary" className="text-[10px]">{c.cid_code}</Badge>}
                    <Badge variant="outline" className="text-[10px]">{c.days_off} {c.days_off === 1 ? "dia" : "dias"}</Badge>
                  </div>
                  {c.cid_description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.cid_description}</p>
                  )}
                </div>
                {c.file_path && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => downloadFile(c)}>
                    <Download className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <div className="px-6 pb-6 space-y-3">
        {!formOpen ? (
          <Button onClick={() => setFormOpen(true)} className="w-full">
            <Plus className="h-4 w-4 mr-2" /> Novo atestado
          </Button>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Novo atestado</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { reset(); setFormOpen(false); }}
                disabled={saving}
              >
                Cancelar
              </Button>
            </div>
            <div className="rounded-md border border-dashed p-3 space-y-2">
              <Label>Arquivo (PDF ou imagem)</Label>
              <Input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <div className="flex items-center gap-2">
                <MaintenancePhotoCaptureButton disabled={saving || analyzing} onCapture={setFile} />
                {file && <span className="text-xs text-muted-foreground break-all flex-1 min-w-0 truncate">{file.name}</span>}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAnalyze}
                disabled={!file || analyzing}
                className="w-full"
              >
                {analyzing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Analisar com IA
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Data do atestado</Label>
                <Input type="date" value={form.certificate_date} onChange={(e) => setForm({ ...form, certificate_date: e.target.value })} />
              </div>
              <div>
                <Label>Início do afastamento</Label>
                <Input type="date" value={form.leave_start_date} onChange={(e) => setForm({ ...form, leave_start_date: e.target.value })} />
              </div>
              <div>
                <Label>CID</Label>
                <div className="relative">
                  <Input
                    value={form.cid_code}
                    onChange={(e) => setForm({ ...form, cid_code: e.target.value.toUpperCase() })}
                    placeholder="Ex: J00"
                  />
                  {lookingUpCid && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2" />
                  )}
                </div>
              </div>
              <div>
                <Label>Dias de afastamento</Label>
                <Input type="number" min="1" value={form.days_off} onChange={(e) => setForm({ ...form, days_off: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label>Descrição do CID</Label>
                <Input value={form.cid_description} onChange={(e) => setForm({ ...form, cid_description: e.target.value })} />
              </div>
              <div>
                <Label>Médico</Label>
                <Input value={form.doctor_name} onChange={(e) => setForm({ ...form, doctor_name: e.target.value })} />
              </div>
              <div>
                <Label>CRM</Label>
                <Input value={form.doctor_crm} onChange={(e) => setForm({ ...form, doctor_crm: e.target.value })} placeholder="12345/SP" />
              </div>
              <div className="sm:col-span-2">
                <Label>Observações</Label>
                <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={submit} disabled={saving || !file}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Enviar
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
