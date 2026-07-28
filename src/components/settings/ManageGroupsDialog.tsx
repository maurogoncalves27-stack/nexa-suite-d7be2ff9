import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Loader2, Plus, UserPlus, UserMinus, Pencil } from "lucide-react";
import { toast } from "sonner";

type Group = { id: string; group_id: string; name: string; sender_id: string; active: boolean };

export function ManageGroupsDialog({ senderId, senderLabel }: { senderId: string; senderLabel: string }) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // create
  const [newName, setNewName] = useState("");
  const [newPhones, setNewPhones] = useState("");
  // manage existing
  const [selGroup, setSelGroup] = useState<string>("");
  const [renameTo, setRenameTo] = useState("");
  const [addPhones, setAddPhones] = useState("");
  const [rmPhones, setRmPhones] = useState("");

  async function loadGroups() {
    setLoading(true);
    const { data } = await supabase
      .from("whatsapp_groups")
      .select("id, group_id, name, sender_id, active")
      .eq("sender_id", senderId)
      .eq("active", true)
      .order("name");
    setGroups((data ?? []) as Group[]);
    setLoading(false);
  }

  useEffect(() => { if (open) loadGroups(); }, [open, senderId]);

  async function call(action: string, extra: Record<string, unknown>, successMsg: string) {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("zapi-group-manage", {
        body: { sender_id: senderId, action, ...extra },
      });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.details === "string" ? data.details : (data.error ?? "Falhou"));
      toast.success(successMsg);
      await loadGroups();
      return true;
    } catch (e: any) {
      toast.error(e?.message ?? "Falhou");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const parsePhones = (raw: string) =>
    raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-xs">
          <Users className="h-3 w-3" /> Gerenciar grupos
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Users className="h-4 w-4" /> Grupos · {senderLabel}</DialogTitle>
          <DialogDescription>Crie novos grupos e gerencie participantes direto pela Z-API.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="create" className="w-full">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="create"><Plus className="h-3.5 w-3.5 mr-1" />Criar</TabsTrigger>
            <TabsTrigger value="manage"><Pencil className="h-3.5 w-3.5 mr-1" />Gerenciar</TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="space-y-3 mt-4">
            <div className="space-y-2">
              <Label>Nome do grupo</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex.: Alertas Loja Asa Sul" />
            </div>
            <div className="space-y-2">
              <Label>Participantes iniciais (telefones com DDD, separados por vírgula ou espaço)</Label>
              <Input value={newPhones} onChange={(e) => setNewPhones(e.target.value)} placeholder="61999990000, 61988887777" />
              <p className="text-xs text-muted-foreground">Mínimo 1 participante além do próprio número.</p>
            </div>
            <Button
              className="w-full gap-2"
              disabled={busy || !newName.trim() || parsePhones(newPhones).length === 0}
              onClick={async () => {
                const ok = await call("create",
                  { group_name: newName.trim(), phones: parsePhones(newPhones) },
                  "Grupo criado");
                if (ok) { setNewName(""); setNewPhones(""); }
              }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar grupo
            </Button>
          </TabsContent>

          <TabsContent value="manage" className="space-y-3 mt-4">
            {loading ? (
              <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
            ) : groups.length === 0 ? (
              <p className="text-xs text-muted-foreground border rounded-md p-3">
                Nenhum grupo sincronizado. Use "Sincronizar grupos" ou crie um novo.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Grupo</Label>
                  <Select value={selGroup} onValueChange={setSelGroup}>
                    <SelectTrigger><SelectValue placeholder="Selecione um grupo" /></SelectTrigger>
                    <SelectContent>
                      {groups.map((g) => (
                        <SelectItem key={g.id} value={g.group_id}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selGroup && (
                  <div className="space-y-4 border-t pt-3">
                    <div className="space-y-2">
                      <Label>Renomear</Label>
                      <div className="flex gap-2">
                        <Input value={renameTo} onChange={(e) => setRenameTo(e.target.value)} placeholder="Novo nome" />
                        <Button
                          size="sm" variant="outline" disabled={busy || !renameTo.trim()}
                          onClick={async () => {
                            const ok = await call("rename",
                              { group_id: selGroup, group_name: renameTo.trim() },
                              "Grupo renomeado");
                            if (ok) setRenameTo("");
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Adicionar participante(s)</Label>
                      <div className="flex gap-2">
                        <Input value={addPhones} onChange={(e) => setAddPhones(e.target.value)} placeholder="61999990000" />
                        <Button
                          size="sm" variant="outline" disabled={busy || parsePhones(addPhones).length === 0}
                          onClick={async () => {
                            const ok = await call("add_participant",
                              { group_id: selGroup, phones: parsePhones(addPhones) },
                              "Participante(s) adicionado(s)");
                            if (ok) setAddPhones("");
                          }}
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Remover participante(s)</Label>
                      <div className="flex gap-2">
                        <Input value={rmPhones} onChange={(e) => setRmPhones(e.target.value)} placeholder="61999990000" />
                        <Button
                          size="sm" variant="outline" disabled={busy || parsePhones(rmPhones).length === 0}
                          onClick={async () => {
                            const ok = await call("remove_participant",
                              { group_id: selGroup, phones: parsePhones(rmPhones) },
                              "Participante(s) removido(s)");
                            if (ok) setRmPhones("");
                          }}
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
