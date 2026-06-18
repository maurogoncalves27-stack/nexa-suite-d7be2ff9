import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isElectron } from "@/lib/electronBridge";

const HEARTBEAT_MS = 60_000;

interface Props {
  storeId: string | null;
}

async function readRustDeskId(): Promise<string | null> {
  if (!isElectron() || !window.electron?.remote?.getRustDeskId) return null;
  try {
    const res = await window.electron.remote.getRustDeskId();
    return res?.id ?? null;
  } catch {
    return null;
  }
}

export function TotemRemoteHeartbeat({ storeId }: Props) {
  useEffect(() => {
    if (!storeId) return;

    const beat = async () => {
      const rustdeskId = await readRustDeskId();
      const machineName = window.electron?.remote?.machineName ?? "totem-web";

      const row = {
        store_id: storeId,
        terminal_kind: "totem" as const,
        machine_name: machineName,
        rustdesk_id: rustdeskId,
        app_version: window.electron?.remote?.appVersion ?? null,
        screen_spec: "23.8in-vertical",
        metadata: {
          userAgent: navigator.userAgent,
          path: window.location.pathname,
        },
        last_seen_at: new Date().toISOString(),
      };

      const { data: existing } = await (supabase as any)
        .from("store_terminal_remote")
        .select("id")
        .eq("store_id", storeId)
        .eq("terminal_kind", "totem")
        .eq("machine_name", machineName)
        .maybeSingle();

      if (existing?.id) {
        await (supabase as any).from("store_terminal_remote").update(row).eq("id", existing.id);
      } else {
        await (supabase as any).from("store_terminal_remote").insert(row);
      }
    };

    void beat();
    const id = window.setInterval(() => void beat(), HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [storeId]);

  return null;
}
