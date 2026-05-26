import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type OutsourcedApprovalStatus = "pending" | "approved" | "rejected" | "suspended";

export interface OutsourcedRecord {
  id: string;
  user_id: string | null;
  full_name: string | null;
  cpf: string | null;
  email: string | null;
  phone: string | null;
  specialty: string | null;
  role_title: string | null;
  approval_status: OutsourcedApprovalStatus;
  rejection_reason: string | null;
}

export function useOutsourced() {
  const { user, loading: authLoading } = useAuth();
  const [record, setRecord] = useState<OutsourcedRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!user) {
      setRecord(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("outsourced_professionals")
      .select("id,user_id,full_name,cpf,email,phone,specialty,role_title,approval_status,rejection_reason")
      .eq("user_id", user.id)
      .maybeSingle();
    setRecord((data as OutsourcedRecord) ?? null);
    setLoading(false);
  };

  useEffect(() => {
    if (authLoading) return;
    refresh();
  }, [user?.id, authLoading]);

  return { record, loading: loading || authLoading, refresh };
}
