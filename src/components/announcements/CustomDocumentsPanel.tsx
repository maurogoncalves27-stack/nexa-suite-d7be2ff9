import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2, Users } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";

interface DocumentRow {
  id: string;
  title: string;
  description: string | null;
  is_active: boolean;
  current_version: number;
  created_at: string;
}

interface VersionRow {
  id: string;
  document_id: string;
  version_number: number;
  content: string;
  target_positions: string[];
  target_employee_ids: string[];
  created_at: string;
}

interface EmployeeOpt {
  id: string;
  full_name: string;
  position: string | null;
}

interface SignatureCount {
  document_id: string;
  count: number;
}

const QUILL_MODULES = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ["bold", "italic", "underline", "strike"],
    [{ list: "ordered" }, { list: "bullet" }],
    [{ align: [] }],
    ["link", "blockquote"],
    ["clean"],
  ],
};

export default function CustomDocumentsPanel() {
  const { user } = useAuth();
  const [employeePositions, setEmployeePositions] = useState<string[]>([]);
  const [employees, setEmployees] = useState<EmployeeOpt[]>([]);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [versions, setVersions] = useState<Record<string, VersionRow>>({});
  const [signCounts, setSignCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [targetPositions, setTargetPositions] = useState<string[]>([]);
  const [targetEmployeeIds, setTargetEmployeeIds] = useState<string[]>([]);
  const [audienceMode, setAudienceMode] = useState<"positions" | "employees">("positions");
  const [employeeSearch, setEmployeeSearch] = useState("");

  const reset = () => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setContent("");
    setTargetPositions([]);
    setTargetEmployeeIds([]);
    setAudienceMode("positions");
    setEmployeeSearch("");
  };

  const load = async () => {
    setLoading(true);
    const { data: docList } = await supabase
      .from("custom_documents")
      .select("*")
      .order("created_at", { ascending: false });
    const list = (docList ?? []) as DocumentRow[];
    setDocs(list);

    if (list.length > 0) {
      const ids = list.map((d) => d.id);
      const [{ data: vers }, { data: sigs }] = await Promise.all([
        supabase
          .from("custom_document_versions")
          .select("*")
          .in("document_id", ids),
        supabase
          .from("custom_document_signatures")
          .select("document_id, version_number")
          .in("document_id", ids),
      ]);
      const versionMap: Record<string, VersionRow> = {};
      ((vers ?? []) as VersionRow[]).forEach((v) => {
        const doc = list.find((d) => d.id === v.document_id);
        if (doc && v.version_number === doc.current_version) {
          versionMap[v.document_id] = v;
        }
      });
      setVersions(versionMap);

      const counts: Record<string, number> = {};
      ((sigs ?? []) as any[]).forEach((s) => {
        const doc = list.find((d) => d.id === s.document_id);
        if (doc && s.version_number === doc.current_version) {
          counts[s.document_id] = (counts[s.document_id] ?? 0) + 1;
        }
      });
      setSignCounts(counts);
    } else {
      setVersions({});
      setSignCounts({});
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Carrega colaboradores ativos (para cargos distintos + seleção individual)
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("employees")
        .select("id, full_name, position, status")
        .neq("status", "terminated")
        .order("full_name");
      const rows = (data ?? []) as Array<{ id: string; full_name: string; position: string | null; status: string }>;
      setEmployees(rows.map((r) => ({ id: r.id, full_name: r.full_name, position: r.position })));
      const set = new Set<string>();
      rows.forEach((r) => {
        const p = (r.position ?? "").trim();
        if (p) set.add(p);
      });
      setEmployeePositions(Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR")));
    })();
  }, []);

  const openNew = () => { reset(); setOpen(true); };

  const openEdit = (doc: DocumentRow) => {
    const v = versions[doc.id];
    setEditingId(doc.id);
    setTitle(doc.title);
    setDescription(doc.description ?? "");
    setContent(v?.content ?? "");
    setTargetPositions(v?.target_positions ?? []);
    setTargetEmployeeIds(v?.target_employee_ids ?? []);
    setAudienceMode(((v?.target_employee_ids?.length ?? 0) > 0 && (v?.target_positions?.length ?? 0) === 0) ? "employees" : "positions");
    setOpen(true);
  };

  const togglePosition = (name: string) => {
    setTargetPositions((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name],
    );
  };

  const toggleEmployee = (id: string) => {
    setTargetEmployeeIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: "Informe o título", variant: "destructive" });
      return;
    }
    if (!content || content === "<p><br></p>") {
      toast({ title: "Informe o conteúdo do documento", variant: "destructive" });
      return;
    }
    const positionsPayload = audienceMode === "positions" ? targetPositions : [];
    const employeesPayload = audienceMode === "employees" ? targetEmployeeIds : [];
    if (positionsPayload.length === 0 && employeesPayload.length === 0) {
      toast({ title: audienceMode === "positions" ? "Selecione ao menos um cargo" : "Selecione ao menos um colaborador", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        const doc = docs.find((d) => d.id === editingId);
        if (!doc) throw new Error("Documento não encontrado");
        const newVersionNumber = doc.current_version + 1;
        const { error: vErr } = await supabase.from("custom_document_versions").insert({
          document_id: editingId,
          version_number: newVersionNumber,
          content,
          target_positions: positionsPayload,
          target_employee_ids: employeesPayload,
          created_by: user?.id ?? null,
        });
        if (vErr) throw vErr;
        const { error: dErr } = await supabase
          .from("custom_documents")
          .update({ title: title.trim(), description: description.trim() || null, current_version: newVersionNumber })
          .eq("id", editingId);
        if (dErr) throw dErr;
        toast({ title: "Documento atualizado", description: `Nova versão v${newVersionNumber}. Colaboradores precisarão reassinar.` });
      } else {
        const { data: newDoc, error: dErr } = await supabase
          .from("custom_documents")
          .insert({
            title: title.trim(),
            description: description.trim() || null,
            current_version: 1,
            created_by: user?.id ?? null,
          })
          .select()
          .single();
        if (dErr) throw dErr;
        const { error: vErr } = await supabase.from("custom_document_versions").insert({
          document_id: newDoc.id,
          version_number: 1,
          content,
          target_positions: positionsPayload,
          target_employee_ids: employeesPayload,
          created_by: user?.id ?? null,
        });
        if (vErr) throw vErr;
        toast({ title: "Documento criado" });
      }
      setOpen(false);
      reset();
      await load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (doc: DocumentRow) => {
    const { error } = await supabase
      .from("custom_documents")
      .update({ is_active: !doc.is_active })
      .eq("id", doc.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este documento e todas as assinaturas? Esta ação não pode ser desfeita.")) return;
    const { error } = await supabase.from("custom_documents").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    load();
  };

  const positionsList = useMemo(() => {
    // Une cargos efetivamente atribuídos a colaboradores + cargos já vinculados
    // a versões existentes deste documento (para não "perder" referências antigas).
    const fromVersions = Object.values(versions).flatMap((v) => v.target_positions ?? []);
    const set = new Set<string>([...employeePositions, ...fromVersions, ...targetPositions]);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [employeePositions, versions, targetPositions]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex justify-end">
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" /> Novo documento
            </Button>
          </div>
          {loading ? (
            <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : docs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum documento criado ainda.</p>
          ) : (
            <ul className="divide-y divide-border">
              {docs.map((d) => {
                const v = versions[d.id];
                return (
                  <li key={d.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{d.title}</span>
                        <Badge variant="outline">v{d.current_version}</Badge>
                        {!d.is_active && <Badge variant="secondary">Inativo</Badge>}
                        <Badge variant="outline" className="gap-1">
                          <Users className="h-3 w-3" /> {signCounts[d.id] ?? 0} assinaturas
                        </Badge>
                      </div>
                      {d.description && (
                        <p className="text-sm text-muted-foreground mt-1">{d.description}</p>
                      )}
                      {v && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {v.target_employee_ids?.length > 0
                            ? `Colaboradores: ${v.target_employee_ids.length} selecionado(s)`
                            : `Cargos: ${v.target_positions.join(", ") || "—"}`}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch checked={d.is_active} onCheckedChange={() => toggleActive(d)} />
                      <Button variant="ghost" size="icon" onClick={() => openEdit(d)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(d.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar documento" : "Novo documento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Termo de Confidencialidade" />
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <Label>Conteúdo do documento *</Label>
              <div className="bg-background border rounded-md mt-1">
                <ReactQuill
                  theme="snow"
                  value={content}
                  onChange={setContent}
                  modules={QUILL_MODULES}
                  className="[&_.ql-editor]:min-h-[260px] [&_.ql-toolbar]:rounded-t-md [&_.ql-container]:rounded-b-md"
                />
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Cargos que devem assinar *</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto border rounded-md p-3">
                {positionsList.map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={targetPositions.includes(p)}
                      onCheckedChange={() => togglePosition(p)}
                    />
                    <span>{p}</span>
                  </label>
                ))}
              </div>
            </div>
            {editingId && (
              <p className="text-xs text-warning">
                ⚠ Salvar gera uma nova versão. Colaboradores que já assinaram precisarão assinar novamente.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingId ? "Salvar nova versão" : "Criar documento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
