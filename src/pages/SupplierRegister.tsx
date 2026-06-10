import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2, Truck, Eye, EyeOff } from "lucide-react";
import { NexaLogoCard } from "@/components/auth/NexaLogoCard";
import { AuthRolePill } from "@/components/auth/AuthRolePill";

const onlyDigits = (v: string) => v.replace(/\D/g, "");

const formatCnpj = (v: string) => {
  const d = onlyDigits(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
};

export default function SupplierRegister() {
  const navigate = useNavigate();
  const { user, isSupplier, loading: authLoading } = useAuth();
  const [legalName, setLegalName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!authLoading && user) {
    if (isSupplier) return <Navigate to="/fornecedor/painel" replace />;
    return <Navigate to="/fornecedor/aguardando" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCnpj = onlyDigits(cnpj);
    if (cleanCnpj.length !== 14) {
      toast({ title: "CNPJ inválido", description: "Informe os 14 dígitos.", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Senha curta", description: "Mínimo de 6 caracteres.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/fornecedor/login`,
        data: { full_name: legalName, supplier_signup: true },
      },
    });
    if (signUpError) {
      setSubmitting(false);
      toast({ title: "Falha no cadastro", description: signUpError.message, variant: "destructive" });
      return;
    }

    // Tenta logar (caso confirmação de email esteja desativada)
    let authedUserId = signUpData.user?.id ?? null;
    if (!signUpData.session) {
      const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInErr) {
        setSubmitting(false);
        toast({
          title: "Cadastro criado",
          description: "Verifique seu e-mail para confirmar a conta antes de prosseguir.",
        });
        navigate("/fornecedor/login");
        return;
      }
      authedUserId = signIn.user?.id ?? authedUserId;
    }

    if (!authedUserId) {
      setSubmitting(false);
      toast({ title: "Erro inesperado", description: "Não foi possível identificar o usuário.", variant: "destructive" });
      return;
    }

    const { error: insErr } = await supabase.from("suppliers").insert({
      user_id: authedUserId,
      cnpj: cleanCnpj,
      legal_name: legalName.trim().toUpperCase(),
      email: email.trim(),
      phone: phone.trim() || null,
      contact_name: contactName.trim() || null,
    });
    setSubmitting(false);

    if (insErr) {
      toast({
        title: "Falha ao salvar fornecedor",
        description: insErr.message.includes("duplicate") ? "Já existe um fornecedor com esse CNPJ." : insErr.message,
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Cadastro enviado!", description: "Aguarde a aprovação do administrador." });
    navigate("/fornecedor/aguardando");
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8"
      style={{ background: "var(--gradient-subtle)" }}
    >
      <div className="w-full max-w-lg">
        <NexaLogoCard />
        <div className="flex justify-center mb-4">
          <AuthRolePill variant="fornecedor" icon={Truck} label="Fornecedor" />
        </div>
        <Card className="shadow-xl border-border/50 backdrop-blur-sm bg-card/95">
          <CardHeader className="text-center space-y-1 pb-4">
            <CardTitle className="text-xl">Cadastro de Fornecedor</CardTitle>
            <CardDescription>Preencha os dados básicos. Após aprovação você poderá completar categorias e condições.</CardDescription>
          </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="legal_name">Razão social*</Label>
              <Input id="legal_name" required value={legalName} onChange={(e) => setLegalName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cnpj">CNPJ*</Label>
              <Input id="cnpj" required value={cnpj} onChange={(e) => setCnpj(formatCnpj(e.target.value))} placeholder="00.000.000/0000-00" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="contact">Pessoa de contato</Label>
                <Input id="contact" value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail (será usado para login)*</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha*</Label>
              <div className="relative">
                <Input id="password" type={showPassword ? "text" : "password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className="pr-10" />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enviar cadastro
            </Button>
            <p className="text-center text-sm text-muted-foreground pt-2">
              Já tem cadastro?{" "}
              <Link to="/fornecedor/login" className="text-primary font-medium hover:underline">
                Faça login
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
