import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Bell, Plus, Pencil, Trash2, Star, Loader2, MessageCircle, Smartphone,
  ChevronDown, MessageSquare, Mail, Info, Phone, X, Users, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";

// ================================================================
// Tipos
// ================================================================

interface Sender {
  id: string;
  label: string;
  phone_display: string | null;
  provider: "zapi";
  zapi_instance_id: string | null;
  zapi_token: string | null;
  zapi_client_token: string | null;
  is_default: boolean;
  active: boolean;
}

interface SmsSender {
  id: string;
  label: string;
  phone_display: string | null;
  api_key: string;
  device_id: string;
  is_default: boolean;
  active: boolean;
}

type PhoneRecipient = { phone: string; label?: string };
type GroupRecipient = { group_id: string; name?: string; sender_id?: string };
type Recipient = PhoneRecipient | GroupRecipient;
type EmailRecipient = { email: string; label?: string };

const isGroupR = (r: Recipient): r is GroupRecipient => !!(r as any).group_id;

interface WhatsappGroup {
  id: string;
  sender_id: string;
  group_id: string;
  name: string;
  active: boolean;
}

interface Setting {
  alert_key: string;
  label: string;
  description: string | null;
  category_group: string;
  push_enabled: boolean;
  whatsapp_enabled: boolean;
  whatsapp_sender_id: string | null;
  sms_enabled: boolean;
  sms_sender_id: string | null;
  email_enabled: boolean;
  extra_recipients: Recipient[];
  email_recipients: EmailRecipient[];
}

const emptySender: Omit<Sender, "id"> = {
  label: "", phone_display: "", provider: "zapi",
  zapi_instance_id: "", zapi_token: "", zapi_client_token: "",
  is_default: false, active: true,
};
const emptySms: Omit<SmsSender, "id"> = {
  label: "", phone_display: "", api_key: "", device_id: "", is_default: false, active: true,
};

// ================================================================
// Página principal
// ================================================================

export default function NotificationSettings() {
  const [senders, setSenders] = useState<Sender[]>([]);
  const [smsSenders, setSmsSenders] = useState<SmsSender[]>([]);
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [editSender, setEditSender] = useState<Sender | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [draft, setDraft] = useState<Omit<Sender, "id">>(emptySender);
  const [editSms, setEditSms] = useState<SmsSender | null>(null);
  const [newSmsOpen, setNewSmsOpen] = useState(false);
  const [smsDraft, setSmsDraft] = useState<Omit<SmsSender, "id">>(emptySms);
  const [saving, setSaving] = useState(false);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [groups, setGroups] = useState<WhatsappGroup[]>([]);
  const [syncingSender, setSyncingSender] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: s }, { data: sms }, { data: c }, { data: g }] = await Promise.all([
      supabase.from("whatsapp_senders").select("*").order("is_default", { ascending: false }).order("label"),
      supabase.from("sms_senders").select("*").order("is_default", { ascending: false }).order("label"),
      supabase.from("notification_settings").select("*").order("category_group").order("label"),
      supabase.from("whatsapp_groups").select("*").eq("active", true).order("name"),
    ]);
    setSenders((s as Sender[]) ?? []);
    setSmsSenders((sms as SmsSender[]) ?? []);
    setGroups((g as WhatsappGroup[]) ?? []);
    setSettings(((c as any[]) ?? []).map((row) => ({
      ...row,
      extra_recipients: Array.isArray(row.extra_recipients) ? row.extra_recipients : [],
      email_recipients: Array.isArray(row.email_recipients) ? row.email_recipients : [],
    })) as Setting[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const syncGroups = async (senderId: string) => {
    setSyncingSender(senderId);
    try {
      const { data, error } = await supabase.functions.invoke("zapi-list-groups", { body: { sender_id: senderId } });
      if (error) throw error;
      const count = (data as any)?.count ?? 0;
      toast.success(`${count} grupo(s) sincronizado(s).`);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao sincronizar grupos");
    } finally { setSyncingSender(null); }
  };

  const updateSetting = async (key: string, patch: Partial<Setting>) => {
    setSettings((prev) => prev.map((x) => (x.alert_key === key ? { ...x, ...patch } : x)));
    const { error } = await supabase.from("notification_settings").update(patch as any).eq("alert_key", key);
    if (error) { toast.error("Falha ao salvar: " + error.message); load(); }
  };

  // ---- senders ----
  const saveSender = async () => {
    setSaving(true);
    try {
      const op = editSender
        ? supabase.from("whatsapp_senders").update({ ...draft }).eq("id", editSender.id)
        : supabase.from("whatsapp_senders").insert(draft);
      const { error } = await op; if (error) throw error;
      toast.success("Remetente salvo");
      setEditSender(null); setNewOpen(false); setDraft(emptySender); load();
    } catch (e: any) { toast.error(e.message ?? "Erro"); } finally { setSaving(false); }
  };
  const deleteSender = async (id: string) => {
    if (!confirm("Excluir este remetente?")) return;
    const { error } = await supabase.from("whatsapp_senders").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Remetente removido"); load();
  };
  const saveSms = async () => {
    setSaving(true);
    try {
      const op = editSms
        ? supabase.from("sms_senders").update({ ...smsDraft }).eq("id", editSms.id)
        : supabase.from("sms_senders").insert(smsDraft);
      const { error } = await op; if (error) throw error;
      toast.success("Gateway SMS salvo");
      setEditSms(null); setNewSmsOpen(false); setSmsDraft(emptySms); load();
    } catch (e: any) { toast.error(e.message ?? "Erro"); } finally { setSaving(false); }
  };
  const deleteSms = async (id: string) => {
    if (!confirm("Excluir este gateway SMS?")) return;
    const { error } = await supabase.from("sms_senders").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Gateway removido"); load();
  };
  const openEdit = (s: Sender) => {
    setEditSender(s);
    setDraft({
      label: s.label, phone_display: s.phone_display ?? "", provider: "zapi",
      zapi_instance_id: s.zapi_instance_id ?? "", zapi_token: s.zapi_token ?? "",
      zapi_client_token: s.zapi_client_token ?? "",
      is_default: s.is_default, active: s.active,
    });
  };
  const openEditSms = (s: SmsSender) => {
    setEditSms(s);
    setSmsDraft({
      label: s.label, phone_display: s.phone_display ?? "",
      api_key: s.api_key, device_id: s.device_id,
      is_default: s.is_default, active: s.active,
    });
  };

  const sendTestEmail = async (setting: Setting) => {
    const emails = setting.email_recipients || [];
    if (emails.length === 0) { toast.error("Cadastre pelo menos 1 e-mail nesse alerta antes de testar."); return; }
    setTestingKey(setting.alert_key);
    try {
      let ok = 0, fail = 0;
      for (const r of emails) {
        const { error } = await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "alert-generic",
            recipientEmail: r.email,
            templateData: {
              title: `Teste — ${setting.label}`,
              message: `Este é um e-mail de teste do alerta "${setting.label}".\nSe você recebeu isto, o canal está funcionando.`,
              category: setting.category_group,
              severity: "info",
            },
          },
        });
        if (error) fail++; else ok++;
      }
      if (ok) toast.success(`${ok} e-mail(s) enviado(s). ${fail ? `${fail} falha(s).` : ""}`);
      else toast.error("Nenhum e-mail foi enviado.");
    } catch (e: any) { toast.error(e.message ?? "Erro"); }
    finally { setTestingKey(null); }
  };

  const sendTestAlert = async (setting: Setting) => {
    if (!setting.push_enabled && !setting.whatsapp_enabled && !setting.sms_enabled && !setting.email_enabled) {
      toast.error("Ative pelo menos um canal antes de testar.");
      return;
    }
    setTestingKey(setting.alert_key);
    const title = `Teste — ${setting.label}`;
    const message = `Mensagem de teste do alerta "${setting.label}". Se você recebeu isto, o canal está funcionando.`;
    const phones = (setting.extra_recipients || []).filter((r): r is PhoneRecipient => !isGroupR(r));
    const results: string[] = [];
    try {
      if (setting.push_enabled) {
        try {
          const { data: u } = await supabase.auth.getUser();
          if (u?.user?.id) {
            const { error } = await supabase.functions.invoke("notify-user", {
              body: { user_id: u.user.id, title, message, category: setting.alert_key },
            });
            results.push(error ? `push: falhou` : "push: enviado");
          }
        } catch { results.push("push: erro"); }
      }
      if (setting.whatsapp_enabled) {
        if (phones.length === 0) results.push("whatsapp: sem números extras");
        else {
          let ok = 0, fail = 0;
          for (const p of phones) {
            const { error } = await supabase.functions.invoke("send-whatsapp", {
              body: {
                phone: p.phone, message: `*${title}*\n${message}`,
                category: setting.alert_key,
                sender_id: setting.whatsapp_sender_id ?? undefined,
              },
            });
            if (error) fail++; else ok++;
          }
          results.push(`whatsapp: ${ok} ok${fail ? `, ${fail} falha` : ""}`);
        }
      }
      if (setting.sms_enabled) {
        if (phones.length === 0) results.push("sms: sem números extras");
        else {
          let ok = 0, fail = 0;
          for (const p of phones) {
            const { error } = await supabase.functions.invoke("send-sms", {
              body: {
                phone: p.phone, message: `${title}\n${message}`,
                category: setting.alert_key,
                sender_id: setting.sms_sender_id ?? undefined,
              },
            });
            if (error) fail++; else ok++;
          }
          results.push(`sms: ${ok} ok${fail ? `, ${fail} falha` : ""}`);
        }
      }
      if (setting.email_enabled) {
        const emails = setting.email_recipients || [];
        if (emails.length === 0) results.push("e-mail: sem destinatários");
        else {
          let ok = 0, fail = 0;
          for (const r of emails) {
            const { error } = await supabase.functions.invoke("send-transactional-email", {
              body: {
                templateName: "alert-generic",
                recipientEmail: r.email,
                templateData: { title, message, category: setting.category_group, severity: "info" },
              },
            });
            if (error) fail++; else ok++;
          }
          results.push(`e-mail: ${ok} ok${fail ? `, ${fail} falha` : ""}`);
        }
      }
      toast.success("Teste disparado", { description: results.join(" · ") });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao disparar teste");
    } finally {
      setTestingKey(null);
    }
  };

  const grouped = useMemo(() => {
    return settings.reduce<Record<string, Setting[]>>((acc, s) => {
      (acc[s.category_group] ??= []).push(s); return acc;
    }, {});
  }, [settings]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Bell className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Alertas e notificações
        </h1>
        <p className="text-muted-foreground">
          Escolha, para cada alerta, quais canais disparam e quem recebe.
        </p>
      </div>

      {/* Legenda dos canais */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="text-sm space-y-2 flex-1">
              <p className="font-medium">Como funciona</p>
              <p className="text-muted-foreground text-xs sm:text-sm">
                Cada alerta pode ser enviado por até 4 canais. Os canais usam remetentes cadastrados abaixo (WhatsApp, SMS e e-mail).
                Além dos gestores automáticos, você pode adicionar <strong>destinatários extras</strong> (números ou e-mails) por alerta.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <LegendPill icon={<Smartphone className="h-3.5 w-3.5" />} label="Push" desc="No app + navegador" tone="text-portal-employee" />
                <LegendPill icon={<MessageCircle className="h-3.5 w-3.5" />} label="WhatsApp" desc="Z-API" tone="text-success" />
                <LegendPill icon={<MessageSquare className="h-3.5 w-3.5" />} label="SMS" desc="TextBee (Android)" tone="text-warning" />
                <LegendPill icon={<Mail className="h-3.5 w-3.5" />} label="E-mail" desc="notify.nexa" tone="text-primary" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Remetentes (colapsável) */}
      <Card>
        <Collapsible>
          <CollapsibleTrigger asChild>
            <button type="button" className="group w-full text-left">
              <CardHeader className="flex flex-row items-center justify-between gap-2 p-4 sm:p-6 w-full">
                <CardTitle className="text-sm sm:text-base flex items-center gap-2 min-w-0 flex-1">
                  <Send className="h-5 w-5 text-primary shrink-0" />
                  <span className="truncate">De onde saem os alertas — remetentes</span>
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                    {senders.length} WhatsApp · {smsSenders.length} SMS · 1 e-mail
                  </Badge>
                </CardTitle>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
              </CardHeader>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4 p-4 sm:p-6 pt-0 sm:pt-0">
              {/* WhatsApp */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <MessageCircle className="h-4 w-4 text-success" />
                    <span>Números de WhatsApp (Z-API)</span>
                  </div>
                  <Dialog open={newOpen} onOpenChange={(o) => { setNewOpen(o); if (!o) setDraft(emptySender); }}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="gap-1"><Plus className="h-4 w-4" /> Novo</Button>
                    </DialogTrigger>
                    <SenderDialog title="Novo remetente" draft={draft} setDraft={setDraft} onSave={saveSender} saving={saving} />
                  </Dialog>
                </div>
                {loading ? (
                  <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
                ) : senders.length === 0 ? (
                  <p className="text-xs text-muted-foreground border rounded-md p-3">Nenhum número cadastrado.</p>
                ) : (
                  <div className="space-y-1.5">
                    {senders.map((s) => {
                      const gCount = groups.filter((g) => g.sender_id === s.id).length;
                      return (
                        <div key={s.id} className="rounded-md border">
                          <SenderRow
                            title={s.label}
                            badges={[
                              s.is_default ? <Badge key="d" variant="secondary" className="gap-1 h-5 px-1.5 text-[10px]"><Star className="h-2.5 w-2.5" />Padrão</Badge> : null,
                              !s.active ? <Badge key="a" variant="outline" className="h-5 px-1.5 text-[10px]">Inativo</Badge> : null,
                              gCount > 0 ? <Badge key="g" variant="outline" className="h-5 px-1.5 text-[10px] gap-1"><Users className="h-2.5 w-2.5" />{gCount} grupos</Badge> : null,
                            ]}
                            sub={`${s.phone_display || "sem número"} · ${(s.zapi_instance_id ?? "").slice(0, 24)}…`}
                            onEdit={() => openEdit(s)} onDelete={() => deleteSender(s.id)}
                          />
                          <div className="px-3 pb-2 flex justify-end">
                            <Button
                              type="button" size="sm" variant="ghost" className="h-7 gap-1 text-xs"
                              disabled={syncingSender === s.id || !s.active}
                              onClick={() => syncGroups(s.id)}
                            >
                              {syncingSender === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Users className="h-3 w-3" />}
                              Sincronizar grupos
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <Separator />

              {/* SMS */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <MessageSquare className="h-4 w-4 text-warning" />
                    <span>Gateways SMS (TextBee)</span>
                  </div>
                  <Dialog open={newSmsOpen} onOpenChange={(o) => { setNewSmsOpen(o); if (!o) setSmsDraft(emptySms); }}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="gap-1"><Plus className="h-4 w-4" /> Novo</Button>
                    </DialogTrigger>
                    <SmsDialog title="Novo gateway SMS" draft={smsDraft} setDraft={setSmsDraft} onSave={saveSms} saving={saving} />
                  </Dialog>
                </div>
                {loading ? (
                  <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
                ) : smsSenders.length === 0 ? (
                  <p className="text-xs text-muted-foreground border rounded-md p-3">
                    Nenhum gateway. Instale o app <a href="https://textbee.dev" target="_blank" rel="noreferrer" className="underline">TextBee</a> em um Android.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {smsSenders.map((s) => (
                      <SenderRow key={s.id}
                        title={s.label}
                        badges={[
                          s.is_default ? <Badge key="d" variant="secondary" className="gap-1 h-5 px-1.5 text-[10px]"><Star className="h-2.5 w-2.5" />Padrão</Badge> : null,
                          !s.active ? <Badge key="a" variant="outline" className="h-5 px-1.5 text-[10px]">Inativo</Badge> : null,
                        ]}
                        sub={`${s.phone_display || "sem número"} · device ${s.device_id.slice(0, 10)}…`}
                        onEdit={() => openEditSms(s)} onDelete={() => deleteSms(s.id)}
                      />
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* E-mail */}
              <div>
                <div className="flex items-center gap-2 text-sm font-medium mb-2">
                  <Mail className="h-4 w-4 text-primary" />
                  <span>E-mail transacional</span>
                </div>
                <div className="rounded-md border p-3 text-xs sm:text-sm text-muted-foreground">
                  Enviado por <strong className="text-foreground">notify.nexa.aquelaparme.com.br</strong> (domínio verificado).
                  Não precisa cadastrar remetente — configure apenas os e-mails de destino em cada alerta abaixo.
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <Dialog open={!!editSender} onOpenChange={(o) => { if (!o) { setEditSender(null); setDraft(emptySender); } }}>
        <SenderDialog title="Editar remetente" draft={draft} setDraft={setDraft} onSave={saveSender} saving={saving} />
      </Dialog>
      <Dialog open={!!editSms} onOpenChange={(o) => { if (!o) { setEditSms(null); setSmsDraft(emptySms); } }}>
        <SmsDialog title="Editar gateway SMS" draft={smsDraft} setDraft={setSmsDraft} onSave={saveSms} saving={saving} />
      </Dialog>

      {/* Alertas */}
      {Object.entries(grouped).map(([group, rows]) => {
        const activeCount = rows.filter((r) => r.push_enabled || r.whatsapp_enabled || r.sms_enabled || r.email_enabled).length;
        return (
          <Card key={group}>
            <Collapsible>
              <CollapsibleTrigger asChild>
                <button type="button" className="group w-full text-left">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 p-4 sm:p-6 w-full">
                    <CardTitle className="text-sm sm:text-base flex items-center gap-2 min-w-0 flex-1">
                      <span className="truncate uppercase tracking-wide text-xs sm:text-sm text-muted-foreground">{group}</span>
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px] shrink-0">{activeCount}/{rows.length} ativos</Badge>
                    </CardTitle>
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                  </CardHeader>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-3 p-4 sm:p-6 pt-0 sm:pt-0">
                  {rows.map((s) => (
                    <AlertCard
                      key={s.alert_key}
                      setting={s}
                      senders={senders}
                      smsSenders={smsSenders}
                      groups={groups}
                      onChange={(patch) => updateSetting(s.alert_key, patch)}
                      onTestEmail={() => sendTestEmail(s)}
                      onTest={() => sendTestAlert(s)}
                      testing={testingKey === s.alert_key}
                    />
                  ))}
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        );
      })}
    </div>
  );
}

// ================================================================
// Alert Card
// ================================================================

function AlertCard({
  setting, senders, smsSenders, groups, onChange, onTestEmail, onTest, testing,
}: {
  setting: Setting;
  senders: Sender[];
  smsSenders: SmsSender[];
  groups: WhatsappGroup[];
  onChange: (patch: Partial<Setting>) => void;
  onTestEmail: () => void;
  onTest: () => void;
  testing: boolean;
}) {
  const anyChannel = setting.push_enabled || setting.whatsapp_enabled || setting.sms_enabled || setting.email_enabled;
  const wpSender = senders.find((x) => x.id === setting.whatsapp_sender_id);
  const smsSender = smsSenders.find((x) => x.id === setting.sms_sender_id);
  const wpDefault = senders.find((x) => x.is_default && x.active);
  const smsDefault = smsSenders.find((x) => x.is_default && x.active);
  // Grupos do remetente ativo do alerta (ou do padrão) — apenas esses podem ser adicionados.
  const activeWaSenderId = setting.whatsapp_sender_id ?? wpDefault?.id ?? null;
  const availableGroups = groups.filter((g) => g.sender_id === activeWaSenderId);

  return (
    <div className={`rounded-lg border ${anyChannel ? "border-primary/30 bg-primary/[0.02]" : "bg-muted/20"} overflow-hidden`}>
      {/* Header */}
      <div className="p-3 sm:p-4 border-b bg-background/50">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">{setting.label}</div>
            {setting.description && (
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 leading-snug">{setting.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!anyChannel && <Badge variant="outline" className="h-5 text-[10px]">Silenciado</Badge>}
            <Button
              type="button" size="sm" variant="outline"
              className="h-7 px-2 gap-1 text-[11px]"
              disabled={testing || !anyChannel}
              onClick={onTest}
              title="Disparar mensagem de teste em todos os canais ativos"
            >
              {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Testar
            </Button>
          </div>
        </div>
      </div>

      {/* Canais */}
      <div className="p-3 sm:p-4 space-y-2">
        <ChannelRow
          icon={<Smartphone className="h-4 w-4" />} label="Push (app + navegador)"
          hint="Envia para gestores/admins responsáveis."
          enabled={setting.push_enabled}
          onToggle={(v) => onChange({ push_enabled: v })}
        />

        <ChannelRow
          icon={<MessageCircle className="h-4 w-4 text-success" />} label="WhatsApp"
          hint={setting.whatsapp_enabled
            ? `De: ${wpSender?.label ?? wpDefault?.label ?? "padrão"}${(wpSender?.phone_display ?? wpDefault?.phone_display) ? ` · ${wpSender?.phone_display ?? wpDefault?.phone_display}` : ""}`
            : "Envia mensagens no WhatsApp via Z-API."}
          enabled={setting.whatsapp_enabled}
          onToggle={(v) => onChange({ whatsapp_enabled: v })}
        >
          <SenderPicker
            value={setting.whatsapp_sender_id}
            onChange={(v) => onChange({ whatsapp_sender_id: v })}
            options={senders.filter((x) => x.active).map((x) => ({
              id: x.id, label: x.label, sub: x.phone_display ?? undefined,
            }))}
            emptyLabel="WhatsApp padrão"
          />
          <PhoneRecipients
            value={setting.extra_recipients}
            onChange={(v) => onChange({ extra_recipients: v })}
            hint="Números adicionais que recebem este alerta por WhatsApp e SMS."
          />
          <GroupRecipients
            value={setting.extra_recipients}
            onChange={(v) => onChange({ extra_recipients: v })}
            available={availableGroups}
          />
        </ChannelRow>


        <ChannelRow
          icon={<MessageSquare className="h-4 w-4 text-warning" />} label="SMS"
          hint={setting.sms_enabled
            ? `De: ${smsSender?.label ?? smsDefault?.label ?? "padrão"}${(smsSender?.phone_display ?? smsDefault?.phone_display) ? ` · ${smsSender?.phone_display ?? smsDefault?.phone_display}` : ""}`
            : "SMS via TextBee (celular Android). Use para alertas críticos."}
          enabled={setting.sms_enabled}
          onToggle={(v) => onChange({ sms_enabled: v })}
        >
          <SenderPicker
            value={setting.sms_sender_id}
            onChange={(v) => onChange({ sms_sender_id: v })}
            options={smsSenders.filter((x) => x.active).map((x) => ({
              id: x.id, label: x.label, sub: x.phone_display ?? undefined,
            }))}
            emptyLabel="SMS padrão"
          />
          <p className="text-[11px] text-muted-foreground flex items-center gap-1 pl-1">
            <Users className="h-3 w-3" /> Usa a mesma lista de números do WhatsApp acima.
          </p>
        </ChannelRow>

        <ChannelRow
          icon={<Mail className="h-4 w-4 text-primary" />} label="E-mail"
          hint={setting.email_enabled ? `${setting.email_recipients.length} destinatário(s)` : "E-mail via notify.nexa. Ideal para registro/auditoria."}
          enabled={setting.email_enabled}
          onToggle={(v) => onChange({ email_enabled: v })}
        >
          <EmailRecipients
            value={setting.email_recipients}
            onChange={(v) => onChange({ email_recipients: v })}
          />
          <div className="flex justify-end">
            <Button
              type="button" size="sm" variant="outline" className="gap-1 h-7 text-xs"
              disabled={testing || setting.email_recipients.length === 0}
              onClick={onTestEmail}
            >
              {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Enviar teste
            </Button>
          </div>
        </ChannelRow>
      </div>
    </div>
  );
}

// ================================================================
// Subcomponentes
// ================================================================

function LegendPill({ icon, label, desc, tone }: { icon: React.ReactNode; label: string; desc: string; tone: string }) {
  return (
    <div className="rounded-md border p-2 flex items-start gap-2">
      <div className={`${tone} shrink-0 mt-0.5`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs font-medium truncate">{label}</div>
        <div className="text-[10px] text-muted-foreground truncate">{desc}</div>
      </div>
    </div>
  );
}

function SenderRow({
  title, badges, sub, onEdit, onDelete,
}: {
  title: string;
  badges: (React.ReactNode | null)[];
  sub: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border p-2.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-sm truncate">{title}</span>
          {badges.filter(Boolean)}
        </div>
        <div className="text-[11px] text-muted-foreground truncate">{sub}</div>
      </div>
      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={onDelete}><Trash2 className="h-4 w-4 text-destructive" /></Button>
    </div>
  );
}

function ChannelRow({
  icon, label, hint, enabled, onToggle, children,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-md border ${enabled ? "border-primary/40" : "border-border"} overflow-hidden`}>
      <label className="flex items-center gap-2 p-2.5 cursor-pointer hover:bg-muted/30">
        <div className="shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium leading-tight">{label}</div>
          {hint && <div className="text-[11px] text-muted-foreground truncate">{hint}</div>}
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </label>
      {enabled && children && (
        <div className="p-2.5 pt-0 space-y-2 border-t bg-muted/10">
          {children}
        </div>
      )}
    </div>
  );
}

function SenderPicker({
  value, onChange, options, emptyLabel,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: { id: string; label: string; sub?: string }[];
  emptyLabel: string;
}) {
  return (
    <Select value={value ?? "__default__"} onValueChange={(v) => onChange(v === "__default__" ? null : v)}>
      <SelectTrigger className="text-xs sm:text-sm h-8"><SelectValue placeholder="Remetente" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__default__">{emptyLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>{o.label}{o.sub ? ` — ${o.sub}` : ""}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PhoneRecipients({
  value, onChange, hint,
}: {
  value: Recipient[];
  onChange: (v: Recipient[]) => void;
  hint?: string;
}) {
  const [label, setLabel] = useState("");
  const [phone, setPhone] = useState("");
  const phones = value.filter((r): r is PhoneRecipient => !isGroupR(r));
  const others = value.filter((r) => isGroupR(r));
  const add = () => {
    const p = phone.replace(/\D+/g, "");
    if (p.length < 10) { toast.error("Informe um telefone com DDD."); return; }
    onChange([...value, { phone: p.startsWith("55") ? p : `55${p}`, label: label.trim() || undefined }]);
    setLabel(""); setPhone("");
  };
  const remove = (target: PhoneRecipient) =>
    onChange([...others, ...phones.filter((r) => r.phone !== target.phone)]);

  return (
    <div className="space-y-1.5">
      {hint && <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" />{hint}</p>}
      {phones.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {phones.map((r, i) => (
            <div key={i} className="inline-flex items-center gap-1 rounded-full border bg-background pl-2 pr-1 py-0.5 text-[11px]">
              <Phone className="h-3 w-3 text-muted-foreground" />
              <span className="font-medium">{r.label || "Extra"}</span>
              <span className="text-muted-foreground">{formatBrPhone(r.phone)}</span>
              <button type="button" onClick={() => remove(r)} className="ml-0.5 rounded-full hover:bg-destructive/10 p-0.5">
                <X className="h-3 w-3 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-1.5">
        <Input placeholder="Nome (opcional)" value={label} onChange={(e) => setLabel(e.target.value)} className="h-8 text-xs flex-1" />
        <Input placeholder="61 99999-9999" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-8 text-xs flex-1"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={add}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function GroupRecipients({
  value, onChange, available,
}: {
  value: Recipient[];
  onChange: (v: Recipient[]) => void;
  available: WhatsappGroup[];
}) {
  const selected = value.filter((r): r is GroupRecipient => isGroupR(r));
  const others = value.filter((r) => !isGroupR(r));
  const notSelected = available.filter((g) => !selected.some((s) => s.group_id === g.group_id));
  const addGroup = (g: WhatsappGroup) => {
    onChange([...value, { group_id: g.group_id, name: g.name, sender_id: g.sender_id }]);
  };
  const remove = (gid: string) =>
    onChange([...others, ...selected.filter((s) => s.group_id !== gid)]);

  if (available.length === 0 && selected.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground flex items-center gap-1 pl-1">
        <Users className="h-3 w-3" /> Nenhum grupo sincronizado neste remetente.
        Use "Sincronizar grupos" na lista de remetentes acima.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <Users className="h-3 w-3" /> Grupos de WhatsApp que também recebem este alerta.
      </p>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((g) => (
            <div key={g.group_id} className="inline-flex items-center gap-1 rounded-full border bg-success/5 border-success/30 pl-2 pr-1 py-0.5 text-[11px]">
              <Users className="h-3 w-3 text-success" />
              <span className="font-medium">{g.name || g.group_id}</span>
              <button type="button" onClick={() => remove(g.group_id)} className="ml-0.5 rounded-full hover:bg-destructive/10 p-0.5">
                <X className="h-3 w-3 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}
      {notSelected.length > 0 && (
        <Select value="" onValueChange={(v) => {
          const g = notSelected.find((x) => x.group_id === v);
          if (g) addGroup(g);
        }}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="+ Adicionar grupo…" /></SelectTrigger>
          <SelectContent>
            {notSelected.map((g) => (
              <SelectItem key={g.group_id} value={g.group_id}>{g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

function EmailRecipients({
  value, onChange,
}: {
  value: EmailRecipient[];
  onChange: (v: EmailRecipient[]) => void;
}) {
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const add = () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { toast.error("E-mail inválido."); return; }
    onChange([...value, { email: e, label: label.trim() || undefined }]);
    setLabel(""); setEmail("");
  };
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <Users className="h-3 w-3" /> Destinatários por e-mail para este alerta.
      </p>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((r, i) => (
            <div key={i} className="inline-flex items-center gap-1 rounded-full border bg-background pl-2 pr-1 py-0.5 text-[11px]">
              <Mail className="h-3 w-3 text-muted-foreground" />
              {r.label && <span className="font-medium">{r.label}</span>}
              <span className="text-muted-foreground">{r.email}</span>
              <button type="button" onClick={() => remove(i)} className="ml-0.5 rounded-full hover:bg-destructive/10 p-0.5">
                <X className="h-3 w-3 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-1.5">
        <Input placeholder="Nome (opcional)" value={label} onChange={(e) => setLabel(e.target.value)} className="h-8 text-xs flex-1" />
        <Input placeholder="pessoa@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-8 text-xs flex-[1.6]"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={add}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function formatBrPhone(raw: string) {
  const d = raw.replace(/\D+/g, "");
  const n = d.startsWith("55") ? d.slice(2) : d;
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return raw;
}

// ================================================================
// Diálogos
// ================================================================

function SenderDialog({
  title, draft, setDraft, onSave, saving,
}: {
  title: string;
  draft: Omit<Sender, "id">;
  setDraft: (d: Omit<Sender, "id">) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Apelido *</Label>
          <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Ex.: Alertas Gerais" />
        </div>
        <div><Label>Provedor</Label>
          <div className="text-sm text-muted-foreground rounded-md border px-3 py-2 bg-muted/40">Z-API</div>
        </div>
        <div><Label>Número exibido (referência)</Label>
          <Input value={draft.phone_display ?? ""} onChange={(e) => setDraft({ ...draft, phone_display: e.target.value })} placeholder="+55 61 9 9999-9999" />
        </div>
        <div><Label>Z-API Instance ID *</Label>
          <Input value={draft.zapi_instance_id ?? ""} onChange={(e) => setDraft({ ...draft, zapi_instance_id: e.target.value })} />
        </div>
        <div><Label>Z-API Token *</Label>
          <Input value={draft.zapi_token ?? ""} onChange={(e) => setDraft({ ...draft, zapi_token: e.target.value })} />
        </div>
        <div><Label>Z-API Client-Token *</Label>
          <Input value={draft.zapi_client_token ?? ""} onChange={(e) => setDraft({ ...draft, zapi_client_token: e.target.value })} />
        </div>
        <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
          <span className="text-sm">Definir como padrão</span>
          <Switch checked={draft.is_default} onCheckedChange={(v) => setDraft({ ...draft, is_default: v })} />
        </div>
        <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
          <span className="text-sm">Ativo</span>
          <Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={onSave}
          disabled={saving || !draft.label || !draft.zapi_instance_id || !draft.zapi_token || !draft.zapi_client_token}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Salvar
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function SmsDialog({
  title, draft, setDraft, onSave, saving,
}: {
  title: string;
  draft: Omit<SmsSender, "id">;
  setDraft: (d: Omit<SmsSender, "id">) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Instale o app TextBee no celular Android, gere a API Key em <a href="https://textbee.dev" target="_blank" rel="noreferrer" className="underline">textbee.dev</a> e copie o Device ID exibido no app.
        </p>
        <div><Label>Apelido *</Label>
          <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Ex.: Celular Alertas" />
        </div>
        <div><Label>Número exibido (referência)</Label>
          <Input value={draft.phone_display ?? ""} onChange={(e) => setDraft({ ...draft, phone_display: e.target.value })} placeholder="+55 61 9 9999-9999" />
        </div>
        <div><Label>API Key *</Label>
          <Input value={draft.api_key} onChange={(e) => setDraft({ ...draft, api_key: e.target.value })} placeholder="tbk_..." />
        </div>
        <div><Label>Device ID *</Label>
          <Input value={draft.device_id} onChange={(e) => setDraft({ ...draft, device_id: e.target.value })} placeholder="ex.: 65f1a2b3c4d5e6f7..." />
        </div>
        <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
          <span className="text-sm">Definir como padrão</span>
          <Switch checked={draft.is_default} onCheckedChange={(v) => setDraft({ ...draft, is_default: v })} />
        </div>
        <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
          <span className="text-sm">Ativo</span>
          <Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={onSave} disabled={saving || !draft.label || !draft.api_key || !draft.device_id}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Salvar
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
