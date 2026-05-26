import { Link } from "react-router-dom";

type Key = "colaborador" | "freelancer" | "fornecedor" | "parceiro";

const links: Record<Key, { label: string; to: string }> = {
  colaborador: { label: "Sou colaborador / gestor", to: "/auth" },
  freelancer: { label: "Sou freelancer", to: "/freelancer/login" },
  fornecedor: { label: "Sou fornecedor", to: "/fornecedor/login" },
  parceiro: { label: "Sou parceiro / terceirizado", to: "/parceiro/login" },
};

interface Props {
  /** Quais links mostrar (oculta o atual automaticamente). */
  current: Key;
}

export function AuthSwitchLinks({ current }: Props) {
  const entries = (Object.keys(links) as Key[]).filter((k) => k !== current);
  return (
    <div className="pt-4 mt-2 border-t border-border/40 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {entries.map((k) => (
        <Link key={k} to={links[k].to} className="hover:text-primary hover:underline transition-colors">
          {links[k].label} →
        </Link>
      ))}
    </div>
  );
}
