import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isSuperUserId } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2, Fingerprint, Lock, KeyRound, UserPlus, Briefcase, Eye, EyeOff } from "lucide-react";
import { NexaLogoCard } from "@/components/auth/NexaLogoCard";
import { AuthRolePill } from "@/components/auth/AuthRolePill";
import { AuthSwitchLinks } from "@/components/auth/AuthSwitchLinks";
import { isWebAuthnSupported, getPasskeyAssertion } from "@/lib/webauthn";
import { lovable } from "@/integrations/lovable";
import { Checkbox } from "@/components/ui/checkbox";
import LgpdTermsDialog from "@/components/auth/LgpdTermsDialog";
import SignatureSetupDialog from "@/components/auth/SignatureSetupDialog";
import { registerUserSignature } from "@/lib/userSignature";

const emailSchema = z.string().trim().email("E-mail inválido").max(255);
const passwordSchema = z.string().min(6, "Senha deve ter ao menos 6 caracteres").max(72);
const nameSchema = z.string().trim().min(2, "Nome muito curto").max(100);

const LAST_EMAIL_KEY = "rhplus:lastEmail";
const KNOWN_EMAILS_KEY = "rhplus:knownEmails";
const BIO_PREF_PREFIX = "rhplus:bioPref:";

function loadKnownEmails(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KNOWN_EMAILS_KEY) ?? "[]");
  } catch { return []; }
}
function rememberEmail(email: string) {
  try {
    localStorage.setItem(LAST_EMAIL_KEY, email);
    const set = new Set(loadKnownEmails());
    set.add(email.toLowerCase());
    localStorage.setItem(KNOWN_EMAILS_KEY, JSON.stringify([...set]));
  } catch {}
}
function getBioPref(email: string): boolean {
  try { return localStorage.getItem(BIO_PREF_PREFIX + email.toLowerCase()) === "1"; } catch { return false; }
}
function setBioPref(email: string, value: boolean) {
  try {
    if (value) localStorage.setItem(BIO_PREF_PREFIX + email.toLowerCase(), "1");
    else localStorage.removeItem(BIO_PREF_PREFIX + email.toLowerCase());
  } catch {}
}

type Mode = "signin" | "signup";

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  const webAuthnOk = isWebAuthnSupported();
  const explicitFrom = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
  const computeRedirect = (uid?: string | null, meta?: Record<string, unknown> | null) => {
    // Super-usuário SEMPRE vai para a tela de seleção de perfil ao logar,
    // ignorando "from" e qualquer viewMode antigo na sessão.
    if (isSuperUserId(uid)) {
      try { sessionStorage.removeItem("rh:viewMode"); } catch {}
      return "/selecionar-acesso";
    }
    // Logins de TOTEM vão direto para a tela do totem.
    const m = meta ?? (user?.user_metadata as Record<string, unknown> | undefined);
    if (m && (m as { totem_login?: boolean }).totem_login) return "/totem";
    if (explicitFrom) return explicitFrom;
    return "/";
  };
  const redirectAfterLogin = computeRedirect(user?.id);


  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem(LAST_EMAIL_KEY) ?? ""; } catch { return ""; }
  });
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [bioPrefEnabled, setBioPrefEnabled] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const [autoTried, setAutoTried] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  // Cadastro da assinatura única após criar a conta
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [signatureBusy, setSignatureBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate(redirectAfterLogin, { replace: true });
  }, [user, loading, navigate, redirectAfterLogin]);

  // Detectar passkey disponível conforme o usuário digita o e-mail (debounced)
  useEffect(() => {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setHasPasskey(false);
      setBioPrefEnabled(false);
      return;
    }
    const normalized = parsed.data.toLowerCase();
    setBioPrefEnabled(getBioPref(normalized));
    const t = setTimeout(async () => {
      try {
        const { data } = await supabase.functions.invoke("auth-methods-available", { body: { email: normalized } });
        setHasPasskey(!!(data as any)?.passkey);
      } catch {
        setHasPasskey(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [email]);

  // Detectar ambiente de preview (passkeys não funcionam entre domínios)
  const isPreviewDomain =
    typeof window !== "undefined" &&
    (window.location.hostname.includes("lovableproject.com") ||
      window.location.hostname.includes("id-preview--"));

  // Auto-disparar passkey se o usuário marcou "usar sempre"
  // (não dispara em domínios de preview pra evitar popup "nenhuma chave disponível")
  useEffect(() => {
    if (mode !== "signin" || autoTried) return;
    if (!bioPrefEnabled || !hasPasskey || !webAuthnOk) return;
    if (isPreviewDomain) return;
    setAutoTried(true);
    void loginWithPasskey();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, bioPrefEnabled, hasPasskey, webAuthnOk]);

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const ep = emailSchema.safeParse(email);
    const pp = passwordSchema.safeParse(password);
    if (!ep.success || !pp.success) {
      toast({ title: "Dados inválidos", description: (ep.success ? pp : ep).error?.errors[0].message ?? "", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { data: signInData, error } = await supabase.auth.signInWithPassword({ email: ep.data, password: pp.data });
    setBusy(false);
    if (error) {
      toast({ title: "Falha no login", description: error.message, variant: "destructive" });
      return;
    }
    rememberEmail(ep.data);
    setBioPref(ep.data, bioPrefEnabled);
    navigate(computeRedirect(signInData.user?.id), { replace: true });
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!acceptedTerms) {
      toast({ title: "Aceite obrigatório", description: "Você precisa aceitar os Termos e LGPD.", variant: "destructive" });
      return;
    }
    const ep = emailSchema.safeParse(email);
    const pp = passwordSchema.safeParse(password);
    const np = nameSchema.safeParse(fullName);
    if (!ep.success || !pp.success || !np.success) {
      const err = (!np.success ? np : !ep.success ? ep : pp).error?.errors[0].message ?? "";
      toast({ title: "Dados inválidos", description: err, variant: "destructive" });
      return;
    }
    setBusy(true);
    const { data: signUpData, error } = await supabase.auth.signUp({
      email: ep.data, password: pp.data,
      options: { emailRedirectTo: `${window.location.origin}/`, data: { full_name: np.data } },
    });
    if (error) {
      setBusy(false);
      toast({ title: "Falha no cadastro", description: error.message, variant: "destructive" });
      return;
    }
    if (signUpData.user) {
      await supabase.from("lgpd_consents").insert({
        user_id: signUpData.user.id,
        user_agent: navigator.userAgent,
      });
    }
    rememberEmail(ep.data);

    // Garante sessão ativa para gravar a assinatura no storage (RLS exige auth.uid())
    let activeUserId = signUpData.session?.user?.id ?? null;
    if (!activeUserId) {
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
        email: ep.data,
        password: pp.data,
      });
      if (signInErr) {
        // E-mail provavelmente exige confirmação — pula assinatura por agora.
        setBusy(false);
        toast({
          title: "Conta criada",
          description: "Confirme seu e-mail e faça login. Você cadastrará sua assinatura no primeiro acesso.",
        });
        setMode("signin");
        return;
      }
      activeUserId = signInData.user?.id ?? null;
    }

    setBusy(false);
    if (activeUserId) {
      setPendingUserId(activeUserId);
      setSignatureDialogOpen(true);
    } else {
      toast({ title: "Conta criada", description: "Você já pode acessar o sistema." });
      setMode("signin");
    }
  };

  const handleSignatureConfirm = async (signatureDataUrl: string) => {
    if (!pendingUserId) return;
    setSignatureBusy(true);
    try {
      await registerUserSignature({ userId: pendingUserId, signatureDataUrl });
      toast({
        title: "Assinatura cadastrada",
        description: "Pronto! Sua assinatura será usada em todos os documentos.",
      });
      setSignatureDialogOpen(false);
      setPendingUserId(null);
      navigate(redirectAfterLogin, { replace: true });
    } catch (err: any) {
      toast({
        title: "Erro ao salvar assinatura",
        description: err?.message ?? "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSignatureBusy(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = emailSchema.safeParse(resetEmail);
    if (!parsed.success) {
      toast({ title: "E-mail inválido", description: parsed.error.errors[0].message, variant: "destructive" });
      return;
    }
    setResetBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetBusy(false);
    if (error) {
      toast({ title: "Falha ao enviar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "E-mail enviado", description: "Se o e-mail estiver cadastrado, você receberá um link." });
    setResetOpen(false);
    setResetEmail("");
  };

  async function loginWithPasskey() {
    const ep = emailSchema.safeParse(email);
    if (!ep.success) { toast({ title: "Informe seu e-mail", variant: "destructive" }); return; }
    if (!webAuthnOk) { toast({ title: "Não suportado neste navegador", variant: "destructive" }); return; }
    setBioBusy(true);
    try {
      const { data: opts, error } = await supabase.functions.invoke("passkey-login-options", {
        body: { email: ep.data, rpId: window.location.hostname },
      });
      if (error || !opts) throw new Error(error?.message ?? "Falha ao iniciar");
      if (!opts.allowCredentials || opts.allowCredentials.length === 0) {
        throw new Error("Nenhuma passkey cadastrada para este e-mail neste sistema.");
      }
      const assertion = await getPasskeyAssertion(opts);
      const { data: verify, error: vErr } = await supabase.functions.invoke("passkey-login-verify", {
        body: {
          email: ep.data, credential: assertion,
          expectedChallenge: opts.challenge, expectedOrigin: window.location.origin,
        },
      });
      if (vErr || !verify?.token) throw new Error(vErr?.message ?? "Falha na verificação");
      const { error: otpErr } = await supabase.auth.verifyOtp({
        email: ep.data, token: verify.token, type: "email",
      });
      if (otpErr) throw new Error(otpErr.message);
      rememberEmail(ep.data);
      setBioPref(ep.data, true);
      navigate(redirectAfterLogin, { replace: true });
    } catch (e: any) {
      toast({
        title: "Falha no login biométrico",
        description: (e?.message ?? String(e)) + " — você pode usar a senha.",
        variant: "destructive",
      });
    } finally {
      setBioBusy(false);
    }
  }

  const showPasskey = hasPasskey && webAuthnOk && mode === "signin";

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8 relative overflow-hidden"
      style={{ background: "var(--gradient-subtle)" }}
    >
      <div
        className="absolute -top-32 -left-32 h-96 w-96 rounded-full opacity-30 blur-3xl pointer-events-none"
        style={{ background: "var(--gradient-primary)" }}
        aria-hidden
      />
      <div
        className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full opacity-20 blur-3xl pointer-events-none"
        style={{ background: "var(--gradient-primary)" }}
        aria-hidden
      />

      <div className="w-full max-w-md relative z-10">
        <NexaLogoCard />
        <div className="flex justify-center mb-4">
          <AuthRolePill variant="colaborador" icon={Briefcase} label="Colaborador / Gestor" />
        </div>


        <Card className="shadow-xl border-border/50 backdrop-blur-sm bg-card/95">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl">
              {mode === "signin" ? "Acesse sua conta" : "Crie sua conta"}
            </CardTitle>
            <CardDescription>
              {mode === "signin"
                ? "Informe seu e-mail e senha para entrar"
                : "Preencha seus dados para se cadastrar"}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {mode === "signin" ? (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5" /> Senha
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pr-10"
                    />
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

                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Entrar
                </Button>

                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">ou</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={async () => {
                    const result = await lovable.auth.signInWithOAuth("google", {
                      redirect_uri: `${window.location.origin}${redirectAfterLogin}`,
                    });
                    if (result.error) {
                      toast({ title: "Falha no login com Google", description: result.error.message ?? String(result.error), variant: "destructive" });
                      return;
                    }
                    if (result.redirected) return;
                    navigate(redirectAfterLogin, { replace: true });
                  }}
                >
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  Entrar com Google
                </Button>

                {showPasskey && (
                  <>
                    <div className="relative py-1">
                      <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">ou</span>
                      </div>
                    </div>

                    <Button
                      type="button"
                      onClick={loginWithPasskey}
                      variant="outline"
                      className="w-full"
                      disabled={bioBusy || isPreviewDomain}
                    >
                      {bioBusy
                        ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        : <Fingerprint className="mr-2 h-4 w-4" />}
                      Entrar com Digital
                    </Button>

                    {isPreviewDomain ? (
                      <p className="text-xs text-muted-foreground text-center leading-relaxed">
                        A biometria está vinculada ao domínio onde foi cadastrada
                        (<span className="font-mono">nexasuite.aquelaparme.com.br</span>).
                        Acesse pelo app publicado para usar a digital.
                      </p>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="bio-pref"
                          checked={bioPrefEnabled}
                          onCheckedChange={(c) => {
                            const v = c === true;
                            setBioPrefEnabled(v);
                            setBioPref(email, v);
                          }}
                        />
                        <Label htmlFor="bio-pref" className="text-xs font-normal cursor-pointer">
                          Usar biometria automaticamente neste dispositivo
                        </Label>
                      </div>
                    )}
                  </>
                )}

                <div className="flex items-center justify-between gap-2 pt-1">
                  <Dialog open={resetOpen} onOpenChange={(o) => { setResetOpen(o); if (o) setResetEmail(email); }}>
                    <DialogTrigger asChild>
                      <Button type="button" variant="link" className="h-auto p-0 text-sm">
                        <KeyRound className="mr-1 h-3.5 w-3.5" /> Esqueci minha senha
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Redefinir senha</DialogTitle>
                        <DialogDescription>
                          Informe seu e-mail e enviaremos um link para criar uma nova senha.
                        </DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleResetPassword} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="reset-email">E-mail</Label>
                          <Input id="reset-email" type="email" value={resetEmail}
                            onChange={(e) => setResetEmail(e.target.value)} required autoComplete="email" />
                        </div>
                        <DialogFooter>
                          <Button type="submit" className="w-full" disabled={resetBusy}>
                            {resetBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Enviar link de redefinição
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>

                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-sm"
                    onClick={() => setMode("signup")}
                  >
                    <UserPlus className="mr-1 h-3.5 w-3.5" /> Criar conta
                  </Button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nome completo</Label>
                  <Input id="fullName" required autoFocus value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email-su">E-mail</Label>
                  <Input
                    id="email-su"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-su">Senha</Label>
                  <div className="relative">
                    <Input
                      id="password-su"
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete="new-password"
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pr-10"
                    />
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
                <div className="flex items-start gap-2 rounded-md border p-3 bg-muted/30">
                  <Checkbox id="lgpd-accept" checked={acceptedTerms}
                    onCheckedChange={(c) => setAcceptedTerms(c === true)} className="mt-0.5" />
                  <Label htmlFor="lgpd-accept" className="text-xs leading-relaxed cursor-pointer font-normal">
                    Li e aceito os{" "}
                    <button type="button" onClick={() => setTermsOpen(true)} className="text-primary underline font-medium">
                      Termos de Uso e Política de Privacidade (LGPD)
                    </button>
                    , autorizando o tratamento dos meus dados pessoais.
                  </Label>
                </div>
                <Button type="submit" className="w-full" disabled={busy || !acceptedTerms}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Criar conta
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => setMode("signin")}
                >
                  Já tenho conta — entrar
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
        <AuthSwitchLinks current="colaborador" />
      </div>


      <LgpdTermsDialog open={termsOpen} onOpenChange={setTermsOpen} />

      <SignatureSetupDialog
        open={signatureDialogOpen}
        onConfirm={handleSignatureConfirm}
        busy={signatureBusy}
      />
    </div>
  );
}
