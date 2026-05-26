import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type FreelancerSelf = {
  id: string;
  full_name: string;
  cpf: string | null;
  email: string | null;
  status: string;
};

/** Retorna o cadastro de freelancer do usuário logado, se houver. */
export function useFreelancerSelf() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<FreelancerSelf | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    if (!user) { setData(null); setLoading(false); return; }
    setLoading(true);
    const { data: row } = await supabase
      .from("freelancers")
      .select("id, full_name, cpf, email, status")
      .eq("user_id", user.id)
      .maybeSingle();
    setData((row ?? null) as FreelancerSelf | null);
    setLoading(false);
  };

  useEffect(() => { if (!authLoading) reload(); /* eslint-disable-next-line */ }, [authLoading, user?.id]);

  return { freelancer: data, loading: loading || authLoading, reload };
}
