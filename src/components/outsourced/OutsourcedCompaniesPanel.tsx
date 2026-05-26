import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, Pencil, Trash2, FileText, Upload, Building2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Company {
  id: string;
  legal_name: string | null;
  trade_name: string | null;
  cnpj: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  service_area: string | null;
  contact_name: string | null;
  contact_role: string | null;
  contact_phone: string | null;
  contract_start: string | null;
  contract_end: string | null;
  monthly_value: number | null;
  status: string;
  notes: string | null;
}

interface DocRow {
  id: string;
  doc_type: string;
  file_name: string;
  file_path: string;
  uploaded_at: string;
}

const empty: Partial<Company> = {
  legal_name: "",
  trade_name: "",
  cnpj: "",
  phone: "",
  email: "",
  address: "",
  service_area: "",
  contact_name: "",
  contact_role: "",
  contact_phone: "",
  contract_start: null,
  contract_end: null,
  monthly_value: null,
  status: "active",
  notes: "",
};

export default function OutsourcedCompaniesPanel() {
  const [list, setList] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState<Partial<Company>>(empty);
  const [docsOpen, setDocsOpen] = useState<Company | null>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("outsourced_companies")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    setList((data ?? []) as Company[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const startNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const startEdit = (c: Company) => { setEditing(c); setForm(c); setOpen(true); };

  const save = async () => {
    const payload: any = { ...form };
    payload.monthly_value = payload.monthly_value === "" || payload.monthly_value === null ? null : Number(payload.monthly_value);
    payload.contract_start = payload.contract_start || null;
    payload.contract_end = payload.contract_end || null;

    if (editing) {
      const { error } = await supabase.from("outsourced_companies").update(payload).eq("id", editing.id);
      if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      const { error } = await supabase.from("outsourced_companies").insert(payload);
      if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
    toast({ title: editing ? "Empresa atualizada" : "Empresa cadastrada" });
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta empresa terceirizada?")) return;
    const { error } = await supabase.from("outsourced_companies").delete().eq("id", id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Empresa removida" });
    load();
  };

  const openDocs = async (c: Company) => {
    setDocsOpen(c);
    const { data } = await supabase
      .from("outsourced_documents")
      .select("id, doc_type, file_name, file_path, uploaded_at")
      .eq("company_id", c.id)
      .order("uploaded_at", { ascending: false });
    setDocs((data ?? []) as DocRow[]);
  };

  const uploadDoc = async () => {
    if (!file || !docsOpen) return;
    setUploading(true);
    const path = `companies/${docsOpen.id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("outsourced-contracts").upload(path, file);
    if (upErr) {
      setUploading(false);
      return toast({ title: "Erro no upload", description: upErr.message, variant: "destructive" });
    }
    const { error: dbErr } = await supabase.from("outsourced_documents").insert({
      company_id: docsOpen.id,
      doc_type: "contract",
      file_name: file.name,
      file_path: path,
      mime_type: file.type,
      size_bytes: file.size,
    });
    setUploading(false);
    if (dbErr) return toast({ title: "Erro", description: dbErr.message, variant: "destructive" });
    setFile(null);
    openDocs(docsOpen);
    toast({ title: "Contrato enviado" });
  };

  const downloadDoc = async (d: DocRow) => {
    const { data } = await supabase.storage.from("outsourced-contracts").createSignedUrl(d.file_path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const removeDoc = async (d: DocRow) => {
    if (!confirm("Excluir este documento?")) return;
    await supabase.storage.from("outsourced-contracts").remove([d.file_path]);
    await supabase.from("outsourced_documents").delete().eq("id", d.id);
    if (docsOpen) openDocs(docsOpen);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div className="text-sm text-muted-foreground">{list.length} empresa(s) cadastrada(s)</div>
        <Button onClick={startNew}><Plus className="h-4 w-4" /> Nova empresa</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : list.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Building2 className="h-10 w-10 mx-auto mb-3 opacity-50" />
              Nenhuma empresa terceirizada cadastrada.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Vigência</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium">{c.trade_name || c.legal_name || "—"}</div>
                      {c.legal_name && c.trade_name && (
                        <div className="text-xs text-muted-foreground">{c.legal_name}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{c.cnpj || "—"}</TableCell>
                    <TableCell className="text-sm">{c.service_area || "—"}</TableCell>
                    <TableCell className="text-sm">
                      {c.contract_start ? new Date(c.contract_start).toLocaleDateString("pt-BR") : "—"}
                      {c.contract_end ? ` → ${new Date(c.contract_end).toLocaleDateString("pt-BR")}` : ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.status === "active" ? "default" : "secondary"}>
                        {c.status === "active" ? "Ativa" : "Encerrada"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openDocs(c)} title="Documentos">
                        <FileText className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => startEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(c.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar empresa terceirizada" : "Nova empresa terceirizada"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label>Razão social</Label><Input value={form.legal_name ?? ""} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} /></div>
            <div><Label>Nome fantasia</Label><Input value={form.trade_name ?? ""} onChange={(e) => setForm({ ...form, trade_name: e.target.value })} /></div>
            <div><Label>CNPJ</Label><Input value={form.cnpj ?? ""} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} /></div>
            <div><Label>Área de atuação</Label><Input value={form.service_area ?? ""} onChange={(e) => setForm({ ...form, service_area: e.target.value })} placeholder="Ex: Nutrição, Limpeza" /></div>
            <div><Label>Telefone</Label><Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>E-mail</Label><Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Endereço</Label><Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div><Label>Responsável (nome)</Label><Input value={form.contact_name ?? ""} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></div>
            <div><Label>Cargo do responsável</Label><Input value={form.contact_role ?? ""} onChange={(e) => setForm({ ...form, contact_role: e.target.value })} /></div>
            <div><Label>Telefone do responsável</Label><Input value={form.contact_phone ?? ""} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></div>
            <div><Label>Status</Label>
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.status ?? "active"} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">Ativa</option>
                <option value="ended">Encerrada</option>
              </select>
            </div>
            <div><Label>Início do contrato</Label><Input type="date" value={form.contract_start ?? ""} onChange={(e) => setForm({ ...form, contract_start: e.target.value })} /></div>
            <div><Label>Fim do contrato</Label><Input type="date" value={form.contract_end ?? ""} onChange={(e) => setForm({ ...form, contract_end: e.target.value })} /></div>
            <div><Label>Valor mensal (R$)</Label><Input type="number" step="0.01" value={form.monthly_value ?? ""} onChange={(e) => setForm({ ...form, monthly_value: e.target.value as any })} /></div>
            <div className="sm:col-span-2"><Label>Observações</Label><Textarea value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!docsOpen} onOpenChange={(o) => !o && setDocsOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Contratos — {docsOpen?.trade_name || docsOpen?.legal_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label>Anexar contrato (PDF/imagem)</Label>
                <Input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
              <Button onClick={uploadDoc} disabled={!file || uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Enviar
              </Button>
            </div>
            <div className="space-y-1.5">
              {docs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum documento enviado.</p>
              ) : docs.map((d) => (
                <div key={d.id} className="flex items-center gap-2 bg-muted/40 rounded-md px-3 py-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="text-sm flex-1 truncate">{d.file_name}</span>
                  <span className="text-xs text-muted-foreground">{new Date(d.uploaded_at).toLocaleDateString("pt-BR")}</span>
                  <Button variant="ghost" size="sm" onClick={() => downloadDoc(d)}>Abrir</Button>
                  <Button variant="ghost" size="icon" onClick={() => removeDoc(d)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
