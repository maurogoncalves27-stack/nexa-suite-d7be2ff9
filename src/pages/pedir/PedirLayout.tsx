// Layout compartilhado das rotas /pedir/* — identidade Aquela Parmê
// (cream bg + Avigea display + CTA vermelho), com troca de accent por marca.
import { ReactNode, useEffect } from "react";
import { Link } from "react-router-dom";
import { ShoppingBag } from "lucide-react";
import "@/styles/aquelaparme.css";
import { parmeAssets } from "@/assets/parme-assets";

export type BrandCode = "all" | "aquela-parme" | "aquele-estrogonofe" | "box-caipira";

// Accent (HSL) por marca — usado em CTAs, contadores e badges
const BRAND_ACCENT: Record<BrandCode, string> = {
  all: "3 65% 47%",                  // ap-red
  "aquela-parme": "3 65% 47%",       // vermelho
  "aquele-estrogonofe": "21 30% 30%",// marrom
  "box-caipira": "18 82% 58%",       // laranja
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

  const accent = BRAND_ACCENT[brand];

  return (
    <div
      className="ap-brand min-h-screen flex flex-col"
      style={{ ["--brand-accent" as never]: accent }}
    >
      {/* Header preto fixo, espelhando o site */}
      <header className="ap-header">
        <div className="ap-header-inner" style={{ gridTemplateColumns: "1fr auto 1fr" }}>
          <div className="flex items-center">
            <Link to="/pedir" className="ap-nav-link text-sm">
              ← Lojas
            </Link>
          </div>
          <Link to="/pedir" className="ap-header-logo">
            <img src={parmeAssets.Logo_Aquela_Parme} alt="Aquela Parmê" />
          </Link>
          <div className="flex items-center justify-end">
            {cartHref && (
              <Link
                to={cartHref}
                className="relative inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-px"
                style={{
                  background: `hsl(${accent})`,
                  boxShadow: `0 8px 20px -10px hsl(${accent} / .6)`,
                  fontFamily: "Bitter, ui-sans-serif, system-ui, sans-serif",
                }}
              >
                <ShoppingBag className="h-4 w-4" />
                <span className="hidden sm:inline">Sacola</span>
                {cartCount > 0 && (
                  <span
                    className="grid h-5 min-w-5 place-items-center rounded-full bg-white px-1.5 text-xs font-bold"
                    style={{ color: `hsl(${accent})` }}
                  >
                    {cartCount}
                  </span>
                )}
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Faixa decorativa: estrelas/textura sutil do site */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-16 -z-0 h-40 opacity-[0.08]"
        style={{
          backgroundImage: `url(${parmeAssets.Star_bg})`,
          backgroundRepeat: "repeat-x",
          backgroundSize: "auto 100%",
        }}
      />

      <main className="relative z-10 mx-auto w-full max-w-3xl flex-1 px-4 py-6 md:py-10">
        {children}
      </main>

      {/* Rodapé laranja com onda do site */}
      <footer className="ap-footer mt-10">
        <div className="ap-footer-wave" />
        <div className="ap-footer-inner text-center">
          <h4>Grupo Aquela Parmê</h4>
          <p className="mt-2 text-sm opacity-90" style={{ fontFamily: "Bitter, serif" }}>
            Parmê · Aquele Estrogonofe · Box Caipira
          </p>
          <div className="ap-footer-bottom justify-center">
            <span>© {new Date().getFullYear()} Grupo Aquela Parmê</span>
            <span>Brasília · DF</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
