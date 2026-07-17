import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "@/hooks/use-toast";
import { Download, FileText, History, Loader2, Plus, ShieldCheck, Trash2, Upload } from "lucide-react";

type DocType =
  | "pcmso"
  | "pgr"
  | "ltcat"
  | "ltip"
  | "psicossocial_nr1"
  | "relatorio_psicossocial"
  | "outros";

const DOC_TYPE_META: Record<DocType, { label: string; short: string; defaultValidityMonths: number | null }> = {
  pcmso: { label: "PCMSO — Programa de Controle Médico de Saúde Ocupacional", short: "PCMSO", defaultValidityMonths: 12 },
  pgr: { label: "PGR — Programa de Gerenciamento de Riscos", short: "PGR", defaultValidityMonths: 24 },
  ltcat: { label: "LTCAT — Laudo Técnico de Condições Ambientais", short: "LTCAT", defaultValidityMonths: null },
  ltip: { label: "LTIP — Laudo Técnico de Insalubridade e Periculosidade", short: "LTIP", defaultValidityMonths: null },
  psicossocial_nr1: { label: "Pesquisa Psicossocial (NR-1)", short: "Psicossocial NR-1", defaultValidityMonths: 12 },
  relatorio_psicossocial: { label: "Relatório Psicossocial", short: "Relatório Psicossocial", defaultValidityMonths: 12 },
  outros: { label: "Outros documentos de SST", short: "Outros", defaultValidityMonths: 12 },
};

interface DocumentRow {
  id: string;
  doc_type: DocType;
  cnpj: string;
  company_name: string;
  emitted_at: string;
  valid_from: string;
  valid_until: string | null;
  notes: string | null;
  current_version: number;
  is_active: boolean;
}

interface VersionRow {
  id: string;
  document_id: string;
  version_number: number;
  file_path: string;
  file_name: string;
  emitted_at: string;
  valid_from: string;
  valid_until: string | null;
  superseded_at: string | null;
  created_at: string;
}

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function statusOf(validUntil: string | null): { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string; days: number | null } {
  if (!validUntil) return { label: "Sem vencimento", variant: "secondary", className: "", days: null };
  const days = daysBetween(new Date(), new Date(validUntil));
  if (days < 0) return { label: `Vencido há ${Math.abs(days)}d`, variant: "destructive", className: "", days };
  if (days <= 30) return { label: `Vence em ${days}d`, variant: "outline", className: "border-warning text-warning", days };
  if (days <= 60) return { label: `Vence em ${days}d`, variant: "outline", className: "", days };
  return { label: `Vigente (${days}d)`, variant: "outline", className: "border-success text-success", days };
}

function addMonths(date: string, months: number): string {
  const d = new Date(date + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  // Subtrai 1 dia para pegar véspera do aniversário
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default function SstDocumentsPanel() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [versions, setVersions] = useState<Record<string, VersionRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingDoc, setEditingDoc] = useState<DocumentRow | null>(null);

  // Form
  const [docType, setDocType] = useState<DocType>("pcmso");
  const [cnpj, setCnpj] = useState("44.932.369/0001-08");
  const [companyName, setCompanyName] = useState("AQUELA PARMÊ");
  const [emittedAt, setEmittedAt] = useState(new Date().toISOString().slice(0, 10));
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const resetForm = () => {
    setEditingDoc(null);
    setDocType("pcmso");
    setCnpj("44.932.369/0001-08");
    setCompanyName("AQUELA PARMÊ");
    const today = new Date().toISOString().slice(0, 10);
    setEmittedAt(today);
    setValidFrom(today);
    setValidUntil("");
    setNotes("");
    setFile(null);
  };

  const load = async () => {
    setLoading(true);
    const [{ data: docRows, error: dErr }, { data: vRows, error: vErr }] = await Promise.all([
      supabase.from("sst_documents").select("*").order("doc_type").order("valid_from", { ascending: false }),
      supabase.from("sst_document_versions").select("*").order("version_number", { ascending: false }),
    ]);
    if (dErr || vErr) {
      toast({ title: "Erro ao carregar documentos", description: dErr?.message ?? vErr?.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    setDocs((docRows ?? []) as DocumentRow[]);
    const grouped: Record<string, VersionRow[]> = {};
    ((vRows ?? []) as VersionRow[]).forEach((v) => {
      grouped[v.document_id] = grouped[v.document_id] ?? [];
      grouped[v.document_id].push(v);
    });
    setVersions(grouped);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Auto-preencher validade quando muda tipo/emissão
  useEffect(() => {
    if (editingDoc) return;
    const months = DOC_TYPE_META[docType].defaultValidityMonths;
    if (months && emittedAt) {
      setValidFrom(emittedAt);
      setValidUntil(addMonths(emittedAt, months));
    }
  }, [docType, emittedAt, editingDoc]);

  const openNew = () => { resetForm(); setOpen(true); };

  const openNewVersion = (doc: DocumentRow) => {
    resetForm();
    setEditingDoc(doc);
    setDocType(doc.doc_type);
    setCnpj(doc.cnpj);
    setCompanyName(doc.company_name);
    const today = new Date().toISOString().slice(0, 10);
    setEmittedAt(today);
    setValidFrom(today);
    const months = DOC_TYPE_META[doc.doc_type].defaultValidityMonths;
    setValidUntil(months ? addMonths(today, months) : "");
    setOpen(true);
  };

  const handleSave = async () => {
    if (!file) {
      toast({ title: "Selecione o arquivo PDF", variant: "destructive" });
      return;
    }
    if (!cnpj.trim() || !companyName.trim() || !emittedAt || !validFrom) {
      toast({ title: "Preencha CNPJ, empresa, emissão e início da vigência", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const cnpjKey = cnpj.replace(/\D/g, "");
      let documentId = editingDoc?.id;
      let versionNumber = 1;

      if (editingDoc) {
        versionNumber = editingDoc.current_version + 1;
      } else {
        const { data: newDoc, error: insErr } = await supabase
          .from("sst_documents")
          .insert({
            doc_type: docType,
            cnpj: cnpj.trim(),
            company_name: companyName.trim(),
            emitted_at: emittedAt,
            valid_from: validFrom,
            valid_until: validUntil || null,
            notes: notes.trim() || null,
            current_version: 1,
            is_active: true,
            created_by: user?.id ?? null,
          })
          .select()
          .single();
        if (insErr) throw insErr;
        documentId = newDoc.id;
      }

      const path = `${cnpjKey}/${docType}/v${versionNumber}-${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("sst-documents")
        .upload(path, file, { contentType: file.type || "application/pdf", upsert: false });
      if (upErr) throw upErr;

      const { error: vErr } = await supabase.from("sst_document_versions").insert({
        document_id: documentId,
        version_number: versionNumber,
        file_path: path,
        file_name: file.name,
        file_size: file.size,
        emitted_at: emittedAt,
        valid_from: validFrom,
        valid_until: validUntil || null,
        uploaded_by: user?.id ?? null,
      });
      if (vErr) throw vErr;

      if (editingDoc) {
        await supabase
          .from("sst_document_versions")
          .update({ superseded_at: new Date().toISOString() })
          .eq("document_id", editingDoc.id)
          .lt("version_number", versionNumber)
          .is("superseded_at", null);

        await supabase
          .from("sst_documents")
          .update({
            emitted_at: emittedAt,
            valid_from: validFrom,
            valid_until: validUntil || null,
            notes: notes.trim() || editingDoc.notes,
            current_version: versionNumber,
          })
          .eq("id", editingDoc.id);
      }

      toast({ title: editingDoc ? `Nova versão v${versionNumber} enviada` : "Documento cadastrado" });
      setOpen(false);
      resetForm();
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const download = async (v: VersionRow) => {
    const { data, error } = await supabase.storage.from("sst-documents").createSignedUrl(v.file_path, 300);
    if (error || !data?.signedUrl) {
      toast({ title: "Não foi possível gerar link", description: error?.message, variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const removeDocument = async (doc: DocumentRow) => {
    if (!confirm(`Excluir ${DOC_TYPE_META[doc.doc_type].short} e todas as versões? Esta ação não pode ser desfeita.`)) return;
    const paths = (versions[doc.id] ?? []).map((v) => v.file_path);
    if (paths.length > 0) await supabase.storage.from("sst-documents").remove(paths);
    const { error } = await supabase.from("sst_documents").delete().eq("id", doc.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    load();
  };

  const handleSmartUpload = async (f: File) => {
    setSmartLoading(true);
    setSmartFile(f);
    setSmartResult(null);
    setSmartEmployee(null);
    setSmartOpen(true);
    try {
      const result = await classifySstDocument(f);
      setSmartResult(result);
      if (result.kind === "aso") {
        const match = await matchEmployeeFromClassification(result);
        setSmartEmployee(match);
      }
    } catch (e: any) {
      toast({ title: "Falha ao analisar PDF", description: e.message ?? String(e), variant: "destructive" });
      setSmartOpen(false);
    } finally {
      setSmartLoading(false);
    }
  };

  const confirmSmart = async () => {
    if (!smartFile || !smartResult) return;
    setSmartConfirming(true);
    try {
      // ASO → vai para a ficha do colaborador
      if (smartResult.kind === "aso") {
        if (!smartEmployee) {
          toast({
            title: "Colaborador não identificado",
            description: "Não foi possível casar o nome/CPF do ASO com um colaborador cadastrado.",
            variant: "destructive",
          });
          setSmartConfirming(false);
          return;
        }
        const cert = smartResult.emitted_at ?? new Date().toISOString().slice(0, 10);
        const path = `${smartEmployee.id}/aso-${Date.now()}.pdf`;
        const { error: upErr } = await supabase.storage
          .from("medical-certificates")
          .upload(path, smartFile, { contentType: "application/pdf" });
        if (upErr) throw upErr;

        const { error: insErr } = await supabase.from("medical_certificates").insert({
          employee_id: smartEmployee.id,
          certificate_date: cert,
          days_off: 0,
          doctor_name: smartResult.doctor_name,
          doctor_crm: smartResult.doctor_crm,
          notes: smartResult.notes,
          file_path: path,
          file_name: smartFile.name,
          mime_type: "application/pdf",
          size_bytes: smartFile.size,
          created_by: user?.id ?? null,
          status: "approved",
          document_type: "aso",
          valid_until: smartResult.valid_until,
          is_pcmso: true,
        });
        if (insErr) throw insErr;

        // arquiva também na pasta do colaborador
        await uploadEmployeePdfBlob({
          employeeId: smartEmployee.id,
          docType: "aso",
          fileName: smartFile.name,
          blob: smartFile,
          uploadedBy: user?.id ?? null,
        });

        toast({ title: `ASO arquivado na ficha de ${smartEmployee.full_name}` });
        setSmartOpen(false);
        return;
      }

      // Documento SST → cria/atualiza registro em sst_documents
      const kind = smartResult.kind === "outros" ? "outros" : smartResult.kind;
      const cnpjIn = smartResult.cnpj || "44.932.369/0001-08";
      const cnpjKey = cnpjIn.replace(/\D/g, "");
      const company = smartResult.company_name || "AQUELA PARMÊ";
      const today = new Date().toISOString().slice(0, 10);
      const emitted = smartResult.emitted_at ?? today;
      const vFrom = smartResult.valid_from ?? emitted;
      const months = DOC_TYPE_META[kind as DocType].defaultValidityMonths;
      const vUntil =
        smartResult.valid_until ?? (months ? addMonths(emitted, months) : null);

      // Documento já existe? (mesmo tipo + cnpj + empresa) → nova versão
      const { data: existing } = await supabase
        .from("sst_documents")
        .select("*")
        .eq("doc_type", kind)
        .eq("cnpj", cnpjIn)
        .maybeSingle();

      let documentId = existing?.id as string | undefined;
      let versionNumber = 1;
      if (existing) {
        versionNumber = (existing.current_version ?? 1) + 1;
      } else {
        const { data: newDoc, error: insErr } = await supabase
          .from("sst_documents")
          .insert({
            doc_type: kind,
            cnpj: cnpjIn,
            company_name: company,
            emitted_at: emitted,
            valid_from: vFrom,
            valid_until: vUntil,
            notes: smartResult.notes,
            current_version: 1,
            is_active: true,
            created_by: user?.id ?? null,
          })
          .select()
          .single();
        if (insErr) throw insErr;
        documentId = newDoc.id;
      }

      const path = `${cnpjKey}/${kind}/v${versionNumber}-${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("sst-documents")
        .upload(path, smartFile, { contentType: "application/pdf" });
      if (upErr) throw upErr;

      const { error: vErr } = await supabase.from("sst_document_versions").insert({
        document_id: documentId,
        version_number: versionNumber,
        file_path: path,
        file_name: smartFile.name,
        file_size: smartFile.size,
        emitted_at: emitted,
        valid_from: vFrom,
        valid_until: vUntil,
        uploaded_by: user?.id ?? null,
      });
      if (vErr) throw vErr;

      if (existing) {
        await supabase
          .from("sst_document_versions")
          .update({ superseded_at: new Date().toISOString() })
          .eq("document_id", existing.id)
          .lt("version_number", versionNumber)
          .is("superseded_at", null);
        await supabase
          .from("sst_documents")
          .update({
            emitted_at: emitted,
            valid_from: vFrom,
            valid_until: vUntil,
            notes: smartResult.notes ?? existing.notes,
            current_version: versionNumber,
          })
          .eq("id", existing.id);
      }

      toast({
        title: existing
          ? `Nova versão v${versionNumber} de ${DOC_TYPE_META[kind as DocType].short} enviada`
          : `${DOC_TYPE_META[kind as DocType].short} cadastrado`,
      });
      setSmartOpen(false);
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setSmartConfirming(false);
    }
  };

  const kpis = useMemo(() => {
    let vigente = 0, vence60 = 0, vencido = 0;
    docs.forEach((d) => {
      const s = statusOf(d.valid_until);
      if (s.days === null) return;
      if (s.days < 0) vencido++;
      else if (s.days <= 60) vence60++;
      else vigente++;
    });
    return { vigente, vence60, vencido, total: docs.length };
  }, [docs]);

  const grouped = useMemo(() => {
    const map: Record<DocType, DocumentRow[]> = {
      pcmso: [], pgr: [], ltcat: [], ltip: [], psicossocial_nr1: [], relatorio_psicossocial: [], outros: [],
    };
    docs.forEach((d) => { map[d.doc_type].push(d); });
    return map;
  }, [docs]);

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Total de documentos</div>
          <div className="text-2xl font-bold">{kpis.total}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Vigentes</div>
          <div className="text-2xl font-bold text-success">{kpis.vigente}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Vence em ≤60 dias</div>
          <div className="text-2xl font-bold text-warning">{kpis.vence60}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Vencidos</div>
          <div className="text-2xl font-bold text-destructive">{kpis.vencido}</div>
        </CardContent></Card>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" asChild>
          <label className="cursor-pointer">
            <Sparkles className="h-4 w-4 mr-2" />
            Upload inteligente (IA)
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleSmartUpload(f);
                e.currentTarget.value = "";
              }}
            />
          </label>
        </Button>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Novo documento</Button>
      </div>

      {docs.length === 0 ? (
        <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground">
          Nenhum documento cadastrado. Envie PCMSO, PGR, LTCAT, LTIP ou pesquisas psicossociais.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {(Object.keys(grouped) as DocType[]).map((type) => {
            const items = grouped[type];
            if (items.length === 0) return null;
            return (
              <Card key={type}>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <span className="font-semibold">{DOC_TYPE_META[type].short}</span>
                    <span className="text-xs text-muted-foreground">— {DOC_TYPE_META[type].label}</span>
                  </div>
                  <div className="space-y-2">
                    {items.map((d) => {
                      const s = statusOf(d.valid_until);
                      const vs = versions[d.id] ?? [];
                      const current = vs.find((v) => v.version_number === d.current_version);
                      return (
                        <div key={d.id} className="border rounded-lg p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium truncate">{d.company_name}</span>
                                <Badge variant="outline" className="text-xs">CNPJ {d.cnpj}</Badge>
                                <Badge variant="outline" className="text-xs">v{d.current_version}</Badge>
                                <Badge variant={s.variant} className={s.className}>{s.label}</Badge>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                Emissão: {new Date(d.emitted_at).toLocaleDateString("pt-BR")} · Vigência: {new Date(d.valid_from).toLocaleDateString("pt-BR")}
                                {d.valid_until ? ` → ${new Date(d.valid_until).toLocaleDateString("pt-BR")}` : " (sem prazo)"}
                              </div>
                              {d.notes && <div className="text-xs text-muted-foreground mt-1">{d.notes}</div>}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {current && (
                                <Button variant="outline" size="sm" onClick={() => download(current)}>
                                  <Download className="h-4 w-4 mr-1" /> Baixar
                                </Button>
                              )}
                              <Button variant="outline" size="sm" onClick={() => openNewVersion(d)}>
                                <Upload className="h-4 w-4 mr-1" /> Nova versão
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => removeDocument(d)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                          {vs.length > 1 && (
                            <Accordion type="single" collapsible>
                              <AccordionItem value="hist" className="border-0">
                                <AccordionTrigger className="py-1 text-xs hover:no-underline">
                                  <div className="flex items-center gap-1 text-muted-foreground">
                                    <History className="h-3 w-3" /> Histórico ({vs.length} versões)
                                  </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                  <div className="space-y-1">
                                    {vs.map((v) => (
                                      <div key={v.id} className="flex items-center justify-between gap-2 text-xs py-1 border-b last:border-0">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <FileText className="h-3 w-3 shrink-0" />
                                          <span className="truncate">v{v.version_number} · {v.file_name}</span>
                                          {v.superseded_at && <Badge variant="secondary" className="text-[10px]">Substituído</Badge>}
                                        </div>
                                        <Button variant="ghost" size="sm" className="h-7" onClick={() => download(v)}>
                                          <Download className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    ))}
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            </Accordion>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingDoc ? `Nova versão — ${DOC_TYPE_META[editingDoc.doc_type].short}` : "Novo documento SST"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {!editingDoc && (
              <div>
                <Label>Tipo *</Label>
                <Select value={docType} onValueChange={(v) => setDocType(v as DocType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(DOC_TYPE_META) as DocType[]).map((t) => (
                      <SelectItem key={t} value={t}>{DOC_TYPE_META[t].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>CNPJ *</Label>
                <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} disabled={!!editingDoc} />
              </div>
              <div>
                <Label>Empresa *</Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} disabled={!!editingDoc} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Emissão *</Label>
                <Input type="date" value={emittedAt} onChange={(e) => setEmittedAt(e.target.value)} />
              </div>
              <div>
                <Label>Vigência início *</Label>
                <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
              </div>
              <div>
                <Label>Vigência fim</Label>
                <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Arquivo PDF *</Label>
              <Input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file && <div className="text-xs text-muted-foreground mt-1">{file.name} · {(file.size / 1024).toFixed(0)} KB</div>}
            </div>
            {!editingDoc && (
              <div>
                <Label>Observações</Label>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: escopo, responsável técnico, alteração de layout etc." />
              </div>
            )}
            {editingDoc && (
              <p className="text-xs text-warning">
                ⚠ A versão anterior (v{editingDoc.current_version}) será marcada como substituída, mas fica no histórico.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingDoc ? "Enviar nova versão" : "Cadastrar documento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={smartOpen} onOpenChange={(v) => { if (!smartConfirming) setSmartOpen(v); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> Análise automática do PDF
            </DialogTitle>
          </DialogHeader>
          {smartLoading || !smartResult ? (
            <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              A IA está lendo o documento…
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge>{smartResult.kind === "aso" ? "ASO (ficha do colaborador)" : DOC_TYPE_META[smartResult.kind as DocType]?.short ?? smartResult.kind}</Badge>
                  <span className="text-xs text-muted-foreground">confiança {(smartResult.confidence * 100).toFixed(0)}%</span>
                </div>
                {smartResult.kind === "aso" ? (
                  <>
                    <div><b>Colaborador identificado:</b>{" "}
                      {smartEmployee ? (
                        <span className="text-success">{smartEmployee.full_name}</span>
                      ) : (
                        <span className="text-destructive">
                          {smartResult.employee_name ?? "(não detectado)"} — sem correspondência no cadastro
                        </span>
                      )}
                    </div>
                    {smartResult.aso_type && <div><b>Tipo:</b> {smartResult.aso_type}</div>}
                    {smartResult.aso_result && <div><b>Resultado:</b> {smartResult.aso_result}</div>}
                    {smartResult.doctor_name && <div><b>Médico:</b> {smartResult.doctor_name}{smartResult.doctor_crm ? ` (${smartResult.doctor_crm})` : ""}</div>}
                    {smartResult.emitted_at && <div><b>Emitido:</b> {new Date(smartResult.emitted_at).toLocaleDateString("pt-BR")}</div>}
                    {smartResult.valid_until && <div><b>Validade:</b> {new Date(smartResult.valid_until).toLocaleDateString("pt-BR")}</div>}
                  </>
                ) : (
                  <>
                    {smartResult.company_name && <div><b>Empresa:</b> {smartResult.company_name}</div>}
                    {smartResult.cnpj && <div><b>CNPJ:</b> {smartResult.cnpj}</div>}
                    {smartResult.emitted_at && <div><b>Emitido:</b> {new Date(smartResult.emitted_at).toLocaleDateString("pt-BR")}</div>}
                    {smartResult.valid_from && <div><b>Vigência:</b> {new Date(smartResult.valid_from).toLocaleDateString("pt-BR")}{smartResult.valid_until ? ` → ${new Date(smartResult.valid_until).toLocaleDateString("pt-BR")}` : ""}</div>}
                    {smartResult.notes && <div className="text-muted-foreground text-xs">{smartResult.notes}</div>}
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {smartResult.kind === "aso"
                  ? "O arquivo será arquivado na pasta do colaborador e registrado como ASO/PCMSO na aba Atestados."
                  : `O documento será cadastrado em SST como ${DOC_TYPE_META[(smartResult.kind as DocType) ?? "outros"]?.short ?? "SST"}. Se já existir um do mesmo tipo/CNPJ, entra como nova versão.`}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSmartOpen(false)} disabled={smartConfirming}>Cancelar</Button>
            <Button
              onClick={confirmSmart}
              disabled={smartConfirming || smartLoading || !smartResult || (smartResult?.kind === "aso" && !smartEmployee)}
            >
              {smartConfirming && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar e arquivar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
