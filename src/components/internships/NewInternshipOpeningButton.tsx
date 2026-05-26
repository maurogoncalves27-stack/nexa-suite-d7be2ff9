import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { GraduationCap } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { upsertInternshipOpening } from "@/lib/internshipOpenings";

interface Props {
  /** Callback após criar com sucesso (ex: recarregar listas). */
  onCreated?: () => void;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "secondary";
  label?: string;
}

interface Store { id: string; name: string }

export default function NewInternshipOpeningButton({ onCreated, size = "sm", variant = "outline", label = "Nova vaga estágio" }: Props) {
  const [open, setOpen] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [form, setForm] = useState({ title: "", store_id: "", positions_count: 1 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase.from("stores").select("id, name").eq("is_active", true).eq("is_virtual", false).order("name")
      .then(({ data }) => setStores((data ?? []) as Store[]));
  }, [open]);

  const submit = async () => {
    if (!form.title.trim()) return toast({ title: "Informe o título", variant: "destructive" });
    setSaving(true);
    try {
      await upsertInternshipOpening({
        title: form.title.trim(),
        store_id: form.store_id || null,
        positions_count: Math.max(1, Number(form.positions_count) || 1),
        status: "open",
      });
      toast({ title: "Vaga de estágio criada e publicada no recrutamento" });
      setOpen(false);
      setForm({ title: "", store_id: "", positions_count: 1 });
      onCreated?.();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        <GraduationCap className="h-4 w-4 mr-1" />{label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nova vaga de estágio</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Título</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex: Estágio Auxiliar de Cozinha" /></div>
            <div>
              <Label>Loja / Setor</Label>
              <Select value={form.store_id || "none"} onValueChange={(v) => setForm({ ...form, store_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sem loja —</SelectItem>
                  {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Nº de posições</Label><Input type="number" min={1} value={form.positions_count} onChange={(e) => setForm({ ...form, positions_count: Number(e.target.value) })} /></div>
            <p className="text-xs text-muted-foreground">A vaga será criada na página de Estágio e publicada automaticamente no recrutamento e na divulgação pública.</p>
          </div>
          <DialogFooter><Button onClick={submit} disabled={saving}>{saving ? "Salvando..." : "Criar e publicar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
