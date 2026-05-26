import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Upload } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { SOURCES } from "@/lib/recruitment";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  jobOpeningId: string;
  onSaved: () => void;
}

export function CandidateDialog({ open, onOpenChange, jobOpeningId, onSaved }: Props) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: "", cpf: "", email: "", phone: "", city: "",
    source: "", expected_salary: "", availability: "",
    has_experience: "false", notes: "",
  });
  const [resume, setResume] = useState<File | null>(null);

  const reset = () => {
    setForm({
      full_name: "", cpf: "", email: "", phone: "", city: "",
      source: "", expected_salary: "", availability: "",
      has_experience: "false", notes: "",
    });
    setResume(null);
  };

  const submit = async () => {
    if (!form.full_name) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    setSaving(true);

    let resume_path: string | null = null;
    let resume_name: string | null = null;
    if (resume) {
      const ext = resume.name.split(".").pop();
      const path = `${jobOpeningId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("recruitment-cvs").upload(path, resume);
      if (upErr) {
        setSaving(false);
        toast({ title: "Erro ao enviar currículo", description: upErr.message, variant: "destructive" });
        return;
      }
      resume_path = path;
      resume_name = resume.name;
    }

    const { error } = await supabase.from("job_candidates").insert({
      job_opening_id: jobOpeningId,
      full_name: form.full_name,
      cpf: form.cpf || null,
      email: form.email || null,
      phone: form.phone || null,
      city: form.city || null,
      source: form.source || null,
      expected_salary: form.expected_salary ? Number(form.expected_salary) : null,
      availability: form.availability || null,
      has_experience: form.has_experience === "true",
      notes: form.notes || null,
      resume_path,
      resume_name,
      created_by: user?.id,
    });
    setSaving(false);

    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Candidato cadastrado" });
    reset();
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo candidato</DialogTitle>
          <DialogDescription>Cadastre o candidato — ele entra na etapa de Triagem.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2 md:col-span-2">
              <Label>Nome completo *</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>CPF</Label>
              <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Cidade</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Origem</Label>
              <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                <SelectTrigger><SelectValue placeholder="Como soube da vaga?" /></SelectTrigger>
                <SelectContent>
                  {SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Pretensão salarial (R$)</Label>
              <Input type="number" step="0.01" value={form.expected_salary} onChange={(e) => setForm({ ...form, expected_salary: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Disponibilidade</Label>
              <Input value={form.availability} onChange={(e) => setForm({ ...form, availability: e.target.value })} placeholder="Ex.: Imediata, 30 dias..." />
            </div>
            <div className="space-y-2">
              <Label>Tem experiência no cargo?</Label>
              <Select value={form.has_experience} onValueChange={(v) => setForm({ ...form, has_experience: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Sim</SelectItem>
                  <SelectItem value="false">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Currículo (PDF / DOC)</Label>
            <Input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setResume(e.target.files?.[0] ?? null)} />
            {resume && <p className="text-xs text-muted-foreground">{resume.name}</p>}
          </div>
          <div className="space-y-2">
            <Label>Observações iniciais</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Cadastrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
