import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Search, Pencil, Trash2, UserCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { sortStores } from "@/lib/storeSort";

interface Freelancer {
  id: string;
  full_name: string;
  cpf: string | null;
  address: string | null;
  phone: string | null;
  pix_key: string | null;
  pix_key_type: string | null;
  notes: string | null;
  status: string;
  store_id: string | null;
  store?: { name: string } | null;
}

interface Store { id: string; name: string }

const PIX_TYPES = [
  { value: "cpf", label: "CPF" },
  { value: "email", label: "E-mail" },
  { value: "phone", label: "Celular" },
  { value: "random", label: "Chave aleatória" },
];

const empty = {
  full_name: "", cpf: "", address: "", phone: "",
  pix_key: "", pix_key_type: "", notes: "",
  status: "active", store_id: "" as string | "",
};

export default function FreelancersPanel() {
  const [items, setItems] = useState<Freelancer[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: fr, error }, { data: st }] = await Promise.all([
      supabase.from("freelancers").select("*, store:stores(name)").order("created_at", { ascending: false }),
      supabase.from("stores").select("id, name, store_type").eq("is_virtual", false).order("name"),
    ]);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    setItems((fr ?? []) as unknown as Freelancer[]);
    setStores(sortStores(st ?? []));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => { setForm({ ...empty }); setEditingId(null); };

  const openNew = () => { resetForm(); setOpen(true); };

  const openEdit = (f: Freelancer) => {
    setEditingId(f.id);
    setForm({
      full_name: f.full_name, cpf: f.cpf ?? "", address: f.address ?? "",
      phone: f.phone ?? "", pix_key: f.pix_key ?? "", pix_key_type: f.pix_key_type ?? "",
      notes: f.notes ?? "", status: f.status, store_id: f.store_id ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.full_name.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      full_name: form.full_name.trim(),
      cpf: form.cpf.trim() || null,
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      pix_key: form.pix_key.trim() || null,
      pix_key_type: form.pix_key_type || null,
      notes: form.notes.trim() || null,
      status: form.status,
      store_id: form.store_id || null,
    };
    const { error } = editingId
      ? await supabase.from("freelancers").update(payload).eq("id", editingId)
      : await supabase.from("freelancers").insert(payload as any);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editingId ? "Freelancer atualizado" : "Freelancer cadastrado" });
    setOpen(false); resetForm(); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este freelancer?")) return;
    const { error } = await supabase.from("freelancers").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Excluído" });
    load();
  };

  const filtered = items.filter((f) => !search ||
    f.full_name.toLowerCase().includes(search.toLowerCase()) ||
    f.cpf?.includes(search) ||
    f.phone?.includes(search));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4" /> Novo freelancer</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar freelancer" : "Novo freelancer"}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label>Nome completo *</Label>
                <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} maxLength={150} />
              </div>
              <div>
                <Label>CPF</Label>
                <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} maxLength={20} />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={20} />
              </div>
              <div className="md:col-span-2">
                <Label>Endereço</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={250} />
              </div>
              <div>
                <Label>Tipo de chave PIX</Label>
                <Select value={form.pix_key_type} onValueChange={(v) => setForm({ ...form, pix_key_type: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {PIX_TYPES.map((t) => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Chave PIX</Label>
                <Input value={form.pix_key} onChange={(e) => setForm({ ...form, pix_key: e.target.value })} maxLength={120} />
              </div>
              <div>
                <Label>Loja</Label>
                <Select value={form.store_id || "none"} onValueChange={(v) => setForm({ ...form, store_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Sem loja" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem loja</SelectItem>
                    {stores.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label>Observações</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={500} rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome, CPF ou telefone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>

          {loading ? (
            <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <UserCheck className="h-10 w-10 mx-auto mb-3 opacity-50" />
              {items.length === 0 ? "Nenhum freelancer cadastrado." : "Nenhum resultado encontrado."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>PIX</TableHead>
                  <TableHead>Loja</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.full_name}</TableCell>
                    <TableCell>{f.cpf ?? "—"}</TableCell>
                    <TableCell>{f.phone ?? "—"}</TableCell>
                    <TableCell>{f.pix_key ?? "—"}</TableCell>
                    <TableCell>{f.store?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={f.status === "active" ? "default" : "secondary"}>
                        {f.status === "active" ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(f)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(f.id)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
