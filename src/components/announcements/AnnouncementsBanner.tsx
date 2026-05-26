import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Megaphone, AlertTriangle, Info, Volume2, Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface Announcement {
  id: string;
  title: string;
  message: string;
  priority: "info" | "warning" | "urgent";
  created_at: string;
  schedule_start_date: string | null;
  schedule_end_date: string | null;
  recurrence: "none" | "daily" | "weekly" | "biweekly" | "monthly" | null;
  recurrence_day: number | null;
}

const PRIORITY_STYLE: Record<string, { icon: any; cls: string }> = {
  info: { icon: Info, cls: "border-primary/40 bg-primary/5" },
  warning: { icon: Megaphone, cls: "border-amber-500/50 bg-amber-500/5 text-amber-900 dark:text-amber-200" },
  urgent: { icon: AlertTriangle, cls: "border-destructive/60 bg-destructive/10 text-destructive" },
};

function isDueToday(a: Announcement): boolean {
  const todayStr = new Date().toISOString().slice(0, 10);
  if (a.schedule_start_date && todayStr < a.schedule_start_date) return false;
  if (a.schedule_end_date && todayStr > a.schedule_end_date) return false;

  const rec = a.recurrence ?? "none";
  if (rec === "none" || rec === "daily") return true;

  const today = new Date(todayStr + "T00:00:00");
  const start = a.schedule_start_date ? new Date(a.schedule_start_date + "T00:00:00") : today;

  if (rec === "weekly") {
    const targetDow = a.recurrence_day ?? start.getDay();
    return today.getDay() === targetDow;
  }
  if (rec === "monthly") {
    const targetDay = a.recurrence_day ?? start.getDate();
    return today.getDate() === targetDay;
  }
  if (rec === "biweekly") {
    if (!a.schedule_start_date) return false;
    const diffDays = Math.floor((today.getTime() - start.getTime()) / 86400000);
    return diffDays >= 0 && diffDays % 14 === 0;
  }
  return true;
}

export default function AnnouncementsBanner() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const ttsSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("hr_announcements")
        .select("id, title, message, priority, created_at, schedule_start_date, schedule_end_date, recurrence, recurrence_day")
        .eq("is_active", true)
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);
      const filtered = ((data ?? []) as Announcement[]).filter(isDueToday).slice(0, 10);
      setItems(filtered);
    })();

    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const speak = (a: Announcement) => {
    if (!ttsSupported) return;
    window.speechSynthesis.cancel();

    if (speakingId === a.id) {
      setSpeakingId(null);
      return;
    }

    const utter = new SpeechSynthesisUtterance(`${a.title}. ${a.message}`);
    utter.lang = "pt-BR";
    utter.rate = 0.95;
    utter.pitch = 1;

    // Tenta usar uma voz pt-BR se disponível
    const voices = window.speechSynthesis.getVoices();
    const ptVoice = voices.find((v) => v.lang === "pt-BR") || voices.find((v) => v.lang.startsWith("pt"));
    if (ptVoice) utter.voice = ptVoice;

    utter.onend = () => setSpeakingId((cur) => (cur === a.id ? null : cur));
    utter.onerror = () => setSpeakingId((cur) => (cur === a.id ? null : cur));

    setSpeakingId(a.id);
    window.speechSynthesis.speak(utter);
  };

  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      {items.map((a) => {
        const cfg = PRIORITY_STYLE[a.priority] ?? PRIORITY_STYLE.info;
        const Icon = cfg.icon;
        const isSpeaking = speakingId === a.id;
        return (
          <Alert key={a.id} className={cn(cfg.cls, "relative pr-12")}>
            <Icon className="h-4 w-4" />
            <AlertTitle className="font-semibold">{a.title}</AlertTitle>
            <AlertDescription className="whitespace-pre-wrap text-sm">{a.message}</AlertDescription>
            {ttsSupported && (
              <div className="absolute top-2 right-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => speak(a)}
                  className="h-8 w-8"
                  aria-label={isSpeaking ? "Parar leitura" : "Ouvir aviso em voz alta"}
                  title={isSpeaking ? "Parar leitura" : "Ouvir em voz alta"}
                >
                  {isSpeaking ? <Square className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
              </div>
            )}
          </Alert>
        );
      })}
    </div>
  );
}
