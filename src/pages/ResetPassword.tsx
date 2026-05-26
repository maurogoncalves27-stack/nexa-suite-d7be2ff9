import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { NexaLogoCard } from "@/components/auth/NexaLogoCard";

const passwordSchema = z
  .object({
    password: z.string().min(6, "Senha deve ter ao menos 6 caracteres").max(72),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: "As senhas não conferem",
    path: ["confirm"],
  });

export default function ResetPassword() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const finish = (ok: boolean, msg?: string) => {
      if (cancelled) return;
      if (ok) {
        setReady(true);
        setError(null);
      } else {
        setReady(false);
        setError(msg ?? "Link inválido ou expirado. Solicite um novo e-mail de redefinição.");
      }
    };

    // 1) Captura e LIMPA a URL imediatamente para evitar que React StrictMode
    // (ou qualquer re-execução do effect) tente consumir o mesmo token 2x.
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : "";
    const hashParams = new URLSearchParams(hash);
    const search = new URLSearchParams(window.location.search);

    const hashError = hashParams.get("error_description") || hashParams.get("error");
    const code = search.get("code");
    const access_token = hashParams.get("access_token");
    const refresh_token = hashParams.get("refresh_token");
    const type = hashParams.get("type");

    // Limpa a URL antes de consumir o token (idempotência)
    if (code || access_token || hashError) {
      window.history.replaceState({}, "", "/reset-password");
    }

    // 2) listener para PASSWORD_RECOVERY / SIGNED_IN
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        finish(true);
      }
    });

    (async () => {
      if (hashError) {
        finish(false, decodeURIComponent(hashError.replace(/\+/g, " ")));
        return;
      }

      // Fluxo "code" (PKCE) - ?code=...
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          // Se já existe sessão (token já foi trocado), aceita
          const { data } = await supabase.auth.getSession();
          if (data.session) return finish(true);
          return finish(false, error.message);
        }
        return finish(true);
      }

      // Fluxo "implicit" - #access_token=...&refresh_token=...&type=recovery
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) return finish(false, error.message);
        if (type === "recovery") return finish(true);
      }

      // Sessão já existente (ex.: usuário voltou na aba)
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        finish(true);
        return;
      }

      finish(false);
    })();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = passwordSchema.safeParse({
      password: form.get("password"),
      confirm: form.get("confirm"),
    });
    if (!parsed.success) {
      toast({
        title: "Dados inválidos",
        description: parsed.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    setBusy(false);
    if (error) {
      toast({ title: "Falha ao redefinir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Senha redefinida", description: "Você já pode acessar com a nova senha." });
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--gradient-subtle)" }}
    >
      <div className="w-full max-w-md">
        <NexaLogoCard />
        <div className="flex flex-col items-center mb-6 text-center">
          <h1 className="text-2xl font-bold text-foreground">Redefinir senha</h1>
          <p className="text-sm text-muted-foreground">Crie uma nova senha para sua conta</p>
        </div>


        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Nova senha</CardTitle>
            <CardDescription>
              {ready
                ? "Digite e confirme sua nova senha."
                : error
                ? "Não foi possível validar o link."
                : "Validando link de redefinição..."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ready ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Nova senha</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    required
                    autoComplete="new-password"
                    minLength={6}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirmar senha</Label>
                  <Input
                    id="confirm"
                    name="confirm"
                    type="password"
                    required
                    autoComplete="new-password"
                    minLength={6}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar nova senha
                </Button>
              </form>
            ) : error ? (
              <div className="space-y-3 py-2">
                <p className="text-sm text-destructive">{error}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate("/auth", { replace: true })}
                >
                  Voltar para login
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
