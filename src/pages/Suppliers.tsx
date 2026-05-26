import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Loader2, Check, X, Settings as SettingsIcon } from "lucide-react";

interface Supplier {
  user_id: string | null;
  id: string; cnpj: string; legal_name: string; trade_name: string | null;
  email: string; phone: string | null; contact_name: string | null;
  status: "pending" | "approved" | "rejected" | "suspended";
  payment_terms: string | null; rejection_reason: string | null; created_at: string;
}
interface Category { id: string; name: string; is_active: boolean; sort_order: number; }

const statusBadge = (s: string) => {
  const map: Record<string, { label: string; variant: any }> = {
    pending: { label: "Pendente", variant: "secondary" },
    approved: { label: "Aprovado", variant: "default" },
    rejected: { label: "Rejeitado", variant: "destructive" },
    suspended: { label: "Suspenso", variant: "outline" },
  };
  const c = map[s] ?? { label: s, variant: "outline" };
  return <Badge variant={c.variant}>{c.label}</Badge>;
};

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [approvedCats, setApprovedCats] = useState<Set<string>>(new Set());
  const [rejectReason, setRejectReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [newCat, setNewCat] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: sups }, { data: cats }] = await Promise.all([
      supabase.from("suppliers").select("*").order("created_at", { ascending: false }),
      supabase.from("supplier_categories").select("*").order("sort_order"),
    ]);
    setSuppliers((sups ?? []) as Supplier[]);
    setCategories((cats ?? []) as Category[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openEdit = async (s: Supplier) => {
    setEditing(s);
    setRejectReason(s.rejection_reason ?? "");
    const { data } = await supabase
      .from("supplier_approved_categories").select("category_id").eq("supplier_id", s.id);
    setApprovedCats(new Set((data ?? []).map((r: any) => r.category_id)));
  };

  const saveCategoriesFor = async (supplierId: string) => {
    const { data: current } = await supabase
      .from("supplier_approved_categories").select("category_id").eq("supplier_id", supplierId);
    const currentIds = new Set((current ?? []).map((r: any) => r.category_id as string));
    const toAdd = [...approvedCats].filter((id) => !currentIds.has(id));
    const toRemove = [...currentIds].filter((id) => !approvedCats.has(id));
    if (toAdd.length) {
      await supabase.from("supplier_approved_categories").insert(
        toAdd.map((cid) => ({ supplier_id: supplierId, category_id: cid }))
      );
    }
    if (toRemove.length) {
      await supabase.from("supplier_approved_categories")
        .delete().eq("supplier_id", supplierId).in("category_id", toRemove);
    }
  };

  const approve = async () => {
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase.from("suppliers")
      .update({ status: "approved", rejection_reason: null, approved_at: new Date().toISOString() })
      .eq("id", editing.id);
    if (!error && editing.user_id) {
      const { error: roleError } = await supabase.from("user_roles").insert({
        user_id: editing.user_id,
        role: "supplier" as any,
      });
      if (roleError && !roleError.message.toLowerCase().includes("duplicate")) {
        setSaving(false);
        toast({
          title: "Fornecedor aprovado, mas sem acesso liberado",
          description: roleError.message,
          variant: "destructive",
        });
        return;
      }
    }
    if (!error) await saveCategoriesFor(editing.id);
    setSaving(false);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Fornecedor aprovado" });
    setEditing(null); load();
  };

  const reject = async () => {
    if (!editing) return;
    setSaving(true);
    const supplierId = editing.id;
    const { error: delErr } = await supabase.functions.invoke("delete-supplier-user", {
      body: { supplier_id: supplierId },
    });
    setSaving(false);
    if (delErr) {
      return toast({
        title: "Erro ao rejeitar fornecedor",
        description: delErr.message,
        variant: "destructive",
      });
    }
    toast({ title: "Fornecedor rejeitado e cadastro excluído" });
    setEditing(null);
    load();
  };

  const suspend = async () => {
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase.from("suppliers").update({ status: "suspended" }).eq("id", editing.id);
    if (!error && editing.user_id) {
      await supabase.from("user_roles").delete().eq("user_id", editing.user_id).eq("role", "supplier");
    }
    setSaving(false);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Fornecedor suspenso" });
    setEditing(null); load();
  };

  const saveOnly = async () => {
    if (!editing) return;
    setSaving(true);
    await saveCategoriesFor(editing.id);
    setSaving(false);
    toast({ title: "Categorias atualizadas" });
    setEditing(null); load();
  };

  const addCategory = async () => {
    if (!newCat.trim()) return;
    const { error } = await supabase.from("supplier_categories")
      .insert({ name: newCat.trim(), sort_order: (categories.at(-1)?.sort_order ?? 0) + 10 });
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    setNewCat(""); load();
  };

  const toggleCategory = async (c: Category) => {
    await supabase.from("supplier_categories").update({ is_active: !c.is_active }).eq("id", c.id);
    load();
  };

  const grouped = {
    pending: suppliers.filter((s) => s.status === "pending"),
    approved: suppliers.filter((s) => s.status === "approved"),
    other: suppliers.filter((s) => s.status === "rejected" || s.status === "suspended"),
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Fornecedores</h1>
      </div>

      <Tabs defaultValue="suppliers">
        <TabsList>
          <TabsTrigger value="suppliers">Fornecedores</TabsTrigger>
          <TabsTrigger value="categories">Categorias</TabsTrigger>
        </TabsList>

        <TabsContent value="suppliers" className="mt-4 space-y-4">
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {[
                { key: "pending", title: "Aguardando aprovação", list: grouped.pending },
                { key: "approved", title: "Aprovados", list: grouped.approved },
                { key: "other", title: "Rejeitados / Suspensos", list: grouped.other },
              ].map((g) => (
                <Card key={g.key}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{g.title} <span className="text-muted-foreground text-sm">({g.list.length})</span></CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 overflow-x-auto">
                    {g.list.length === 0 ? (
                      <div className="p-6 text-center text-sm text-muted-foreground">Nenhum fornecedor.</div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Razão social</TableHead>
                            <TableHead>CNPJ</TableHead>
                            <TableHead>Contato</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {g.list.map((s) => (
                            <TableRow key={s.id}>
                              <TableCell className="font-medium">{s.legal_name}</TableCell>
                              <TableCell>{s.cnpj}</TableCell>
                              <TableCell>
                                <div className="text-sm">{s.contact_name ?? "—"}</div>
                                <div className="text-xs text-muted-foreground">{s.email}</div>
                              </TableCell>
                              <TableCell>{statusBadge(s.status)}</TableCell>
                              <TableCell>
                                <Button size="sm" variant="outline" onClick={() => openEdit(s)}>
                                  <SettingsIcon className="h-4 w-4 mr-2" /> Gerenciar
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </TabsContent>

        <TabsContent value="categories" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Categorias de fornecimento</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input placeholder="Nova categoria" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
                <Button onClick={addCategory}>Adicionar</Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {categories.map((c) => (
                  <div key={c.id} className="flex items-center justify-between border rounded-md p-2">
                    <span className={c.is_active ? "" : "text-muted-foreground line-through"}>{c.name}</span>
                    <Button size="sm" variant="ghost" onClick={() => toggleCategory(c)}>
                      {c.is_active ? "Desativar" : "Ativar"}
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>{editing?.legal_name}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-2 overflow-y-auto flex-1 min-h-0 space-y-4">
            <div className="text-sm space-y-1">
              <div><span className="text-muted-foreground">CNPJ:</span> {editing?.cnpj}</div>
              <div><span className="text-muted-foreground">E-mail:</span> {editing?.email}</div>
              <div><span className="text-muted-foreground">Telefone:</span> {editing?.phone ?? "—"}</div>
              <div><span className="text-muted-foreground">Contato:</span> {editing?.contact_name ?? "—"}</div>
              {editing?.payment_terms && <div><span className="text-muted-foreground">Pagto:</span> {editing.payment_terms}</div>}
              <div className="pt-1">{editing && statusBadge(editing.status)}</div>
            </div>
            <div className="space-y-2">
              <Label>Categorias liberadas</Label>
              <div className="grid grid-cols-1 gap-1.5 max-h-60 overflow-y-auto">
                {categories.filter((c) => c.is_active).map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={approvedCats.has(c.id)} onCheckedChange={(v) => {
                      const next = new Set(approvedCats);
                      v ? next.add(c.id) : next.delete(c.id);
                      setApprovedCats(next);
                    }} />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
            {editing?.status !== "approved" && (
              <div className="space-y-2">
                <Label>Motivo da rejeição (opcional)</Label>
                <Textarea rows={2} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
              </div>
            )}
          </div>
          <DialogFooter className="px-6 py-4 border-t shrink-0 bg-background flex-row flex-wrap justify-end gap-2">
            {editing?.status === "approved" ? (
              <>
                <Button variant="outline" onClick={suspend} disabled={saving}>Suspender</Button>
                <Button onClick={saveOnly} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar categorias
                </Button>
              </>
            ) : (
              <>
                <Button variant="destructive" onClick={reject} disabled={saving}>
                  <X className="h-4 w-4 mr-2" /> Rejeitar
                </Button>
                <Button onClick={approve} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />} Aprovar
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
