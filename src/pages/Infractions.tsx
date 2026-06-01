import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert, Loader2 } from "lucide-react";
import InfractionsTab from "@/components/evaluations/InfractionsTab";
import type { Cycle } from "@/pages/Evaluations";

export default function Infractions() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("evaluation_cycles")
        .select("*")
        .order("start_date", { ascending: false });
      setCycles((data ?? []) as Cycle[]);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Infrações e Advertências
        </h1>
        <p className="text-muted-foreground">Registre pontuações e advertências.</p>
      </div>
      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <InfractionsTab cycles={cycles} />
      )}
    </div>
  );
}
