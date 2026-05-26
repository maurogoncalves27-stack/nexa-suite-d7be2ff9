import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, XCircle, ShieldCheck, Truck, Stethoscope, Eye } from "lucide-react";
import { EXTERNAL_MODULES } from "@/lib/externalModules";
import { Link } from "react-router-dom";

interface PartnerRow {
  kind: "supplier" | "outsourced";
  id: string;
  user_id: string | null;
  display_name: string;
  doc: string;
  email: string | null;
  status: string;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: "Pendente", className: "bg-amber-100 text-amber-700" },
  approved: { label: "Aprovado", className: "bg-green-100 text-green-700" },
  rejected: { label: "Rejeitado", className: "bg-destructive/10 text-destructive" },
  suspended: { label: "Suspenso", className: "bg-amber-100 text-amber-700" },
};

export default function ExternalAccessPanel() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PartnerRow[]>([]);
  const [perms, setPerms] = useState<Map<string, Set<string>>>(new Map()); // user_id -> Set(module)
  const [editing, setEditing] = useState<PartnerRow | null>(null);
  const [rejectOpen, setRejectOpen] = useState<PartnerRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [supRes, outRes, permRes] = await Promise.all([
      supabase.from("suppliers").select("id,user_id,legal_name,cnpj,email,status").order("created_at", { ascending: false }),
      supabase
        .from("outsourced_professionals")
        .select("id,user_id,full_name,cpf,email,approval_status")
        .order("created_at", { ascending: false }),
      supabase.from("external_partner_permissions").select("user_id,module"),
    ]);

    const r: PartnerRow[] = [];
    (supRes.data ?? []).forEach((s: any) =>
      r.push({
        kind: "supplier",
        id: s.id,
        user_id: s.user_id,
        display_name: s.legal_name,
        doc: s.cnpj,
        email: s.email,
        status: s.status,
      })
    );
    (outRes.data ?? []).forEach((o: any) =>
      r.push({
        kind: "outsourced",
        id: o.id,
        user_id: o.user_id,
        display_name: o.full_name ?? "—",
        doc: o.cpf ?? "—",
        email: o.email,
        status: o.approval_status,
      })
    );
    setRows(r);

    const m = new Map<string, Set<string>>();
    (permRes.data ?? []).forEach((p: any) => {
      if (!m.has(p.user_id)) m.set(p.user_id, new Set());
      m.get(p.user_id)!.add(p.module);
    });
    setPerms(m);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const approve = async (row: PartnerRow) => {
    setSaving(true);
    const payload =
      row.kind === "supplier"
        ? { status: "approved", rejection_reason: null }
        : { approval_status: "approved", rejection_reason: null };
    const table = row.kind === "supplier" ? "suppliers" : "outsourced_professionals";
    const { error } = await (supabase.from(table) as any).update(payload).eq("id", row.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao aprovar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Aprovado!" });
    await load();
  };

  const reject = async () => {
    if (!rejectOpen) return;
    setSaving(true);
    const payload =
      rejectOpen.kind === "supplier"
        ? { status: "rejected", rejection_reason: rejectReason || null }
        : { approval_status: "rejected", rejection_reason: rejectReason || null };
    const table = rejectOpen.kind === "supplier" ? "suppliers" : "outsourced_professionals";
    const { error } = await (supabase.from(table) as any).update(payload).eq("id", rejectOpen.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Cadastro rejeitado" });
    setRejectOpen(null);
    setRejectReason("");
    await load();
  };

  const toggleModule = async (userId: string, moduleKey: string, enable: boolean) => {
    if (enable) {
      const { error } = await supabase
        .from("external_partner_permissions")
        .insert({ user_id: userId, module: moduleKey });
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
        return;
      }
    } else {
      const { error } = await supabase
        .from("external_partner_permissions")
        .delete()
        .eq("user_id", userId)
        .eq("module", moduleKey);
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
        return;
      }
    }
    // atualiza estado local
    setPerms((prev) => {
      const next = new Map(prev);
      const cur = new Set(next.get(userId) ?? []);
      if (enable) cur.add(moduleKey);
      else cur.delete(moduleKey);
      next.set(userId, cur);
      return next;
    });
  };

  const renderTable = (kind: "supplier" | "outsourced" | "all") => {
    const filtered = rows.filter((r) => kind === "all" || r.kind === kind);
    if (loading) {
      return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
    }
    if (filtered.length === 0) {
      return <div className="p-8 text-center text-muted-foreground">Nenhum registro.</div>;
    }
    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Módulos</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => {
              const userMods = row.user_id ? perms.get(row.user_id) ?? new Set() : new Set();
              const badge = STATUS_BADGE[row.status] ?? { label: row.status, className: "" };
              return (
                <TableRow key={`${row.kind}-${row.id}`}>
                  <TableCell>
                    {row.kind === "supplier" ? (
                      <Badge variant="outline" className="gap-1"><Truck className="h-3 w-3" />Fornecedor</Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1"><Stethoscope className="h-3 w-3" />Terceirizado</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{row.display_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.doc}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.email}</TableCell>
                  <TableCell><Badge className={badge.className}>{badge.label}</Badge></TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">{(userMods as Set<string>).size} liberado(s)</span>
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    {row.status !== "approved" && (
                      <Button size="sm" variant="default" onClick={() => approve(row)} disabled={saving}>
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar
                      </Button>
                    )}
                    {row.status !== "rejected" && (
                      <Button size="sm" variant="outline" onClick={() => { setRejectOpen(row); setRejectReason(""); }}>
                        <XCircle className="h-4 w-4 mr-1" /> Rejeitar
                      </Button>
                    )}
                    {row.status === "approved" && row.user_id && (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => setEditing(row)}>
                          <ShieldCheck className="h-4 w-4 mr-1" /> Módulos
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <Link to={`/preview-parceiro/${row.user_id}`} target="_blank" rel="noopener noreferrer">
                            <Eye className="h-4 w-4 mr-1" /> Visualizar como
                          </Link>
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

  const editingMods = editing?.user_id ? perms.get(editing.user_id) ?? new Set() : new Set();

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Aprove cadastros de fornecedores e profissionais terceirizados, e libere os módulos do sistema para cada um.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Parceiros</CardTitle>
          <CardDescription>Lista unificada de fornecedores e terceirizados.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">Todos</TabsTrigger>
              <TabsTrigger value="supplier">Fornecedores</TabsTrigger>
              <TabsTrigger value="outsourced">Terceirizados</TabsTrigger>
            </TabsList>
            <TabsContent value="all" className="mt-4">{renderTable("all")}</TabsContent>
            <TabsContent value="supplier" className="mt-4">{renderTable("supplier")}</TabsContent>
            <TabsContent value="outsourced" className="mt-4">{renderTable("outsourced")}</TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Dialog: liberar módulos */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Módulos liberados</DialogTitle>
            <DialogDescription>{editing?.display_name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {EXTERNAL_MODULES.map((m) => (
              <div key={m.key} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <div className="font-medium text-sm">{m.label}</div>
                  <div className="text-xs text-muted-foreground">{m.route}</div>
                </div>
                <Switch
                  checked={(editingMods as Set<string>).has(m.key)}
                  onCheckedChange={(v) => editing?.user_id && toggleModule(editing.user_id, m.key, v)}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: rejeitar */}
      <Dialog open={!!rejectOpen} onOpenChange={(o) => !o && setRejectOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rejeitar cadastro</DialogTitle>
            <DialogDescription>{rejectOpen?.display_name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motivo (opcional)</Label>
            <Textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={reject} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Rejeitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
