import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSupplier } from "@/hooks/useSupplier";
import { useOutsourced } from "@/hooks/useOutsourced";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2, Handshake } from "lucide-react";
import { NexaLogoCard } from "@/components/auth/NexaLogoCard";
import { AuthRolePill } from "@/components/auth/AuthRolePill";
import { AuthSwitchLinks } from "@/components/auth/AuthSwitchLinks";

/**
 * Login unificado para parceiros externos (fornecedores e terceirizados).
 * Após autenticar, o redirect decide o destino conforme o tipo de cadastro.
 */
export default function PartnerAuth() {
  const navigate = useNavigate();
  const { user, isSupplier, isOutsourced, loading: authLoading } = useAuth();
  const { supplier, loading: supplierLoading } = useSupplier();
  const { record: outsourced, loading: outLoading } = useOutsourced();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const stillLoading = authLoading || (user && (supplierLoading || outLoading));

  if (stillLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (user) {
    if (isSupplier || supplier?.status === "approved") return <Navigate to="/fornecedor/painel" replace />;
    if (isOutsourced || outsourced?.approval_status === "approved") return <Navigate to="/terceirizado/painel" replace />;
    if (supplier) return <Navigate to="/fornecedor/aguardando" replace />;
    if (outsourced) return <Navigate to="/parceiro/aguardando" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setSubmitting(false);
    if (error) {
      toast({ title: "Falha no login", description: error.message, variant: "destructive" });
      return;
    }
    navigate("/parceiro/login");
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8 relative overflow-hidden"
      style={{ background: "var(--gradient-subtle)" }}
    >
      <div className="w-full max-w-md relative z-10">
        <NexaLogoCard />
        <div className="flex justify-center mb-4">
          <AuthRolePill variant="parceiro" icon={Handshake} label="Parceiro / Terceirizado" />
        </div>
        <Card className="shadow-xl border-border/50 backdrop-blur-sm bg-card/95">
          <CardHeader className="text-center space-y-1 pb-4">
            <CardTitle className="text-xl">Acesso de Parceiro</CardTitle>
            <CardDescription>Fornecedores e profissionais terceirizados</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Entrar
              </Button>
              <p className="text-center text-sm text-muted-foreground pt-2">
                Ainda não tem cadastro?{" "}
                <Link to="/parceiro/cadastro" className="text-primary font-medium hover:underline">
                  Cadastre-se aqui
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
        <AuthSwitchLinks current="parceiro" />
      </div>
    </div>
  );
}
