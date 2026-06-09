import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "manager" | "employee" | "trainee" | "supplier" | "outsourced" | "nutritionist" | "hr" | "contabilidade" | "partner";

/**
 * IDs de usuárias com permissão especial total (super-acesso):
 * - acesso ao sistema mesmo fora da localização das lojas (bypass geofence)
 * - tratadas como admin/manager para todas as checagens client-side
 * Mantenha em sincronia com a função SQL `public.is_super_user`.
 */
export const SUPER_USER_IDS: ReadonlySet<string> = new Set([
  "ec5e52b2-a4c3-46c7-8d11-a5b6cf406866", // MAURO SOUZA
  "c23ee5c2-9fd8-415d-b5a6-f1fc77b5dbcf", // LUIZ CESAR (lrasec2505@gmail.com)
]);

export const isSuperUserId = (userId: string | null | undefined): boolean =>
  !!userId && SUPER_USER_IDS.has(userId);

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  isManager: boolean;
  isSupplier: boolean;
  isOutsourced: boolean;
  isExternalPartner: boolean;
  isContabilidade: boolean;
  /** True para sócios (visualização gerencial somente leitura). */
  isPartner: boolean;
  /** True para usuárias com permissão especial total (acesso irrestrito). */
  isSuperUser: boolean;
  /**
   * True quando o login é um "PC de loja" (user_metadata.store_login = true).
   * Esses logins ficam restritos ao /pdv-novo (balcão), independente das roles.
   */
  isStoreLogin: boolean;
  hasRole: (role: AppRole) => boolean;
  /** True quando esta árvore está visualizando como outro usuário (modo gestor). */
  isImpersonating: boolean;
  /** ID real do usuário autenticado (gestor), independente da impersonação. */
  realUserId: string | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Provider que sobrescreve o user.id retornado pelo useAuth para os filhos.
 * Útil para "visualizar como colaborador": mantém roles/session do gestor real
 * (necessário para as RLS de leitura), mas faz consultas que filtram por user.id
 * apontarem para o colaborador alvo.
 */
export const ImpersonationProvider = ({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) => {
  const parent = useContext(AuthContext);
  if (!parent) throw new Error("ImpersonationProvider must be used within AuthProvider");

  const [targetRoles, setTargetRoles] = useState<AppRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setRolesLoading(true);

    void (async () => {
      try {
        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);
        if (cancelled) return;
        const nextRoles = (data?.map((r) => r.role as AppRole) ?? []) || [];
        setTargetRoles(nextRoles.length > 0 ? nextRoles : ["employee"]);
      } finally {
        if (!cancelled) setRolesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const overriddenUser = useMemo<User | null>(() => {
    if (!parent.user) return null;
    return { ...parent.user, id: userId } as User;
  }, [parent.user, userId]);

  const effectiveRoles = targetRoles.length > 0 ? targetRoles : (["employee"] as AppRole[]);
  const superUser = isSuperUserId(userId);

  const value: AuthContextValue = {
    ...parent,
    user: overriddenUser,
    roles: effectiveRoles,
    loading: parent.loading || rolesLoading,
    isAdmin: superUser || effectiveRoles.includes("admin"),
    isManager: superUser || effectiveRoles.includes("manager"),
    isSupplier: effectiveRoles.includes("supplier"),
    isOutsourced: effectiveRoles.includes("outsourced"),
    isExternalPartner: effectiveRoles.includes("supplier") || effectiveRoles.includes("outsourced"),
    isContabilidade: effectiveRoles.includes("contabilidade"),
    isPartner: effectiveRoles.includes("partner"),
    isSuperUser: superUser,
    isStoreLogin: false,
    hasRole: (r) => effectiveRoles.includes(r) || (superUser && (r === "admin" || r === "manager")),
    isImpersonating: true,
    realUserId: parent.user?.id ?? null,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRoles = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const nextRoles = (data?.map((r) => r.role as AppRole)) ?? [];
    setRoles(nextRoles);
    return nextRoles;
  };

  useEffect(() => {
    const applySession = async (nextSession: Session | null, deferRoleFetch = false) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        setRoles([]);
        setLoading(false);
        return;
      }

      const loadRoles = async () => {
        try {
          await fetchRoles(nextSession.user.id);
        } finally {
          setLoading(false);
        }
      };

      if (deferRoleFetch) {
        setTimeout(() => {
          void loadRoles();
        }, 0);
        return;
      }

      await loadRoles();
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setLoading(true);
      void applySession(nextSession, true);
    });

    void supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setLoading(true);
      return applySession(existing);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("rh:viewMode");
    }
    await supabase.auth.signOut();
    setRoles([]);
  };

  const superUser = isSuperUserId(user?.id);
  const storeLogin = Boolean((user?.user_metadata as { store_login?: boolean } | undefined)?.store_login) && !superUser;

  const value: AuthContextValue = {
    user,
    session,
    roles,
    loading,
    signOut,
    isAdmin: superUser || roles.includes("admin"),
    isManager: superUser || roles.includes("manager"),
    isSupplier: roles.includes("supplier"),
    isOutsourced: roles.includes("outsourced"),
    isExternalPartner: roles.includes("supplier") || roles.includes("outsourced"),
    isContabilidade: roles.includes("contabilidade"),
    isPartner: roles.includes("partner"),
    isSuperUser: superUser,
    isStoreLogin: storeLogin,
    hasRole: (r) => roles.includes(r) || (superUser && (r === "admin" || r === "manager")),
    isImpersonating: false,
    realUserId: user?.id ?? null,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
