import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const MOODS: { score: number; emoji: string; label: string; bg: string }[] = [
  { score: 1, emoji: "😞", label: "Muito mal", bg: "bg-red-100 hover:bg-red-200 border-red-300" },
  { score: 2, emoji: "🙁", label: "Mal", bg: "bg-orange-100 hover:bg-orange-200 border-orange-300" },
  { score: 3, emoji: "😐", label: "Neutro", bg: "bg-yellow-100 hover:bg-yellow-200 border-yellow-300" },
  { score: 4, emoji: "🙂", label: "Bem", bg: "bg-lime-100 hover:bg-lime-200 border-lime-300" },
  { score: 5, emoji: "😄", label: "Ótimo", bg: "bg-green-100 hover:bg-green-200 border-green-300" },
];

/** Data de hoje em yyyy-mm-dd (local). */
function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

const CHECKIN_INTERVAL_DAYS = 3;

/**
 * Exibe o check-in de humor a cada 3 dias, no primeiro acesso após o intervalo.
 * Salva em `mood_checkins` (campo `week_start` é reaproveitado como a data do check-in).
 * Só aparece para colaboradores com registro ativo em `employees`.
 */
export default function WeeklyMoodCheckin() {
  const { user, loading } = useAuth();
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [checked, setChecked] = useState(false);

  const today = useMemo(() => todayStr(), []);

  useEffect(() => {
    if (loading || !user || checked) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: emp } = await supabase
          .from("employees")
          .select("id, status")
          .eq("user_id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (!emp) { setChecked(true); return; }
        if (emp.status && !["active", "in_training", "on_leave"].includes(emp.status)) {
          setChecked(true); return;
        }
        setEmployeeId(emp.id);
        // Busca o último check-in (respondido ou pulado) e verifica se já se passaram 3 dias
        const { data: last } = await supabase
          .from("mood_checkins")
          .select("created_at")
          .eq("employee_id", emp.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        const now = Date.now();
        const shouldOpen = !last
          || (now - new Date(last.created_at).getTime()) >= CHECKIN_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
        if (shouldOpen) setOpen(true);
      } catch {
        // silencioso
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user, loading, checked, today]);


  const save = async (skip = false) => {
    if (!employeeId || !user) return;
    if (!skip && selected == null) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("mood_checkins").insert({
        employee_id: employeeId,
        user_id: user.id,
        week_start: today,
        mood_score: skip ? null : selected,
        comment: skip ? null : (comment.trim() || null),
        skipped: skip,
      });
      if (error) throw error;
      if (!skip) {
        toast({
          title: "Obrigado por compartilhar 💚",
          description: selected && selected <= 2
            ? "Se precisar de apoio, nosso RH está à disposição."
            : "Tenha um ótimo dia!",
        });
      }
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Não foi possível salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) setOpen(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Como você está se sentindo hoje?</DialogTitle>
          <p className="text-sm text-muted-foreground pt-1">
            Sua resposta é confidencial e ajuda a empresa a cuidar do seu bem-estar (NR-1).
          </p>
        </DialogHeader>

        <div className="grid grid-cols-5 gap-2 py-4">
          {MOODS.map((m) => (
            <button
              key={m.score}
              type="button"
              onClick={() => setSelected(m.score)}
              className={`flex flex-col items-center gap-1 rounded-lg border-2 p-2 transition ${m.bg} ${selected === m.score ? "ring-2 ring-primary ring-offset-2" : "border-transparent"}`}
            >
              <span className="text-3xl">{m.emoji}</span>
              <span className="text-[10px] font-medium text-center leading-tight">{m.label}</span>
            </button>
          ))}
        </div>

        {selected != null && selected <= 2 && (
          <div className="rounded-md bg-orange-50 border border-orange-200 p-3 text-sm text-orange-900">
            Sentimos muito que o dia esteja difícil. Se quiser, deixe um recado — o RH pode conversar com você em sigilo.
          </div>
        )}

        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, 500))}
          placeholder="Quer contar mais alguma coisa? (opcional)"
          rows={3}
        />

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="ghost" onClick={() => save(true)} disabled={saving}>
            Pular esta semana
          </Button>
          <Button onClick={() => save(false)} disabled={saving || selected == null}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
