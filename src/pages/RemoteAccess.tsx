import { useEffect, useMemo, useState } from "react";
import { Monitor, Plus, Pencil, Trash2, Copy, ExternalLink, Eye, EyeOff, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Store { id: string; name: string; }
interface Machine {
  id: string;
  store_id: string | null;
  label: string;
  machine_type: string;
  tool: string;
  remote_id: string;
  password: string | null;
  hostname: string | null;
  notes: string | null;
  last_seen_at: string | null;
}

const emptyForm = (): Partial<Machine> => ({
  store_id: null,
  label: "",
  machine_type: "pdv",
  tool: "rustdesk",
  remote_id: "",
  password: "",
  hostname: "",
  notes: "",
});

const buildDeepLink = (tool: string, id: string) => {
  const clean = id.replace(/\s+/g, "");
  if (tool === "anydesk") return `anydesk:${clean}`;
  return `rustdesk://connect/${clean}`;
};

const RemoteAccess = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [stores, setStores] = useState<Store[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<Partial<Machine>>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: s }, { data: m }] = await Promise.all([
      supabase.from("stores").select("id,name").eq("is_virtual", false).order("name"),
      supabase.from("remote_access_machines").select("*").order("label"),
    ]);
    setStores((s ?? []) as Store[]);
    setMachines((m ?? []) as Machine[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Machine[]>();
    for (const m of machines) {
      const key = m.store_id ?? "sem_loja";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return map;
  }, [machines]);

  const storeName = (id: string | null) =>
    id ? stores.find((s) => s.id === id)?.name ?? "Loja removida" : "Sem loja";

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (m: Machine) => {
    setEditingId(m.id);
    setForm({ ...m });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.label?.trim() || !form.remote_id?.trim()) {
      toast({ title: "Preencha rótulo e ID remoto", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      store_id: form.store_id || null,
      label: form.label!.trim(),
      machine_type: form.machine_type || "pdv",
      tool: form.tool || "rustdesk",
      remote_id: form.remote_id!.trim(),
      password: form.password?.trim() || null,
      hostname: form.hostname?.trim() || null,
      notes: form.notes?.trim() || null,
    };
    const { error } = editingId
      ? await supabase.from("remote_access_machines").update(payload).eq("id", editingId)
      : await supabase.from("remote_access_machines").insert({ ...payload, created_by: user?.id });
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editingId ? "Máquina atualizada" : "Máquina cadastrada" });
    setDialogOpen(false);
    void load();
  };

  const removeMachine = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("remote_access_machines").delete().eq("id", deleteId);
    setDeleteId(null);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Máquina removida" });
    void load();
  };

  const audit = async (machineId: string, action: string) => {
    if (!user?.id) return;
    await supabase.from("remote_access_audit").insert({
      machine_id: machineId, user_id: user.id, action,
    });
  };

  const copy = async (text: string, label = "Copiado") => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: label });
    } catch {
      toast({ title: "Falha ao copiar", variant: "destructive" });
    }
  };

  const connect = (m: Machine) => {
    void audit(m.id, "connect");
    window.location.href = buildDeepLink(m.tool, m.remote_id);
  };

  const toggleReveal = (m: Machine) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(m.id)) {
        next.delete(m.id);
      } else {
        next.add(m.id);
        void audit(m.id, "view_password");
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Monitor className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            Acesso remoto
          </h1>
          <p className="text-muted-foreground">
            Cadastre o ID AnyDesk/RustDesk de cada PC de loja e conecte com um clique.
            Recomendado: <b>RustDesk</b> (gratuito e open-source).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
          <Button size="sm" onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> Nova máquina
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : machines.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              Nenhuma máquina cadastrada ainda. Instale o RustDesk (ou AnyDesk) no PC da loja,
              copie o ID que aparece e cole aqui.
            </p>
            <div className="flex flex-wrap justify-center gap-2 text-xs">
              <a href="https://rustdesk.com/" target="_blank" rel="noreferrer"
                 className="underline text-primary">Baixar RustDesk</a>
              <span className="text-muted-foreground">·</span>
              <a href="https://anydesk.com/pt/downloads/windows" target="_blank" rel="noreferrer"
                 className="underline text-primary">Baixar AnyDesk</a>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([storeId, list]) => (
            <div key={storeId} className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {storeName(storeId === "sem_loja" ? null : storeId)}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {list.map((m) => (
                  <Card key={m.id}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{m.label}</div>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            <Badge variant="secondary" className="text-[10px]">
                              {m.machine_type.toUpperCase()}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {m.tool === "anydesk" ? "AnyDesk" : "RustDesk"}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="h-8 w-8"
                                  onClick={() => openEdit(m)} aria-label="Editar">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                                  onClick={() => setDeleteId(m.id)} aria-label="Remover">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-1.5 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground text-xs w-14">ID</span>
                          <code className="flex-1 font-mono text-sm bg-muted px-2 py-1 rounded truncate">
                            {m.remote_id}
                          </code>
                          <Button variant="ghost" size="icon" className="h-7 w-7"
                                  onClick={() => copy(m.remote_id, "ID copiado")}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        {m.password && (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground text-xs w-14">Senha</span>
                            <code className="flex-1 font-mono text-sm bg-muted px-2 py-1 rounded truncate">
                              {revealed.has(m.id) ? m.password : "••••••••"}
                            </code>
                            <Button variant="ghost" size="icon" className="h-7 w-7"
                                    onClick={() => toggleReveal(m)}>
                              {revealed.has(m.id)
                                ? <EyeOff className="h-3.5 w-3.5" />
                                : <Eye className="h-3.5 w-3.5" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7"
                                    onClick={() => { void audit(m.id, "view_password"); void copy(m.password!, "Senha copiada"); }}>
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                        {m.hostname && (
                          <div className="text-xs text-muted-foreground truncate">
                            Host: <span className="font-mono">{m.hostname}</span>
                          </div>
                        )}
                        {m.notes && (
                          <p className="text-xs text-muted-foreground whitespace-pre-wrap">{m.notes}</p>
                        )}
                      </div>

                      <Button onClick={() => connect(m)} className="w-full gap-2" size="sm">
                        <ExternalLink className="h-4 w-4" />
                        Conectar via {m.tool === "anydesk" ? "AnyDesk" : "RustDesk"}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar máquina" : "Nova máquina"}</DialogTitle>
            <DialogDescription>
              Cadastre o ID exibido pelo cliente AnyDesk/RustDesk instalado no PC.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Loja</Label>
                <Select value={form.store_id ?? "none"}
                        onValueChange={(v) => setForm({ ...form, store_id: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="Loja" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem loja</SelectItem>
                    {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.machine_type ?? "pdv"}
                        onValueChange={(v) => setForm({ ...form, machine_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pdv">PDV</SelectItem>
                    <SelectItem value="totem">Totem</SelectItem>
                    <SelectItem value="office">Escritório</SelectItem>
                    <SelectItem value="other">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Rótulo *</Label>
              <Input value={form.label ?? ""} placeholder="Ex.: PDV Caixa 1"
                     onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Ferramenta</Label>
                <Select value={form.tool ?? "rustdesk"}
                        onValueChange={(v) => setForm({ ...form, tool: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rustdesk">RustDesk</SelectItem>
                    <SelectItem value="anydesk">AnyDesk</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>ID remoto *</Label>
                <Input value={form.remote_id ?? ""} placeholder="123 456 789"
                       onChange={(e) => setForm({ ...form, remote_id: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Senha de acesso</Label>
              <Input type="text" value={form.password ?? ""} placeholder="Opcional"
                     onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Hostname (opcional)</Label>
              <Input value={form.hostname ?? ""} placeholder="PDV-ASASUL-01"
                     onChange={(e) => setForm({ ...form, hostname: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea rows={2} value={form.notes ?? ""}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover máquina?</AlertDialogTitle>
            <AlertDialogDescription>
              O cadastro será excluído. O agente AnyDesk/RustDesk no PC continua funcionando normalmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={removeMachine}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default RemoteAccess;
