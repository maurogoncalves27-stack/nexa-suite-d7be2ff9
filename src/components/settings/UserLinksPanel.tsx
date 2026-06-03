import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Link2, Link2Off, Search, RefreshCw, X, UserCheck, UserX, UserPlus, Briefcase, Users, HandCoins } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface ProfileRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
}
interface EmployeeRow {
  id: string;
  full_name: string;
  email: string | null;
  cpf: string | null;
  position: string | null;
  user_id: string | null;
  status: string;
}
interface OutsourcedRow {
  id: string;
  full_name: string | null;
  email: string | null;
  cpf: string | null;
  role_title: string | null;
  user_id: string | null;
  status: string;
}
interface FreelancerRow {
  id: string;
  full_name: string;
  email: string | null;
  cpf: string | null;
  phone: string | null;
  user_id: string | null;
  status: string;
}

type LinkKind = "employee" | "outsourced" | "freelancer";

const UserLinksPanel = () => {
  const { isAdmin } = useAuth();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [outsourced, setOutsourced] = useState<OutsourcedRow[]>([]);
  const [freelancers, setFreelancers] = useState<FreelancerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"unlinked" | "linked" | "no-login">("unlinked");

  const [linkDialog, setLinkDialog] = useState<{ open: boolean; profile: ProfileRow | null }>({ open: false, profile: null });
  const [linkKind, setLinkKind] = useState<LinkKind>("employee");
  const [selectedTargetId, setSelectedTargetId] = useState<string>("");
  const [targetSearch, setTargetSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [
      { data: profs, error: pe },
      { data: emps, error: ee },
      { data: outs, error: oe },
      { data: frees, error: fe },
    ] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, email").order("full_name"),
      supabase.from("employees").select("id, full_name, email, cpf, position, user_id, status").order("full_name"),
      supabase.from("outsourced_professionals").select("id, full_name, email, cpf, role_title, user_id, status").order("full_name"),
      supabase.from("freelancers").select("id, full_name, email, cpf, phone, user_id, status").order("full_name"),
    ]);
    if (pe || ee || oe || fe) {
      toast({ title: "Erro ao carregar", description: pe?.message || ee?.message || oe?.message || fe?.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    setProfiles(profs ?? []);
    setEmployees((emps ?? []) as EmployeeRow[]);
    setOutsourced((outs ?? []) as OutsourcedRow[]);
    setFreelancers((frees ?? []) as FreelancerRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const linkedEmployeeByUserId = useMemo(() => {
    const m = new Map<string, EmployeeRow>();
    employees.forEach((e) => { if (e.user_id) m.set(e.user_id, e); });
    return m;
  }, [employees]);

  const linkedOutsourcedByUserId = useMemo(() => {
    const m = new Map<string, OutsourcedRow>();
    outsourced.forEach((o) => { if (o.user_id) m.set(o.user_id, o); });
    return m;
  }, [outsourced]);

  const linkedFreelancerByUserId = useMemo(() => {
    const m = new Map<string, FreelancerRow>();
    freelancers.forEach((f) => { if (f.user_id) m.set(f.user_id, f); });
    return m;
  }, [freelancers]);

  const unlinkedProfiles = useMemo(
    () => profiles.filter((p) => !linkedEmployeeByUserId.has(p.user_id) && !linkedOutsourcedByUserId.has(p.user_id) && !linkedFreelancerByUserId.has(p.user_id)),
    [profiles, linkedEmployeeByUserId, linkedOutsourcedByUserId, linkedFreelancerByUserId]
  );
  const linkedProfiles = useMemo(
    () => profiles.filter((p) => linkedEmployeeByUserId.has(p.user_id) || linkedOutsourcedByUserId.has(p.user_id) || linkedFreelancerByUserId.has(p.user_id)),
    [profiles, linkedEmployeeByUserId, linkedOutsourcedByUserId, linkedFreelancerByUserId]
  );

  const filterProfiles = (list: ProfileRow[]) => {
    const q = search.toLowerCase().trim();
    if (!q) return list;
    return list.filter((p) => p.full_name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q));
  };

  const availableEmployees = useMemo(
    () => employees.filter((e) => !e.user_id),
    [employees]
  );
  const availableOutsourced = useMemo(
    () => outsourced.filter((o) => !o.user_id),
    [outsourced]
  );
  const availableFreelancers = useMemo(
    () => freelancers.filter((f) => !f.user_id),
    [freelancers]
  );

  const filteredAvailableEmployees = useMemo(() => {
    const q = targetSearch.toLowerCase().trim();
    if (!q) return availableEmployees;
    return availableEmployees.filter((e) =>
      e.full_name.toLowerCase().includes(q) ||
      e.email?.toLowerCase().includes(q) ||
      e.cpf?.includes(q)
    );
  }, [availableEmployees, targetSearch]);

  const filteredAvailableOutsourced = useMemo(() => {
    const q = targetSearch.toLowerCase().trim();
    if (!q) return availableOutsourced;
    return availableOutsourced.filter((o) =>
      o.full_name?.toLowerCase().includes(q) ||
      o.email?.toLowerCase().includes(q) ||
      o.cpf?.includes(q)
    );
  }, [availableOutsourced, targetSearch]);

  const filteredAvailableFreelancers = useMemo(() => {
    const q = targetSearch.toLowerCase().trim();
    if (!q) return availableFreelancers;
    return availableFreelancers.filter((f) =>
      f.full_name.toLowerCase().includes(q) ||
      f.email?.toLowerCase().includes(q) ||
      f.cpf?.includes(q) ||
      f.phone?.includes(q)
    );
  }, [availableFreelancers, targetSearch]);

  const openLinkDialog = (profile: ProfileRow) => {
    setSelectedTargetId("");
    setTargetSearch("");
    const alreadyEmp = linkedEmployeeByUserId.has(profile.user_id);
    const alreadyOut = linkedOutsourcedByUserId.has(profile.user_id);
    const alreadyFree = linkedFreelancerByUserId.has(profile.user_id);
    // sugestão automática por e-mail, preferindo kinds ainda não vinculados
    const empSuggestion = !alreadyEmp ? availableEmployees.find((e) => e.email && profile.email && e.email.toLowerCase() === profile.email.toLowerCase()) : null;
    const outSuggestion = !alreadyOut ? availableOutsourced.find((o) => o.email && profile.email && o.email.toLowerCase() === profile.email.toLowerCase()) : null;
    const freeSuggestion = !alreadyFree ? availableFreelancers.find((f) => f.email && profile.email && f.email.toLowerCase() === profile.email.toLowerCase()) : null;
    if (empSuggestion) {
      setLinkKind("employee");
      setSelectedTargetId(empSuggestion.id);
    } else if (outSuggestion) {
      setLinkKind("outsourced");
      setSelectedTargetId(outSuggestion.id);
    } else if (freeSuggestion) {
      setLinkKind("freelancer");
      setSelectedTargetId(freeSuggestion.id);
    } else {
      setLinkKind(!alreadyEmp ? "employee" : !alreadyOut ? "outsourced" : "freelancer");
    }
    setLinkDialog({ open: true, profile });
  };

  const confirmLink = async () => {
    if (!linkDialog.profile || !selectedTargetId) return;
    setSaving(true);
    const table = linkKind === "employee" ? "employees" : linkKind === "outsourced" ? "outsourced_professionals" : "freelancers";
    const { error } = await supabase
      .from(table)
      .update({ user_id: linkDialog.profile.user_id })
      .eq("id", selectedTargetId);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao vincular", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Vínculo criado",
      description: linkKind === "employee" ? "Login associado ao colaborador." : linkKind === "outsourced" ? "Login associado ao terceirizado." : "Login associado ao freelancer.",
    });
    setLinkDialog({ open: false, profile: null });
    await load();
  };

  const unlinkEmployee = async (employeeId: string) => {
    if (!confirm("Remover o vínculo? O usuário continuará podendo entrar, mas perderá acesso à Área do Colaborador até ser revinculado.")) return;
    const { error } = await supabase.from("employees").update({ user_id: null }).eq("id", employeeId);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Vínculo removido" });
    await load();
  };

  const unlinkFreelancer = async (freelancerId: string) => {
    if (!confirm("Remover o vínculo do freelancer? O usuário continuará podendo entrar, mas perderá acesso à área do freelancer até ser revinculado.")) return;
    const { error } = await supabase.from("freelancers").update({ user_id: null }).eq("id", freelancerId);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Vínculo removido" });
    await load();
  };

  const unlinkOutsourced = async (outsourcedId: string) => {
    if (!confirm("Remover o vínculo do terceirizado? O usuário continuará podendo entrar, mas perderá acesso à área do terceirizado até ser revinculado.")) return;
    const { error } = await supabase.from("outsourced_professionals").update({ user_id: null }).eq("id", outsourcedId);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Vínculo removido" });
    await load();
  };

  const handleSearch = () => setSearch(searchInput);
  const handleClear = () => { setSearchInput(""); setSearch(""); };

  const unlinkedView = filterProfiles(unlinkedProfiles);
  const linkedView = filterProfiles(linkedProfiles);

  const noLoginCount = availableEmployees.length + availableOutsourced.length + availableFreelancers.length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Link2 className="h-6 w-6 text-primary" /> Vínculos de Login
        </h2>
        <p className="text-muted-foreground text-sm">
          Associe contas de login (e-mail/senha) a cadastros de <strong>colaborador</strong>, <strong>terceirizado</strong> ou <strong>freelancer</strong>. Sem vínculo, o usuário não acessa as áreas restritas.
        </p>
      </div>

      <Card className="bg-muted/40">
        <CardContent className="pt-4 pb-4 text-sm space-y-1">
          <p><strong>Como funciona:</strong> quando alguém cria uma conta, ela aparece em <em>"Logins sem vínculo"</em>. Clique em <strong>Vincular</strong>, escolha se é colaborador, terceirizado ou freelancer e selecione o cadastro correspondente.</p>
          <p className="text-xs text-muted-foreground">O sistema sugere automaticamente um cadastro com o mesmo e-mail, se houver.</p>
          <p className="text-xs text-muted-foreground">A aba <strong>Sem login</strong> mostra colaboradores, terceirizados e freelancers que ainda não criaram conta — peça que se cadastrem na tela de login correta com o e-mail do cadastro.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant={tab === "unlinked" ? "default" : "outline"}
                onClick={() => setTab("unlinked")}
                className="gap-1"
              >
                <UserX className="h-4 w-4" /> Logins sem vínculo
                <Badge variant="secondary" className="ml-1">{unlinkedProfiles.length}</Badge>
              </Button>
              <Button
                size="sm"
                variant={tab === "linked" ? "default" : "outline"}
                onClick={() => setTab("linked")}
                className="gap-1"
              >
                <UserCheck className="h-4 w-4" /> Vinculados
                <Badge variant="secondary" className="ml-1">{linkedProfiles.length}</Badge>
              </Button>
              <Button
                size="sm"
                variant={tab === "no-login" ? "default" : "outline"}
                onClick={() => setTab("no-login")}
                className="gap-1"
              >
                <UserPlus className="h-4 w-4" /> Sem login
                <Badge variant="secondary" className="ml-1">{noLoginCount}</Badge>
              </Button>
            </div>
            <Button size="sm" variant="outline" onClick={load} title="Atualizar">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou email..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                className="pl-8 pr-8"
              />
              {searchInput && (
                <button type="button" onClick={handleClear} className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button size="sm" onClick={handleSearch} className="gap-1">
              <Search className="h-4 w-4" /> Buscar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : tab === "unlinked" ? (
            unlinkedView.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Nenhum login sem vínculo. 🎉
              </div>
            ) : (
              <div className="space-y-2">
                {unlinkedView.map((p) => (
                  <div key={p.user_id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border bg-card">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{p.full_name || "(sem nome)"}</div>
                      <div className="text-xs text-muted-foreground truncate">{p.email}</div>
                    </div>
                    <Button size="sm" onClick={() => openLinkDialog(p)} className="gap-1 w-full sm:w-auto">
                      <Link2 className="h-4 w-4" /> Vincular
                    </Button>
                  </div>
                ))}
              </div>
            )
          ) : tab === "linked" ? (
            linkedView.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Nenhum login vinculado encontrado.
              </div>
            ) : (
              <div className="space-y-2">
                {linkedView.map((p) => {
                  const emp = linkedEmployeeByUserId.get(p.user_id);
                  const out = linkedOutsourcedByUserId.get(p.user_id);
                  const freelancer = linkedFreelancerByUserId.get(p.user_id);
                  const hasAll = !!emp && !!out && !!freelancer;
                  return (
                    <div key={p.user_id} className="flex flex-col gap-2 p-3 rounded-lg border bg-card">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <span className="font-medium truncate">{p.full_name || "(sem nome)"}</span>
                          <div className="text-xs text-muted-foreground truncate">login: {p.email}</div>
                        </div>
                        {!hasAll && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openLinkDialog(p)}
                            disabled={!isAdmin}
                            className="gap-1 w-full sm:w-auto"
                          >
                            + Vincular também
                          </Button>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        {emp && (
                          <div className="flex items-center justify-between gap-2 text-xs bg-muted/40 rounded px-2 py-1">
                            <span className="flex items-center gap-1 truncate"><Users className="h-3 w-3" /> Colaborador: <strong className="truncate">{emp.full_name}</strong></span>
                            <Button size="sm" variant="ghost" className="h-6 px-2 gap-1" onClick={() => unlinkEmployee(emp.id)} disabled={!isAdmin}>
                              <Link2Off className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                        {freelancer && (
                          <div className="flex items-center justify-between gap-2 text-xs bg-muted/40 rounded px-2 py-1">
                            <span className="flex items-center gap-1 truncate"><HandCoins className="h-3 w-3" /> Freelancer: <strong className="truncate">{freelancer.full_name}</strong></span>
                            <Button size="sm" variant="ghost" className="h-6 px-2 gap-1" onClick={() => unlinkFreelancer(freelancer.id)} disabled={!isAdmin}>
                              <Link2Off className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                        {out && (
                          <div className="flex items-center justify-between gap-2 text-xs bg-muted/40 rounded px-2 py-1">
                            <span className="flex items-center gap-1 truncate"><Briefcase className="h-3 w-3" /> Terceirizado: <strong className="truncate">{out.full_name}</strong></span>
                            <Button size="sm" variant="ghost" className="h-6 px-2 gap-1" onClick={() => unlinkOutsourced(out.id)} disabled={!isAdmin}>
                              <Link2Off className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            (() => {
              const q = search.toLowerCase().trim();
              const empView = q
                ? availableEmployees.filter((e) =>
                    e.full_name.toLowerCase().includes(q) ||
                    e.email?.toLowerCase().includes(q) ||
                    e.cpf?.includes(q)
                  )
                : availableEmployees;
              const outView = q
                ? availableOutsourced.filter((o) =>
                    o.full_name?.toLowerCase().includes(q) ||
                    o.email?.toLowerCase().includes(q) ||
                    o.cpf?.includes(q)
                  )
                : availableOutsourced;
              const freelancerView = q
                ? availableFreelancers.filter((f) =>
                    f.full_name.toLowerCase().includes(q) ||
                    f.email?.toLowerCase().includes(q) ||
                    f.cpf?.includes(q) ||
                    f.phone?.includes(q)
                  )
                : availableFreelancers;
              if (empView.length === 0 && outView.length === 0 && freelancerView.length === 0) {
                return (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    Todos os cadastros possuem login. 🎉
                  </div>
                );
              }
              return (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Estes cadastros ainda não têm conta no sistema. Peça que cada um acesse a tela de login e clique em <strong>Criar conta</strong> usando o e-mail abaixo. Após o cadastro, o vínculo aparecerá automaticamente em <em>Logins sem vínculo</em>.
                  </p>

                  {empView.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold flex items-center gap-1">
                        <Users className="h-4 w-4" /> Colaboradores ({empView.length})
                      </h4>
                      {empView.map((e) => (
                        <div key={e.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border bg-card">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium truncate">{e.full_name}</span>
                              {e.position && <Badge variant="outline" className="text-xs">{e.position}</Badge>}
                              <Badge variant="secondary" className="text-xs">{e.status}</Badge>
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {e.email || "Sem e-mail cadastrado"}
                              {e.cpf ? ` • CPF ${e.cpf}` : ""}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {outView.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold flex items-center gap-1">
                        <Briefcase className="h-4 w-4" /> Terceirizados ({outView.length})
                      </h4>
                      {outView.map((o) => (
                        <div key={o.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border bg-card">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium truncate">{o.full_name || "(sem nome)"}</span>
                              {o.role_title && <Badge variant="outline" className="text-xs">{o.role_title}</Badge>}
                              <Badge variant="secondary" className="text-xs">{o.status}</Badge>
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {o.email || "Sem e-mail cadastrado"}
                              {o.cpf ? ` • CPF ${o.cpf}` : ""}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {freelancerView.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold flex items-center gap-1">
                        <HandCoins className="h-4 w-4" /> Freelancers ({freelancerView.length})
                      </h4>
                      {freelancerView.map((f) => (
                        <div key={f.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border bg-card">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium truncate">{f.full_name}</span>
                              <Badge variant="secondary" className="text-xs">{f.status}</Badge>
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {f.email || "Sem e-mail cadastrado"}
                              {f.cpf ? ` • CPF ${f.cpf}` : ""}
                              {f.phone ? ` • ${f.phone}` : ""}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()
          )}
        </CardContent>
      </Card>

      <Dialog open={linkDialog.open} onOpenChange={(o) => !o && setLinkDialog({ open: false, profile: null })}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vincular login</DialogTitle>
            <DialogDescription>
              Login: <strong>{linkDialog.profile?.full_name}</strong> ({linkDialog.profile?.email})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Tipo de cadastro</p>
              <Tabs value={linkKind} onValueChange={(v) => { setLinkKind(v as LinkKind); setSelectedTargetId(""); }}>
                <TabsList className="grid w-full grid-cols-3 h-auto">
                  <TabsTrigger value="employee" className="gap-1">
                    <Users className="h-4 w-4" /> Colaborador
                  </TabsTrigger>
                  <TabsTrigger value="outsourced" className="gap-1">
                    <Briefcase className="h-4 w-4" /> Terceirizado
                  </TabsTrigger>
                  <TabsTrigger value="freelancer" className="gap-1">
                    <HandCoins className="h-4 w-4" /> Freelancer
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <Input
              placeholder={linkKind === "employee" ? "Buscar colaborador (nome, email ou CPF)" : linkKind === "outsourced" ? "Buscar terceirizado (nome, email ou CPF)" : "Buscar freelancer (nome, email, CPF ou telefone)"}
              value={targetSearch}
              onChange={(e) => setTargetSearch(e.target.value)}
            />

            <Select value={selectedTargetId} onValueChange={setSelectedTargetId}>
              <SelectTrigger>
                <SelectValue placeholder={linkKind === "employee" ? "Selecione um colaborador disponível" : linkKind === "outsourced" ? "Selecione um terceirizado disponível" : "Selecione um freelancer disponível"} />
              </SelectTrigger>
              <SelectContent>
                {linkKind === "employee" ? (
                  filteredAvailableEmployees.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                      Nenhum colaborador disponível {targetSearch && "para essa busca"}.
                    </div>
                  ) : (
                    filteredAvailableEmployees.slice(0, 50).map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.full_name} {e.position ? `— ${e.position}` : ""} {e.email ? `(${e.email})` : ""}
                      </SelectItem>
                    ))
                  )
                ) : linkKind === "outsourced" ? (
                  filteredAvailableOutsourced.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                      Nenhum terceirizado disponível {targetSearch && "para essa busca"}.
                    </div>
                  ) : (
                    filteredAvailableOutsourced.slice(0, 50).map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.full_name || "(sem nome)"} {o.role_title ? `— ${o.role_title}` : ""} {o.email ? `(${o.email})` : ""}
                      </SelectItem>
                    ))
                  )
                ) : (
                  filteredAvailableFreelancers.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                      Nenhum freelancer disponível {targetSearch && "para essa busca"}.
                    </div>
                  ) : (
                    filteredAvailableFreelancers.slice(0, 50).map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.full_name} {f.email ? `(${f.email})` : ""} {f.phone ? `— ${f.phone}` : ""}
                      </SelectItem>
                    ))
                  )
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Mostrando apenas cadastros ainda não vinculados a outro login.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setLinkDialog({ open: false, profile: null })} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={confirmLink} disabled={!selectedTargetId || saving} className="gap-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserLinksPanel;
