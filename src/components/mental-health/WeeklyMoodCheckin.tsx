import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck } from "lucide-react";

const MOODS: { score: number; emoji: string; label: string; bg: string }[] = [
  { score: 1, emoji: "😞", label: "Muito mal", bg: "bg-red-100 hover:bg-red-200 border-red-300" },
  { score: 2, emoji: "🙁", label: "Mal", bg: "bg-orange-100 hover:bg-orange-200 border-orange-300" },
  { score: 3, emoji: "😐", label: "Neutro", bg: "bg-yellow-100 hover:bg-yellow-200 border-yellow-300" },
  { score: 4, emoji: "🙂", label: "Bem", bg: "bg-lime-100 hover:bg-lime-200 border-lime-300" },
  { score: 5, emoji: "😄", label: "Ótimo", bg: "bg-green-100 hover:bg-green-200 border-green-300" },
];

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Segunda-feira da semana ISO (mantém compatibilidade com a view v_mood_weekly_store_agg,
// que agrega participantes por week_start).
function weekStartStr(): string {
  const d = new Date();
  const day = d.getDay(); // 0=dom
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const CHECKIN_INTERVAL_DAYS = 3;
const OPTOUT_DAYS = 90;

/**
 * Check-in de humor voluntário (NR-1 / LGPD).
 * - Aparece a cada 3 dias.
 * - Sempre pode ser pulado ("Prefiro não responder hoje").
 * - Pode ser desativado por 90 dias ("Não me perguntar mais").
 * - Base legal: LGPD art. 11 §2º "a" (consentimento) + NR-1 (percepção coletiva anônima).
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
        // 1) Respeita opt-out do próprio colaborador
        const { data: prof } = await supabase
          .from("profiles")
          .select("mood_optout_until")
          .eq("user_id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (prof?.mood_optout_until && new Date(prof.mood_optout_until) > new Date()) {
          setChecked(true);
          return;
        }

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

        // Se o usuário já dispensou/respondeu nesta sessão, não reabrir
        const dismissedToday = sessionStorage.getItem("mood_checkin_dismissed") === today;
        if (dismissedToday) { setChecked(true); return; }

        const { data: last } = await supabase
          .from("mood_checkins")
          .select("created_at")
          .eq("employee_id", emp.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;

        if (last) {
          const lastDate = new Date(last.created_at);
          const lastDayStr = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, "0")}-${String(lastDate.getDate()).padStart(2, "0")}`;
          // Se já respondeu hoje, não pergunta de novo
          if (lastDayStr === today) {
            sessionStorage.setItem("mood_checkin_dismissed", today);
            setChecked(true);
            return;
          }
          // Só reabre depois de 3 dias completos desde a última resposta
          const daysSince = Math.floor((Date.now() - lastDate.getTime()) / (24 * 60 * 60 * 1000));
          if (daysSince < CHECKIN_INTERVAL_DAYS) { setChecked(true); return; }
        }
        setOpen(true);
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
      const { error } = await supabase.from("mood_checkins").upsert({
        employee_id: employeeId,
        user_id: user.id,
        week_start: weekStartStr(),
        mood_score: skip ? null : selected,
        comment: skip ? null : (comment.trim() || null),
        skipped: skip,
      }, { onConflict: "employee_id,week_start" });
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

  const optOut = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const until = new Date();
      until.setDate(until.getDate() + OPTOUT_DAYS);
      const { error } = await supabase
        .from("profiles")
        .update({ mood_optout_until: until.toISOString() })
        .eq("user_id", user.id);
      if (error) throw error;
      toast({
        title: "Ok, não perguntaremos mais por 90 dias",
        description: "Você pode reativar em Configurações → Perfil quando quiser.",
      });
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Não foi possível desativar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) setOpen(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Como você está se sentindo hoje?</DialogTitle>
        </DialogHeader>

        <div className="rounded-md bg-primary/5 border border-primary/20 p-3 text-xs text-muted-foreground flex gap-2">
          <ShieldCheck className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <strong className="text-foreground">Resposta 100% voluntária.</strong> Usada apenas de forma agregada, no nível da loja, para atender à NR-1 (riscos psicossociais). Você pode pular ou desativar a qualquer momento — nenhuma resposta é vista individualmente por seu gestor.
          </div>
        </div>

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
          <Button variant="ghost" size="sm" onClick={optOut} disabled={saving} className="text-xs text-muted-foreground">
            Não me perguntar mais (90 dias)
          </Button>
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" onClick={() => save(true)} disabled={saving}>
              Prefiro não responder
            </Button>
            <Button onClick={() => save(false)} disabled={saving || selected == null}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enviar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
