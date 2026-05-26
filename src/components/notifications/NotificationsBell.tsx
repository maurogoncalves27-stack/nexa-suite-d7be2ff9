import { useEffect, useMemo, useState } from "react";
import { Bell, Check, Trash2, Megaphone, AlertTriangle, Info, Volume2, Square, Siren } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface UserNotification {
  id: string;
  title: string;
  message: string;
  url: string | null;
  tag: string | null;
  category: string;
  is_read: boolean;
  created_at: string;
}

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

export default function NotificationsBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<UserNotification[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [open, setOpen] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const ttsSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  const unread = useMemo(
    () => items.filter((n) => !n.is_read).length + announcements.length,
    [items, announcements],
  );

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setItems((data ?? []) as UserNotification[]);
  };

  const loadAnnouncements = async () => {
    if (!user) { setAnnouncements([]); return; }
    // Descobre employee_id e store_id do usuário logado
    const { data: emp } = await supabase
      .from("employees")
      .select("id, store_id, allocated_store_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const empId = (emp as any)?.id ?? null;
    const storeIds = [(emp as any)?.store_id, (emp as any)?.allocated_store_id].filter(Boolean);

    // Monta filtro: globais + da minha loja + direcionados a mim
    const orParts: string[] = ["scope.eq.global", "scope.is.null"];
    if (empId) orParts.push(`and(scope.eq.employee,employee_id.eq.${empId})`);
    if (storeIds.length > 0) orParts.push(`and(scope.eq.store,store_id.in.(${storeIds.join(",")}))`);

    const { data } = await supabase
      .from("hr_announcements")
      .select("id, title, message, priority, created_at, schedule_start_date, schedule_end_date, recurrence, recurrence_day")
      .eq("is_active", true)
      .or(orParts.join(","))
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);
    const filtered = ((data ?? []) as Announcement[]).filter(isDueToday).slice(0, 10);
    setAnnouncements(filtered);
  };

  useEffect(() => {
    if (!user) return;
    load();
    loadAnnouncements();
    const ch = supabase
      .channel(`user_notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const markRead = async (id: string) => {
    await supabase
      .from("user_notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", id);
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase
      .from("user_notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("is_read", false);
  };

  const removeOne = async (id: string) => {
    await supabase.from("user_notifications").delete().eq("id", id);
  };

  const handleClick = (n: UserNotification) => {
    const targetUrl = n.url && n.url !== "/" ? n.url : null;
    setOpen(false);
    if (targetUrl) navigate(targetUrl);
    if (!n.is_read) void markRead(n.id);
  };

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

    const voices = window.speechSynthesis.getVoices();
    const ptVoice = voices.find((v) => v.lang === "pt-BR") || voices.find((v) => v.lang.startsWith("pt"));
    if (ptVoice) utter.voice = ptVoice;

    utter.onend = () => setSpeakingId((cur) => (cur === a.id ? null : cur));
    utter.onerror = () => setSpeakingId((cur) => (cur === a.id ? null : cur));

    setSpeakingId(a.id);
    window.speechSynthesis.speak(utter);
  };

  if (!user) return null;

  const isEmpty = items.length === 0 && announcements.length === 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 shrink-0"
          aria-label="Notificações"
          data-tour="notification-bell"
        >
          <Bell className="!h-5 !w-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(380px,calc(100vw-1rem))] p-0" align="end">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">Notificações</span>
            {unread > 0 && <Badge variant="secondary">{unread} novas</Badge>}
          </div>
          {items.some((n) => !n.is_read) && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}>
              <Check className="h-3.5 w-3.5 mr-1" /> Marcar todas
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[60vh]">
          {announcements.length > 0 && (
            <div className="p-2 space-y-2 border-b">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-1 font-semibold">
                Avisos
              </div>
              {announcements.map((a) => {
                const cfg = PRIORITY_STYLE[a.priority] ?? PRIORITY_STYLE.info;
                const Icon = cfg.icon;
                const isSpeaking = speakingId === a.id;
                return (
                  <div
                    key={a.id}
                    className={cn(
                      "relative rounded-md border p-2.5 pr-10",
                      cfg.cls,
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold leading-tight">{a.title}</div>
                        <div className="text-xs whitespace-pre-wrap mt-0.5">{a.message}</div>
                      </div>
                    </div>
                    {ttsSupported && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => speak(a)}
                        className="absolute top-1.5 right-1.5 h-7 w-7"
                        aria-label={isSpeaking ? "Parar leitura" : "Ouvir aviso em voz alta"}
                        title={isSpeaking ? "Parar leitura" : "Ouvir em voz alta"}
                      >
                        {isSpeaking ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {isEmpty ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Você não tem notificações.
            </div>
          ) : items.length === 0 ? null : (
            <ul className="divide-y">
              {items.map((n) => {
                const stripEmoji = (s: string) =>
                  s
                    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
                    .replace(/\s{2,}/g, " ")
                    .trim();
                const cleanTitle = stripEmoji(n.title || "");
                const rawMsg = stripEmoji(n.message || "");
                const upperMsg = rawMsg.toUpperCase();
                let sirenColor = "text-destructive";
                let cleanMsg = rawMsg;
                if (n.category === "occurrence") {
                  const storeMatchers: Array<{ rx: RegExp; cls: string }> = [
                    { rx: /ASA\s*NORTE/i, cls: "text-green-600" },
                    { rx: /[ÁA]GUAS\s*CLARAS/i, cls: "text-blue-600" },
                    { rx: /ASA\s*SUL/i, cls: "text-yellow-500" },
                    { rx: /LAGO\s*SUL/i, cls: "text-pink-500" },
                  ];
                  const m = storeMatchers.find((s) => s.rx.test(upperMsg));
                  if (m) {
                    sirenColor = m.cls;
                    cleanMsg = rawMsg
                      .replace(m.rx, "")
                      .replace(/^\s*[•·\-—]\s*/, "")
                      .replace(/\s*•\s*•\s*/g, " • ")
                      .trim();
                  }
                }
                return (
                <li
                  key={n.id}
                  className={`relative px-3 py-2.5 hover:bg-muted/50 cursor-pointer ${
                    !n.is_read ? "bg-primary/5" : ""
                  }`}
                  onClick={() => handleClick(n)}
                >
                  <div className="flex items-start gap-2">
                    {n.category === "occurrence" ? (
                      <Siren className={`h-4 w-4 mt-0.5 shrink-0 ${sirenColor}`} aria-hidden />
                    ) : null}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold leading-tight truncate">{cleanTitle}</div>
                      <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 whitespace-pre-wrap">
                        {cleanMsg}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(n.created_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 opacity-60 hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeOne(n.id);
                      }}
                      aria-label="Remover"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
                );
              })}

            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
