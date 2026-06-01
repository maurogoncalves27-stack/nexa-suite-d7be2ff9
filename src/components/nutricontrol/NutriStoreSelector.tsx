import { useEffect, useState } from "react";
import { Store } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { sortStores } from "@/lib/storeSort";

interface StoreOption {
  id: string;
  name: string;
}

interface Props {
  value: string | null;
  onChange: (storeId: string) => void;
}

export const NutriStoreSelector = ({ value, onChange }: Props) => {
  const { user, isAdmin, isManager, isSuperUser, hasRole } = useAuth();
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [loading, setLoading] = useState(true);
  const isNutritionist = hasRole("nutritionist");
  const canSeeAll = isAdmin || isManager || isSuperUser || isNutritionist;

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      let list: StoreOption[] = [];

      const ALLOWED = ["asa sul", "asa norte", "aguas claras", "águas claras", "lago sul", "fabrica", "fábrica"];
      const isAllowed = (name: string) => {
        const n = name.toLowerCase();
        return ALLOWED.some((a) => n.includes(a));
      };

      if (canSeeAll) {
        // Admin/Manager vê todas as lojas permitidas no NutriControle
        const { data } = await supabase.from("stores").select("id, name, store_type").eq("is_virtual", false).order("name");
        list = ((data ?? []) as StoreOption[]).filter((s) => isAllowed(s.name));
      } else {
        // Colaborador comum: tenta buscar a loja vinculada via employees
        const { data: emp } = await supabase
          .from("employees")
          .select("store_id, allocated_store_id")
          .eq("user_id", user.id)
          .maybeSingle();
        const sid = emp?.allocated_store_id ?? emp?.store_id;
        if (sid) {
          const { data } = await supabase
            .from("stores").select("id, name, store_type")
            .eq("id", sid)
            .maybeSingle();
          if (data) list = [data as StoreOption];
        }
      }

      setStores(sortStores(list));
      // Não pré-seleciona: usuário deve escolher manualmente uma loja
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isAdmin, isManager, isSuperUser, isNutritionist]);

  return (
    <div className="flex items-center gap-2">
      <Store className="h-4 w-4 text-muted-foreground" />
      <Select
        value={value ?? undefined}
        onValueChange={(v) => onChange(v)}
        disabled={loading || stores.length === 0}
      >
        <SelectTrigger className="h-9 w-[220px] text-sm">
          <SelectValue
            placeholder={loading ? "Carregando..." : stores.length === 0 ? "Sem loja vinculada" : "Selecione a loja"}
          />
        </SelectTrigger>
        <SelectContent>
          {stores.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
