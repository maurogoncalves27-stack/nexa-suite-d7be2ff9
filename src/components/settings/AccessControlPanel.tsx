import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, Search, ShieldCheck, Crown, X, RefreshCw, Link2Off, MapPin, Store as StoreIcon, Check, FileText } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth, AppRole } from "@/hooks/useAuth";
import { sortStores } from "@/lib/storeSort";

interface ProfileRow {
  user_id: string;
  email: string | null;
}

interface OverrideRow {
  user_id: string;
  bypass_geofence: boolean;
  extra_store_ids: string[];
  can_receive_invoices: boolean;
}

interface StoreOption {
  id: string;
  name: string;
}

interface AccessRow {
  employee_id: string;
  user_id: string | null;
  full_name: string;
  employeeEmail: string | null;
  loginEmail: string | null;
  status: string;
  isAdmin: boolean;
  isManager: boolean;
  bypassGeofence: boolean;
  extraStoreIds: string[];
  canReceiveInvoices: boolean;
}

const AccessControlPanel = () => {
  const { user, isAdmin, isManager } = useAuth();
  const canEdit = isAdmin || isManager;
  const [rows, setRows] = useState<AccessRow[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);

    const [employeesRes, profilesRes, rolesRes, overridesRes, storesRes] = await Promise.all([
      supabase
        .from("employees")
        .select("id, user_id, full_name, email, status")
        .order("full_name", { ascending: true }),
      supabase.from("profiles").select("user_id, email"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("user_access_overrides").select("user_id, bypass_geofence, extra_store_ids, can_receive_invoices"),
      supabase.from("stores").select("id, name, store_type, is_virtual").eq("is_active", true).eq("is_virtual", false),
    ]);

    const firstError = [employeesRes, profilesRes, rolesRes, overridesRes, storesRes].find((r) => r.error);
    if (firstError?.error) {
      toast({ title: "Erro ao carregar dados", description: firstError.error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const profileMap = new Map<string, ProfileRow>();
    (profilesRes.data ?? []).forEach((p: any) => profileMap.set(p.user_id, p as ProfileRow));

    const roleMap = new Map<string, Set<string>>();
    (rolesRes.data ?? []).forEach((r: any) => {
      if (!roleMap.has(r.user_id)) roleMap.set(r.user_id, new Set());
      roleMap.get(r.user_id)!.add(r.role);
    });

    const overrideMap = new Map<string, OverrideRow>();
    (overridesRes.data ?? []).forEach((o: any) => overrideMap.set(o.user_id, o as OverrideRow));

    const nextRows: AccessRow[] = (employeesRes.data ?? []).map((emp: any) => {
      const profile = emp.user_id ? profileMap.get(emp.user_id) : null;
      const empRoles = emp.user_id ? roleMap.get(emp.user_id) : undefined;
      const ovr = emp.user_id ? overrideMap.get(emp.user_id) : undefined;

      return {
        employee_id: emp.id,
        user_id: emp.user_id,
        full_name: emp.full_name,
        employeeEmail: emp.email,
        loginEmail: profile?.email ?? null,
        status: emp.status,
        isAdmin: empRoles?.has("admin") ?? false,
        isManager: empRoles?.has("manager") ?? false,
        bypassGeofence: ovr?.bypass_geofence ?? false,
        extraStoreIds: ovr?.extra_store_ids ?? [],
        canReceiveInvoices: ovr?.can_receive_invoices ?? false,
      };
    });

    setRows(nextRows);
    setStores(sortStores((storesRes.data ?? []) as any).map((s: any) => ({ id: s.id, name: s.name })));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const ensureCanEdit = () => {
    if (!canEdit) {
      toast({ title: "Permissão negada", description: "Apenas administradoras e gestoras podem alterar acessos.", variant: "destructive" });
      return false;
    }
    return true;
  };

  const ensureLinked = (row: AccessRow) => {
    if (!row.user_id) {
      toast({
        title: "Login não vinculado",
        description: "Vincule um login ao colaborador na seção Vínculos antes de configurar acessos.",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const toggleRole = async (row: AccessRow, role: AppRole, enabled: boolean) => {
    if (!ensureCanEdit() || !ensureLinked(row)) return;
    if (!isAdmin && (role === "admin" || role === "manager")) {
      toast({ title: "Apenas admin", description: "Somente administradoras alteram os papéis Admin e Gestor.", variant: "destructive" });
      return;
    }
    if (row.user_id === user?.id && role === "admin" && !enabled) {
      toast({ title: "Ação bloqueada", description: "Você não pode remover seu próprio acesso de administrador.", variant: "destructive" });
      return;
    }

    setSavingId(row.user_id! + role);

    if (enabled) {
      const { error } = await supabase.from("user_roles").insert({ user_id: row.user_id!, role });
      if (error && !error.message.includes("duplicate")) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
        setSavingId(null);
        return;
      }
    } else {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", row.user_id!).eq("role", role);
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
        setSavingId(null);
        return;
      }
    }

    const { data: freshRoles } = await supabase.from("user_roles").select("role").eq("user_id", row.user_id!);
    const roleSet = new Set((freshRoles ?? []).map((r: any) => r.role));

    setRows((prev) =>
      prev.map((current) =>
        current.employee_id === row.employee_id
          ? { ...current, isAdmin: roleSet.has("admin"), isManager: roleSet.has("manager") }
          : current
      )
    );

    setSavingId(null);
    toast({
      title: "Acesso atualizado",
      description: `${role === "admin" ? "Admin" : "Gestor"} ${enabled ? "concedido" : "removido"}.`,
    });
  };

  const upsertOverride = async (
    row: AccessRow,
    patch: Partial<Pick<AccessRow, "bypassGeofence" | "extraStoreIds" | "canReceiveInvoices">>,
  ) => {
    if (!ensureCanEdit() || !ensureLinked(row)) return;

    const next = {
      bypass_geofence: patch.bypassGeofence ?? row.bypassGeofence,
      extra_store_ids: patch.extraStoreIds ?? row.extraStoreIds,
      can_receive_invoices: patch.canReceiveInvoices ?? row.canReceiveInvoices,
    };

    setSavingId(row.user_id! + "override");

    const { error } = await supabase
      .from("user_access_overrides")
      .upsert(
        { user_id: row.user_id!, ...next, updated_by: user?.id ?? null },
        { onConflict: "user_id" },
      );

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      setSavingId(null);
      return;
    }

    setRows((prev) =>
      prev.map((c) =>
        c.employee_id === row.employee_id
          ? {
              ...c,
              bypassGeofence: next.bypass_geofence,
              extraStoreIds: next.extra_store_ids,
              canReceiveInvoices: next.can_receive_invoices,
            }
          : c,
      ),
    );
    setSavingId(null);
    toast({ title: "Exceção atualizada" });
  };

  const toggleExtraStore = (row: AccessRow, storeId: string) => {
    const exists = row.extraStoreIds.includes(storeId);
    const nextIds = exists ? row.extraStoreIds.filter((s) => s !== storeId) : [...row.extraStoreIds, storeId];
    upsertOverride(row, { extraStoreIds: nextIds });
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter((row) =>
      row.full_name.toLowerCase().includes(q) ||
      row.employeeEmail?.toLowerCase().includes(q) ||
      row.loginEmail?.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const linkedCount = rows.filter((row) => !!row.user_id).length;
  const unlinkedCount = rows.length - linkedCount;
  const storeMap = useMemo(() => Object.fromEntries(stores.map((s) => [s.id, s.name])), [stores]);

  const handleSearch = () => setSearch(searchInput);
  const handleClear = () => { setSearchInput(""); setSearch(""); };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" /> Acessos
        </h2>
        <p className="text-muted-foreground text-sm">
          Gerencie papéis (Admin/Gestor) e exceções de acesso (geolocalização e lojas adicionais).
        </p>
      </div>

      <div className="space-y-4">
      <Card className="bg-muted/40">
        <CardContent className="pt-4 pb-4 space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{rows.length} colaborador(es)</Badge>
            <Badge variant="secondary">{linkedCount} com login vinculado</Badge>
            <Badge variant="secondary">{unlinkedCount} sem login vinculado</Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold">Admin</span>
                <span className="text-muted-foreground"> — acesso total ao sistema.</span>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Crown className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold">Gestor</span>
                <span className="text-muted-foreground"> — gere colaboradores, escalas e relatórios.</span>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold">Sem geofence</span>
                <span className="text-muted-foreground"> — bate ponto / usa o sistema fora da localização das lojas.</span>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <StoreIcon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold">Lojas extras</span>
                <span className="text-muted-foreground"> — enxerga estoque/contas/ponto de outras lojas além da principal.</span>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <FileText className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold">Recebe nota/boleto</span>
                <span className="text-muted-foreground"> — pode registrar notas fiscais e boletos no recebimento de mercadorias.</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground pt-1 border-t">
            Sem nenhuma personalização, o colaborador recebe o acesso padrão do cargo.
          </p>
        </CardContent>
      </Card>

      {!canEdit && (
        <Card className="border-warning">
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Você está em modo somente leitura. Apenas administradoras e gestoras alteram acessos.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Colaboradores</CardTitle>
              <CardDescription>{filtered.length} colaborador(es) listado(s)</CardDescription>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-72">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou email..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                  className="pl-8 pr-8"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                    aria-label="Limpar"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Button type="button" size="sm" onClick={handleSearch} className="gap-1">
                <Search className="h-4 w-4" /> Buscar
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={load} title="Atualizar lista">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Nenhum colaborador encontrado.</div>
          ) : (
            <div className="space-y-2">
              {filtered.map((row) => {
                const hasCustomRole = row.isAdmin || row.isManager;
                const hasOverride = row.bypassGeofence || row.extraStoreIds.length > 0 || row.canReceiveInvoices;
                const hasLogin = !!row.user_id;
                const emailLine = hasLogin
                  ? row.loginEmail && row.employeeEmail && row.loginEmail !== row.employeeEmail
                    ? `login: ${row.loginEmail} • cadastro: ${row.employeeEmail}`
                    : row.loginEmail || row.employeeEmail || "Sem e-mail"
                  : row.employeeEmail || "Sem login vinculado";

                return (
                  <div key={row.employee_id} className="flex flex-col gap-3 p-3 rounded-lg border bg-card">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{row.full_name}</span>
                          {hasCustomRole && (
                            <Badge variant="secondary" className="gap-1 text-xs">
                              <Crown className="h-3 w-3" /> Papel personalizado
                            </Badge>
                          )}
                          {hasOverride && (
                            <Badge variant="secondary" className="gap-1 text-xs">
                              <ShieldCheck className="h-3 w-3" /> Exceção ativa
                            </Badge>
                          )}
                          {!hasLogin && (
                            <Badge variant="outline" className="gap-1 text-xs">
                              <Link2Off className="h-3 w-3" /> Sem login vinculado
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{emailLine}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-end gap-4">
                      <div className="flex flex-col items-center gap-1">
                        <Switch
                          checked={row.isAdmin}
                          disabled={!isAdmin || !hasLogin || savingId === row.user_id + "admin"}
                          onCheckedChange={(value) => toggleRole(row, "admin", value)}
                          aria-label="Administrador"
                        />
                        <span className="text-[10px] font-medium text-muted-foreground">Admin</span>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <Switch
                          checked={row.isManager}
                          disabled={!isAdmin || !hasLogin || savingId === row.user_id + "manager"}
                          onCheckedChange={(value) => toggleRole(row, "manager", value)}
                          aria-label="Gestor"
                        />
                        <span className="text-[10px] font-medium text-muted-foreground">Gestor</span>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <Switch
                          checked={row.bypassGeofence}
                          disabled={!canEdit || !hasLogin || savingId === row.user_id + "override"}
                          onCheckedChange={(value) => upsertOverride(row, { bypassGeofence: value })}
                          aria-label="Sem geofence"
                        />
                        <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> Sem geofence
                        </span>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <Switch
                          checked={row.canReceiveInvoices}
                          disabled={!canEdit || !hasLogin || savingId === row.user_id + "override"}
                          onCheckedChange={(value) => upsertOverride(row, { canReceiveInvoices: value })}
                          aria-label="Recebe nota/boleto"
                        />
                        <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                          <FileText className="h-3 w-3" /> Nota/Boleto
                        </span>
                      </div>

                      <div className="flex flex-col items-start gap-1 ml-auto">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!canEdit || !hasLogin}
                              className="gap-1"
                            >
                              <StoreIcon className="h-4 w-4" />
                              Lojas extras
                              {row.extraStoreIds.length > 0 && (
                                <Badge variant="secondary" className="ml-1">{row.extraStoreIds.length}</Badge>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-72 max-h-80 overflow-auto p-2">
                            <div className="text-xs font-medium px-2 pb-2 border-b mb-2">
                              Selecione lojas extras
                            </div>
                            {stores.length === 0 ? (
                              <div className="text-xs text-muted-foreground px-2 py-3">Nenhuma loja ativa.</div>
                            ) : (
                              <div className="space-y-0.5">
                                {stores.map((s) => {
                                  const checked = row.extraStoreIds.includes(s.id);
                                  return (
                                    <button
                                      key={s.id}
                                      type="button"
                                      onClick={() => toggleExtraStore(row, s.id)}
                                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent text-left text-sm"
                                    >
                                      <span className={`h-4 w-4 rounded border flex items-center justify-center ${checked ? "bg-primary border-primary text-primary-foreground" : "border-input"}`}>
                                        {checked && <Check className="h-3 w-3" />}
                                      </span>
                                      <span className="flex-1 truncate">{s.name}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            <div className="flex justify-between pt-2 mt-2 border-t">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => upsertOverride(row, { extraStoreIds: [] })}
                                disabled={row.extraStoreIds.length === 0}
                              >
                                Limpar
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => upsertOverride(row, { extraStoreIds: stores.map((s) => s.id) })}
                              >
                                Marcar todas
                              </Button>
                            </div>
                          </PopoverContent>
                        </Popover>
                        {row.extraStoreIds.length > 0 && (
                          <div className="text-[10px] text-muted-foreground max-w-[16rem] truncate">
                            {row.extraStoreIds.map((id) => storeMap[id] ?? "?").join(", ")}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      </div>
    </div>
  );
};

export default AccessControlPanel;
