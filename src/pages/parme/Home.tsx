import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { SiteLayout } from "@/components/parme-site/SiteLayout";
import { BRAND_THEMES } from "@/components/parme-site/brand-theme";
import { useEffect } from "react";

const CARDS = [BRAND_THEMES.parme, BRAND_THEMES.box, BRAND_THEMES.estro];

export default function ParmeHome() {
  useEffect(() => {
    document.title = "Aquela Parmê — Comida com gosto de casa em Brasília";
  }, []);

  return (
    <SiteLayout>
      <section className="bg-brand-cream">
        <div className="mx-auto grid max-w-[1320px] gap-4 px-4 py-6 md:grid-cols-3 md:gap-6 md:px-6 md:py-8">
          {CARDS.map((c) => (
            <Link
              key={c.slug}
              to={`/parme/${c.slug}`}
              className="group relative flex aspect-[4/4.6] flex-col overflow-hidden rounded-[24px] p-6 transition hover:scale-[1.01] md:rounded-[28px] md:p-8"
              style={{ background: c.bg }}
            >
              <h2
                className="font-display text-center text-[clamp(1.75rem,6vw,3.25rem)] leading-[1.02]"
                style={{ color: "hsl(var(--parme-cream))" }}
              >
                {c.name}
              </h2>

              <div className="flex flex-1 items-center justify-center">
                <span
                  className="text-[clamp(5rem,18vw,9rem)]"
                  style={{ filter: "drop-shadow(0 18px 22px rgba(0,0,0,0.25))" }}
                >
                  {c.emoji}
                </span>
              </div>

              <p
                className="font-script text-2xl"
                style={{ color: "hsl(var(--parme-cream))" }}
              >
                {c.scriptTagline}
              </p>

              <span className="mt-3 inline-flex items-center gap-2 self-start rounded-full bg-[hsl(var(--parme-cream))] px-5 py-2 text-sm font-bold text-brand-ink shadow-md transition group-hover:-translate-y-0.5">
                Saiba mais
                <span className="grid h-5 w-5 place-items-center rounded-full border border-current">
                  <ChevronRight className="h-3 w-3" />
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-brand-cream pb-20">
        <div className="mx-auto max-w-5xl px-4 text-center">
          <p className="font-script text-3xl text-brand-red">o que dizem por aí</p>
          <h2 className="mt-1 font-display text-4xl text-brand-red-dark md:text-5xl">
            Quem prova, volta
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-gray-600">
            Três marcas, uma só fome. Comida bem feita em Brasília, sem firula —
            do parmegiana à galinhada caipira.
          </p>
        </div>
      </section>
    </SiteLayout>
  );
}
