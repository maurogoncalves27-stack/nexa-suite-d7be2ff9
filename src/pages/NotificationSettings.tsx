import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell, Plus, Pencil, Trash2, Star, Loader2, MessageCircle, Smartphone, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";

interface Sender {
  id: string;
  label: string;
  phone_display: string | null;
  zapi_instance_id: string;
  zapi_token: string;
  zapi_client_token: string;
  is_default: boolean;
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
}

const emptySender: Omit<Sender, "id"> = {
  label: "", phone_display: "", zapi_instance_id: "", zapi_token: "", zapi_client_token: "",
  is_default: false, active: true,
};

export default function NotificationSettings() {
  const [senders, setSenders] = useState<Sender[]>([]);
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [editSender, setEditSender] = useState<Sender | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [draft, setDraft] = useState<Omit<Sender, "id">>(emptySender);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: s }, { data: c }] = await Promise.all([
      supabase.from("whatsapp_senders").select("*").order("is_default", { ascending: false }).order("label"),
      supabase.from("notification_settings").select("*").order("category_group").order("label"),
    ]);
    setSenders((s as Sender[]) ?? []);
    setSettings((c as Setting[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateSetting = async (key: string, patch: Partial<Setting>) => {
    setSettings((prev) => prev.map((x) => (x.alert_key === key ? { ...x, ...patch } : x)));
    const { error } = await supabase.from("notification_settings").update(patch).eq("alert_key", key);
    if (error) { toast.error("Falha ao salvar: " + error.message); load(); }
  };

  const saveSender = async () => {
    setSaving(true);
    try {
      if (editSender) {
        const { error } = await supabase.from("whatsapp_senders")
          .update({ ...draft }).eq("id", editSender.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("whatsapp_senders").insert(draft);
        if (error) throw error;
      }
      toast.success("Remetente salvo");
      setEditSender(null); setNewOpen(false); setDraft(emptySender);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Erro");
    } finally { setSaving(false); }
  };

  const deleteSender = async (id: string) => {
    if (!confirm("Excluir este remetente?")) return;
    const { error } = await supabase.from("whatsapp_senders").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Remetente removido");
    load();
  };

  const openEdit = (s: Sender) => {
    setEditSender(s);
    setDraft({
      label: s.label, phone_display: s.phone_display ?? "",
      zapi_instance_id: s.zapi_instance_id, zapi_token: s.zapi_token,
      zapi_client_token: s.zapi_client_token, is_default: s.is_default, active: s.active,
    });
  };

  const grouped = settings.reduce<Record<string, Setting[]>>((acc, s) => {
    (acc[s.category_group] ??= []).push(s); return acc;
  }, {});

  const senderLabel = (id: string | null) => {
    if (!id) return "Padrão do sistema";
    const s = senders.find((x) => x.id === id);
    return s ? `${s.label}${s.phone_display ? ` (${s.phone_display})` : ""}` : "—";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Bell className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Alertas e notificações
        </h1>
        <p className="text-muted-foreground">
          Configure quais alertas do sistema são enviados por push, por WhatsApp e qual número dispara cada um.
        </p>
      </div>

      {/* Remetentes de WhatsApp */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base min-w-0">
            <MessageCircle className="h-5 w-5 text-primary shrink-0" />
            <span className="truncate">Números de WhatsApp</span>
          </CardTitle>
          <Dialog open={newOpen} onOpenChange={(o) => { setNewOpen(o); if (!o) { setDraft(emptySender); } }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1 shrink-0"><Plus className="h-4 w-4" /> Novo</Button>
            </DialogTrigger>
            <SenderDialog
              title="Novo remetente"
              draft={draft} setDraft={setDraft}
              onSave={saveSender} saving={saving}
            />
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-2 p-4 sm:p-6 pt-0 sm:pt-0">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : senders.length === 0 ? (
            <p className="text-xs sm:text-sm text-muted-foreground">
              Nenhum número cadastrado. O sistema usa as credenciais Z-API padrão.
            </p>
          ) : (
            senders.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-md border p-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-sm truncate">{s.label}</span>
                    {s.is_default && <Badge variant="secondary" className="gap-1 h-5 px-1.5 text-[10px]"><Star className="h-2.5 w-2.5" />Padrão</Badge>}
                    {!s.active && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">Inativo</Badge>}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {s.phone_display || "sem número"} · {s.zapi_instance_id.slice(0, 10)}…
                  </div>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => deleteSender(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editSender} onOpenChange={(o) => { if (!o) { setEditSender(null); setDraft(emptySender); } }}>
        <SenderDialog
          title="Editar remetente"
          draft={draft} setDraft={setDraft}
          onSave={saveSender} saving={saving}
        />
      </Dialog>

      {/* Alertas */}
      {Object.entries(grouped).map(([group, rows]) => {
        const activeCount = rows.filter((r) => r.push_enabled || r.whatsapp_enabled).length;
        return (
          <Card key={group}>
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="w-full group">
                <CardHeader className="flex flex-row items-center justify-between gap-2 p-4 sm:p-6">
                  <CardTitle className="text-sm sm:text-base flex items-center gap-2 min-w-0">
                    <span className="truncate">{group}</span>
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px] shrink-0">{activeCount}/{rows.length}</Badge>
                  </CardTitle>
                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-data-[state=closed]:-rotate-90" />
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-2 p-4 sm:p-6 pt-0 sm:pt-0">
                  {rows.map((s) => (
                    <div key={s.alert_key} className="rounded-md border p-3 space-y-2.5">
                      <div>
                        <div className="font-medium text-sm">{s.label}</div>
                        {s.description && <p className="text-[11px] leading-snug text-muted-foreground mt-0.5">{s.description}</p>}
                      </div>
                      <div className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5">
                        <span className="flex items-center gap-2 text-xs sm:text-sm"><Smartphone className="h-4 w-4" /> Push</span>
                        <Switch checked={s.push_enabled} onCheckedChange={(v) => updateSetting(s.alert_key, { push_enabled: v })} />
                      </div>
                      <div className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5">
                        <span className="flex items-center gap-2 text-xs sm:text-sm"><MessageCircle className="h-4 w-4" /> WhatsApp</span>
                        <Switch checked={s.whatsapp_enabled} onCheckedChange={(v) => updateSetting(s.alert_key, { whatsapp_enabled: v })} />
                      </div>
                      {s.whatsapp_enabled && (
                        <Select
                          value={s.whatsapp_sender_id ?? "__default__"}
                          onValueChange={(v) => updateSetting(s.alert_key, { whatsapp_sender_id: v === "__default__" ? null : v })}
                        >
                          <SelectTrigger className="text-xs sm:text-sm h-9"><SelectValue placeholder="Remetente" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__default__">Padrão do sistema</SelectItem>
                            {senders.filter((x) => x.active).map((x) => (
                              <SelectItem key={x.id} value={x.id}>
                                {x.label}{x.phone_display ? ` — ${x.phone_display}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
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
        <div>
          <Label>Apelido *</Label>
          <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Ex.: Alertas Gerais" />
        </div>
        <div>
          <Label>Número exibido (para referência)</Label>
          <Input value={draft.phone_display ?? ""} onChange={(e) => setDraft({ ...draft, phone_display: e.target.value })} placeholder="+55 61 9 9999-9999" />
        </div>
        <div>
          <Label>Z-API Instance ID *</Label>
          <Input value={draft.zapi_instance_id} onChange={(e) => setDraft({ ...draft, zapi_instance_id: e.target.value })} />
        </div>
        <div>
          <Label>Z-API Token *</Label>
          <Input value={draft.zapi_token} onChange={(e) => setDraft({ ...draft, zapi_token: e.target.value })} />
        </div>
        <div>
          <Label>Z-API Client-Token *</Label>
          <Input value={draft.zapi_client_token} onChange={(e) => setDraft({ ...draft, zapi_client_token: e.target.value })} />
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
        <Button onClick={onSave} disabled={saving || !draft.label || !draft.zapi_instance_id || !draft.zapi_token || !draft.zapi_client_token}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Salvar
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
