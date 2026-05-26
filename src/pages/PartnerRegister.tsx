import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Loader2, Handshake, Truck, Stethoscope } from "lucide-react";
import { NexaLogoCard } from "@/components/auth/NexaLogoCard";
import { AuthRolePill } from "@/components/auth/AuthRolePill";

type PartnerType = "supplier" | "outsourced";

const onlyDigits = (v: string) => v.replace(/\D/g, "");

const formatCnpj = (v: string) => {
  const d = onlyDigits(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
};

const formatCpf = (v: string) => {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};

/**
 * Cadastro unificado para parceiros externos.
 * O usuário escolhe entre Fornecedor (CNPJ) e Profissional Terceirizado (CPF).
 * Em ambos os casos, o cadastro entra como "pending" e precisa ser aprovado.
 */
export default function PartnerRegister() {
  const navigate = useNavigate();
  const { user, isExternalPartner, loading: authLoading } = useAuth();
  const [type, setType] = useState<PartnerType>("supplier");

  // comuns
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // supplier
  const [legalName, setLegalName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [contactName, setContactName] = useState("");

  // outsourced
  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [specialty, setSpecialty] = useState("");

  if (!authLoading && user && isExternalPartner) {
    return <Navigate to="/parceiro/login" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // validações por tipo
    if (type === "supplier") {
      if (onlyDigits(cnpj).length !== 14) {
        toast({ title: "CNPJ inválido", description: "Informe os 14 dígitos.", variant: "destructive" });
        return;
      }
      if (!legalName.trim()) {
        toast({ title: "Razão social obrigatória", variant: "destructive" });
        return;
      }
    } else {
      if (onlyDigits(cpf).length !== 11) {
        toast({ title: "CPF inválido", description: "Informe os 11 dígitos.", variant: "destructive" });
        return;
      }
      if (!fullName.trim()) {
        toast({ title: "Nome completo obrigatório", variant: "destructive" });
        return;
      }
    }
    if (password.length < 6) {
      toast({ title: "Senha curta", description: "Mínimo de 6 caracteres.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    const fullNameForAuth = type === "supplier" ? legalName : fullName;

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/parceiro/login`,
        data: { full_name: fullNameForAuth, partner_type: type },
      },
    });
    if (signUpError) {
      setSubmitting(false);
      toast({ title: "Falha no cadastro", description: signUpError.message, variant: "destructive" });
      return;
    }

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
        navigate("/parceiro/login");
        return;
      }
      authedUserId = signIn.user?.id ?? authedUserId;
    }

    if (!authedUserId) {
      setSubmitting(false);
      toast({ title: "Erro inesperado", description: "Não foi possível identificar o usuário.", variant: "destructive" });
      return;
    }

    if (type === "supplier") {
      const { error: insErr } = await supabase.from("suppliers").insert({
        user_id: authedUserId,
        cnpj: onlyDigits(cnpj),
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
    } else {
      const { error: insErr } = await supabase.from("outsourced_professionals").insert({
        user_id: authedUserId,
        full_name: fullName.trim().toUpperCase(),
        cpf: onlyDigits(cpf),
        email: email.trim(),
        phone: phone.trim() || null,
        specialty: specialty.trim() || null,
      });
      setSubmitting(false);
      if (insErr) {
        toast({ title: "Falha ao salvar cadastro", description: insErr.message, variant: "destructive" });
        return;
      }
      toast({ title: "Cadastro enviado!", description: "Aguarde a aprovação e a liberação dos módulos." });
      navigate("/parceiro/aguardando");
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8"
      style={{ background: "var(--gradient-subtle)" }}
    >
      <div className="w-full max-w-lg">
        <NexaLogoCard />
        <div className="flex justify-center mb-4">
          <AuthRolePill variant="parceiro" icon={Handshake} label="Parceiro / Terceirizado" />
        </div>
        <Card className="shadow-xl border-border/50 backdrop-blur-sm bg-card/95">
          <CardHeader className="text-center space-y-1 pb-4">
            <CardTitle className="text-xl">Cadastro de Parceiro</CardTitle>
            <CardDescription>Escolha o tipo de cadastro abaixo</CardDescription>
          </CardHeader>
        <CardContent>
          <Tabs value={type} onValueChange={(v) => setType(v as PartnerType)} className="mb-4">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="supplier"><Truck className="h-4 w-4 mr-2" />Fornecedor</TabsTrigger>
              <TabsTrigger value="outsourced"><Stethoscope className="h-4 w-4 mr-2" />Terceirizado</TabsTrigger>
            </TabsList>
            <TabsContent value="supplier" />
            <TabsContent value="outsourced" />
          </Tabs>

          <form onSubmit={handleSubmit} className="space-y-3">
            {type === "supplier" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="legal_name">Razão social*</Label>
                  <Input id="legal_name" required value={legalName} onChange={(e) => setLegalName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cnpj">CNPJ*</Label>
                  <Input id="cnpj" required value={cnpj} onChange={(e) => setCnpj(formatCnpj(e.target.value))} placeholder="00.000.000/0000-00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact">Pessoa de contato</Label>
                  <Input id="contact" value={contactName} onChange={(e) => setContactName(e.target.value)} />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="full_name">Nome completo*</Label>
                  <Input id="full_name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cpf">CPF*</Label>
                  <Input id="cpf" required value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))} placeholder="000.000.000-00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="specialty">Área / Especialidade</Label>
                  <Input id="specialty" value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Ex.: Nutricionista, Contador, Manutenção..." />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail (será usado para login)*</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha*</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enviar cadastro
            </Button>
            <p className="text-center text-sm text-muted-foreground pt-2">
              Já tem cadastro?{" "}
              <Link to="/parceiro/login" className="text-primary font-medium hover:underline">
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
