import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface InventoryPermission {
  canReceive: boolean;
  canViewPayables: boolean;
  storeId: string | null;
  position: string | null;
  loading: boolean;
}

export const useInventoryPermission = (): InventoryPermission => {
  const { user, isAdmin, isManager } = useAuth();
  const [state, setState] = useState<InventoryPermission>({
    canReceive: false,
    canViewPayables: false,
    storeId: null,
    position: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!user) {
        if (!cancelled) setState({ canReceive: false, canViewPayables: false, storeId: null, position: null, loading: false });
        return;
      }
      const isStaff = isAdmin || isManager;

      // Busca cargo + loja do colaborador (se houver)
      const { data: emp } = await supabase
        .from("employees")
        .select("position, store_id, allocated_store_id, status")
        .eq("user_id", user.id)
        .maybeSingle();

      let canReceive = isStaff;
      const storeId = emp?.allocated_store_id ?? emp?.store_id ?? null;

      if (!isStaff && emp && (emp.status === "active" || emp.status === "in_training")) {
        const { data: override } = await supabase
          .from("user_access_overrides")
          .select("can_receive_invoices")
          .eq("user_id", user.id)
          .maybeSingle();
        canReceive = !!override?.can_receive_invoices;
      }

      if (!cancelled) {
        setState({
          canReceive,
          canViewPayables: isStaff,
          storeId,
          position: emp?.position ?? null,
          loading: false,
        });
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin, isManager]);

  return state;
};
