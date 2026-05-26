import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSupplier } from "@/hooks/useSupplier";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2, Truck } from "lucide-react";
import { NexaLogoCard } from "@/components/auth/NexaLogoCard";
import { AuthRolePill } from "@/components/auth/AuthRolePill";
import { AuthSwitchLinks } from "@/components/auth/AuthSwitchLinks";

export default function SupplierAuth() {
  const navigate = useNavigate();
  const { user, isSupplier, loading: authLoading } = useAuth();
  const { supplier, loading: supplierLoading } = useSupplier();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (authLoading || (user && supplierLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (user) {
    if (isSupplier || supplier?.status === "approved") return <Navigate to="/fornecedor/painel" replace />;
    if (supplier) return <Navigate to="/fornecedor/aguardando" replace />;
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
    navigate("/fornecedor/painel");
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8 relative overflow-hidden"
      style={{ background: "var(--gradient-subtle)" }}
    >
      <div className="w-full max-w-md relative z-10">
        <NexaLogoCard />
        <div className="flex justify-center mb-4">
          <AuthRolePill variant="fornecedor" icon={Truck} label="Fornecedor" />
        </div>
        <Card className="shadow-xl border-border/50 backdrop-blur-sm bg-card/95">
          <CardHeader className="text-center space-y-1 pb-4">
            <CardTitle className="text-xl">Área do Fornecedor</CardTitle>
            <CardDescription>Acesse sua conta para participar das cotações</CardDescription>
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
                <Link to="/fornecedor/cadastro" className="text-primary font-medium hover:underline">
                  Cadastre-se aqui
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
        <AuthSwitchLinks current="fornecedor" />
      </div>
    </div>
  );
}
