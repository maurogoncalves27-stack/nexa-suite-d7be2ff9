import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { ExternalModuleKey } from "@/lib/externalModules";

export function usePartnerPermissions() {
  const { user, loading: authLoading } = useAuth();
  const [modules, setModules] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!user) {
      setModules(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("external_partner_permissions")
      .select("module")
      .eq("user_id", user.id);
    setModules(new Set((data ?? []).map((d) => d.module)));
    setLoading(false);
  };

  useEffect(() => {
    if (authLoading) return;
    refresh();
  }, [user?.id, authLoading]);

  return {
    modules,
    loading: loading || authLoading,
    has: (m: ExternalModuleKey) => modules.has(m),
    refresh,
  };
}
