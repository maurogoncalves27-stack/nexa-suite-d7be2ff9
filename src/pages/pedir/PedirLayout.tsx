// Layout compartilhado das rotas /pedir/*.
// Aplica tema "Grupo Aquela Parmê" via CSS variables, com troca dinâmica
// por marca quando uma aba específica está ativa.
import { ReactNode, useEffect } from "react";
import { Link } from "react-router-dom";
import { ShoppingBag } from "lucide-react";

export type BrandCode = "all" | "aquela-parme" | "aquele-estrogonofe" | "box-caipira";

const BRAND_COLOR: Record<BrandCode, { bg: string; fg: string; accent: string }> = {
  all: { bg: "24 33% 97%", fg: "20 14% 12%", accent: "0 75% 52%" },
  "aquela-parme": { bg: "0 0% 100%", fg: "20 14% 12%", accent: "1 82% 51%" },
  "aquele-estrogonofe": { bg: "30 22% 96%", fg: "20 14% 12%", accent: "33 36% 46%" },
  "box-caipira": { bg: "30 100% 97%", fg: "20 14% 12%", accent: "19 86% 58%" },
};

export function PedirLayout({
  children,
  brand = "all",
  cartCount = 0,
  cartHref,
}: {
  children: ReactNode;
  brand?: BrandCode;
  cartCount?: number;
  cartHref?: string;
}) {
  useEffect(() => {
    document.title = "Grupo Aquela Parmê — Peça online";
  }, []);

  const c = BRAND_COLOR[brand];

  return (
    <div
      className="min-h-screen"
      style={{
        background: `hsl(${c.bg})`,
        color: `hsl(${c.fg})`,
        // Expor accent para componentes filhos
        ["--brand-accent" as never]: c.accent,
      }}
    >
      <header
        className="sticky top-0 z-30 border-b backdrop-blur"
        style={{ background: `hsl(${c.bg} / 0.92)`, borderColor: `hsl(${c.accent} / 0.25)` }}
      >
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link to="/pedir" className="flex items-center gap-2">
            <span
              className="grid h-8 w-8 place-items-center rounded-full text-sm font-black"
              style={{ background: `hsl(${c.accent})`, color: "white" }}
            >
              GP
            </span>
            <span className="text-sm font-bold leading-tight">
              Grupo
              <br />
              Aquela Parmê
            </span>
          </Link>
          {cartHref && (
            <Link
              to={cartHref}
              className="relative inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold text-white"
              style={{ background: `hsl(${c.accent})` }}
            >
              <ShoppingBag className="h-4 w-4" />
              Sacola
              {cartCount > 0 && (
                <span className="ml-1 grid h-5 min-w-5 place-items-center rounded-full bg-white px-1.5 text-xs font-bold" style={{ color: `hsl(${c.accent})` }}>
                  {cartCount}
                </span>
              )}
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>

      <footer className="mx-auto max-w-3xl px-4 py-8 text-center text-xs opacity-60">
        © Grupo Aquela Parmê · Parmê · Estrogonofe · Box Caipira
      </footer>
    </div>
  );
}
