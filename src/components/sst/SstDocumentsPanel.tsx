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
  useEffect(() => {
    const handler = () => load();
    window.addEventListener("sst-docs-changed", handler);
    return () => window.removeEventListener("sst-docs-changed", handler);
  }, []);

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

  // Smart upload was moved to page-level (see SstSmartUploadButton).

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

    </div>
  );
}
