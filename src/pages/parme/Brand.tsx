import { useEffect, useMemo } from "react";
import { useParams, Navigate, Link } from "react-router-dom";
import { Instagram, ChevronRight } from "lucide-react";
import { SiteLayout } from "@/components/parme-site/SiteLayout";
import { BRAND_THEMES, type BrandTheme } from "@/components/parme-site/brand-theme";

function findTheme(slug?: string): BrandTheme | null {
  if (!slug) return null;
  return Object.values(BRAND_THEMES).find((t) => t.slug === slug) ?? null;
}

export default function ParmeBrand() {
  const { slug } = useParams<{ slug: string }>();
  const theme = useMemo(() => findTheme(slug), [slug]);

  useEffect(() => {
    if (theme) document.title = `${theme.name} — ${theme.bigTitle}`;
  }, [theme]);

  if (!theme) return <Navigate to="/parme" replace />;

  return (
    <SiteLayout>
      {/* HERO */}
      <section
        className="relative overflow-hidden"
        style={{ background: theme.bg, color: "hsl(var(--parme-cream))" }}
      >
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-20 md:grid-cols-2 md:px-6 md:py-28">
          <div>
            <p className="font-script text-3xl" style={{ color: "hsl(var(--parme-cream))" }}>
              {theme.scriptTagline}
            </p>
            <h1
              className="mt-2 font-display text-[clamp(2.5rem,7vw,5rem)] leading-[1.02]"
              style={{ color: "hsl(var(--parme-cream))" }}
            >
              {theme.heroTitle[0]}
              <br />
              {theme.heroTitle[1]}
            </h1>
            <p className="mt-6 max-w-md text-lg opacity-90">
              {theme.heroSubtitle}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/parme/reservar"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold transition hover:opacity-90"
                style={{ color: theme.accent }}
              >
                Reservar mesa
                <ChevronRight className="h-4 w-4" />
              </Link>
              <a
                href="https://www.ifood.com.br"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Pedir no iFood 🛵
              </a>
            </div>
          </div>

          <div className="flex items-center justify-center">
            <div
              className="aspect-square w-full max-w-[420px] rounded-full bg-white/10 grid place-items-center text-[10rem] shadow-2xl ring-8 ring-white/10"
            >
              {theme.emoji}
            </div>
          </div>
        </div>
      </section>

      {/* BIG TITLE */}
      <section
        style={{ background: theme.bgMuted }}
        className="py-16 md:py-24"
      >
        <div className="mx-auto max-w-5xl px-5 text-center md:px-6">
          <h2
            className="font-display text-[clamp(2rem,6vw,4.5rem)] leading-[1.05]"
            style={{ color: theme.accent }}
          >
            {theme.bigTitle}
          </h2>
        </div>
      </section>

      {/* LONG COPY */}
      <section className="bg-brand-cream py-16">
        <div className="mx-auto max-w-3xl space-y-6 px-5 text-lg leading-relaxed text-gray-700 md:px-6">
          {theme.longCopy.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </section>

      {/* DISHES GRID */}
      <section
        id="cardapio"
        className="py-20"
        style={{ background: theme.bgMuted }}
      >
        <div className="mx-auto max-w-6xl px-5 md:px-6">
          <p className="font-script text-3xl" style={{ color: theme.primary }}>
            escolhe o teu rango
          </p>
          <h2
            className="mt-1 font-display text-4xl md:text-5xl"
            style={{ color: theme.accent }}
          >
            Cardápio {theme.name}
          </h2>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 md:grid-cols-3">
            {theme.dishes.map((name) => (
              <article
                key={name}
                className="group flex aspect-[4/5] flex-col items-center justify-end rounded-3xl p-6 text-center shadow-md transition hover:-translate-y-1"
                style={{ background: "white" }}
              >
                <span className="mb-4 text-7xl">{theme.emoji}</span>
                <h3
                  className="font-display text-xl"
                  style={{ color: theme.accent }}
                >
                  {name}
                </h3>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* INSTAGRAM */}
      <section className="bg-brand-ink py-12 text-brand-cream">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-5 text-center">
          <Instagram className="h-8 w-8" style={{ color: theme.primary }} />
          <a
            href="https://instagram.com/aquelaparme"
            target="_blank"
            rel="noopener noreferrer"
            className="font-display text-2xl md:text-3xl"
          >
            @aquelaparme
          </a>
          <p className="text-sm opacity-80">
            Siga a gente pra ver as novidades direto da cozinha.
          </p>
        </div>
      </section>
    </SiteLayout>
  );
}
