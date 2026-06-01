import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { sortStores } from "@/lib/storeSort";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  KeyRound, Phone, Plus, Search, Eye, EyeOff, Copy, Pencil, Trash2, Tag, Tags, Mail, Globe, Building2, ExternalLink,
} from "lucide-react";

type Kind = "credential" | "contact";

type Category = { id: string; name: string; kind: Kind; sort_order: number };
type StoreOpt = { id: string; name: string };
type Credential = {
  id: string; service_name: string; username: string | null; password: string | null;
  url: string | null; notes: string | null; category_id: string | null; store_id: string | null;
  updated_at: string;
};
type Contact = {
  id: string; name: string; role_or_company: string | null; phone: string | null;
  email: string | null; notes: string | null; category_id: string | null; store_id: string | null;
  updated_at: string;
};

const copyToClipboard = async (value: string, label: string) => {
  try {
    await navigator.clipboard.writeText(value);
    toast({ title: `${label} copiado` });
  } catch {
    toast({ title: "Não foi possível copiar", variant: "destructive" });
  }
};

const Vault = () => {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Kind>("credential");
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const { data: stores = [] } = useQuery({
    queryKey: ["vault-stores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("id, name, store_type").eq("is_virtual", false).order("name");
      if (error) throw error;
      return sortStores((data ?? []) as StoreOpt[]);
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["vault-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vault_categories").select("id,name,kind,sort_order")
        .order("sort_order").order("name");
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });

  const { data: credentials = [], isLoading: loadingCred } = useQuery({
    queryKey: ["vault-credentials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vault_credentials").select("*").order("service_name");
      if (error) throw error;
      return (data ?? []) as Credential[];
    },
  });

  const { data: contacts = [], isLoading: loadingCont } = useQuery({
    queryKey: ["vault-contacts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vault_contacts").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Contact[];
    },
  });

  const credCats = useMemo(() => categories.filter((c) => c.kind === "credential"), [categories]);
  const contactCats = useMemo(() => categories.filter((c) => c.kind === "contact"), [categories]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (s: string | null | undefined) => !q || (s ?? "").toLowerCase().includes(q);
    const passStore = (sid: string | null) =>
      storeFilter === "all" ? true : storeFilter === "global" ? !sid : sid === storeFilter;
    const passCat = (cid: string | null) =>
      categoryFilter === "all" ? true : cid === categoryFilter;

    if (tab === "credential") {
      return credentials.filter((c) =>
        passStore(c.store_id) && passCat(c.category_id) &&
        (match(c.service_name) || match(c.username) || match(c.url) || match(c.notes))
      );
    }
    return contacts.filter((c) =>
      passStore(c.store_id) && passCat(c.category_id) &&
      (match(c.name) || match(c.role_or_company) || match(c.phone) || match(c.email) || match(c.notes))
    );
  }, [tab, credentials, contacts, search, storeFilter, categoryFilter]);

  // Reset filters quando troca de aba
  useEffect(() => { setCategoryFilter("all"); }, [tab]);

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["vault-credentials"] });
    qc.invalidateQueries({ queryKey: ["vault-contacts"] });
    qc.invalidateQueries({ queryKey: ["vault-categories"] });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Lock className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Cofre
        </h1>
        <p className="text-muted-foreground text-sm">
          Logins, senhas e contatos importantes das lojas em um só lugar.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Kind)}>
        <TabsList className="grid grid-cols-2 w-full sm:w-auto">
          <TabsTrigger value="credential" className="gap-2">
            <KeyRound className="h-4 w-4" /> Credenciais
          </TabsTrigger>
          <TabsTrigger value="contact" className="gap-2">
            <Phone className="h-4 w-4" /> Contatos
          </TabsTrigger>
        </TabsList>

        <Card className="mt-4">
          <CardContent className="pt-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder={tab === "credential" ? "Buscar por serviço, login, URL..." : "Buscar por nome, telefone, e-mail..."}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={storeFilter} onValueChange={setStoreFilter}>
                <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Loja" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as lojas</SelectItem>
                  <SelectItem value="global">Globais (sem loja)</SelectItem>
                  {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as categorias</SelectItem>
                  {(tab === "credential" ? credCats : contactCats).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <ManageCategoriesDialog kind={tab} categories={tab === "credential" ? credCats : contactCats} onChanged={refreshAll} />
                {tab === "credential" ? (
                  <CredentialDialog stores={stores} categories={credCats} onSaved={refreshAll}>
                    <Button className="gap-1"><Plus className="h-4 w-4" /> Nova</Button>
                  </CredentialDialog>
                ) : (
                  <ContactDialog stores={stores} categories={contactCats} onSaved={refreshAll}>
                    <Button className="gap-1"><Plus className="h-4 w-4" /> Novo</Button>
                  </ContactDialog>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <TabsContent value="credential" className="mt-4">
          {loadingCred ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : filtered.length === 0 ? (
            <EmptyState message="Nenhuma credencial encontrada." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(filtered as Credential[]).map((c) => (
                <CredentialCard
                  key={c.id} item={c}
                  category={c.category_id ? catById.get(c.category_id) : undefined}
                  storeName={c.store_id ? storeById.get(c.store_id)?.name : undefined}
                  stores={stores} categories={credCats} onChanged={refreshAll}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="contact" className="mt-4">
          {loadingCont ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : filtered.length === 0 ? (
            <EmptyState message="Nenhum contato encontrado." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(filtered as Contact[]).map((c) => (
                <ContactCard
                  key={c.id} item={c}
                  category={c.category_id ? catById.get(c.category_id) : undefined}
                  storeName={c.store_id ? storeById.get(c.store_id)?.name : undefined}
                  stores={stores} categories={contactCats} onChanged={refreshAll}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

const EmptyState = ({ message }: { message: string }) => (
  <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{message}</CardContent></Card>
);

/* ---------- Credential Card ---------- */
const CredentialCard = ({
  item, category, storeName, stores, categories, onChanged,
}: {
  item: Credential; category?: Category; storeName?: string;
  stores: StoreOpt[]; categories: Category[]; onChanged: () => void;
}) => {
  const [show, setShow] = useState(false);

  const handleDelete = async () => {
    const { error } = await supabase.from("vault_credentials").delete().eq("id", item.id);
    if (error) return toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    toast({ title: "Credencial excluída" });
    onChanged();
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-tight break-words">{item.service_name}</CardTitle>
          <div className="flex gap-1 shrink-0">
            <CredentialDialog initial={item} stores={stores} categories={categories} onSaved={onChanged}>
              <Button size="icon" variant="ghost" className="h-8 w-8"><Pencil className="h-4 w-4" /></Button>
            </CredentialDialog>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir credencial?</AlertDialogTitle>
                  <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {category && <Badge variant="secondary" className="gap-1"><Tag className="h-3 w-3" />{category.name}</Badge>}
          {storeName ? (
            <Badge variant="outline" className="gap-1"><Building2 className="h-3 w-3" />{storeName}</Badge>
          ) : (
            <Badge variant="outline">Global</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm flex-1">
        {item.username && (
          <FieldRow label="Login" value={item.username} onCopy={() => copyToClipboard(item.username!, "Login")} />
        )}
        {item.password && (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Senha</p>
              <p className="font-mono break-all">{show ? item.password : "•".repeat(Math.min(item.password.length, 12))}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShow((v) => !v)} aria-label="Alternar visibilidade">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyToClipboard(item.password!, "Senha")} aria-label="Copiar senha">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        {item.url && (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">URL</p>
              <a href={item.url.startsWith("http") ? item.url : `https://${item.url}`}
                 target="_blank" rel="noreferrer"
                 className="text-primary hover:underline break-all inline-flex items-center gap-1">
                <Globe className="h-3 w-3 shrink-0" />{item.url}<ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            </div>
          </div>
        )}
        {item.notes && (
          <div>
            <p className="text-xs text-muted-foreground">Observações</p>
            <p className="whitespace-pre-wrap break-words">{item.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const FieldRow = ({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) => (
  <div className="flex items-center justify-between gap-2">
    <div className="min-w-0 flex-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-all">{value}</p>
    </div>
    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={onCopy} aria-label={`Copiar ${label}`}>
      <Copy className="h-4 w-4" />
    </Button>
  </div>
);

/* ---------- Contact Card ---------- */
const ContactCard = ({
  item, category, storeName, stores, categories, onChanged,
}: {
  item: Contact; category?: Category; storeName?: string;
  stores: StoreOpt[]; categories: Category[]; onChanged: () => void;
}) => {
  const handleDelete = async () => {
    const { error } = await supabase.from("vault_contacts").delete().eq("id", item.id);
    if (error) return toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    toast({ title: "Contato excluído" });
    onChanged();
  };

  const phoneClean = item.phone?.replace(/\D/g, "");

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base leading-tight break-words">{item.name}</CardTitle>
            {item.role_or_company && (
              <p className="text-xs text-muted-foreground mt-0.5 break-words">{item.role_or_company}</p>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            <ContactDialog initial={item} stores={stores} categories={categories} onSaved={onChanged}>
              <Button size="icon" variant="ghost" className="h-8 w-8"><Pencil className="h-4 w-4" /></Button>
            </ContactDialog>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir contato?</AlertDialogTitle>
                  <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {category && <Badge variant="secondary" className="gap-1"><Tag className="h-3 w-3" />{category.name}</Badge>}
          {storeName ? (
            <Badge variant="outline" className="gap-1"><Building2 className="h-3 w-3" />{storeName}</Badge>
          ) : (
            <Badge variant="outline">Global</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm flex-1">
        {item.phone && (
          <div className="flex items-center justify-between gap-2">
            <a href={`tel:${phoneClean}`} className="text-primary hover:underline inline-flex items-center gap-1 break-all">
              <Phone className="h-3 w-3 shrink-0" />{item.phone}
            </a>
            <div className="flex gap-1 shrink-0">
              {phoneClean && (
                <a href={`https://wa.me/${phoneClean}`} target="_blank" rel="noreferrer">
                  <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="WhatsApp">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </a>
              )}
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyToClipboard(item.phone!, "Telefone")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        {item.email && (
          <div className="flex items-center justify-between gap-2">
            <a href={`mailto:${item.email}`} className="text-primary hover:underline inline-flex items-center gap-1 break-all">
              <Mail className="h-3 w-3 shrink-0" />{item.email}
            </a>
            <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => copyToClipboard(item.email!, "E-mail")}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        )}
        {item.notes && (
          <div>
            <p className="text-xs text-muted-foreground">Observações</p>
            <p className="whitespace-pre-wrap break-words">{item.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/* ---------- Credential Dialog ---------- */
const CredentialDialog = ({
  initial, stores, categories, onSaved, children,
}: {
  initial?: Credential; stores: StoreOpt[]; categories: Category[];
  onSaved: () => void; children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    service_name: "", username: "", password: "", url: "", notes: "",
    category_id: "none", store_id: "global",
  });
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        service_name: initial?.service_name ?? "",
        username: initial?.username ?? "",
        password: initial?.password ?? "",
        url: initial?.url ?? "",
        notes: initial?.notes ?? "",
        category_id: initial?.category_id ?? "none",
        store_id: initial?.store_id ?? "global",
      });
      setShowPwd(false);
    }
  }, [open, initial]);

  const handleSave = async () => {
    if (!form.service_name.trim()) {
      toast({ title: "Informe o nome do serviço", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      service_name: form.service_name.trim(),
      username: form.username.trim() || null,
      password: form.password || null,
      url: form.url.trim() || null,
      notes: form.notes.trim() || null,
      category_id: form.category_id === "none" ? null : form.category_id,
      store_id: form.store_id === "global" ? null : form.store_id,
    };
    const res = initial
      ? await supabase.from("vault_credentials").update({ ...payload, updated_by: user?.id }).eq("id", initial.id)
      : await supabase.from("vault_credentials").insert({ ...payload, created_by: user?.id, updated_by: user?.id });
    setSaving(false);
    if (res.error) return toast({ title: "Erro ao salvar", description: res.error.message, variant: "destructive" });
    toast({ title: initial ? "Credencial atualizada" : "Credencial criada" });
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar credencial" : "Nova credencial"}</DialogTitle>
          <DialogDescription>Salve um login/senha vinculado a uma loja ou global.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Serviço *</Label>
            <Input value={form.service_name} onChange={(e) => setForm({ ...form, service_name: e.target.value })} placeholder="Ex: Wi-Fi loja Centro" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Login / Usuário</Label>
              <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </div>
            <div>
              <Label>Senha</Label>
              <div className="relative">
                <Input
                  type={showPwd ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="pr-9"
                />
                <Button type="button" size="icon" variant="ghost" className="absolute right-0 top-0 h-10 w-9"
                        onClick={() => setShowPwd((v) => !v)}>
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
          <div>
            <Label>URL</Label>
            <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem categoria</SelectItem>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Loja</Label>
              <Select value={form.store_id} onValueChange={(v) => setForm({ ...form, store_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global (sem loja)</SelectItem>
                  {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ---------- Contact Dialog ---------- */
const ContactDialog = ({
  initial, stores, categories, onSaved, children,
}: {
  initial?: Contact; stores: StoreOpt[]; categories: Category[];
  onSaved: () => void; children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", role_or_company: "", phone: "", email: "", notes: "",
    category_id: "none", store_id: "global",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        name: initial?.name ?? "",
        role_or_company: initial?.role_or_company ?? "",
        phone: initial?.phone ?? "",
        email: initial?.email ?? "",
        notes: initial?.notes ?? "",
        category_id: initial?.category_id ?? "none",
        store_id: initial?.store_id ?? "global",
      });
    }
  }, [open, initial]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Informe o nome", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      name: form.name.trim(),
      role_or_company: form.role_or_company.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      notes: form.notes.trim() || null,
      category_id: form.category_id === "none" ? null : form.category_id,
      store_id: form.store_id === "global" ? null : form.store_id,
    };
    const res = initial
      ? await supabase.from("vault_contacts").update({ ...payload, updated_by: user?.id }).eq("id", initial.id)
      : await supabase.from("vault_contacts").insert({ ...payload, created_by: user?.id, updated_by: user?.id });
    setSaving(false);
    if (res.error) return toast({ title: "Erro ao salvar", description: res.error.message, variant: "destructive" });
    toast({ title: initial ? "Contato atualizado" : "Contato criado" });
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar contato" : "Novo contato"}</DialogTitle>
          <DialogDescription>Cadastre um contato importante (fornecedor, manutenção, etc.).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Função / Empresa</Label>
            <Input value={form.role_or_company} onChange={(e) => setForm({ ...form, role_or_company: e.target.value })}
                   placeholder="Ex: Eletricista - Pedro Silva" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(11) 9..." />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem categoria</SelectItem>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Loja</Label>
              <Select value={form.store_id} onValueChange={(v) => setForm({ ...form, store_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global (sem loja)</SelectItem>
                  {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ---------- Manage categories ---------- */
const ManageCategoriesDialog = ({
  kind, categories, onChanged,
}: { kind: Kind; categories: Category[]; onChanged: () => void }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const add = async () => {
    if (!name.trim()) return;
    const sort = (categories[categories.length - 1]?.sort_order ?? 0) + 1;
    const { error } = await supabase.from("vault_categories").insert({
      name: name.trim(), kind, sort_order: sort,
    });
    if (error) return toast({ title: "Erro ao adicionar", description: error.message, variant: "destructive" });
    setName("");
    onChanged();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("vault_categories").delete().eq("id", id);
    if (error) return toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-1"><Tags className="h-4 w-4" /> Categorias</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Categorias de {kind === "credential" ? "credenciais" : "contatos"}</DialogTitle>
          <DialogDescription>Crie ou remova categorias usadas para organizar seus registros.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova categoria"
                   onKeyDown={(e) => e.key === "Enter" && add()} />
            <Button onClick={add}><Plus className="h-4 w-4" /></Button>
          </div>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {categories.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma categoria.</p>}
            {categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="text-sm">{c.name}</span>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove(c.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default Vault;
