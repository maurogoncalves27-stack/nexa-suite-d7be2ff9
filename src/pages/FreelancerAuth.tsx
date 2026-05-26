import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, HandCoins } from "lucide-react";
import { useFreelancerSelf } from "@/hooks/useFreelancerSelf";
import { NexaLogoCard } from "@/components/auth/NexaLogoCard";
import { AuthRolePill } from "@/components/auth/AuthRolePill";
import { AuthSwitchLinks } from "@/components/auth/AuthSwitchLinks";

export default function FreelancerAuth() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { freelancer, loading: flLoading } = useFreelancerSelf();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [freelancerId, setFreelancerId] = useState("");
  const [options, setOptions] = useState<{ id: string; full_name: string }[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSending, setForgotSending] = useState(false);

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setForgotSending(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Enviamos um e-mail com o link para redefinir sua senha.");
    setForgotOpen(false);
    setForgotEmail("");
  };

  useEffect(() => {
    if (tab !== "register") return;
    setLoadingList(true);
    (supabase.rpc as any)("list_unlinked_freelancers")
      .then(({ data, error }: any) => {
        if (error) toast.error("Não foi possível carregar a lista de freelancers.");
        else setOptions(data || []);
      })
      .finally(() => setLoadingList(false));
  }, [tab]);

  if (authLoading || (user && flLoading)) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }
  if (user && freelancer) return <Navigate to="/freelancer/painel" replace />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    navigate("/freelancer/painel");
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!freelancerId) { toast.error("Selecione seu nome na lista."); return; }
    setSubmitting(true);
    const { error: signErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${window.location.origin}/freelancer/painel` },
    });
    if (signErr) { setSubmitting(false); toast.error(signErr.message); return; }

    const { error: linkErr } = await (supabase.rpc as any)("link_freelancer_account_by_id", { _freelancer_id: freelancerId });
    setSubmitting(false);
    if (linkErr) {
      toast.error("Conta criada, mas não foi possível vincular. Procure o gestor.");
      return;
    }
    toast.success("Cadastro vinculado! Você já pode acessar as vagas.");
    navigate("/freelancer/painel");
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8 relative overflow-hidden"
      style={{ background: "var(--gradient-subtle)" }}
    >
      <div className="w-full max-w-md relative z-10">
        <NexaLogoCard />
        <div className="flex justify-center mb-4">
          <AuthRolePill variant="freelancer" icon={HandCoins} label="Freelancer" />
        </div>
        <Card className="shadow-xl border-border/50 backdrop-blur-sm bg-card/95">
          <CardHeader className="text-center space-y-1 pb-4">
            <CardTitle className="text-xl">Área do Freelancer</CardTitle>
            <CardDescription>Veja vagas de diária e candidate-se</CardDescription>
          </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="register">Criar conta</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4 mt-3">
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                </div>
                <div className="space-y-2">
                  <Label>Senha</Label>
                  <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Entrar
                </Button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-primary hover:underline w-full text-center"
                  onClick={() => { setForgotEmail(email); setForgotOpen(true); }}
                >
                  Esqueci minha senha
                </button>
              </form>
            </TabsContent>
            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4 mt-3">
                <p className="text-xs text-muted-foreground">Selecione seu nome na lista de freelancers cadastrados pelo gestor.</p>
                <div className="space-y-2">
                  <Label>Seu nome</Label>
                  <Select value={freelancerId} onValueChange={setFreelancerId} disabled={loadingList}>
                    <SelectTrigger>
                      <SelectValue placeholder={loadingList ? "Carregando..." : (options.length ? "Selecione" : "Nenhum freelancer disponível")} />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((o) => (
                        <SelectItem key={o.id} value={o.id}>{o.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Senha</Label>
                  <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Criar conta
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      <AuthSwitchLinks current="freelancer" />
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recuperar senha</DialogTitle>
            <DialogDescription>Informe seu e-mail para receber o link de redefinição.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleForgot} className="space-y-4">
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input type="email" required value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} autoComplete="email" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={forgotSending} className="w-full">
                {forgotSending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Enviar link
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
