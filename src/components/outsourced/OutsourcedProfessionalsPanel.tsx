import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, Pencil, Trash2, FileText, Upload, UserCog, Store, Mail } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { sortStores } from "@/lib/storeSort";

interface Professional {
  id: string;
  full_name: string | null;
  cpf: string | null;
  rg: string | null;
  phone: string | null;
  email: string | null;
  role_title: string | null;
  specialty: string | null;
  professional_license: string | null;
  company_id: string | null;
  user_id: string | null;
  is_nutritionist: boolean;
  status: string;
  notes: string | null;
}

interface CompanyOpt { id: string; legal_name: string | null; trade_name: string | null; }
interface StoreOpt { id: string; name: string; parent_store_id: string | null; }
interface DocRow { id: string; doc_type: string; file_name: string; file_path: string; uploaded_at: string; }

const empty: Partial<Professional> = {
  full_name: "", cpf: "", rg: "", phone: "", email: "",
  role_title: "", specialty: "", professional_license: "",
  company_id: null, user_id: null, is_nutritionist: false,
  status: "active", notes: "",
};

export default function OutsourcedProfessionalsPanel() {
  const [list, setList] = useState<Professional[]>([]);
  const [companies, setCompanies] = useState<CompanyOpt[]>([]);
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [linkedStores, setLinkedStores] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Professional | null>(null);
  const [form, setForm] = useState<Partial<Professional>>(empty);
  const [selStores, setSelStores] = useState<Set<string>>(new Set());
  const [docsOpen, setDocsOpen] = useState<Professional | null>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingContract, setUploadingContract] = useState(false);
  const [accessOpen, setAccessOpen] = useState<Professional | null>(null);
  const [accessForm, setAccessForm] = useState({ email: "", password: "", grant_nutritionist: true });
  const [creatingAccess, setCreatingAccess] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: profs }, { data: comps }, { data: sto }, { data: links }] = await Promise.all([
      supabase.from("outsourced_professionals").select("*").order("created_at", { ascending: false }),
      supabase.from("outsourced_companies").select("id, legal_name, trade_name").order("trade_name"),
      supabase.from("stores").select("id, name, parent_store_id, store_type").eq("is_virtual", false).order("name"),
      supabase.from("outsourced_professional_stores").select("professional_id, store_id"),
    ]);
    setList((profs ?? []) as Professional[]);
    setCompanies((comps ?? []) as CompanyOpt[]);
    setStores(sortStores((sto ?? []) as StoreOpt[]));
    const map: Record<string, string[]> = {};
    (links ?? []).forEach((l: any) => {
      map[l.professional_id] = [...(map[l.professional_id] ?? []), l.store_id];
    });
    setLinkedStores(map);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const startNew = () => { setEditing(null); setForm(empty); setSelStores(new Set()); setOpen(true); };
  const startEdit = (p: Professional) => {
    setEditing(p);
    setForm(p);
    setSelStores(new Set(linkedStores[p.id] ?? []));
    setOpen(true);
  };

  const save = async () => {
    const payload: any = { ...form };
    payload.company_id = payload.company_id || null;

    let id = editing?.id;
    if (editing) {
      const { error } = await supabase.from("outsourced_professionals").update(payload).eq("id", editing.id);
      if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      const { data, error } = await supabase.from("outsourced_professionals").insert(payload).select("id").single();
      if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
      id = data.id;
    }

    // Sincroniza vínculos com lojas
    if (id) {
      await supabase.from("outsourced_professional_stores").delete().eq("professional_id", id);
      if (selStores.size > 0) {
        const rows = Array.from(selStores).map((sid) => ({ professional_id: id!, store_id: sid }));
        await supabase.from("outsourced_professional_stores").insert(rows);
      }
    }

    toast({ title: editing ? "Profissional atualizado" : "Profissional cadastrado" });
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este profissional terceirizado?")) return;
    const { error } = await supabase.from("outsourced_professionals").delete().eq("id", id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Profissional removido" });
    load();
  };

  const openDocs = async (p: Professional) => {
    setDocsOpen(p);
    const { data } = await supabase
      .from("outsourced_documents")
      .select("id, doc_type, file_name, file_path, uploaded_at")
      .eq("professional_id", p.id)
      .order("uploaded_at", { ascending: false });
    setDocs((data ?? []) as DocRow[]);
  };

  const uploadDoc = async () => {
    if (!file || !docsOpen) return;
    setUploading(true);
    const path = `professionals/${docsOpen.id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("outsourced-contracts").upload(path, file);
    if (upErr) { setUploading(false); return toast({ title: "Erro", description: upErr.message, variant: "destructive" }); }
    const { error } = await supabase.from("outsourced_documents").insert({
      professional_id: docsOpen.id,
      doc_type: "contract",
      file_name: file.name,
      file_path: path,
      mime_type: file.type,
      size_bytes: file.size,
    });
    setUploading(false);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    setFile(null);
    openDocs(docsOpen);
    toast({ title: "Documento enviado" });
  };

  const downloadDoc = async (d: DocRow) => {
    const { data } = await supabase.storage.from("outsourced-contracts").createSignedUrl(d.file_path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const removeDoc = async (d: DocRow) => {
    if (!confirm("Excluir documento?")) return;
    await supabase.storage.from("outsourced-contracts").remove([d.file_path]);
    await supabase.from("outsourced_documents").delete().eq("id", d.id);
    if (docsOpen) openDocs(docsOpen);
  };

  const openAccess = (p: Professional) => {
    setAccessOpen(p);
    setAccessForm({ email: p.email ?? "", password: "", grant_nutritionist: !!p.is_nutritionist });
  };

  const createAccess = async () => {
    if (!accessOpen) return;
    if (!accessForm.email) {
      return toast({ title: "Preencha o e-mail", variant: "destructive" });
    }
    setCreatingAccess(true);

    // 1) Tenta localizar usuário já existente pelo e-mail (ex.: colaborador interno
    //    que já possui login). Isso evita criar um auth user duplicado e atribuir
    //    a role de nutricionista ao user_id errado (bug observado com a Raquel).
    let userId: string | null = null;

    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("user_id")
      .ilike("email", accessForm.email)
      .maybeSingle();
    if (existingProfile?.user_id) userId = existingProfile.user_id;

    if (!userId) {
      const { data: existingEmp } = await supabase
        .from("employees")
        .select("user_id")
        .ilike("email", accessForm.email)
        .not("user_id", "is", null)
        .maybeSingle();
      if (existingEmp?.user_id) userId = existingEmp.user_id;
    }

    // 2) Se não existe, cria novo auth user (signUp exige senha).
    if (!userId) {
      if (!accessForm.password) {
        setCreatingAccess(false);
        return toast({ title: "Defina uma senha para o novo acesso", variant: "destructive" });
      }
      const { data, error } = await supabase.auth.signUp({
        email: accessForm.email,
        password: accessForm.password,
        options: { data: { full_name: accessOpen.full_name } },
      });
      if (error || !data.user) {
        setCreatingAccess(false);
        return toast({ title: "Erro ao criar acesso", description: error?.message ?? "Falha", variant: "destructive" });
      }
      userId = data.user.id;
    }

    // 3) Vincula user_id ao profissional terceirizado.
    await supabase.from("outsourced_professionals").update({
      user_id: userId,
      email: accessForm.email,
      is_nutritionist: accessForm.grant_nutritionist || accessOpen.is_nutritionist,
    }).eq("id", accessOpen.id);

    // 4) Garante a role 'nutritionist' (idempotente) no user_id correto.
    if (accessForm.grant_nutritionist) {
      await supabase
        .from("user_roles")
        .upsert({ user_id: userId, role: "nutritionist" as any }, { onConflict: "user_id,role" });
    }
    setCreatingAccess(false);
    setAccessOpen(null);
    toast({
      title: "Acesso configurado",
      description: existingProfile?.user_id
        ? "Usuário existente vinculado e role de nutricionista garantida."
        : "Conta criada e role de nutricionista atribuída.",
    });
    load();
  };

  const toggleStore = (id: string) => {
    setSelStores((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const companyName = (id: string | null) => {
    if (!id) return "—";
    const c = companies.find((x) => x.id === id);
    return c?.trade_name || c?.legal_name || "—";
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div className="text-sm text-muted-foreground">{list.length} profissional(is) cadastrado(s)</div>
        <Button onClick={startNew}><Plus className="h-4 w-4" /> Novo profissional</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : list.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <UserCog className="h-10 w-10 mx-auto mb-3 opacity-50" />
              Nenhum profissional terceirizado cadastrado.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Lojas</TableHead>
                  <TableHead>Acesso</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium flex items-center gap-2">
                        {p.full_name || "—"}
                        {p.is_nutritionist && <Badge variant="outline" className="text-[10px]">Nutricionista</Badge>}
                      </div>
                      {p.professional_license && (
                        <div className="text-xs text-muted-foreground">Reg.: {p.professional_license}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.role_title || "—"}
                      {p.specialty && <div className="text-xs text-muted-foreground">{p.specialty}</div>}
                    </TableCell>
                    <TableCell className="text-sm">{companyName(p.company_id)}</TableCell>
                    <TableCell className="text-sm">
                      <Badge variant="secondary">{(linkedStores[p.id] ?? []).length}</Badge>
                    </TableCell>
                    <TableCell>
                      {p.user_id ? (
                        <Badge variant="default" className="text-[10px]">Ativo</Badge>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => openAccess(p)} className="h-7 text-xs">
                          <Mail className="h-3 w-3" /> Criar acesso
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.status === "active" ? "default" : "secondary"}>
                        {p.status === "active" ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openDocs(p)} title="Documentos">
                        <FileText className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => startEdit(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(p.id)}>
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar profissional terceirizado" : "Novo profissional terceirizado"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2"><Label>Nome completo</Label><Input value={form.full_name ?? ""} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div><Label>CPF</Label><Input value={form.cpf ?? ""} onChange={(e) => setForm({ ...form, cpf: e.target.value })} /></div>
            <div><Label>RG</Label><Input value={form.rg ?? ""} onChange={(e) => setForm({ ...form, rg: e.target.value })} /></div>
            <div><Label>Telefone</Label><Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>E-mail</Label><Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Função</Label><Input value={form.role_title ?? ""} onChange={(e) => setForm({ ...form, role_title: e.target.value })} placeholder="Ex: Nutricionista" /></div>
            <div><Label>Especialidade</Label><Input value={form.specialty ?? ""} onChange={(e) => setForm({ ...form, specialty: e.target.value })} /></div>
            <div><Label>Registro de classe</Label><Input value={form.professional_license ?? ""} onChange={(e) => setForm({ ...form, professional_license: e.target.value })} placeholder="Ex: CRN 12345" /></div>
            <div><Label>Empresa vinculada</Label>
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.company_id ?? ""} onChange={(e) => setForm({ ...form, company_id: e.target.value || null })}>
                <option value="">— Nenhuma —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.trade_name || c.legal_name}</option>
                ))}
              </select>
            </div>
            <div><Label>Status</Label>
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.status ?? "active"} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox id="is_nutri" checked={!!form.is_nutritionist} onCheckedChange={(v) => setForm({ ...form, is_nutritionist: !!v })} />
              <Label htmlFor="is_nutri" className="cursor-pointer">É nutricionista (acessa NutriControle e Infrações das lojas vinculadas)</Label>
            </div>
            <div className="sm:col-span-2"><Label>Observações</Label><Textarea value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>

            <div className="sm:col-span-2">
              <Label className="flex items-center gap-2 mb-2"><Store className="h-4 w-4" /> Lojas atendidas</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border border-border rounded-md p-3 max-h-48 overflow-y-auto">
                {stores.map((s) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <Checkbox id={`store_${s.id}`} checked={selStores.has(s.id)} onCheckedChange={() => toggleStore(s.id)} />
                    <Label htmlFor={`store_${s.id}`} className="cursor-pointer text-sm font-normal">{s.name}</Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="flex justify-between items-center gap-2">
            <div className="flex items-center gap-2">
              <Input
                type="file"
                id="contract-upload"
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={(e) => setContractFile(e.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!editing || uploadingContract}
                onClick={() => document.getElementById('contract-upload')?.click()}
              >
                <FileText className="h-4 w-4 mr-1" />
                {contractFile ? contractFile.name.slice(0, 20) + (contractFile.name.length > 20 ? '...' : '') : 'Anexar contrato'}
              </Button>
              {contractFile && editing && (
                <Button
                  type="button"
                  size="sm"
                  disabled={uploadingContract}
                  onClick={async () => {
                    if (!contractFile || !editing) return;
                    setUploadingContract(true);
                    const path = `professionals/${editing.id}/contracts/${Date.now()}-${contractFile.name}`;
                    const { error: upErr } = await supabase.storage.from("outsourced-contracts").upload(path, contractFile);
                    if (upErr) {
                      setUploadingContract(false);
                      return toast({ title: "Erro", description: upErr.message, variant: "destructive" });
                    }
                    const { error } = await supabase.from("outsourced_documents").insert({
                      professional_id: editing.id,
                      doc_type: "contract",
                      file_name: contractFile.name,
                      file_path: path,
                      mime_type: contractFile.type,
                      size_bytes: contractFile.size,
                    });
                    setUploadingContract(false);
                    setContractFile(null);
                    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
                    toast({ title: "Contrato enviado" });
                  }}
                >
                  {uploadingContract ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Enviar
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setOpen(false); setContractFile(null); }}>Cancelar</Button>
              <Button onClick={save}>Salvar</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!docsOpen} onOpenChange={(o) => !o && setDocsOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Documentos — {docsOpen?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label>Anexar contrato/documento (PDF/imagem)</Label>
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

      <Dialog open={!!accessOpen} onOpenChange={(o) => !o && setAccessOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Criar acesso ao sistema</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Define email e senha para o profissional acessar o sistema. Se for nutricionista, terá acesso ao NutriControle e Infrações das lojas vinculadas.
            </p>
            <div><Label>E-mail</Label><Input type="email" value={accessForm.email} onChange={(e) => setAccessForm({ ...accessForm, email: e.target.value })} /></div>
            <div><Label>Senha temporária</Label><Input type="text" value={accessForm.password} onChange={(e) => setAccessForm({ ...accessForm, password: e.target.value })} placeholder="Mínimo 6 caracteres" /></div>
            <div className="flex items-center gap-2">
              <Checkbox id="grant_nutri" checked={accessForm.grant_nutritionist} onCheckedChange={(v) => setAccessForm({ ...accessForm, grant_nutritionist: !!v })} />
              <Label htmlFor="grant_nutri" className="cursor-pointer text-sm font-normal">Conceder permissão de nutricionista</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccessOpen(null)}>Cancelar</Button>
            <Button onClick={createAccess} disabled={creatingAccess}>
              {creatingAccess && <Loader2 className="h-4 w-4 animate-spin" />} Criar acesso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
