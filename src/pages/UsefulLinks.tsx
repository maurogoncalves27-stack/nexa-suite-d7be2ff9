import { useEffect, useState } from "react";
import { Link2, Plus, Pencil, Trash2, ExternalLink, Star, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

type LinkRow = {
  id: string;
  user_id: string;
  title: string;
  url: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_shared: boolean;
};

type FormState = {
  id?: string;
  title: string;
  url: string;
  is_shared: boolean;
};

const emptyForm: FormState = { title: "", url: "", is_shared: false };

const normalizeUrl = (u: string) => /^https?:\/\//i.test(u) ? u : `https://${u}`;

const faviconFor = (url: string) => {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  } catch {
    return "";
  }
};

export default function UsefulLinks() {
  const { user } = useAuth();
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("user_useful_links")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
    setLinks((data ?? []) as LinkRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(emptyForm); setOpen(true); };
  const openEdit = (l: LinkRow) => {
    setForm({ id: l.id, title: l.title, url: l.url, is_shared: l.is_shared });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!form.title.trim() || !form.url.trim()) {
      toast({ title: "Preencha nome e URL", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      url: normalizeUrl(form.url.trim()),
      description: null,
      is_shared: form.is_shared,
      user_id: user.id,
    };
    const { error } = form.id
      ? await supabase.from("user_useful_links").update(payload).eq("id", form.id)
      : await supabase.from("user_useful_links").insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Link salvo" });
    setOpen(false);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este link?")) return;
    const { error } = await supabase.from("user_useful_links").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Link excluído" });
    load();
  };

  const myLinks = links.filter(l => l.user_id === user?.id);
  const sharedLinks = links.filter(l => l.user_id !== user?.id && l.is_shared);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Link2 className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            Links úteis
          </h1>
          <p className="text-muted-foreground">
            Salve atalhos para sites e ferramentas que você usa no dia a dia. O ícone do site é incluído automaticamente.
          </p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Novo link
        </Button>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <Star className="h-4 w-4" /> Meus favoritos
        </h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : myLinks.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
            Você ainda não salvou nenhum link. Clique em <strong>Novo link</strong> para começar.
          </CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {myLinks.map(l => (
              <LinkCard key={l.id} link={l} onEdit={() => openEdit(l)} onDelete={() => handleDelete(l.id)} editable />
            ))}
          </div>
        )}
      </section>

      {sharedLinks.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Globe className="h-4 w-4" /> Compartilhados pela equipe
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sharedLinks.map(l => (
              <LinkCard key={l.id} link={l} />
            ))}
          </div>
        </section>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar link" : "Novo link"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="url">URL</Label>
              <Input
                id="url"
                value={form.url}
                onChange={e => setForm({ ...form, url: e.target.value })}
                placeholder="exemplo.com.br"
              />
              {form.url && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                  <img src={faviconFor(normalizeUrl(form.url))} alt="" className="w-4 h-4 rounded-sm" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
                  Ícone detectado automaticamente
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="title">Nome</Label>
              <Input id="title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Painel iFood" />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="shared" className="cursor-pointer">Compartilhar com a equipe</Label>
                <p className="text-xs text-muted-foreground">Outros usuários verão este link.</p>
              </div>
              <Switch id="shared" checked={form.is_shared} onCheckedChange={v => setForm({ ...form, is_shared: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LinkCard({ link, onEdit, onDelete, editable }: { link: LinkRow; onEdit?: () => void; onDelete?: () => void; editable?: boolean }) {
  let host = "";
  try { host = new URL(link.url).hostname.replace(/^www\./, ""); } catch { host = link.url; }
  const favicon = faviconFor(link.url);
  return (
    <Card className="group hover:border-primary/50 transition-colors">
      <CardContent className="p-3 flex items-center gap-3">
        <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center shrink-0 overflow-hidden">
            {favicon ? (
              <img
                src={favicon}
                alt=""
                className="w-6 h-6"
                onError={(e) => {
                  const img = e.currentTarget as HTMLImageElement;
                  img.style.display = "none";
                  img.parentElement!.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
                }}
              />
            ) : (
              <Link2 className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold flex items-center gap-1.5 hover:text-primary truncate">
              <span className="truncate">{link.title}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60" />
            </div>
            <div className="text-xs text-muted-foreground truncate">{host}</div>
          </div>
        </a>
        {link.is_shared && <Badge variant="secondary" className="shrink-0 text-[10px]">Compart.</Badge>}
        {editable && (
          <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onEdit}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={onDelete}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
