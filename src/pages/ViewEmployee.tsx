import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, ImpersonationProvider } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Eye, Loader2, UserSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import EmployeeArea from "./EmployeeArea";

interface EmployeeOption {
  id: string;
  user_id: string;
  full_name: string;
  position: string | null;
  store_name: string | null;
}

export default function ViewEmployee() {
  const { isAdmin, isManager, loading: authLoading } = useAuth();
  const isStaff = isAdmin || isManager;

  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!isStaff) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("employees")
        .select("id, user_id, full_name, position, status, store:stores!employees_store_id_fkey(name)")
        .not("user_id", "is", null)
        .in("status", ["active", "in_training"])
        .order("full_name");
      if (error) console.error("[ViewEmployee] erro carregando colaboradores:", error);
      const opts = (data ?? []).map((e: any) => ({
        id: e.id,
        user_id: e.user_id,
        full_name: e.full_name,
        position: e.position,
        store_name: e.store?.name ?? null,
      })) as EmployeeOption[];
      setEmployees(opts);
      setLoading(false);
    })();
  }, [isStaff]);

  const selected = useMemo(
    () => employees.find((e) => e.user_id === selectedUserId) ?? null,
    [employees, selectedUserId],
  );

  if (authLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isStaff) return <Navigate to="/" replace />;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 md:p-6 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <UserSearch className="h-4 w-4" />
              {selected
                ? <>Visualizando como <strong className="text-foreground">{selected.full_name}</strong></>
                : "Selecione um colaborador para visualizar a área dele exatamente como ele vê"}
            </div>
            {selected && (
              <Button size="sm" variant="outline" onClick={() => setSelectedUserId(null)}>
                Trocar colaborador
              </Button>
            )}
          </div>

          {!selected && (
            loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : employees.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">
                Nenhum colaborador disponível.
              </div>
            ) : (
              <div className="rounded-md border divide-y">
                {employees.map((e) => (
                  <button
                    key={e.user_id}
                    type="button"
                    onClick={() => setSelectedUserId(e.user_id)}
                    className="w-full text-left px-3 py-2 hover:bg-accent transition-colors flex flex-col"
                  >
                    <span className="font-medium text-sm">{e.full_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {[e.position, e.store_name].filter(Boolean).join(" • ") || "—"}
                    </span>
                  </button>
                ))}
              </div>
            )
          )}
        </CardContent>
      </Card>

      {selected && (
        <>
          <Alert className="border-primary/40 bg-primary/5">
            <Eye className="h-4 w-4 text-primary" />
            <AlertTitle className="font-semibold">Modo visualização</AlertTitle>
            <AlertDescription className="text-sm">
              Você está vendo a área do colaborador <strong>{selected.full_name}</strong> exatamente como ela aparece para ele,
              com banners, pendências e botões habilitados como ele os vê.
              Evite executar ações nesta tela — elas seriam registradas como se fossem dele.
            </AlertDescription>
          </Alert>

          <div className={cn("rounded-lg border-2 border-dashed border-primary/30 p-2 md:p-4 bg-muted/20")}>
            <ImpersonationProvider key={selected.user_id} userId={selected.user_id}>
              <EmployeeArea impersonateUserId={selected.user_id} />
            </ImpersonationProvider>
          </div>
        </>
      )}
    </div>
  );
}
