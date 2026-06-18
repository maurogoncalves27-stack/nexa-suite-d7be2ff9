import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Cake, Camera } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  storeId: string;
  allocatedStoreId?: string | null;
}

interface BirthdayEmployee {
  id: string;
  full_name: string;
  position: string | null;
  birth_date: string;
  day: number;
  photoUrl: string | null;
}

export default function BirthdaysCard({ storeId, allocatedStoreId }: Props) {
  const [items, setItems] = useState<BirthdayEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const storeIds = Array.from(new Set([storeId, allocatedStoreId].filter(Boolean))) as string[];
      if (storeIds.length === 0) {
        if (!cancelled) { setItems([]); setLoading(false); }
        return;
      }

      const { data, error } = await supabase.rpc("list_store_birthdays", { _store_ids: storeIds });
      if (error) {
        console.error("[BirthdaysCard] erro ao carregar aniversariantes:", error);
        if (!cancelled) { setItems([]); setLoading(false); }
        return;
      }

      const list: (BirthdayEmployee & { _photoPath?: string | null })[] = (data ?? [])
        .map((e: any) => ({
          id: e.id,
          full_name: e.display_name,
          position: e.job_position,
          birth_date: `0000-${String(e.birth_month).padStart(2, "0")}-${String(e.birth_day).padStart(2, "0")}`,
          day: e.birth_day,
          photoUrl: null as string | null,
          _photoPath: e.photo_path as string | null,
        }))
        .sort((a, b) => a.day - b.day);

      await Promise.all(
        list.map(async (item) => {
          if (!item._photoPath) return;
          const { data: signed } = await supabase.storage
            .from("time-clock-photos")
            .createSignedUrl(item._photoPath, 60 * 60);
          item.photoUrl = signed?.signedUrl ?? null;
        }),
      );

      if (!cancelled) {
        setItems(list);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [storeId, allocatedStoreId]);

  useEffect(() => {
    if (loading || items.length === 0) return;
    const fadeTimer = setTimeout(() => setFading(true), 18000);
    const hideTimer = setTimeout(() => setVisible(false), 18500);
    return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer); };
  }, [loading, items.length]);

  if (loading || items.length === 0 || !visible) return null;

  const monthLabel = format(new Date(), "MMMM", { locale: ptBR });
  const today = new Date();
  const todayDay = today.getDate();
  const todayMonth = today.getMonth() + 1;

  return (
    <div
      className={`transition-opacity duration-500 flex items-center gap-3 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-accent/15 to-primary/10 px-3 py-2.5 shadow-sm backdrop-blur-sm ${fading ? "opacity-0" : "opacity-100"}`}
    >
      <div className="flex flex-col items-center gap-0.5 shrink-0 pl-0.5 self-center">
        <div className="rounded-full bg-gradient-to-br from-primary to-accent p-1.5 shadow-sm">
          <Cake className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="text-[11px] font-semibold text-primary capitalize whitespace-nowrap leading-tight">
          {monthLabel}
        </span>
      </div>

      <div className="h-10 w-px bg-primary/20 shrink-0 self-center" />

      <div className="flex gap-1.5 overflow-hidden flex-1 min-w-0 items-center">
        {items.map((emp) => {
          const isToday = emp.day === todayDay && parseInt(emp.birth_date.slice(5, 7), 10) === todayMonth;
          const firstName = emp.full_name.split(" ")[0];
          return (
            <div
              key={emp.id}
              className="flex flex-col items-center gap-0.5 shrink-0"
              title={`${emp.full_name} — dia ${String(emp.day).padStart(2, "0")}`}
            >
              <Avatar
                className={`h-10 w-10 rounded-md border-2 ${
                  isToday
                    ? "border-accent ring-2 ring-accent/40 animate-pulse"
                    : "border-primary/40"
                }`}
              >
                {emp.photoUrl && <AvatarImage src={emp.photoUrl} alt={emp.full_name} className="rounded-md object-cover" />}
                <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold rounded-md">
                  <Camera className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <span className={`text-[10px] font-medium text-center leading-tight ${isToday ? "text-accent font-bold" : "text-foreground/85"}`}>
                {firstName}
                <span className="text-muted-foreground ml-0.5">
                  {isToday ? "🎉" : String(emp.day).padStart(2, "0")}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
