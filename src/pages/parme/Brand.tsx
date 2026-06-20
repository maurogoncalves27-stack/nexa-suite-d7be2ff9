import { useEffect } from "react";
import { useParams, Navigate } from "react-router-dom";
import { SiteLayout } from "@/components/parme-site/SiteLayout";
import { BRAND_THEMES, type BrandKey } from "@/components/parme/brand-theme";
import { CollageHero } from "@/components/parme/collage-hero";
import { BigTitleSection } from "@/components/parme/big-title-section";
import { LongCopyBlock } from "@/components/parme/long-copy";
import { DishCarousel } from "@/components/parme/dish-carousel";
import { DishGrid } from "@/components/parme/dish-grid";
import { InstagramStrip } from "@/components/parme/instagram-strip";
import { Reveal } from "@/components/parme/reveal";

const SLUG_MAP: Record<string, { key: BrandKey; tagline: string; handle: string; menuTitle: string; pageTitle: string }> = {
  "aquela-parme": { key: "parme", tagline: "escolhe o teu rango", handle: "aquelaparme", menuTitle: "Cardápio Aquela Parmê", pageTitle: "Aquela Parmê — A Parmegiana que você respeita" },
  "box-caipira": { key: "box", tagline: "do fogão pro prato", handle: "boxcaipira", menuTitle: "Cardápio Box Caipira", pageTitle: "Box Caipira — A comida caipira que você respeita" },
  "aquele-estrogonofe": { key: "estro", tagline: "cremosidade na medida", handle: "aqueleestrogonofe", menuTitle: "Cardápio Aquele Estrogonofe", pageTitle: "Aquele Estrogonofe — O estrogonofe que você respeita" },
};

export default function BrandPage() {
  const { slug } = useParams<{ slug: string }>();
  const cfg = slug ? SLUG_MAP[slug] : undefined;

  useEffect(() => {
    if (cfg) document.title = cfg.pageTitle;
  }, [cfg]);

  if (!cfg) return <Navigate to="/parme" replace />;
  const theme = BRAND_THEMES[cfg.key];

  return (
    <SiteLayout>
      <CollageHero theme={theme} />
      <BigTitleSection theme={theme} />
      <LongCopyBlock theme={theme} />

      <section id="cardapio" className="bg-brand-cream py-20">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <p className="font-script text-3xl" style={{ color: theme.primary }}>{cfg.tagline}</p>
            <h2 className="mt-1 font-display text-4xl md:text-5xl" style={{ color: theme.accent }}>
              {cfg.menuTitle}
            </h2>
          </Reveal>
          <div className="mt-10"><DishGrid dishes={theme.dishes} /></div>
        </div>
      </section>

      <section className="bg-brand-cream pb-20">
        <div className="mx-auto max-w-6xl px-2">
          <DishCarousel dishes={theme.dishes} accent={theme.primary} />
        </div>
      </section>

      <InstagramStrip handle={cfg.handle} color={theme.primary} />
    </SiteLayout>
  );
}
