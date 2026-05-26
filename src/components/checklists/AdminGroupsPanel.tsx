import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Users, FolderKey, UserPlus } from "lucide-react";

interface Group { id: string; name: string }
interface UserWithGroups {
  user_id: string;
  full_name: string;
  groups: { group_id: string; group_name: string }[];
}

export default function AdminGroupsPanel() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [users, setUsers] = useState<UserWithGroups[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");

  useEffect(() => { loadGroups(); loadUsers(); }, []);

  const loadGroups = async () => {
    const { data } = await supabase.from("access_groups").select("id, name").order("name");
    if (data) setGroups(data as Group[]);
  };

  const loadUsers = async () => {
    // Lista colaboradores cadastrados (com conta de usuário vinculada)
    const { data: employees } = await supabase
      .from("employees")
      .select("user_id, full_name")
      .not("user_id", "is", null)
      .eq("status", "active")
      .order("full_name");

    // Também inclui perfis (admins/gestores que talvez não estejam em employees)
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .order("full_name");

    const { data: assignments } = await supabase
      .from("user_access_groups")
      .select("user_id, group_id, access_groups(name)");

    const map: Record<string, UserWithGroups> = {};
    for (const e of employees || []) {
      if (!e.user_id) continue;
      map[e.user_id] = {
        user_id: e.user_id,
        full_name: e.full_name || "(sem nome)",
        groups: [],
      };
    }
    for (const p of profiles || []) {
      if (!map[p.user_id]) {
        map[p.user_id] = {
          user_id: p.user_id,
          full_name: p.full_name || "(sem nome)",
          groups: [],
        };
      }
    }
    if (assignments) {
      for (const a of assignments as any[]) {
        if (map[a.user_id]) {
          map[a.user_id].groups.push({
            group_id: a.group_id,
            group_name: a.access_groups?.name || "",
          });
        }
      }
    }
    setUsers(Object.values(map));
  };

  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    const { error } = await supabase.from("access_groups").insert({ name: newGroupName.trim() });
    if (error) {
      toast.error(error.message.includes("duplicate") ? "Grupo já existe" : error.message);
      return;
    }
    toast.success("Grupo criado");
    setNewGroupName(""); setGroupDialogOpen(false); loadGroups();
  };

  const deleteGroup = async (id: string) => {
    if (!confirm("Excluir grupo? Atribuições serão removidas.")) return;
    await supabase.from("access_groups").delete().eq("id", id);
    toast.success("Grupo excluído"); loadGroups(); loadUsers();
  };

  const assignGroup = async (userId?: string, groupId?: string, opts?: { closeDialog?: boolean }) => {
    const uid = userId ?? selectedUserId;
    const gid = groupId ?? selectedGroupId;
    if (!uid || !gid) return;
    const { error } = await supabase.from("user_access_groups").insert({
      user_id: uid, group_id: gid,
    });
    if (error) {
      toast.error(error.message.includes("duplicate") ? "Já atribuído" : error.message);
      return;
    }
    toast.success("Atribuído");
    if (opts?.closeDialog ?? true) {
      setAssignDialogOpen(false); setSelectedUserId(""); setSelectedGroupId("");
    }
    loadUsers();
  };

  const removeUserGroup = async (userId: string, groupId: string) => {
    await supabase.from("user_access_groups").delete().eq("user_id", userId).eq("group_id", groupId);
    toast.success("Removido"); loadUsers();
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Grupos de acesso</h2>
        <div className="flex gap-2">
          <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" variant="outline">
                <Plus className="h-4 w-4" /> Novo grupo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Criar grupo</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome do grupo</Label>
                  <Input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Ex: Caixas" />
                </div>
                <Button onClick={createGroup} className="w-full">Criar</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><UserPlus className="h-4 w-4" /> Atribuir grupo</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Atribuir colaborador a grupo</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Colaborador</Label>
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.user_id} value={u.user_id}>
                          {u.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Grupo</Label>
                  <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {groups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={() => assignGroup()} className="w-full">Atribuir</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
        <FolderKey className="h-5 w-5 text-primary" /> Grupos
      </h3>
      {groups.length === 0 ? (
        <Card className="mb-6">
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhum grupo cadastrado.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-wrap gap-2 mb-6">
          {groups.map((g) => (
            <Badge key={g.id} variant="secondary" className="gap-2 text-sm py-1.5 px-3">
              {g.name}
              <button onClick={() => deleteGroup(g.id)} className="hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
        <Users className="h-5 w-5 text-primary" /> Colaboradores
      </h3>
      <div className="space-y-3">
        {users.map((u) => {
          const assignedIds = new Set(u.groups.map((g) => g.group_id));
          const available = groups.filter((g) => !assignedIds.has(g.id));
          return (
            <Card key={u.user_id}>
              <CardHeader className="py-3 flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">{u.full_name}</CardTitle>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="outline" className="gap-1.5 h-8" disabled={available.length === 0}>
                      <UserPlus className="h-3.5 w-3.5" />
                      Atribuir grupo
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-56 p-1">
                    {available.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-2">
                        Sem grupos disponíveis.
                      </p>
                    ) : (
                      <div className="flex flex-col">
                        {available.map((g) => (
                          <button
                            key={g.id}
                            onClick={() => assignGroup(u.user_id, g.id, { closeDialog: false })}
                            className="text-left text-sm px-2 py-1.5 rounded hover:bg-accent hover:text-accent-foreground"
                          >
                            {g.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </CardHeader>
              <CardContent className="pt-0">
                {u.groups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem grupos atribuídos.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {u.groups.map((g) => (
                      <Badge key={g.group_id} className="gap-1.5 bg-primary/10 text-primary hover:bg-primary/20">
                        {g.group_name}
                        <button onClick={() => removeUserGroup(u.user_id, g.group_id)} className="hover:text-destructive">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
