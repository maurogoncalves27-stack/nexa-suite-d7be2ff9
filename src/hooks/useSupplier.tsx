import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type SupplierStatus = "pending" | "approved" | "rejected" | "suspended";

export interface SupplierRecord {
  id: string;
  user_id: string | null;
  cnpj: string;
  legal_name: string;
  trade_name: string | null;
  email: string;
  phone: string | null;
  contact_name: string | null;
  payment_terms: string | null;
  notes: string | null;
  status: SupplierStatus;
  rejection_reason: string | null;
  approved_at: string | null;
}

export function useSupplier() {
  const { user, loading: authLoading } = useAuth();
  const [supplier, setSupplier] = useState<SupplierRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!user) {
      setSupplier(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("suppliers")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    setSupplier((data as SupplierRecord) ?? null);
    setLoading(false);
  };

  useEffect(() => {
    if (authLoading) return;
    refresh();
  }, [user?.id, authLoading]);

  return { supplier, loading: loading || authLoading, refresh };
}
