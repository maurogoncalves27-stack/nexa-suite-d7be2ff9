import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import { ShieldAlert, Trash2, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { loadChecklistAudience } from "@/lib/checklistAudience";

interface Row {
  user_id: string;
  group_id: string;
  group_name: string;
  full_name: string;
  reason: "nao_colaborador" | "desligado";
}

export default function ChecklistAudienceAudit() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const today = new Date().toISOString().split("T")[0];
    const [audience, { data: groups }, { data: profiles }] = await Promise.all([
      loadChecklistAudience(today),
      supabase.from("access_groups").select("id, name"),
      supabase.from("profiles").select("user_id, full_name"),
    ]);
    const groupName: Record<string, string> = {};
    (groups ?? []).forEach((g: any) => (groupName[g.id] = g.name));
    const profName: Record<string, string> = {};
    (profiles ?? []).forEach((p: any) => (profName[p.user_id] = p.full_name));
    setRows(
      audience.invalidMemberships.map((m) => ({
        ...m,
        group_name: groupName[m.group_id] ?? "Grupo",
        // nome do cadastro tem prioridade; perfil só quando não é colaborador
        full_name:
          m.reason === "nao_colaborador" ? (profName[m.user_id] ?? m.full_name) : m.full_name,
      })),
    );

    setLoading(false);
  };

  useEffect(() => { if (open) load(); }, [open]);

  const remove = async (row: Row) => {
    const key = `${row.user_id}-${row.group_id}`;
    setRemoving(key);
    const { error } = await supabase
      .from("user_access_groups")
      .delete()
      .eq("user_id", row.user_id)
      .eq("group_id", row.group_id);
    setRemoving(null);
    if (error) { toast.error(error.message); return; }
    setRows((prev) => prev.filter((r) => `${r.user_id}-${r.group_id}` !== key));
    toast.success("Vínculo removido");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <ShieldAlert className="h-4 w-4" /> Auditoria
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" /> Auditoria de público
          </DialogTitle>
          <DialogDescription>
            Pessoas vinculadas a grupos de check-list que não são colaboradores ativos.
            Elas não são mais cobradas, mas o vínculo pode ser removido aqui.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mx-auto" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-success" />
            Nenhum vínculo irregular.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const key = `${r.user_id}-${r.group_id}`;
              return (
                <div key={key} className="flex items-center justify-between gap-2 border rounded-lg p-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{r.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.group_name}</p>
                    <Badge
                      variant={r.reason === "desligado" ? "secondary" : "destructive"}
                      className="mt-1 text-[10px]"
                    >
                      {r.reason === "desligado" ? "Desligado" : "Não é colaborador"}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost" size="icon"
                    disabled={removing === key}
                    onClick={() => remove(r)}
                  >
                    {removing === key
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Trash2 className="h-4 w-4 text-destructive" />}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
