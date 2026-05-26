import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

import { Loader2, Plus, Briefcase, Trash2, Edit2, Globe, Sparkles, X, Link2, ExternalLink } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { usePositions } from "@/hooks/usePositions";

export interface JobOpening {
  id: string;
  title: string;
  position: string;
  store_id: string | null;
  description: string | null;
  requirements: string | null;
  responsibilities: string | null;
  salary_min: number | null;
  salary_max: number | null;
  positions_count: number;
  status: "open" | "paused" | "closed";
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
  is_public?: boolean;
  public_summary?: string | null;
  public_benefits?: string | null;
  public_image_url?: string | null;
}

interface StoreOpt { id: string; name: string }

interface Props {
  stores: StoreOpt[];
  openings: JobOpening[];
  onChanged: () => void;
  onSelect: (id: string) => void;
  selectedId: string | null;
  /**
   * - "full" (padrão): renderiza a lista completa de vagas (modo legado)
   * - "header-only": renderiza apenas o cabeçalho com o botão "Nova vaga"
   * - "edit-button": renderiza apenas um botão "Editar" para a vaga `editingJobId`
   */
  mode?: "full" | "header-only" | "edit-button";
  editingJobId?: string;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  open: { label: "Aberta", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  paused: { label: "Pausada", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  closed: { label: "Encerrada", cls: "bg-muted text-muted-foreground" },
};

export function JobOpeningsPanel({ stores, openings, onChanged, onSelect, selectedId, mode = "full", editingJobId }: Props) {
  const { user } = useAuth();
  const { positions } = usePositions();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<JobOpening | null>(null);
  const [saving, setSaving] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);

  const generateBanner = async () => {
    if (!form.position && !form.title) {
      toast({ title: "Preencha o título ou cargo antes de gerar a imagem", variant: "destructive" });
      return;
    }
    setGeneratingImage(true);
    const { data, error } = await supabase.functions.invoke("generate-job-banner", {
      body: {
        title: form.title,
        position: form.position,
        description: form.description,
        responsibilities: form.responsibilities,
        custom_prompt: form.banner_prompt,
      },
    });
    setGeneratingImage(false);
    if (error || (data as any)?.error) {
      toast({
        title: "Erro ao gerar imagem",
        description: (data as any)?.error || error?.message,
        variant: "destructive",
      });
      return;
    }
    const url = (data as any)?.url;
    if (url) {
      setForm((f) => ({ ...f, public_image_url: url }));
      toast({ title: "Imagem gerada!", description: "Banner pronto para a vaga." });
    }
  };

  const blank = {
    title: "", position: "", store_id: "", description: "", requirements: "",
    responsibilities: "", salary_min: "", salary_max: "", positions_count: "1",
    status: "open" as "open" | "paused" | "closed", notes: "",
    public_image_url: "",
    banner_prompt: "",
  };
  const [form, setForm] = useState(blank);

  const openNew = () => { setEditing(null); setForm(blank); setOpen(true); };
  const openEdit = (j: JobOpening) => {
    setEditing(j);
    setForm({
      title: j.title,
      position: j.position,
      store_id: j.store_id ?? "",
      description: j.description ?? "",
      requirements: j.requirements ?? "",
      responsibilities: j.responsibilities ?? "",
      salary_min: j.salary_min?.toString() ?? "",
      salary_max: j.salary_max?.toString() ?? "",
      positions_count: j.positions_count.toString(),
      status: j.status,
      notes: j.notes ?? "",
      public_image_url: j.public_image_url ?? "",
      banner_prompt: "",
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.title || !form.position) {
      toast({ title: "Título e cargo são obrigatórios", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title,
      position: form.position,
      store_id: form.store_id || null,
      description: form.description || null,
      requirements: form.requirements || null,
      responsibilities: form.responsibilities || null,
      salary_min: form.salary_min ? Number(form.salary_min) : null,
      salary_max: form.salary_max ? Number(form.salary_max) : null,
      positions_count: Math.max(1, Number(form.positions_count) || 1),
      status: form.status,
      notes: form.notes || null,
      is_public: true,
      public_summary: null,
      public_benefits: null,
      public_image_url: form.public_image_url || null,
      created_by: user?.id,
    };
    const { error } = editing
      ? await supabase.from("job_openings").update(payload).eq("id", editing.id)
      : await supabase.from("job_openings").insert(payload);
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: editing ? "Vaga atualizada" : "Vaga criada" });
    setOpen(false);
    onChanged();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir vaga e todos os candidatos vinculados?")) return;
    const { error } = await supabase.from("job_openings").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Vaga excluída" });
    onChanged();
  };

  const storeMap = Object.fromEntries(stores.map((s) => [s.id, s.name]));

  const renderForm = () => (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? "Editar vaga" : "Nova vaga"}</DialogTitle>
        <DialogDescription>Preencha as informações da vaga e o que se espera do profissional.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2 md:col-span-2">
            <Label>Título da vaga *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Atendente para loja Centro" />
          </div>
          <div className="space-y-2">
            <Label>Cargo *</Label>
            <Select value={form.position} onValueChange={(v) => setForm({ ...form, position: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {positions.map((p) => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Loja</Label>
            <Select value={form.store_id || "none"} onValueChange={(v) => setForm({ ...form, store_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Sem loja específica —</SelectItem>
                {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Nº de posições</Label>
            <Input type="number" min={1} value={form.positions_count} onChange={(e) => setForm({ ...form, positions_count: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v: any) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Aberta</SelectItem>
                <SelectItem value="paused">Pausada</SelectItem>
                <SelectItem value="closed">Encerrada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Salário mín. (R$)</Label>
            <Input type="number" step="0.01" value={form.salary_min} onChange={(e) => setForm({ ...form, salary_min: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Salário máx. (R$)</Label>
            <Input type="number" step="0.01" value={form.salary_max} onChange={(e) => setForm({ ...form, salary_max: e.target.value })} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Descrição da vaga</Label>
          <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Responsabilidades</Label>
          <Textarea rows={3} value={form.responsibilities} onChange={(e) => setForm({ ...form, responsibilities: e.target.value })} placeholder="Liste as principais responsabilidades..." />
        </div>
        <div className="space-y-2">
          <Label>Requisitos</Label>
          <Textarea rows={3} value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} placeholder="Experiência, formação, disponibilidade..." />
        </div>
        <div className="space-y-2">
          <Label>Observações internas</Label>
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>

        <div className="border-t pt-4 space-y-3">
          <div className="rounded-md border bg-primary/5 p-3 flex items-start gap-2">
            <Globe className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium">Vaga sempre publicada em /vagas</p>
              <p className="text-xs text-muted-foreground">A página pública usa o título, descrição, responsabilidades, requisitos e faixa salarial preenchidos acima.</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Banner da vaga (gerado por IA)
            </Label>
            <div className="space-y-1.5">
              <Label htmlFor="banner-prompt" className="text-xs text-muted-foreground font-normal">
                Orientação para a IA (opcional)
              </Label>
              <Textarea
                id="banner-prompt"
                rows={2}
                value={form.banner_prompt}
                onChange={(e) => setForm({ ...form, banner_prompt: e.target.value })}
                placeholder="Ex.: cozinha industrial moderna com tons quentes, equipe diversa preparando pratos, atmosfera de movimento..."
                className="text-sm"
              />
            </div>
            {form.public_image_url ? (
              <div className="relative group rounded-lg overflow-hidden border">
                <img
                  src={form.public_image_url}
                  alt="Banner da vaga"
                  className="w-full aspect-[16/9] object-cover"
                />
                <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={generateBanner}
                    disabled={generatingImage}
                    className="gap-2"
                  >
                    {generatingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Gerar outra
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => setForm({ ...form, public_image_url: "" })}
                  >
                    <X className="h-4 w-4 mr-1" />Remover
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={generateBanner}
                disabled={generatingImage}
                className="w-full h-24 border-dashed gap-2"
              >
                {generatingImage ? (
                  <><Loader2 className="h-5 w-5 animate-spin" />Gerando imagem...</>
                ) : (
                  <><Sparkles className="h-5 w-5" />Gerar banner com IA</>
                )}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              A IA cria uma imagem 16:9 baseada no cargo e descrição. Pode regenerar quantas vezes quiser.
            </p>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
        <Button onClick={submit} disabled={saving} className="gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {editing ? "Salvar" : "Criar vaga"}
        </Button>
      </DialogFooter>
    </>
  );

  // Modo "edit-button": só renderiza o botão Editar para a vaga indicada + Dialog
  if (mode === "edit-button") {
    const job = openings.find((o) => o.id === editingJobId);
    return (
      <>
        <Button
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={() => job && openEdit(job)}
          disabled={!job}
        >
          <Edit2 className="h-3.5 w-3.5" /> Editar vaga
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            {renderForm()}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Modo "header-only": só o botão "Nova vaga" + Dialog
  if (mode === "header-only") {
    return (
      <>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-base">Vagas em aberto</h3>
          <Button size="sm" onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> Nova vaga
          </Button>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            {renderForm()}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Modo "full" (legado): lista completa de vagas
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Vagas</h3>
        <Button size="sm" onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Nova vaga
        </Button>
      </div>

      {openings.length === 0 ? (
        <div className="text-center text-muted-foreground py-8 text-sm border rounded-lg">
          Nenhuma vaga cadastrada ainda.
        </div>
      ) : (
        <div className="space-y-2">
          {openings.map((j) => {
            const isSel = selectedId === j.id;
            return (
              <Card
                key={j.id}
                className={`cursor-pointer transition-colors ${isSel ? "border-primary ring-1 ring-primary" : "hover:border-primary/50"}`}
                onClick={() => onSelect(j.id)}
              >
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold truncate flex items-center gap-2">
                        <Briefcase className="h-4 w-4 text-primary shrink-0" />
                        {j.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {j.position}{j.store_id ? ` · ${storeMap[j.store_id] ?? "—"}` : ""}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge className={STATUS_LABEL[j.status].cls} variant="outline">
                        {STATUS_LABEL[j.status].label}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{j.positions_count} {j.positions_count === 1 ? "vaga" : "vagas"}</span>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Copiar link público"
                        onClick={(e) => {
                          e.stopPropagation();
                          const url = `${window.location.origin}/vagas/${j.id}`;
                          navigator.clipboard.writeText(url);
                          toast({ title: "Link copiado", description: url });
                        }}
                      >
                        <Link2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Abrir página pública"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(`/vagas/${j.id}`, "_blank");
                        }}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(j); }}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); remove(j.id); }}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {renderForm()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
