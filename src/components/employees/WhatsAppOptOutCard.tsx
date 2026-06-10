import { useEffect, useState } from "react";
import { MessageCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

export default function WhatsAppOptOutCard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [phone, setPhone] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("employees")
        .select("id, phone, whatsapp_opt_out")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setEmployeeId(data.id);
        setPhone(data.phone ?? null);
        setEnabled(!data.whatsapp_opt_out);
      }
      setLoading(false);
    })();
  }, [user]);

  const toggle = async (next: boolean) => {
    if (!employeeId) return;
    setSaving(true);
    const { error } = await supabase
      .from("employees")
      .update({ whatsapp_opt_out: !next })
      .eq("id", employeeId);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    setEnabled(next);
    toast({ title: next ? "Notificações WhatsApp ativadas" : "Notificações WhatsApp desativadas" });
  };

  if (loading || !employeeId) return null;
  if (enabled && phone) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" />
          Notificações por WhatsApp
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Receba avisos importantes (ocorrências, holerite, escala, comunicados) também no WhatsApp,
          além do app.
        </p>
        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="wa-toggle" className="text-sm font-medium">
              Ativar WhatsApp
            </Label>
            <p className="text-xs text-muted-foreground">
              {phone ? `Enviaremos para: ${phone}` : "Atualize seu telefone com o RH para começar a receber."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Switch id="wa-toggle" checked={enabled} onCheckedChange={toggle} disabled={saving || !phone} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
