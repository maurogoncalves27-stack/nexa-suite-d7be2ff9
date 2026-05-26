import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Lock, Unlock, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Survey {
  id: string; name: string; year: number; semester: number;
  start_date: string; end_date: string; status: "draft" | "open" | "closed";
}

export default function ClimateCampaigns({ onChanged }: { onChanged: () => void }) {
  const [list, setList] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("climate_surveys")
      .select("*")
      .order("year", { ascending: false })
      .order("semester", { ascending: false });
    setList((data ?? []) as Survey[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setStatus = async (id: string, status: Survey["status"]) => {
    const { error } = await supabase.from("climate_surveys").update({ status }).eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Status atualizado" });
    load(); onChanged();
  };

  const ensureCurrent = async () => {
    const { error } = await supabase.rpc("ensure_current_climate_survey" as never);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Campanha do semestre verificada" });
    load(); onChanged();
  };

  if (loading) return <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
        <p className="text-sm text-muted-foreground">
          Campanhas semestrais. O sistema cria automaticamente uma nova rodada a cada semestre.
        </p>
        <Button size="sm" variant="outline" onClick={ensureCurrent} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-1" /> Gerar campanha manualmente
        </Button>
      </div>

      {/* Mobile: cards */}
      <div className="md:hidden space-y-2">
        {list.map((s) => (
          <div key={s.id} className="rounded-lg border bg-card p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium text-sm">{s.name}</div>
              {s.status === "open" && <Badge className="bg-emerald-600 hover:bg-emerald-700 shrink-0">Aberta</Badge>}
              {s.status === "closed" && <Badge variant="secondary" className="shrink-0">Encerrada</Badge>}
              {s.status === "draft" && <Badge variant="outline" className="shrink-0">Rascunho</Badge>}
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              {s.start_date} → {s.end_date}
            </div>
            {s.status === "open" ? (
              <Button size="sm" variant="outline" className="w-full" onClick={() => setStatus(s.id, "closed")}>
                <Lock className="h-4 w-4 mr-1" /> Encerrar
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="w-full" onClick={() => setStatus(s.id, "open")}>
                <Unlock className="h-4 w-4 mr-1" /> Reabrir
              </Button>
            )}
          </div>
        ))}
        {list.length === 0 && (
          <div className="text-center text-muted-foreground py-8 text-sm">Nenhuma campanha.</div>
        )}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.start_date} → {s.end_date}</TableCell>
                <TableCell>
                  {s.status === "open" && <Badge className="bg-emerald-600 hover:bg-emerald-700">Aberta</Badge>}
                  {s.status === "closed" && <Badge variant="secondary">Encerrada</Badge>}
                  {s.status === "draft" && <Badge variant="outline">Rascunho</Badge>}
                </TableCell>
                <TableCell className="text-right space-x-2">
                  {s.status === "open" ? (
                    <Button size="sm" variant="outline" onClick={() => setStatus(s.id, "closed")}>
                      <Lock className="h-4 w-4 mr-1" /> Encerrar
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setStatus(s.id, "open")}>
                      <Unlock className="h-4 w-4 mr-1" /> Reabrir
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {list.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhuma campanha.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
