import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserPlus, Trash2, Eye, ShieldAlert, Mail } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface PartnerRow {
  user_id: string;
  email: string | null;
  full_name: string | null;
}

const PartnersPanel = () => {
  const { isAdmin } = useAuth();
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailInput, setEmailInput] = useState("");
  const [granting, setGranting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);

    // 1) IDs com role=partner
    const { data: roles, error: rolesErr } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "partner");

    if (rolesErr) {
      toast({ title: "Erro ao carregar sócios", description: rolesErr.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const ids = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
    if (ids.length === 0) {
      setPartners([]);
      setLoading(false);
      return;
    }

    // 2) Perfis (e-mail/nome)
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, email, full_name")
      .in("user_id", ids);

    const map = new Map<string, PartnerRow>();
    (profiles ?? []).forEach((p: any) =>
      map.set(p.user_id, { user_id: p.user_id, email: p.email ?? null, full_name: p.full_name ?? null }),
    );
    ids.forEach((id) => {
      if (!map.has(id)) map.set(id, { user_id: id, email: null, full_name: null });
    });

    setPartners(Array.from(map.values()));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const grant = async () => {
    const email = emailInput.trim().toLowerCase();
    if (!email) return;
    if (!isAdmin) {
      toast({ title: "Apenas admin", description: "Somente administradoras podem conceder o papel de sócio.", variant: "destructive" });
      return;
    }
    setGranting(true);

    // Localiza o user_id pelo e-mail em profiles
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("user_id, email, full_name")
      .ilike("email", email)
      .maybeSingle();

    if (profileErr) {
      toast({ title: "Erro", description: profileErr.message, variant: "destructive" });
      setGranting(false);
      return;
    }

    if (!profile) {
      toast({
        title: "Usuário não encontrado",
        description: "Peça para o sócio fazer login com Google ao menos uma vez. Depois volte aqui e conceda o acesso.",
        variant: "destructive",
      });
      setGranting(false);
      return;
    }

    const { error: insertErr } = await supabase
      .from("user_roles")
      .insert({ user_id: profile.user_id, role: "partner" });

    if (insertErr && !insertErr.message.toLowerCase().includes("duplicate")) {
      toast({ title: "Erro", description: insertErr.message, variant: "destructive" });
      setGranting(false);
      return;
    }

    toast({ title: "Sócio adicionado", description: `${profile.email} agora tem acesso de visualização.` });
    setEmailInput("");
    setGranting(false);
    load();
  };

  const revoke = async (row: PartnerRow) => {
    if (!isAdmin) return;
    setRemovingId(row.user_id);
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", row.user_id)
      .eq("role", "partner");
    setRemovingId(null);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Acesso revogado", description: `${row.email ?? row.user_id} não é mais sócio.` });
    load();
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Eye className="h-6 w-6 text-primary" /> Sócios
        </h2>
        <p className="text-muted-foreground text-sm">
          Conceda acesso <strong>somente leitura</strong> a sócios para visualização de dashboards, faturamento e financeiro
          (sem dados pessoais de colaboradores e sem permissão de edição).
        </p>
      </div>

      <Card className="bg-muted/40">
        <CardContent className="pt-4 pb-4 text-sm space-y-2">
          <p className="flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <span>
              <strong>Importante:</strong> antes de conceder o acesso, peça para o sócio entrar no sistema com a conta
              Google dele pelo menos uma vez (botão "Entrar com Google" na tela de login). Só assim conseguimos vincular
              o e-mail dele.
            </span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" /> Conceder acesso de sócio
          </CardTitle>
          <CardDescription>Informe o e-mail Google do sócio que já fez login pelo menos uma vez.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Mail className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="email"
                placeholder="email@exemplo.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") grant(); }}
                disabled={!isAdmin || granting}
                className="pl-8"
              />
            </div>
            <Button onClick={grant} disabled={!isAdmin || granting || !emailInput.trim()}>
              {granting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              <span className="ml-2">Conceder</span>
            </Button>
          </div>
          {!isAdmin && (
            <p className="text-xs text-muted-foreground mt-2">
              Apenas administradoras podem conceder/remover esse acesso.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sócios cadastrados</CardTitle>
          <CardDescription>{partners.length} com acesso ativo</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : partners.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              Nenhum sócio cadastrado ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {partners.map((row) => (
                <div
                  key={row.user_id}
                  className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{row.full_name ?? row.email ?? "Sócio"}</span>
                      <Badge variant="secondary" className="text-xs">Somente leitura</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{row.email ?? row.user_id}</div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!isAdmin || removingId === row.user_id}
                      >
                        {removingId === row.user_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        <span className="ml-2">Revogar</span>
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Revogar acesso de sócio?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {row.email ?? "Este usuário"} não poderá mais visualizar os dados gerenciais.
                          O login Google permanece, mas sem acesso ao sistema.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => revoke(row)}>Revogar</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PartnersPanel;
