import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Loader2, Plus, Sparkles, Trash2, FileText, Download, Stethoscope, CalendarDays, TrendingUp, Check, ChevronsUpDown, CheckCircle2, XCircle, Clock } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { addDays, format, parseISO, startOfMonth, startOfYear, eachDayOfInterval } from "date-fns";
import { applyMedicalCertificateApproval } from "@/lib/medicalCertificateApproval";
import { compressImage } from "@/lib/imageCompression";
import { MaintenancePhotoCaptureButton } from "@/components/nutricontrol/MaintenancePhotoCaptureButton";

interface Employee {
  id: string;
  full_name: string;
  store_id: string;
  store?: { name: string };
}

interface Certificate {
  id: string;
  employee_id: string;
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
  mime_type: string | null;
  created_at: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  leave_applied: boolean;
  infraction_id: string | null;
  inss_referral: boolean;
  inss_benefit_type: string | null;
  inss_benefit_number: string | null;
}

interface FormState {
  employee_id: string;
  certificate_date: string;
  cid_code: string;
  cid_description: string;
  days_off: string;
  leave_start_date: string;
  doctor_name: string;
  doctor_crm: string;
  notes: string;
  inss_referral: boolean;
  inss_benefit_type: string;
  inss_benefit_number: string;
}

const EMPTY: FormState = {
  employee_id: "",
  certificate_date: format(new Date(), "yyyy-MM-dd"),
  cid_code: "",
  cid_description: "",
  days_off: "1",
  leave_start_date: "",
  doctor_name: "",
  doctor_crm: "",
  notes: "",
  inss_referral: false,
  inss_benefit_type: "B31",
  inss_benefit_number: "",
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

export default function MedicalCertificatesPanel() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingOriginal, setEditingOriginal] = useState<Certificate | null>(null);
  const [filterEmployee, setFilterEmployee] = useState<string>("all");
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false);
  const [filterPickerOpen, setFilterPickerOpen] = useState(false);
  const [lookingUpCid, setLookingUpCid] = useState(false);

  // Auto-busca da descrição do CID com debounce ao digitar
  useEffect(() => {
    const code = form.cid_code.trim();
    if (!open) return;
    if (code.length < 3) return;
    // Não sobrescreve se o usuário já editou manualmente a descrição
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
        // silencioso enquanto digita
      } finally {
        setLookingUpCid(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [form.cid_code, open]);

  const load = async () => {
    setLoading(true);
    const [{ data: emps }, { data: cs }] = await Promise.all([
      supabase
        .from("employees")
        .select("id, full_name, store_id, store:stores!employees_store_id_fkey(name)")
        .in("status", ["active", "in_training", "on_leave"])
        .order("full_name"),
      supabase
        .from("medical_certificates")
        .select("*")
        .order("certificate_date", { ascending: false }),
    ]);
    setEmployees((emps ?? []) as any);
    setCerts((cs ?? []) as Certificate[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const reset = () => {
    setForm(EMPTY);
    setFile(null);
    setEditingId(null);
    setEditingOriginal(null);
  };

  const openEdit = (c: Certificate) => {
    setEditingId(c.id);
    setEditingOriginal(c);
    setForm({
      employee_id: c.employee_id,
      certificate_date: c.certificate_date,
      cid_code: c.cid_code ?? "",
      cid_description: c.cid_description ?? "",
      days_off: String(c.days_off),
      leave_start_date: c.leave_start_date ?? "",
      doctor_name: c.doctor_name ?? "",
      doctor_crm: c.doctor_crm ?? "",
      notes: c.notes ?? "",
      inss_referral: !!c.inss_referral,
      inss_benefit_type: c.inss_benefit_type ?? "B31",
      inss_benefit_number: c.inss_benefit_number ?? "",
    });
    setFile(null);
    setOpen(true);
  };

  const updateExisting = async () => {
    if (!editingId || !editingOriginal) return;
    if (!form.employee_id) {
      toast({ title: "Selecione o colaborador", variant: "destructive" });
      return;
    }
    const days = parseInt(form.days_off, 10);
    if (!days || days < 1) {
      toast({ title: "Dias de afastamento inválidos", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const start = form.leave_start_date || form.certificate_date;
      const end = format(addDays(parseISO(start), days - 1), "yyyy-MM-dd");

      // Se trocou o arquivo, faz novo upload
      let filePath = editingOriginal.file_path;
      let fileName = editingOriginal.file_name;
      let mimeType = editingOriginal.mime_type;
      if (file) {
        const uploadFile = file.type.startsWith("image/")
          ? await compressImage(file, { maxDimension: 1600, quality: 0.78, maxBytes: 1_800_000 })
          : file;
        const rawName = uploadFile.name || file.name || "atestado";
        const lastDot = rawName.lastIndexOf(".");
        const ext = (lastDot > 0 ? rawName.slice(lastDot + 1) : "bin")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .slice(0, 8) || "bin";
        const ts = Date.now();
        const path = `${form.employee_id}/${ts}.${ext}`;
        const contentType = uploadFile.type || file.type || "application/octet-stream";
        const { error: upErr } = await supabase.storage
          .from("medical-certificates")
          .upload(path, uploadFile, { contentType });
        if (upErr) throw upErr;
        if (editingOriginal.file_path) {
          await supabase.storage.from("medical-certificates").remove([editingOriginal.file_path]);
        }
        filePath = path;
        fileName = rawName;
        mimeType = contentType;
      }

      // Limpa dias antigos da escala que estavam marcados como afastamento por este atestado
      if (editingOriginal.leave_start_date && editingOriginal.leave_end_date) {
        await supabase
          .from("work_schedules")
          .delete()
          .eq("employee_id", editingOriginal.employee_id)
          .gte("schedule_date", editingOriginal.leave_start_date)
          .lte("schedule_date", editingOriginal.leave_end_date)
          .eq("is_day_off", true)
          .ilike("notes", "Afastamento médico%");
      }

      // Remove infração antiga vinculada
      if (editingOriginal.infraction_id) {
        await supabase.from("employee_infractions").delete().eq("id", editingOriginal.infraction_id);
      }

      const { error: updErr } = await supabase
        .from("medical_certificates")
        .update({
          employee_id: form.employee_id,
          certificate_date: form.certificate_date,
          cid_code: form.cid_code || null,
          cid_description: form.cid_description || null,
          days_off: days,
          leave_start_date: start,
          leave_end_date: end,
          doctor_name: form.doctor_name || null,
          doctor_crm: form.doctor_crm || null,
          notes: form.notes || null,
          file_path: filePath,
          file_name: fileName,
          mime_type: mimeType,
          infraction_id: null,
          leave_applied: false,
          inss_referral: days > 15 ? form.inss_referral : false,
          inss_benefit_type: days > 15 && form.inss_referral ? form.inss_benefit_type : null,
          inss_benefit_number: days > 15 && form.inss_referral && form.inss_benefit_number
            ? form.inss_benefit_number
            : null,
        })
        .eq("id", editingId);
      if (updErr) throw updErr;

      // Reaplica aprovação (gera infração nova + reinsere dias na escala)
      if (editingOriginal.status === "approved") {
        const { data: u } = await supabase.auth.getUser();
        await applyMedicalCertificateApproval({
          certificateId: editingId,
          employeeId: form.employee_id,
          leaveStart: start,
          leaveEnd: end,
          cidCode: form.cid_code || null,
          cidDescription: form.cid_description || null,
          reviewerId: u.user?.id ?? null,
        });
      }

      toast({ title: "Atestado atualizado" });
      setOpen(false);
      reset();
      load();
    } catch (err: any) {
      toast({ title: "Erro ao atualizar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
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
      toast({ title: "Atestado analisado!", description: "Confira e ajuste os campos antes de salvar." });
    } catch (err: any) {
      toast({ title: "Erro ao analisar", description: err.message, variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  const submit = async () => {
    if (!form.employee_id) {
      toast({ title: "Selecione o colaborador", variant: "destructive" });
      return;
    }
    if (!file) {
      toast({ title: "Anexe a foto/PDF do atestado (obrigatório)", variant: "destructive" });
      return;
    }
    const days = parseInt(form.days_off, 10);
    if (!days || days < 1) {
      toast({ title: "Dias de afastamento inválidos", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const uploadFile = file.type.startsWith("image/")
        ? await compressImage(file, { maxDimension: 1600, quality: 0.78, maxBytes: 1_800_000 })
        : file;
      const rawName = uploadFile.name || file.name || "atestado";
      const lastDot = rawName.lastIndexOf(".");
      const ext = (lastDot > 0 ? rawName.slice(lastDot + 1) : "bin")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 8) || "bin";
      const safeBase = (lastDot > 0 ? rawName.slice(0, lastDot) : rawName)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]+/g, "_")
        .slice(0, 60) || "atestado";
      const safeFileName = `${safeBase}.${ext}`;
      const contentType = uploadFile.type || file.type || "application/octet-stream";
      const ts = Date.now();
      const path = `${form.employee_id}/${ts}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("medical-certificates")
        .upload(path, uploadFile, { contentType });
      if (upErr) throw upErr;

      // Também envia para a pasta do colaborador (cadastro -> aba Documentos), sem bloquear o atestado.
      const empDocPath = `${form.employee_id}/atestados/${ts}-${safeFileName}`;
      const { error: empUpErr } = await supabase.storage
        .from("employee-documents")
        .upload(empDocPath, uploadFile, { contentType });
      const { data: u } = await supabase.auth.getUser();
      if (!empUpErr) {
        const { error: empInsErr } = await supabase.from("employee_documents").insert({
          employee_id: form.employee_id,
          doc_type: "Atestado Médico",
          file_name: safeFileName,
          file_path: empDocPath,
          mime_type: contentType,
          size_bytes: uploadFile.size,
          uploaded_by: u.user?.id ?? null,
        });
        if (empInsErr) console.warn("[atestado gestor] falha insert employee_documents (ignorado)", empInsErr);
      } else {
        console.warn("[atestado gestor] falha upload employee-documents (ignorado)", empUpErr);
      }

      const start = form.leave_start_date || form.certificate_date;
      const end = format(addDays(parseISO(start), days - 1), "yyyy-MM-dd");

      const { data: inserted, error } = await supabase
        .from("medical_certificates")
        .insert({
          employee_id: form.employee_id,
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
          created_by: u.user?.id ?? null,
          status: "pending",
          inss_referral: days > 15 ? form.inss_referral : false,
          inss_benefit_type: days > 15 && form.inss_referral ? form.inss_benefit_type : null,
          inss_benefit_number: days > 15 && form.inss_referral && form.inss_benefit_number
            ? form.inss_benefit_number
            : null,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Como o gestor está cadastrando, já aprova automaticamente
      const { daysApplied } = await applyMedicalCertificateApproval({
        certificateId: inserted!.id,
        employeeId: form.employee_id,
        leaveStart: start,
        leaveEnd: end,
        cidCode: form.cid_code || null,
        cidDescription: form.cid_description || null,
        reviewerId: u.user?.id ?? null,
      });

      toast({
        title: "Atestado registrado e aprovado",
        description: `${daysApplied} dia(s) lançados na escala como afastamento + infração ATESTADOS adicionada.`,
      });
      setOpen(false);
      reset();
      load();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const approve = async (c: Certificate) => {
    if (!c.leave_start_date || !c.leave_end_date) {
      toast({ title: "Datas de afastamento ausentes", variant: "destructive" });
      return;
    }
    if (!confirm(`Aprovar este atestado? Serão lançados ${c.days_off} dia(s) de afastamento na escala e adicionada a infração ATESTADOS.`)) return;
    try {
      const { data: u } = await supabase.auth.getUser();
      const { daysApplied } = await applyMedicalCertificateApproval({
        certificateId: c.id,
        employeeId: c.employee_id,
        leaveStart: c.leave_start_date,
        leaveEnd: c.leave_end_date,
        cidCode: c.cid_code,
        cidDescription: c.cid_description,
        reviewerId: u.user?.id ?? null,
      });
      toast({ title: "Atestado aprovado", description: `${daysApplied} dia(s) lançados na escala.` });
      load();
    } catch (err: any) {
      toast({ title: "Erro ao aprovar", description: err.message, variant: "destructive" });
    }
  };

  const reject = async (c: Certificate) => {
    const reason = prompt("Motivo da rejeição:");
    if (!reason || !reason.trim()) return;
    try {
      const { data: u } = await supabase.auth.getUser();
      const { rejectMedicalCertificate } = await import("@/lib/medicalCertificateApproval");
      await rejectMedicalCertificate(c.id, u.user?.id ?? null, reason.trim());
      toast({ title: "Atestado rejeitado" });
      load();
    } catch (err: any) {
      toast({ title: "Erro ao rejeitar", description: err.message, variant: "destructive" });
    }
  };

  const remove = async (c: Certificate) => {
    if (!confirm("Excluir este atestado?")) return;
    if (c.file_path) {
      await supabase.storage.from("medical-certificates").remove([c.file_path]);
    }
    const { error } = await supabase.from("medical_certificates").delete().eq("id", c.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Atestado excluído" });
    load();
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

  const filtered = useMemo(
    () => (filterEmployee === "all" ? certs : certs.filter((c) => c.employee_id === filterEmployee)),
    [certs, filterEmployee]
  );

  const employeeName = (id: string) => employees.find((e) => e.id === id)?.full_name ?? "—";

  const stats = useMemo(() => {
    const yearStart = startOfYear(new Date());
    const monthStart = startOfMonth(new Date());
    const inYear = filtered.filter((c) => parseISO(c.certificate_date) >= yearStart);
    const inMonth = filtered.filter((c) => parseISO(c.certificate_date) >= monthStart);
    const cidCount: Record<string, number> = {};
    for (const c of inYear) {
      const k = c.cid_code || "Sem CID";
      cidCount[k] = (cidCount[k] || 0) + 1;
    }
    const topCids = Object.entries(cidCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    return {
      yearDays: inYear.reduce((sum, c) => sum + c.days_off, 0),
      monthDays: inMonth.reduce((sum, c) => sum + c.days_off, 0),
      yearCount: inYear.length,
      topCids,
    };
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="flex-1 max-w-sm">
          <Label className="text-xs">Filtrar por colaborador</Label>
          <Popover open={filterPickerOpen} onOpenChange={setFilterPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                {filterEmployee === "all"
                  ? "Todos os colaboradores"
                  : employees.find((e) => e.id === filterEmployee)?.full_name ?? "Selecione..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput placeholder="Digite o nome..." />
                <CommandList>
                  <CommandEmpty>Nenhum colaborador encontrado.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="Todos os colaboradores"
                      onSelect={() => { setFilterEmployee("all"); setFilterPickerOpen(false); }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", filterEmployee === "all" ? "opacity-100" : "opacity-0")} />
                      Todos os colaboradores
                    </CommandItem>
                    {employees.map((e) => (
                      <CommandItem
                        key={e.id}
                        value={e.full_name}
                        onSelect={() => { setFilterEmployee(e.id); setFilterPickerOpen(false); }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", filterEmployee === e.id ? "opacity-100" : "opacity-0")} />
                        {e.full_name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <Button onClick={() => { reset(); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo atestado
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><CalendarDays className="h-4 w-4" />Dias no ano</div>
            <div className="text-2xl font-bold">{stats.yearDays}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><CalendarDays className="h-4 w-4" />Dias no mês</div>
            <div className="text-2xl font-bold">{stats.monthDays}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><FileText className="h-4 w-4" />Atestados no ano</div>
            <div className="text-2xl font-bold">{stats.yearCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><TrendingUp className="h-4 w-4" />CIDs frequentes</div>
            <div className="text-sm font-medium space-y-0.5 mt-1">
              {stats.topCids.length === 0 ? (
                <span className="text-muted-foreground">—</span>
              ) : stats.topCids.map(([cid, count]) => (
                <div key={cid}>{cid} <span className="text-muted-foreground">({count})</span></div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Histórico</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum atestado registrado.</p>
          ) : (
            <ul className="divide-y">
              {filtered.map((c) => {
                const statusBadge =
                  c.status === "approved" ? (
                    <Badge variant="default" className="text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />Aprovado</Badge>
                  ) : c.status === "rejected" ? (
                    <Badge variant="destructive" className="text-[10px]"><XCircle className="h-3 w-3 mr-1" />Rejeitado</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>
                  );
                return (
                  <li key={c.id} className="py-3 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3">
                    <button
                      type="button"
                      onClick={() => openEdit(c)}
                      className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0 text-left hover:bg-muted/40 rounded-md p-1 -m-1 transition-colors"
                      title="Clique para editar"
                    >
                      <Stethoscope className="h-5 w-5 mt-0.5 shrink-0 text-primary" />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-sm sm:text-base">{employeeName(c.employee_id)}</span>
                          {statusBadge}
                          {c.cid_code && <Badge variant="secondary" className="text-[10px]">{c.cid_code}</Badge>}
                          <Badge variant="outline" className="text-[10px]">{c.days_off} {c.days_off === 1 ? "dia" : "dias"}</Badge>
                        </div>
                        {c.cid_description && (
                          <p className="text-sm text-muted-foreground mt-0.5">{c.cid_description}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1 break-words">
                          Atestado: {format(parseISO(c.certificate_date), "dd/MM/yyyy")}
                          {c.leave_start_date && c.leave_end_date && ` · Afastamento: ${format(parseISO(c.leave_start_date), "dd/MM")} a ${format(parseISO(c.leave_end_date), "dd/MM/yyyy")}`}
                          {c.doctor_name && ` · Dr(a). ${c.doctor_name}`}
                          {c.doctor_crm && ` · CRM ${c.doctor_crm}`}
                        </p>
                        {c.notes && <p className="text-xs mt-1">{c.notes}</p>}
                        {c.review_notes && (
                          <p className="text-xs mt-1 italic text-muted-foreground">Revisão: {c.review_notes}</p>
                        )}
                      </div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                      {c.status === "pending" && (
                        <>
                          <Button size="sm" variant="default" className="h-8" onClick={() => approve(c)}>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Aprovar
                          </Button>
                          <Button size="sm" variant="outline" className="h-8" onClick={() => reject(c)}>
                            <XCircle className="h-3.5 w-3.5 mr-1" />Rejeitar
                          </Button>
                        </>
                      )}
                      {c.file_path && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => downloadFile(c)} title="Baixar">
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(c)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Editar atestado" : "Novo atestado"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Colaborador</Label>
              <Popover open={employeePickerOpen} onOpenChange={setEmployeePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn("w-full justify-between font-normal", !form.employee_id && "text-muted-foreground")}
                  >
                    {form.employee_id
                      ? employees.find((e) => e.id === form.employee_id)?.full_name ?? "Selecione..."
                      : "Buscar colaborador..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Digite o nome..." />
                    <CommandList>
                      <CommandEmpty>Nenhum colaborador encontrado.</CommandEmpty>
                      <CommandGroup>
                        {employees.map((e) => (
                          <CommandItem
                            key={e.id}
                            value={e.full_name}
                            onSelect={() => {
                              setForm({ ...form, employee_id: e.id });
                              setEmployeePickerOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", form.employee_id === e.id ? "opacity-100" : "opacity-0")} />
                            {e.full_name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="rounded-md border border-dashed p-3 space-y-2">
              <Label>Arquivo do atestado (PDF ou imagem) {!editingId && <span className="text-destructive">*</span>}</Label>
              {editingId && editingOriginal?.file_name && !file && (
                <p className="text-xs text-muted-foreground">Arquivo atual: <span className="font-medium">{editingOriginal.file_name}</span>. Selecione um novo apenas se quiser substituir.</p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <MaintenancePhotoCaptureButton disabled={saving || analyzing} onCapture={setFile} />
                {file && <span className="text-xs text-muted-foreground break-all">{file.name}</span>}
              </div>
              <Input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAnalyze}
                disabled={!file || analyzing}
                className="w-full"
              >
                {analyzing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Analisar com IA (preencher CID, dias e datas)
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
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
              <div className="md:col-span-2">
                <Label>Descrição do CID</Label>
                <Input value={form.cid_description} onChange={(e) => setForm({ ...form, cid_description: e.target.value })} placeholder="Ex: Resfriado comum" />
              </div>
              <div>
                <Label>Médico</Label>
                <Input value={form.doctor_name} onChange={(e) => setForm({ ...form, doctor_name: e.target.value })} />
              </div>
              <div>
                <Label>CRM</Label>
                <Input value={form.doctor_crm} onChange={(e) => setForm({ ...form, doctor_crm: e.target.value })} placeholder="12345/SP" />
              </div>
              <div className="md:col-span-2">
                <Label>Observações</Label>
                <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>

              {parseInt(form.days_off, 10) > 15 && (
                <div className="md:col-span-2 rounded-md border border-warning/40 bg-warning/5 p-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Label className="text-sm font-semibold">Encaminhar ao INSS</Label>
                      <p className="text-xs text-muted-foreground">
                        Atestado &gt; 15 dias. Empregador paga apenas os 15 primeiros dias; do 16º em diante, contrato suspenso e INSS assume (CLT art. 60 §3º).
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      className="h-5 w-5 mt-1 accent-primary"
                      checked={form.inss_referral}
                      onChange={(e) => setForm({ ...form, inss_referral: e.target.checked })}
                    />
                  </div>
                  {form.inss_referral && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <Label>Tipo de benefício</Label>
                        <Select
                          value={form.inss_benefit_type}
                          onValueChange={(v) => setForm({ ...form, inss_benefit_type: v })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="B31">B31 — Auxílio por incapacidade temporária</SelectItem>
                            <SelectItem value="B91">B91 — Acidente de trabalho</SelectItem>
                            <SelectItem value="B80">B80 — Salário-maternidade</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>NB (Número do Benefício)</Label>
                        <Input
                          value={form.inss_benefit_number}
                          onChange={(e) => setForm({ ...form, inss_benefit_number: e.target.value })}
                          placeholder="Opcional — preencher após perícia"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={editingId ? updateExisting : submit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
