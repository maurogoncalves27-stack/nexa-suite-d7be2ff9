import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { HeartPulse, Plus, FileText, Download, Trash2, AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { compressImage } from "@/lib/imageCompression";

const DOC_TYPES: { value: string; label: string }[] = [
  { value: "aso_admissional", label: "ASO — Admissional" },
  { value: "aso_periodico", label: "ASO — Periódico" },
  { value: "aso_demissional", label: "ASO — Demissional" },
  { value: "aso_retorno", label: "ASO — Retorno ao trabalho" },
  { value: "aso_mudanca_funcao", label: "ASO — Mudança de função" },
  { value: "laudo_pcmso", label: "Laudo PCMSO" },
  { value: "laudo_psicossocial", label: "Laudo psicossocial (NR-1)" },
  { value: "exame_complementar", label: "Exame complementar" },
  { value: "outro_pcmso", label: "Outro documento PCMSO" },
];

interface Employee { id: string; full_name: string; store?: { name: string } | null }
interface Doc {
  id: string;
  employee_id: string;
  document_type: string;
  certificate_date: string;
  valid_until: string | null;
  doctor_name: string | null;
  doctor_crm: string | null;
  notes: string | null;
  file_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  employee?: { full_name: string; status?: string | null; store?: { name: string } | null };
}

export default function Pcmso({ embedded = false }: { embedded?: boolean } = {}) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    employee_id: "",
    document_type: "aso_admissional",
    certificate_date: new Date().toISOString().slice(0, 10),
    valid_until: "",
    doctor_name: "",
    doctor_crm: "",
    notes: "",
  });
  const [file, setFile] = useState<File | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: emps }, { data: cs }] = await Promise.all([
      supabase.from("employees")
        .select("id, full_name, store:stores!employees_store_id_fkey(name)")
        .in("status", ["active", "in_training", "on_leave"])
        .not("contract_type", "eq", "Estágio")
        .order("full_name"),
      supabase.from("medical_certificates")
        .select("*, employee:employees!medical_certificates_employee_id_fkey(full_name, status, store:stores!employees_store_id_fkey(name))")
        .eq("is_pcmso", true)
        .order("certificate_date", { ascending: false }),
    ]);
    setEmployees((emps ?? []) as any);
    setDocs((cs ?? []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const reset = () => {
    setForm({
      employee_id: "",
      document_type: "aso_admissional",
      certificate_date: new Date().toISOString().slice(0, 10),
      valid_until: "",
      doctor_name: "",
      doctor_crm: "",
      notes: "",
    });
    setFile(null);
  };

  const submit = async () => {
    if (!form.employee_id) { toast({ title: "Selecione o colaborador", variant: "destructive" }); return; }
    setSaving(true);
    try {
      let filePath: string | null = null;
      let fileName: string | null = null;
      let mimeType: string | null = null;
      let sizeBytes: number | null = null;
      if (file) {
        const uploadFile = file.type.startsWith("image/")
          ? await compressImage(file, { maxDimension: 1600, quality: 0.78, maxBytes: 1_800_000 })
          : file;
        const raw = uploadFile.name || file.name || "pcmso";
        const dot = raw.lastIndexOf(".");
        const ext = (dot > 0 ? raw.slice(dot + 1) : "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
        const ts = Date.now();
        const path = `${form.employee_id}/pcmso/${ts}.${ext}`;
        const ct = uploadFile.type || file.type || "application/octet-stream";
        const { error: upErr } = await supabase.storage.from("medical-certificates").upload(path, uploadFile, { contentType: ct });
        if (upErr) throw upErr;
        filePath = path; fileName = raw; mimeType = ct; sizeBytes = uploadFile.size;
      }
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("medical_certificates").insert({
        employee_id: form.employee_id,
        certificate_date: form.certificate_date,
        days_off: 0,
        document_type: form.document_type,
        is_pcmso: true,
        valid_until: form.valid_until || null,
        doctor_name: form.doctor_name || null,
        doctor_crm: form.doctor_crm || null,
        notes: form.notes || null,
        file_path: filePath,
        file_name: fileName,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        created_by: u.user?.id ?? null,
        status: "approved",
      });
      if (error) throw error;
      toast({ title: "ASO registrado" });
      setOpen(false);
      reset();
      load();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (d: Doc) => {
    if (!confirm("Excluir este ASO?")) return;
    try {
      if (d.file_path) await supabase.storage.from("medical-certificates").remove([d.file_path]);
      await supabase.from("medical_certificates").delete().eq("id", d.id);
      load();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const download = async (d: Doc) => {
    if (!d.file_path) return;
    const { data, error } = await supabase.storage.from("medical-certificates").createSignedUrl(d.file_path, 60);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    window.open(data.signedUrl, "_blank");
  };

  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const expiring = useMemo(() => docs.filter((d) => d.valid_until && d.valid_until >= today && d.valid_until <= in30), [docs]);
  const expired = useMemo(() => docs.filter((d) => d.valid_until && d.valid_until < today), [docs]);

  const { grouped, terminatedDocs } = useMemo(() => {
    const map = new Map<string, { name: string; store?: string | null; docs: Doc[] }>();
    const term: Doc[] = [];
    for (const d of docs) {
      if (d.employee?.status === "terminated") { term.push(d); continue; }
      const key = d.employee_id;
      if (!map.has(key)) {
        map.set(key, { name: d.employee?.full_name ?? "—", store: d.employee?.store?.name ?? null, docs: [] });
      }
      map.get(key)!.docs.push(d);
    }
    const arr = Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return { grouped: arr, terminatedDocs: term };
  }, [docs]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        {embedded ? (
          <div />
        ) : (
          <div>
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
              <HeartPulse className="h-6 w-6 md:h-7 md:w-7 text-primary" />
              ASO
            </h1>
            <p className="text-muted-foreground">Atestados de Saúde Ocupacional — admissional, periódico, demissional, retorno e mudança de função.</p>
          </div>
        )}
        <Button onClick={() => { reset(); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo documento
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-green-600" /> Documentos ativos</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{docs.length - expired.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange-500" /> Vencendo em 30 dias</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{expiring.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-600" /> Vencidos</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{expired.length}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Documentos</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : docs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Nenhum ASO cadastrado ainda.</div>
          ) : (
            <Accordion type="multiple" className="w-full">
              {grouped.map((g) => {
                const hasExpired = g.docs.some((d) => d.valid_until && d.valid_until < today);
                const hasSoon = g.docs.some((d) => d.valid_until && d.valid_until >= today && d.valid_until <= in30);
                return (
                  <AccordionItem key={g.id} value={g.id}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-2 flex-wrap text-left">
                        <span className="font-medium">{g.name}</span>
                        {g.store && <span className="text-xs text-muted-foreground">— {g.store}</span>}
                        <Badge variant="secondary">{g.docs.length}</Badge>
                        {hasExpired && <Badge variant="destructive">Vencido</Badge>}
                        {!hasExpired && hasSoon && <Badge className="bg-orange-100 text-orange-800">Vencendo</Badge>}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left">
                              <th className="py-2 pr-2">Tipo</th>
                              <th className="py-2 pr-2">Data</th>
                              <th className="py-2 pr-2">Validade</th>
                              <th className="py-2 pr-2">Médico</th>
                              <th className="py-2 pr-2 text-right">Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.docs.map((d) => {
                              const isExpired = d.valid_until && d.valid_until < today;
                              const isSoon = d.valid_until && !isExpired && d.valid_until <= in30;
                              return (
                                <tr key={d.id} className="border-b hover:bg-muted/40">
                                  <td className="py-2 pr-2">{DOC_TYPES.find(t => t.value === d.document_type)?.label ?? d.document_type}</td>
                                  <td className="py-2 pr-2 whitespace-nowrap">{new Date(d.certificate_date + "T00:00:00").toLocaleDateString("pt-BR")}</td>
                                  <td className="py-2 pr-2 whitespace-nowrap">
                                    {d.valid_until ? (
                                      <div className="flex items-center gap-1">
                                        {new Date(d.valid_until + "T00:00:00").toLocaleDateString("pt-BR")}
                                        {isExpired && <Badge variant="destructive">Vencido</Badge>}
                                        {isSoon && <Badge className="bg-orange-100 text-orange-800">30d</Badge>}
                                      </div>
                                    ) : "—"}
                                  </td>
                                  <td className="py-2 pr-2 text-xs">{d.doctor_name}{d.doctor_crm ? ` — ${d.doctor_crm}` : ""}</td>
                                  <td className="py-2 pr-2 text-right whitespace-nowrap">
                                    {d.file_path && (
                                      <Button size="icon" variant="ghost" onClick={() => download(d)}><Download className="h-4 w-4" /></Button>
                                    )}
                                    <Button size="icon" variant="ghost" onClick={() => remove(d)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
              {terminatedDocs.length > 0 && (
                <AccordionItem value="__terminated__">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2 flex-wrap text-left">
                      <span className="font-medium text-muted-foreground">Desligados</span>
                      <Badge variant="secondary">{terminatedDocs.length}</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="py-2 pr-2">Colaborador</th>
                            <th className="py-2 pr-2">Tipo</th>
                            <th className="py-2 pr-2">Data</th>
                            <th className="py-2 pr-2">Validade</th>
                            <th className="py-2 pr-2">Médico</th>
                            <th className="py-2 pr-2 text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {terminatedDocs.map((d) => (
                            <tr key={d.id} className="border-b hover:bg-muted/40">
                              <td className="py-2 pr-2">
                                <div className="font-medium">{d.employee?.full_name}</div>
                                <div className="text-xs text-muted-foreground">{d.employee?.store?.name}</div>
                              </td>
                              <td className="py-2 pr-2">{DOC_TYPES.find(t => t.value === d.document_type)?.label ?? d.document_type}</td>
                              <td className="py-2 pr-2 whitespace-nowrap">{new Date(d.certificate_date + "T00:00:00").toLocaleDateString("pt-BR")}</td>
                              <td className="py-2 pr-2 whitespace-nowrap">
                                {d.valid_until ? new Date(d.valid_until + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                              </td>
                              <td className="py-2 pr-2 text-xs">{d.doctor_name}{d.doctor_crm ? ` — ${d.doctor_crm}` : ""}</td>
                              <td className="py-2 pr-2 text-right whitespace-nowrap">
                                {d.file_path && (
                                  <Button size="icon" variant="ghost" onClick={() => download(d)}><Download className="h-4 w-4" /></Button>
                                )}
                                <Button size="icon" variant="ghost" onClick={() => remove(d)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => { if (!saving) setOpen(v); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Novo ASO</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Colaborador</Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}{e.store?.name ? ` — ${e.store.name}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.document_type} onValueChange={(v) => setForm({ ...form, document_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DOC_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data do documento</Label>
                <Input type="date" value={form.certificate_date} onChange={(e) => setForm({ ...form, certificate_date: e.target.value })} />
              </div>
              <div>
                <Label>Válido até</Label>
                <Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Médico</Label>
                <Input value={form.doctor_name} onChange={(e) => setForm({ ...form, doctor_name: e.target.value })} />
              </div>
              <div>
                <Label>CRM</Label>
                <Input value={form.doctor_crm} onChange={(e) => setForm({ ...form, doctor_crm: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Anotações / Resultado</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Ex.: Apto sem restrições, próximo exame em 12 meses." />
            </div>
            <div>
              <Label>Arquivo (PDF/imagem)</Label>
              <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              {file && <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><FileText className="h-3 w-3" /> {file.name}</div>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
