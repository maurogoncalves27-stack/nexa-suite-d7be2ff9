import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import {
  isPushSupported,
  getPushPermission,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/webPush";

export default function PushNotificationSettings() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const sup = isPushSupported();
    setSupported(sup);
    if (!sup) return;
    setPermission(await getPushPermission());
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      setSubscribed(!!sub);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const enable = async () => {
    setBusy(true);
    const res = await subscribeToPush();
    setBusy(false);
    if (res.ok) {
      toast({ title: "Notificações ativadas" });
      refresh();
    } else {
      const reasons: Record<string, string> = {
        preview: "Não disponível na pré-visualização. Use o app publicado/instalado.",
        unsupported: "Seu dispositivo não suporta notificações push.",
        denied: "Permissão negada. Habilite nas configurações do navegador.",
        "no-auth": "Faça login primeiro.",
        "no-vapid": "Configuração de servidor incompleta.",
        "no-sw": "Service worker não disponível.",
      };
      toast({
        title: "Não foi possível ativar",
        description: reasons[res.reason ?? ""] ?? res.reason,
        variant: "destructive",
      });
    }
  };

  const disable = async () => {
    setBusy(true);
    await unsubscribeFromPush();
    setBusy(false);
    toast({ title: "Notificações desativadas" });
    refresh();
  };

  if (!supported) return null;

  // Esconder o card quando o usuário já aprovou e está inscrito
  if (subscribed && permission === "granted") return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          Notificações no dispositivo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Receba avisos importantes diretamente no seu celular ou computador, mesmo com o app fechado.
          Para a melhor experiência, instale o app na tela inicial.
        </p>
        {permission === "denied" && (
          <p className="text-sm text-destructive">
            Permissão de notificação está bloqueada. Habilite nas configurações do navegador para este site.
          </p>
        )}
        <div>
          {subscribed ? (
            <Button variant="outline" onClick={disable} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <BellOff className="h-4 w-4 mr-2" />
              Desativar notificações
            </Button>
          ) : (
            <Button onClick={enable} disabled={busy || permission === "denied"}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Bell className="h-4 w-4 mr-2" />
              Ativar notificações
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
